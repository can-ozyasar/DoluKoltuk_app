import cron from "node-cron";
import QRCode from "qrcode";
import whatsapp from "whatsapp-web.js";
import type { Client as WhatsAppClient, Message } from "whatsapp-web.js";
import { WhatsAppStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { handleIncomingMessage } from "@/worker/message-flow";
import { sendDueReminders } from "@/worker/reminders";

const { Client, LocalAuth } = whatsapp;

type ManagedClient = {
  tenantId: string;
  slug: string;
  client: WhatsAppClient;
  ready: boolean;
};

const clients = new Map<string, ManagedClient>();
const sessionDir = process.env.WHATSAPP_SESSION_DIR ?? ".wwebjs_auth";

type SessionPatch = {
  status?: WhatsAppStatus;
  qrCode?: string | null;
  qrDataUrl?: string | null;
  connectedPhone?: string | null;
  lastSeenAt?: Date | null;
  lastError?: string | null;
};

function puppeteerOptions() {
  return {
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  };
}

async function updateSession(tenantId: string, data: SessionPatch) {
  await prisma.whatsAppSession.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data
  });
}

async function startClient(tenant: { id: string; slug: string }) {
  if (clients.has(tenant.id)) {
    return;
  }

  await updateSession(tenant.id, { status: WhatsAppStatus.DISCONNECTED, lastError: null });

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: tenant.slug,
      dataPath: sessionDir
    }),
    puppeteer: puppeteerOptions()
  }) as WhatsAppClient;

  const managed: ManagedClient = {
    tenantId: tenant.id,
    slug: tenant.slug,
    client,
    ready: false
  };
  clients.set(tenant.id, managed);

  client.on("qr", async (qr: string) => {
    const qrDataUrl = await QRCode.toDataURL(qr);
    await updateSession(tenant.id, {
      status: WhatsAppStatus.QR_READY,
      qrCode: qr,
      qrDataUrl,
      lastError: null,
      lastSeenAt: new Date()
    });
    console.log(`[${tenant.slug}] QR hazir`);
  });

  client.on("authenticated", async () => {
    await updateSession(tenant.id, {
      status: WhatsAppStatus.AUTHENTICATED,
      lastError: null,
      lastSeenAt: new Date()
    });
    console.log(`[${tenant.slug}] authenticated`);
  });

  client.on("ready", async () => {
    managed.ready = true;
    await updateSession(tenant.id, {
      status: WhatsAppStatus.CONNECTED,
      qrCode: null,
      qrDataUrl: null,
      connectedPhone: client.info?.wid?._serialized ?? null,
      lastError: null,
      lastSeenAt: new Date()
    });
    console.log(`[${tenant.slug}] connected`);
  });

  client.on("disconnected", async (reason: string) => {
    managed.ready = false;
    await updateSession(tenant.id, {
      status: WhatsAppStatus.DISCONNECTED,
      lastError: reason,
      lastSeenAt: new Date()
    });
    console.log(`[${tenant.slug}] disconnected: ${reason}`);
  });

  client.on("auth_failure", async (message: string) => {
    managed.ready = false;
    await updateSession(tenant.id, {
      status: WhatsAppStatus.FAILED,
      lastError: message,
      lastSeenAt: new Date()
    });
    console.error(`[${tenant.slug}] auth failure: ${message}`);
  });

  client.on("message", async (message: Message) => {
    if (message.fromMe || message.from.endsWith("@g.us") || message.from === "status@broadcast") {
      return;
    }

    try {
      await handleIncomingMessage({
        tenantId: tenant.id,
        from: message.from,
        body: message.body,
        reply: async (text) => {
          await client.sendMessage(message.from, text);
        }
      });
    } catch (error) {
      console.error(`[${tenant.slug}] message error`, error);
      await client.sendMessage(message.from, "Bir hata olustu. Lutfen biraz sonra tekrar deneyin.");
    }
  });

  client.initialize().catch(async (error: unknown) => {
    managed.ready = false;
    await updateSession(tenant.id, {
      status: WhatsAppStatus.FAILED,
      lastError: error instanceof Error ? error.message : "Client baslatilamadi",
      lastSeenAt: new Date()
    });
    console.error(`[${tenant.slug}] initialize error`, error);
  });
}

async function syncTenants() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });

  for (const tenant of tenants) {
    await prisma.whatsAppSession.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id },
      update: {}
    });
    await startClient(tenant);
  }
}

async function sendText(tenantId: string, to: string, body: string) {
  const managed = clients.get(tenantId);
  if (!managed?.ready) {
    throw new Error("WhatsApp oturumu bagli degil");
  }
  await managed.client.sendMessage(to, body);
}

async function main() {
  console.log("WhatsApp worker basliyor...");
  await syncTenants();

  setInterval(() => {
    syncTenants().catch((error) => console.error("Tenant sync error", error));
  }, 30_000);

  cron.schedule("* * * * *", () => {
    sendDueReminders(sendText).catch((error) => console.error("Reminder error", error));
  });
}

async function shutdown() {
  console.log("Worker kapatiliyor...");
  for (const managed of clients.values()) {
    try {
      await managed.client.destroy();
    } catch (error) {
      console.error(`[${managed.slug}] destroy error`, error);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

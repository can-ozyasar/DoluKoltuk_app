import http from "node:http";
import os from "node:os";
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
  restartTimer?: NodeJS.Timeout;
  startedAt: Date;
  lastEventAt?: Date;
};

type TenantRef = {
  id: string;
  slug: string;
};

type SessionPatch = {
  status?: WhatsAppStatus;
  qrCode?: string | null;
  qrDataUrl?: string | null;
  connectedPhone?: string | null;
  lastSeenAt?: Date | null;
  lastError?: string | null;
};

const clients = new Map<string, ManagedClient>();
const sessionDir = process.env.WHATSAPP_SESSION_DIR ?? ".wwebjs_auth";
const workerId = process.env.WORKER_ID ?? `${os.hostname()}-${process.pid}`;
const shardCount = positiveInt(process.env.WORKER_SHARD_COUNT, 1);
const shardIndex = Math.min(positiveInt(process.env.WORKER_SHARD_INDEX, 0), shardCount - 1);
const maxTenants = positiveInt(process.env.WORKER_MAX_TENANTS, 25);
const syncIntervalMs = positiveInt(process.env.WORKER_SYNC_INTERVAL_MS, 30_000);
const heartbeatIntervalMs = positiveInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS, 30_000);
const restartDelayMs = positiveInt(process.env.WORKER_RESTART_DELAY_MS, 15_000);
const reminderMaxAttempts = positiveInt(process.env.REMINDER_MAX_ATTEMPTS, 10);
const reminderBatchSize = positiveInt(process.env.REMINDER_BATCH_SIZE, 50);
const healthPort = positiveInt(process.env.WORKER_HEALTH_PORT, 3100);

let shuttingDown = false;
let lastTenantSyncAt: Date | null = null;
let lastReminderRunAt: Date | null = null;

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function ownsTenant(tenant: TenantRef) {
  return stableHash(tenant.id) % shardCount === shardIndex;
}

function assignedTenantIds() {
  return Array.from(clients.keys());
}

function puppeteerOptions() {
  return {
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-timer-throttling"
    ]
  };
}

async function updateSession(tenantId: string, data: SessionPatch) {
  await prisma.whatsAppSession.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data
  });
}

async function stopClient(tenantId: string, reason: string) {
  const managed = clients.get(tenantId);
  if (!managed) {
    return;
  }

  clients.delete(tenantId);
  if (managed.restartTimer) {
    clearTimeout(managed.restartTimer);
  }

  try {
    await managed.client.destroy();
  } catch (error) {
    console.error(`[${managed.slug}] destroy error`, error);
  }

  await updateSession(tenantId, {
    status: WhatsAppStatus.DISCONNECTED,
    lastError: reason,
    lastSeenAt: new Date()
  });
}

function scheduleRestart(tenant: TenantRef, reason: string) {
  if (shuttingDown) {
    return;
  }

  const managed = clients.get(tenant.id);
  if (!managed || managed.restartTimer) {
    return;
  }

  managed.ready = false;
  managed.lastEventAt = new Date();
  managed.restartTimer = setTimeout(async () => {
    if (shuttingDown) {
      return;
    }

    console.log(`[${tenant.slug}] yeniden baslatiliyor: ${reason}`);
    await stopClient(tenant.id, reason);
    await startClient(tenant);
  }, restartDelayMs);
}

async function startClient(tenant: TenantRef) {
  if (shuttingDown || clients.has(tenant.id)) {
    return;
  }

  await updateSession(tenant.id, { status: WhatsAppStatus.DISCONNECTED, lastError: null, lastSeenAt: new Date() });

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: tenant.slug,
      dataPath: sessionDir
    }),
    puppeteer: puppeteerOptions(),
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
    }
  }) as WhatsAppClient;

  const managed: ManagedClient = {
    tenantId: tenant.id,
    slug: tenant.slug,
    client,
    ready: false,
    startedAt: new Date()
  };
  clients.set(tenant.id, managed);

  client.on("qr", async (qr: string) => {
    managed.lastEventAt = new Date();
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
    managed.lastEventAt = new Date();
    await updateSession(tenant.id, {
      status: WhatsAppStatus.AUTHENTICATED,
      lastError: null,
      lastSeenAt: new Date()
    });
    console.log(`[${tenant.slug}] authenticated`);
  });

  client.on("ready", async () => {
    managed.ready = true;
    managed.lastEventAt = new Date();
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
    managed.lastEventAt = new Date();
    await updateSession(tenant.id, {
      status: WhatsAppStatus.DISCONNECTED,
      lastError: reason,
      lastSeenAt: new Date()
    });
    console.log(`[${tenant.slug}] disconnected: ${reason}`);
    scheduleRestart(tenant, reason);
  });

  client.on("auth_failure", async (message: string) => {
    managed.ready = false;
    managed.lastEventAt = new Date();
    await updateSession(tenant.id, {
      status: WhatsAppStatus.FAILED,
      lastError: message,
      lastSeenAt: new Date()
    });
    console.error(`[${tenant.slug}] auth failure: ${message}`);
    scheduleRestart(tenant, message);
  });

  client.on("message", async (message: Message) => {
    if (message.fromMe || message.from.endsWith("@g.us") || message.from === "status@broadcast") {
      return;
    }

    managed.lastEventAt = new Date();
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
    managed.lastEventAt = new Date();
    const reason = error instanceof Error ? error.message : "Client baslatilamadi";
    await updateSession(tenant.id, {
      status: WhatsAppStatus.FAILED,
      lastError: reason,
      lastSeenAt: new Date()
    });
    console.error(`[${tenant.slug}] initialize error`, error);
    scheduleRestart(tenant, reason);
  });
}

async function syncTenants() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true, slug: true },
    orderBy: { createdAt: "asc" }
  });
  const assigned = tenants.filter(ownsTenant).slice(0, maxTenants);
  const assignedIds = new Set(assigned.map((tenant) => tenant.id));

  for (const [tenantId] of clients) {
    if (!assignedIds.has(tenantId)) {
      await stopClient(tenantId, "Worker shard disinda kaldi veya tenant silindi");
    }
  }

  for (const tenant of assigned) {
    await prisma.whatsAppSession.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id },
      update: {}
    });
    await startClient(tenant);
  }

  lastTenantSyncAt = new Date();
}

async function heartbeatSessions() {
  const now = new Date();
  for (const managed of clients.values()) {
    await updateSession(managed.tenantId, {
      status: managed.ready ? WhatsAppStatus.CONNECTED : undefined,
      lastSeenAt: now
    });
  }
}

async function sendText(tenantId: string, to: string, body: string) {
  const managed = clients.get(tenantId);
  if (!managed?.ready) {
    throw new Error("WhatsApp oturumu bagli degil");
  }
  await managed.client.sendMessage(to, body);
}

function startHealthServer() {
  const server = http.createServer(async (request, response) => {
    if (request.url === "/healthz" || request.url === "/readyz") {
      try {
        await prisma.$queryRaw`SELECT 1`;
        const payload = {
          ok: !shuttingDown,
          workerId,
          shardIndex,
          shardCount,
          managedTenants: clients.size,
          readyTenants: Array.from(clients.values()).filter((client) => client.ready).length,
          lastTenantSyncAt,
          lastReminderRunAt
        };
        response.writeHead(shuttingDown ? 503 : 200, { "content-type": "application/json" });
        response.end(JSON.stringify(payload));
      } catch (error) {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "health error" }));
      }
      return;
    }

    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  server.listen(healthPort, () => {
    console.log(`Worker health endpoint: http://localhost:${healthPort}/healthz`);
  });

  return server;
}

async function main() {
  console.log(`WhatsApp worker basliyor... worker=${workerId} shard=${shardIndex}/${shardCount} maxTenants=${maxTenants}`);
  const healthServer = startHealthServer();
  await syncTenants();

  const syncTimer = setInterval(() => {
    syncTenants().catch((error) => console.error("Tenant sync error", error));
  }, syncIntervalMs);

  const heartbeatTimer = setInterval(() => {
    heartbeatSessions().catch((error) => console.error("Heartbeat error", error));
  }, heartbeatIntervalMs);

  cron.schedule("* * * * *", () => {
    lastReminderRunAt = new Date();
    sendDueReminders(sendText, {
      tenantIds: assignedTenantIds(),
      workerId,
      maxAttempts: reminderMaxAttempts,
      batchSize: reminderBatchSize
    }).catch((error) => console.error("Reminder error", error));
  });

  async function shutdown() {
    shuttingDown = true;
    console.log("Worker kapatiliyor...");
    clearInterval(syncTimer);
    clearInterval(heartbeatTimer);
    healthServer.close();
    for (const tenantId of Array.from(clients.keys())) {
      await stopClient(tenantId, "Worker kapatildi");
    }
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@example.com";
const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "owner12345";
const tenantEmail = process.env.SEED_TENANT_ADMIN_EMAIL ?? "salon@example.com";
const tenantPassword = process.env.SEED_TENANT_ADMIN_PASSWORD ?? "salon12345";

async function ensureWorkingHours(tenantId: string, staffId: string) {
  const defaults = [
    { weekday: 0, startMinute: 10 * 60, endMinute: 18 * 60, closed: true },
    { weekday: 1, startMinute: 9 * 60, endMinute: 19 * 60, closed: false },
    { weekday: 2, startMinute: 9 * 60, endMinute: 19 * 60, closed: false },
    { weekday: 3, startMinute: 9 * 60, endMinute: 19 * 60, closed: false },
    { weekday: 4, startMinute: 9 * 60, endMinute: 19 * 60, closed: false },
    { weekday: 5, startMinute: 9 * 60, endMinute: 19 * 60, closed: false },
    { weekday: 6, startMinute: 10 * 60, endMinute: 18 * 60, closed: false }
  ];

  for (const item of defaults) {
    await prisma.workingHour.upsert({
      where: { staffId_weekday: { staffId, weekday: item.weekday } },
      create: { tenantId, staffId, ...item },
      update: item
    });
  }
}

async function main() {
  const ownerHash = await bcrypt.hash(ownerPassword, 12);
  await prisma.user.upsert({
    where: { email: ownerEmail },
    create: {
      email: ownerEmail,
      passwordHash: ownerHash,
      role: UserRole.OWNER
    },
    update: { passwordHash: ownerHash, role: UserRole.OWNER }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "ornek-salon" },
    create: {
      name: "Ornek Salon",
      slug: "ornek-salon",
      phone: "+90 555 000 00 00",
      address: "Bagdat Caddesi No: 10, Kadikoy / Istanbul",
      greetingMessage: "Merhaba! Ornek Salon WhatsApp randevu hattina hos geldiniz.",
      afterHoursMessage: "Su an kapaliyiz ama buradan hemen randevu alabilirsiniz."
    },
    update: {}
  });

  await prisma.whatsAppSession.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id },
    update: {}
  });

  const tenantHash = await bcrypt.hash(tenantPassword, 12);
  await prisma.user.upsert({
    where: { email: tenantEmail },
    create: {
      tenantId: tenant.id,
      email: tenantEmail,
      passwordHash: tenantHash,
      role: UserRole.TENANT_ADMIN
    },
    update: { tenantId: tenant.id, passwordHash: tenantHash, role: UserRole.TENANT_ADMIN }
  });

  await prisma.service.upsert({
    where: { id: "seed-service-haircut" },
    create: {
      id: "seed-service-haircut",
      tenantId: tenant.id,
      name: "Sac Kesimi",
      durationMinutes: 30,
      priceCents: 50000
    },
    update: {
      tenantId: tenant.id,
      name: "Sac Kesimi",
      durationMinutes: 30,
      priceCents: 50000,
      active: true
    }
  });

  await prisma.service.upsert({
    where: { id: "seed-service-color" },
    create: {
      id: "seed-service-color",
      tenantId: tenant.id,
      name: "Boya",
      durationMinutes: 120,
      priceCents: 180000
    },
    update: {
      tenantId: tenant.id,
      name: "Boya",
      durationMinutes: 120,
      priceCents: 180000,
      active: true
    }
  });

  const staff = await prisma.staff.upsert({
    where: { id: "seed-staff-aylin" },
    create: {
      id: "seed-staff-aylin",
      tenantId: tenant.id,
      name: "Aylin"
    },
    update: { tenantId: tenant.id, name: "Aylin", active: true }
  });

  await ensureWorkingHours(tenant.id, staff.id);

  console.log("Seed tamamlandi:");
  console.log(`Owner: ${ownerEmail} / ${ownerPassword}`);
  console.log(`Salon: ${tenantEmail} / ${tenantPassword}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

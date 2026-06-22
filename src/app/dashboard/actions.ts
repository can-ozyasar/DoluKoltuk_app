"use server";

import bcrypt from "bcryptjs";
import { AppointmentSource, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAppointment, cancelAppointment, AppointmentConflictError } from "@/lib/appointments";
import { labelToMinute, parseMoneyToCents, slugify } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function requireTenantId(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!user.tenantId) {
    redirect("/dashboard");
  }
  return user.tenantId;
}

async function ensureDefaultWorkingHours(tenantId: string, staffId: string) {
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

export async function createTenantAction(formData: FormData) {
  await requireUser([UserRole.OWNER]);

  const name = field(formData, "name");
  const email = field(formData, "email").toLowerCase();
  const password = field(formData, "password");
  const baseSlug = slugify(field(formData, "slug") || name);

  if (!name || !email || password.length < 8 || !baseSlug) {
    redirect("/dashboard?error=Isletme+adi,+email+ve+en+az+8+karakter+sifre+gerekli");
  }

  let slug = baseSlug;
  let suffix = 2;
  while (await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.tenant.create({
    data: {
      name,
      slug,
      phone: field(formData, "phone") || null,
      address: field(formData, "address") || null,
      users: {
        create: {
          email,
          passwordHash,
          role: UserRole.TENANT_ADMIN
        }
      },
      whatsappSession: {
        create: {}
      }
    }
  });

  revalidatePath("/dashboard");
  redirect("/dashboard?notice=Isletme+olusturuldu");
}

export async function updateTenantSettingsAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: field(formData, "name"),
      phone: field(formData, "phone") || null,
      address: field(formData, "address") || null,
      greetingMessage: field(formData, "greetingMessage"),
      afterHoursMessage: field(formData, "afterHoursMessage")
    }
  });

  revalidatePath("/dashboard");
}

export async function upsertServiceAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);
  const id = field(formData, "id");
  const name = field(formData, "name");
  const durationMinutes = Number(field(formData, "durationMinutes"));

  if (!name || !Number.isInteger(durationMinutes) || durationMinutes < 15) {
    redirect("/dashboard?error=Hizmet+adi+ve+gecerli+sure+gerekli");
  }

  const data = {
    name,
    durationMinutes,
    priceCents: parseMoneyToCents(formData.get("price")),
    active: formData.get("active") === "on"
  };

  if (id) {
    await prisma.service.updateMany({ where: { id, tenantId }, data });
  } else {
    await prisma.service.create({ data: { tenantId, ...data, active: true } });
  }

  revalidatePath("/dashboard");
}

export async function upsertStaffAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);
  const id = field(formData, "id");
  const name = field(formData, "name");

  if (!name) {
    redirect("/dashboard?error=Personel+adi+gerekli");
  }

  if (id) {
    await prisma.staff.updateMany({
      where: { id, tenantId },
      data: { name, active: formData.get("active") === "on" }
    });
  } else {
    const staff = await prisma.staff.create({
      data: { tenantId, name, active: true }
    });
    await ensureDefaultWorkingHours(tenantId, staff.id);
  }

  revalidatePath("/dashboard");
}

export async function updateWorkingHoursAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);
  const staffId = field(formData, "staffId");
  const staff = await prisma.staff.findFirst({ where: { id: staffId, tenantId }, select: { id: true } });

  if (!staff) {
    redirect("/dashboard?error=Personel+bulunamadi");
  }

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const closed = formData.get(`closed-${weekday}`) === "on";
    const startMinute = labelToMinute(field(formData, `start-${weekday}`) || "09:00");
    const endMinute = labelToMinute(field(formData, `end-${weekday}`) || "18:00");

    await prisma.workingHour.upsert({
      where: { staffId_weekday: { staffId, weekday } },
      create: { tenantId, staffId, weekday, startMinute, endMinute, closed },
      update: { startMinute, endMinute, closed }
    });
  }

  revalidatePath("/dashboard");
}

export async function createManualAppointmentAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);
  const phone = field(formData, "phone");
  const startRaw = field(formData, "startAt");

  if (!phone || !startRaw) {
    redirect("/dashboard?error=Telefon+ve+tarih+gerekli");
  }

  const customer = await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: {
      tenantId,
      phone,
      name: field(formData, "customerName") || null
    },
    update: {
      name: field(formData, "customerName") || undefined
    }
  });

  try {
    await createAppointment({
      tenantId,
      customerId: customer.id,
      serviceId: field(formData, "serviceId"),
      staffId: field(formData, "staffId"),
      startAt: new Date(startRaw),
      source: AppointmentSource.PANEL
    });
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      redirect("/dashboard?error=Secilen+saat+dolu");
    }
    throw error;
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?notice=Randevu+eklendi");
}

export async function cancelAppointmentAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);

  await cancelAppointment({
    tenantId,
    appointmentId: field(formData, "appointmentId"),
    reason: "Panelden iptal edildi"
  });

  revalidatePath("/dashboard");
}

export async function createCustomerNoteAction(formData: FormData) {
  const user = await requireUser([UserRole.TENANT_ADMIN]);
  const tenantId = requireTenantId(user);
  const customerId = field(formData, "customerId");
  const note = field(formData, "note");

  if (!note) {
    redirect("/dashboard?error=Not+bos+olamaz");
  }

  const customer = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { id: true } });
  if (!customer) {
    redirect("/dashboard?error=Musteri+bulunamadi");
  }

  await prisma.customerNote.create({
    data: { tenantId, customerId, note }
  });

  revalidatePath("/dashboard");
}

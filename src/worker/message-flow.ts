import { AppointmentStatus, MessageDirection, Prisma } from "@prisma/client";
import {
  AppointmentConflictError,
  cancelAppointment,
  createAppointment,
  formatAppointmentLine,
  getAvailableSlots,
  payloadToStart,
  rescheduleAppointment,
  slotToPayload
} from "@/lib/appointments";
import { formatDateTime, formatMoney, minuteToLabel, weekdayName } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { isWithinWorkingHours, type WorkingWindow } from "@/lib/slots";

type Reply = (text: string) => Promise<void>;

type FlowPayload = Prisma.InputJsonObject;

type FlowContext = {
  tenantId: string;
  from: string;
  body: string;
  reply: Reply;
};

const STATE_TTL_MINUTES = 30;

function normalize(input: string) {
  return input
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/\s+/g, " ");
}

function choiceNumber(input: string) {
  const match = normalize(input).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function expiresAt() {
  return new Date(Date.now() + STATE_TTL_MINUTES * 60_000);
}

async function saveState(tenantId: string, customerPhone: string, state: string, payload: FlowPayload) {
  await prisma.conversationState.upsert({
    where: { tenantId_customerPhone: { tenantId, customerPhone } },
    create: { tenantId, customerPhone, state, payload, expiresAt: expiresAt() },
    update: { state, payload, expiresAt: expiresAt() }
  });
}

async function clearState(tenantId: string, customerPhone: string) {
  await prisma.conversationState.deleteMany({ where: { tenantId, customerPhone } });
}

async function logMessage(tenantId: string, customerPhone: string, direction: MessageDirection, body: string) {
  await prisma.messageLog.create({
    data: { tenantId, customerPhone, direction, body: body.slice(0, 4000) }
  });
}

async function send(ctx: FlowContext, text: string) {
  await ctx.reply(text);
  await logMessage(ctx.tenantId, ctx.from, MessageDirection.OUTBOUND, text);
}

function menuText(greeting?: string) {
  const lines = [
    greeting,
    "",
    "1. Randevu Al",
    "2. Fiyat Listesi",
    "3. Adres",
    "4. Calisma Saatleri",
    "5. Randevumu Iptal / Degistir",
    "",
    "Secmek icin numara yazabilirsiniz."
  ].filter(Boolean);
  return lines.join("\n");
}

function slotChoiceText(slots: { startAt: Date }[]) {
  if (slots.length === 0) {
    return "Uygun saat bulamadim. Lutfen daha sonra tekrar deneyin veya isletmeyle iletisime gecin.";
  }

  return [
    "Uygun saatler:",
    ...slots.map((slot, index) => `${index + 1}. ${formatDateTime(slot.startAt)}`),
    "",
    "Bir saat secmek icin numara yazin. Menuye donmek icin 0 yazin."
  ].join("\n");
}

async function priceList(tenantId: string) {
  const services = await prisma.service.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" }
  });

  if (services.length === 0) {
    return "Fiyat listesi henuz eklenmemis.";
  }

  return ["Fiyat listesi:", ...services.map((service) => `- ${service.name}: ${formatMoney(service.priceCents)} (${service.durationMinutes} dk)`)].join("\n");
}

async function workingHoursText(tenantId: string) {
  const staff = await prisma.staff.findMany({
    where: { tenantId, active: true },
    include: { workingHours: { orderBy: { weekday: "asc" } } },
    orderBy: { name: "asc" }
  });

  if (staff.length === 0) {
    return "Calisma saatleri henuz eklenmemis.";
  }

  return staff
    .map((person) => {
      const lines = person.workingHours.map((hour) =>
        hour.closed ? `${weekdayName(hour.weekday)}: Kapali` : `${weekdayName(hour.weekday)}: ${minuteToLabel(hour.startMinute)}-${minuteToLabel(hour.endMinute)}`
      );
      return [`${person.name}:`, ...lines].join("\n");
    })
    .join("\n\n");
}

async function isOpenNow(tenantId: string) {
  const workingHours = await prisma.workingHour.findMany({
    where: { tenantId, staff: { active: true } }
  });
  return workingHours.some((hour) =>
    isWithinWorkingHours({
      date: new Date(),
      workingHours: [
        {
          weekday: hour.weekday,
          startMinute: hour.startMinute,
          endMinute: hour.endMinute,
          closed: hour.closed
        }
      ]
    })
  );
}

async function startBooking(ctx: FlowContext) {
  const services = await prisma.service.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { name: "asc" }
  });

  if (services.length === 0) {
    await send(ctx, "Henuz aktif hizmet yok. Lutfen isletmeyle iletisime gecin.");
    return;
  }

  await saveState(ctx.tenantId, ctx.from, "SELECT_SERVICE", { serviceIds: services.map((service) => service.id) });
  await send(
    ctx,
    ["Hangi hizmeti almak istersiniz?", ...services.map((service, index) => `${index + 1}. ${service.name} - ${formatMoney(service.priceCents)} (${service.durationMinutes} dk)`)].join("\n")
  );
}

async function listActiveAppointments(ctx: FlowContext) {
  const customer = await prisma.customer.findUnique({
    where: { tenantId_phone: { tenantId: ctx.tenantId, phone: ctx.from } }
  });

  if (!customer) {
    await send(ctx, "Aktif randevunuz bulunmuyor.");
    return;
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      tenantId: ctx.tenantId,
      customerId: customer.id,
      status: AppointmentStatus.BOOKED,
      startAt: { gte: new Date() }
    },
    include: { service: true, staff: true },
    orderBy: { startAt: "asc" },
    take: 5
  });

  if (appointments.length === 0) {
    await send(ctx, "Aktif randevunuz bulunmuyor.");
    return;
  }

  await saveState(ctx.tenantId, ctx.from, "SELECT_APPOINTMENT", {
    appointmentIds: appointments.map((appointment) => appointment.id)
  });
  await send(
    ctx,
    [
      "Hangi randevu icin islem yapmak istersiniz?",
      ...appointments.map((appointment, index) => `${index + 1}. ${formatAppointmentLine(appointment)}`),
      "",
      "Menuye donmek icin 0 yazin."
    ].join("\n")
  );
}

async function handleMenu(ctx: FlowContext, tenant: { greetingMessage: string; afterHoursMessage: string; address: string | null }) {
  const normalized = normalize(ctx.body);
  const choice = choiceNumber(ctx.body);

  if (choice === 1 || normalized.includes("randevu")) {
    await startBooking(ctx);
    return;
  }

  if (choice === 2 || normalized.includes("fiyat")) {
    await send(ctx, `${await priceList(ctx.tenantId)}\n\n${menuText()}`);
    return;
  }

  if (choice === 3 || normalized.includes("adres")) {
    await send(ctx, `${tenant.address ?? "Adres henuz eklenmemis."}\n\n${menuText()}`);
    return;
  }

  if (choice === 4 || normalized.includes("saat")) {
    await send(ctx, `${await workingHoursText(ctx.tenantId)}\n\n${menuText()}`);
    return;
  }

  if (choice === 5 || normalized.includes("iptal") || normalized.includes("degistir")) {
    await listActiveAppointments(ctx);
    return;
  }

  const open = await isOpenNow(ctx.tenantId);
  await send(ctx, menuText(open ? tenant.greetingMessage : tenant.afterHoursMessage));
}

async function handleSelectService(ctx: FlowContext, payload: FlowPayload) {
  const serviceIds = (payload.serviceIds as string[] | undefined) ?? [];
  const choice = choiceNumber(ctx.body);
  const serviceId = choice ? serviceIds[choice - 1] : undefined;

  if (!serviceId) {
    await send(ctx, "Gecerli bir hizmet numarasi yazin veya menu icin 0 yazin.");
    return;
  }

  const staff = await prisma.staff.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { name: "asc" }
  });

  if (staff.length === 0) {
    await send(ctx, "Aktif personel bulunmuyor. Lutfen isletmeyle iletisime gecin.");
    return;
  }

  await saveState(ctx.tenantId, ctx.from, "SELECT_STAFF", {
    serviceId,
    staffIds: staff.map((person) => person.id)
  });
  await send(ctx, ["Hangi personelden randevu almak istersiniz?", ...staff.map((person, index) => `${index + 1}. ${person.name}`)].join("\n"));
}

async function askForSlot(ctx: FlowContext, params: { serviceId: string; staffId: string; appointmentId?: string }) {
  const slots = await getAvailableSlots({
    tenantId: ctx.tenantId,
    serviceId: params.serviceId,
    staffId: params.staffId,
    ignoreAppointmentId: params.appointmentId,
    limit: 8,
    days: 10
  });

  await saveState(ctx.tenantId, ctx.from, "SELECT_SLOT", {
    serviceId: params.serviceId,
    staffId: params.staffId,
    appointmentId: params.appointmentId,
    slots: slots.map(slotToPayload)
  });
  await send(ctx, slotChoiceText(slots));
}

async function handleSelectStaff(ctx: FlowContext, payload: FlowPayload) {
  const staffIds = (payload.staffIds as string[] | undefined) ?? [];
  const serviceId = payload.serviceId as string | undefined;
  const choice = choiceNumber(ctx.body);
  const staffId = choice ? staffIds[choice - 1] : undefined;

  if (!serviceId || !staffId) {
    await send(ctx, "Gecerli bir personel numarasi yazin veya menu icin 0 yazin.");
    return;
  }

  await askForSlot(ctx, { serviceId, staffId });
}

async function handleSelectSlot(ctx: FlowContext, payload: FlowPayload) {
  const slots = (payload.slots as Array<{ startAt: string; endAt: string }> | undefined) ?? [];
  const choice = choiceNumber(ctx.body);
  const selected = choice ? slots[choice - 1] : undefined;

  if (!selected) {
    await send(ctx, "Gecerli bir saat numarasi yazin veya menu icin 0 yazin.");
    return;
  }

  await saveState(ctx.tenantId, ctx.from, "CONFIRM_SLOT", {
    ...payload,
    selected
  });
  await send(ctx, `${formatDateTime(new Date(selected.startAt))} icin randevuyu onayliyor musunuz?\n1. Onayla\n2. Vazgec`);
}

async function handleConfirmSlot(ctx: FlowContext, payload: FlowPayload) {
  const choice = choiceNumber(ctx.body);
  if (choice !== 1) {
    await clearState(ctx.tenantId, ctx.from);
    await send(ctx, menuText("Islem iptal edildi."));
    return;
  }

  const serviceId = payload.serviceId as string;
  const staffId = payload.staffId as string;
  const appointmentId = payload.appointmentId as string | undefined;
  const selected = payload.selected as { startAt: string };

  try {
    if (appointmentId) {
      const appointment = await rescheduleAppointment({
        tenantId: ctx.tenantId,
        appointmentId,
        startAt: payloadToStart(selected)
      });
      await clearState(ctx.tenantId, ctx.from);
      await send(ctx, `Randevunuz guncellendi: ${formatDateTime(appointment.startAt)}.`);
      return;
    }

    const customer = await prisma.customer.upsert({
      where: { tenantId_phone: { tenantId: ctx.tenantId, phone: ctx.from } },
      create: { tenantId: ctx.tenantId, phone: ctx.from, lastMessageAt: new Date() },
      update: { lastMessageAt: new Date() }
    });

    const appointment = await createAppointment({
      tenantId: ctx.tenantId,
      customerId: customer.id,
      serviceId,
      staffId,
      startAt: payloadToStart(selected)
    });

    await clearState(ctx.tenantId, ctx.from);
    await send(ctx, `Randevunuz olusturuldu: ${formatDateTime(appointment.startAt)}. Hatirlatma mesajlari otomatik gonderilecek.`);
  } catch (error) {
    if (error instanceof AppointmentConflictError) {
      await send(ctx, "Bu saat az once doldu. Lutfen randevu almayi tekrar deneyin.");
      await startBooking(ctx);
      return;
    }
    throw error;
  }
}

async function handleSelectAppointment(ctx: FlowContext, payload: FlowPayload) {
  const appointmentIds = (payload.appointmentIds as string[] | undefined) ?? [];
  const choice = choiceNumber(ctx.body);
  const appointmentId = choice ? appointmentIds[choice - 1] : undefined;

  if (!appointmentId) {
    await send(ctx, "Gecerli bir randevu numarasi yazin veya menu icin 0 yazin.");
    return;
  }

  await saveState(ctx.tenantId, ctx.from, "CANCEL_OR_RESCHEDULE", { appointmentId });
  await send(ctx, "Ne yapmak istersiniz?\n1. Iptal et\n2. Saat degistir");
}

async function handleCancelOrReschedule(ctx: FlowContext, payload: FlowPayload) {
  const appointmentId = payload.appointmentId as string | undefined;
  const choice = choiceNumber(ctx.body);
  if (!appointmentId) {
    await clearState(ctx.tenantId, ctx.from);
    await send(ctx, menuText("Randevu bulunamadi."));
    return;
  }

  if (choice === 1) {
    await cancelAppointment({ tenantId: ctx.tenantId, appointmentId, reason: "WhatsApp uzerinden iptal edildi" });
    await clearState(ctx.tenantId, ctx.from);
    await send(ctx, "Randevunuz iptal edildi. Bosalan saat tekrar acildi.");
    return;
  }

  if (choice === 2) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId: ctx.tenantId, status: AppointmentStatus.BOOKED },
      select: { serviceId: true, staffId: true }
    });
    if (!appointment) {
      await clearState(ctx.tenantId, ctx.from);
      await send(ctx, "Aktif randevu bulunamadi.");
      return;
    }
    await askForSlot(ctx, { serviceId: appointment.serviceId, staffId: appointment.staffId, appointmentId });
    return;
  }

  await send(ctx, "Lutfen 1 veya 2 yazin.");
}

export async function handleIncomingMessage(ctx: FlowContext) {
  const body = ctx.body.trim();
  if (!body) {
    return;
  }

  await logMessage(ctx.tenantId, ctx.from, MessageDirection.INBOUND, body);
  await prisma.customer.upsert({
    where: { tenantId_phone: { tenantId: ctx.tenantId, phone: ctx.from } },
    create: { tenantId: ctx.tenantId, phone: ctx.from, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date() }
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantId },
    select: { greetingMessage: true, afterHoursMessage: true, address: true }
  });

  const normalized = normalize(body);
  if (normalized === "0" || normalized === "menu" || normalized === "menü" || normalized === "merhaba" || normalized === "selam") {
    await clearState(ctx.tenantId, ctx.from);
    await send(ctx, menuText(tenant.greetingMessage));
    return;
  }

  const state = await prisma.conversationState.findUnique({
    where: { tenantId_customerPhone: { tenantId: ctx.tenantId, customerPhone: ctx.from } }
  });

  if (!state || state.expiresAt < new Date()) {
    if (state) {
      await clearState(ctx.tenantId, ctx.from);
    }
    await handleMenu(ctx, tenant);
    return;
  }

  switch (state.state) {
    case "SELECT_SERVICE":
      await handleSelectService(ctx, state.payload as FlowPayload);
      return;
    case "SELECT_STAFF":
      await handleSelectStaff(ctx, state.payload as FlowPayload);
      return;
    case "SELECT_SLOT":
      await handleSelectSlot(ctx, state.payload as FlowPayload);
      return;
    case "CONFIRM_SLOT":
      await handleConfirmSlot(ctx, state.payload as FlowPayload);
      return;
    case "SELECT_APPOINTMENT":
      await handleSelectAppointment(ctx, state.payload as FlowPayload);
      return;
    case "CANCEL_OR_RESCHEDULE":
      await handleCancelOrReschedule(ctx, state.payload as FlowPayload);
      return;
    default:
      await clearState(ctx.tenantId, ctx.from);
      await send(ctx, menuText(tenant.greetingMessage));
  }
}

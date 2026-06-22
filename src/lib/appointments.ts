import {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  Prisma,
  ReminderKind,
  ReminderStatus
} from "@prisma/client";
import { addMinutes } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { generateUpcomingSlots, overlaps, type Slot, type WorkingWindow } from "@/lib/slots";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class AppointmentConflictError extends Error {
  constructor() {
    super("Secilen saat dolu. Lutfen baska bir saat secin.");
    this.name = "AppointmentConflictError";
  }
}

export function reminderRows(appointmentId: string, startAt: Date, now = new Date()) {
  const rows = [
    {
      appointmentId,
      kind: ReminderKind.DAY_BEFORE,
      dueAt: addMinutes(startAt, -24 * 60)
    },
    {
      appointmentId,
      kind: ReminderKind.TWO_HOURS_BEFORE,
      dueAt: addMinutes(startAt, -2 * 60)
    }
  ];

  return rows.map((row) => ({
    ...row,
    status: row.dueAt > now ? ReminderStatus.PENDING : ReminderStatus.SKIPPED
  }));
}

async function assertNoConflict(
  tx: DbClient,
  params: {
    tenantId: string;
    staffId: string;
    startAt: Date;
    endAt: Date;
    ignoreAppointmentId?: string;
  }
) {
  const conflicts = await tx.appointment.findMany({
    where: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      status: AppointmentStatus.BOOKED,
      startAt: { lt: params.endAt },
      endAt: { gt: params.startAt },
      id: params.ignoreAppointmentId ? { not: params.ignoreAppointmentId } : undefined
    },
    select: { id: true }
  });

  if (conflicts.length > 0) {
    throw new AppointmentConflictError();
  }
}

export async function createAppointment(params: {
  tenantId: string;
  customerId: string;
  staffId: string;
  serviceId: string;
  startAt: Date;
  source?: AppointmentSource;
}) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findFirstOrThrow({
      where: { id: params.serviceId, tenantId: params.tenantId, active: true }
    });
    const staff = await tx.staff.findFirstOrThrow({
      where: { id: params.staffId, tenantId: params.tenantId, active: true }
    });
    const endAt = addMinutes(params.startAt, service.durationMinutes);

    await assertNoConflict(tx, {
      tenantId: params.tenantId,
      staffId: staff.id,
      startAt: params.startAt,
      endAt
    });

    const appointment = await tx.appointment.create({
      data: {
        tenantId: params.tenantId,
        customerId: params.customerId,
        staffId: staff.id,
        serviceId: service.id,
        startAt: params.startAt,
        endAt,
        source: params.source ?? AppointmentSource.WHATSAPP
      }
    });

    await tx.reminder.createMany({
      data: reminderRows(appointment.id, appointment.startAt),
      skipDuplicates: true
    });

    return appointment;
  });
}

export async function rescheduleAppointment(params: {
  tenantId: string;
  appointmentId: string;
  startAt: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findFirstOrThrow({
      where: {
        id: params.appointmentId,
        tenantId: params.tenantId,
        status: AppointmentStatus.BOOKED
      },
      include: { service: true }
    });
    const endAt = addMinutes(params.startAt, appointment.service.durationMinutes);

    await assertNoConflict(tx, {
      tenantId: params.tenantId,
      staffId: appointment.staffId,
      startAt: params.startAt,
      endAt,
      ignoreAppointmentId: appointment.id
    });

    const updated = await tx.appointment.update({
      where: { id: appointment.id },
      data: { startAt: params.startAt, endAt }
    });

    await tx.reminder.deleteMany({ where: { appointmentId: appointment.id } });
    await tx.reminder.createMany({
      data: reminderRows(updated.id, updated.startAt),
      skipDuplicates: true
    });

    return updated;
  });
}

export async function cancelAppointment(params: {
  tenantId: string;
  appointmentId: string;
  reason?: string;
}) {
  return prisma.appointment.updateMany({
    where: {
      id: params.appointmentId,
      tenantId: params.tenantId,
      status: AppointmentStatus.BOOKED
    },
    data: {
      status: AppointmentStatus.CANCELLED,
      cancelReason: params.reason ?? "Musteri tarafindan iptal edildi"
    }
  });
}

export async function getAvailableSlots(params: {
  tenantId: string;
  staffId: string;
  serviceId: string;
  now?: Date;
  days?: number;
  limit?: number;
  ignoreAppointmentId?: string;
}) {
  const [service, workingHours, appointments] = await Promise.all([
    prisma.service.findFirstOrThrow({
      where: { id: params.serviceId, tenantId: params.tenantId, active: true }
    }),
    prisma.workingHour.findMany({
      where: { tenantId: params.tenantId, staffId: params.staffId },
      orderBy: { weekday: "asc" }
    }),
    prisma.appointment.findMany({
      where: {
        tenantId: params.tenantId,
        staffId: params.staffId,
        status: AppointmentStatus.BOOKED,
        id: params.ignoreAppointmentId ? { not: params.ignoreAppointmentId } : undefined
      }
    })
  ]);

  return generateUpcomingSlots({
    serviceDurationMinutes: service.durationMinutes,
    workingHours: workingHours.map((item): WorkingWindow => ({
      weekday: item.weekday,
      startMinute: item.startMinute,
      endMinute: item.endMinute,
      closed: item.closed
    })),
    appointments,
    now: params.now,
    days: params.days,
    limit: params.limit
  });
}

export async function isStaffSlotAvailable(params: {
  tenantId: string;
  staffId: string;
  serviceId: string;
  startAt: Date;
  ignoreAppointmentId?: string;
}) {
  const service = await prisma.service.findFirstOrThrow({
    where: { id: params.serviceId, tenantId: params.tenantId, active: true }
  });
  const endAt = addMinutes(params.startAt, service.durationMinutes);
  const conflicts = await prisma.appointment.findMany({
    where: {
      tenantId: params.tenantId,
      staffId: params.staffId,
      status: AppointmentStatus.BOOKED,
      startAt: { lt: endAt },
      endAt: { gt: params.startAt },
      id: params.ignoreAppointmentId ? { not: params.ignoreAppointmentId } : undefined
    },
    select: { id: true }
  });
  return conflicts.length === 0;
}

export function slotToPayload(slot: Slot) {
  return {
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString()
  };
}

export function payloadToStart(payload: { startAt: string }) {
  return new Date(payload.startAt);
}

export function formatAppointmentLine(
  appointment: Appointment & {
    service: { name: string };
    staff: { name: string };
  }
) {
  return `${appointment.service.name} - ${appointment.staff.name} - ${new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(appointment.startAt)}`;
}

export function appointmentsOverlap(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }) {
  return overlaps(a.startAt, a.endAt, b.startAt, b.endAt);
}

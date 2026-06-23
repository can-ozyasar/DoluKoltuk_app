import { AppointmentStatus, ReminderStatus } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type ReminderSender = (tenantId: string, to: string, body: string) => Promise<void>;

type ReminderOptions = {
  tenantIds: string[];
  workerId: string;
  maxAttempts?: number;
  batchSize?: number;
};

function reminderBody(reminder: {
  appointment: {
    startAt: Date;
    tenant: { name: string };
    service: { name: string };
    staff: { name: string };
  };
}) {
  const appointment = reminder.appointment;
  return [
    `${appointment.tenant.name} randevu hatirlatmasi`,
    `${appointment.service.name} - ${appointment.staff.name}`,
    `Tarih: ${formatDateTime(appointment.startAt)}`,
    "",
    "Gelemeyecekseniz bu sohbetten randevunuzu iptal edebilir veya degistirebilirsiniz."
  ].join("\n");
}

async function claimReminder(reminderId: string, workerId: string) {
  const claimed = await prisma.reminder.updateMany({
    where: {
      id: reminderId,
      status: ReminderStatus.PENDING,
      dueAt: { lte: new Date() }
    },
    data: {
      status: ReminderStatus.PROCESSING,
      lockedAt: new Date(),
      lockedBy: workerId,
      lastError: null
    }
  });

  if (claimed.count !== 1) {
    return null;
  }

  return prisma.reminder.findUnique({
    where: { id: reminderId },
    include: {
      appointment: {
        include: {
          tenant: true,
          customer: true,
          service: true,
          staff: true
        }
      }
    }
  });
}

export async function sendDueReminders(sendText: ReminderSender, options: ReminderOptions) {
  if (options.tenantIds.length === 0) {
    return;
  }

  const maxAttempts = options.maxAttempts ?? 10;
  const batchSize = options.batchSize ?? 50;
  const candidates = await prisma.reminder.findMany({
    where: {
      status: ReminderStatus.PENDING,
      dueAt: { lte: new Date() },
      attemptCount: { lt: maxAttempts },
      appointment: {
        tenantId: { in: options.tenantIds }
      }
    },
    select: { id: true },
    orderBy: { dueAt: "asc" },
    take: batchSize
  });

  for (const candidate of candidates) {
    const reminder = await claimReminder(candidate.id, options.workerId);
    if (!reminder) {
      continue;
    }

    if (reminder.appointment.status !== AppointmentStatus.BOOKED || reminder.appointment.startAt <= new Date()) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: ReminderStatus.SKIPPED,
          lockedAt: null,
          lockedBy: null,
          lastError: null
        }
      });
      continue;
    }

    try {
      await sendText(reminder.appointment.tenantId, reminder.appointment.customer.phone, reminderBody(reminder));
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: ReminderStatus.SENT,
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null
        }
      });
    } catch (error) {
      const nextAttemptCount = reminder.attemptCount + 1;
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: nextAttemptCount >= maxAttempts ? ReminderStatus.FAILED : ReminderStatus.PENDING,
          attemptCount: { increment: 1 },
          lockedAt: null,
          lockedBy: null,
          lastError: error instanceof Error ? error.message : "Hatirlatma gonderilemedi"
        }
      });
    }
  }

  await prisma.reminder.updateMany({
    where: {
      status: ReminderStatus.PROCESSING,
      lockedAt: { lt: new Date(Date.now() - 10 * 60_000) },
      appointment: {
        tenantId: { in: options.tenantIds }
      }
    },
    data: {
      status: ReminderStatus.PENDING,
      lockedAt: null,
      lockedBy: null,
      lastError: "Worker kilidi zaman asimina ugradi, tekrar denenecek"
    }
  });
}

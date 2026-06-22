import { AppointmentStatus, ReminderStatus } from "@prisma/client";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type ReminderSender = (tenantId: string, to: string, body: string) => Promise<void>;

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

export async function sendDueReminders(sendText: ReminderSender) {
  const reminders = await prisma.reminder.findMany({
    where: {
      status: ReminderStatus.PENDING,
      dueAt: { lte: new Date() }
    },
    include: {
      appointment: {
        include: {
          tenant: true,
          customer: true,
          service: true,
          staff: true
        }
      }
    },
    orderBy: { dueAt: "asc" },
    take: 50
  });

  for (const reminder of reminders) {
    if (reminder.appointment.status !== AppointmentStatus.BOOKED || reminder.appointment.startAt <= new Date()) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.SKIPPED, lastError: null }
      });
      continue;
    }

    try {
      await sendText(reminder.appointment.tenantId, reminder.appointment.customer.phone, reminderBody(reminder));
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.SENT, sentAt: new Date(), lastError: null }
      });
    } catch (error) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { lastError: error instanceof Error ? error.message : "Hatirlatma gonderilemedi" }
      });
    }
  }
}

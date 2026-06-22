import { addDays, localDateFromInput, localDateInput, minutesSinceLocalMidnight } from "@/lib/dates";

export type WorkingWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  closed: boolean;
};

export type ExistingAppointment = {
  id?: string;
  startAt: Date;
  endAt: Date;
  status: string;
};

export type Slot = {
  startAt: Date;
  endAt: Date;
};

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export function isBookableStatus(status: string) {
  return status === "BOOKED";
}

export function generateSlotsForDate(params: {
  dateInput: string;
  serviceDurationMinutes: number;
  workingHours: WorkingWindow[];
  appointments: ExistingAppointment[];
  now?: Date;
  stepMinutes?: number;
}) {
  const step = params.stepMinutes ?? 15;
  const day = localDateFromInput(params.dateInput);
  const weekday = day.getDay();
  const working = params.workingHours.find((item) => item.weekday === weekday);

  if (!working || working.closed) {
    return [];
  }

  const slots: Slot[] = [];
  const latestStart = working.endMinute - params.serviceDurationMinutes;

  for (let minute = working.startMinute; minute <= latestStart; minute += step) {
    const startAt = localDateFromInput(params.dateInput, minute);
    const endAt = localDateFromInput(params.dateInput, minute + params.serviceDurationMinutes);

    if (params.now && startAt <= params.now) {
      continue;
    }

    const hasConflict = params.appointments.some((appointment) => {
      if (!isBookableStatus(appointment.status)) {
        return false;
      }
      return overlaps(startAt, endAt, appointment.startAt, appointment.endAt);
    });

    if (!hasConflict) {
      slots.push({ startAt, endAt });
    }
  }

  return slots;
}

export function generateUpcomingSlots(params: {
  serviceDurationMinutes: number;
  workingHours: WorkingWindow[];
  appointments: ExistingAppointment[];
  now?: Date;
  days?: number;
  limit?: number;
}) {
  const now = params.now ?? new Date();
  const days = params.days ?? 7;
  const limit = params.limit ?? 12;
  const slots: Slot[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const day = addDays(now, dayOffset);
    const dateInput = localDateInput(day);
    const dayStart = localDateFromInput(dateInput);
    const dayEnd = localDateFromInput(dateInput, 24 * 60 - 1);
    const appointments = params.appointments.filter((appointment) =>
      overlaps(dayStart, dayEnd, appointment.startAt, appointment.endAt)
    );

    slots.push(
      ...generateSlotsForDate({
        dateInput,
        serviceDurationMinutes: params.serviceDurationMinutes,
        workingHours: params.workingHours,
        appointments,
        now
      })
    );

    if (slots.length >= limit) {
      return slots.slice(0, limit);
    }
  }

  return slots;
}

export function isWithinWorkingHours(params: { date: Date; workingHours: WorkingWindow[] }) {
  const weekday = params.date.getDay();
  const minute = minutesSinceLocalMidnight(params.date);
  const working = params.workingHours.find((item) => item.weekday === weekday);
  if (!working || working.closed) {
    return false;
  }
  return minute >= working.startMinute && minute < working.endMinute;
}

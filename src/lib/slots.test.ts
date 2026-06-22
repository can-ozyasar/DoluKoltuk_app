import { describe, expect, it } from "vitest";
import { generateSlotsForDate, overlaps } from "@/lib/slots";

describe("slot engine", () => {
  it("filters overlapping appointments by service duration", () => {
    const slots = generateSlotsForDate({
      dateInput: "2026-06-22",
      serviceDurationMinutes: 30,
      workingHours: [{ weekday: 1, startMinute: 9 * 60, endMinute: 11 * 60, closed: false }],
      appointments: [
        {
          startAt: new Date(2026, 5, 22, 9, 30),
          endAt: new Date(2026, 5, 22, 10, 0),
          status: "BOOKED"
        }
      ],
      stepMinutes: 30
    });

    expect(slots.map((slot) => slot.startAt.getHours() * 60 + slot.startAt.getMinutes())).toEqual([
      9 * 60,
      10 * 60,
      10 * 60 + 30
    ]);
  });

  it("does not block cancelled appointments", () => {
    const slots = generateSlotsForDate({
      dateInput: "2026-06-22",
      serviceDurationMinutes: 60,
      workingHours: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60, closed: false }],
      appointments: [
        {
          startAt: new Date(2026, 5, 22, 9, 0),
          endAt: new Date(2026, 5, 22, 10, 0),
          status: "CANCELLED"
        }
      ]
    });

    expect(slots).toHaveLength(1);
  });

  it("uses strict overlap boundaries", () => {
    expect(overlaps(new Date(2026, 0, 1, 9), new Date(2026, 0, 1, 10), new Date(2026, 0, 1, 10), new Date(2026, 0, 1, 11))).toBe(false);
    expect(overlaps(new Date(2026, 0, 1, 9), new Date(2026, 0, 1, 10), new Date(2026, 0, 1, 9, 30), new Date(2026, 0, 1, 10, 30))).toBe(true);
  });
});

const weekdayNames = ["Pazar", "Pazartesi", "Sali", "Carsamba", "Persembe", "Cuma", "Cumartesi"];

export function slugify(input: string) {
  return input
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2
  }).format(cents / 100);
}

export function parseMoneyToCents(value: unknown) {
  const raw = String(value ?? "0").replace(",", ".").trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

export function minuteToLabel(minute: number) {
  const hour = Math.floor(minute / 60)
    .toString()
    .padStart(2, "0");
  const min = (minute % 60).toString().padStart(2, "0");
  return `${hour}:${min}`;
}

export function labelToMinute(label: string) {
  const [hourRaw, minuteRaw] = label.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return 0;
  }
  return Math.min(Math.max(hour * 60 + minute, 0), 24 * 60);
}

export function weekdayName(weekday: number) {
  return weekdayNames[weekday] ?? `Gun ${weekday}`;
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

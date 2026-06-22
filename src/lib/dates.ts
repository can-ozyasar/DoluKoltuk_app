export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function localDateFromInput(dateInput: string, minute = 0) {
  const [year, month, day] = dateInput.split("-").map(Number);
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  return new Date(year, month - 1, day, hour, minutes, 0, 0);
}

export function localDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function minutesSinceLocalMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

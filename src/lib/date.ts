export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function addDays(key: string, delta: number): string {
  const dt = parseDateKey(key);
  dt.setDate(dt.getDate() + delta);
  return toLocalDateKey(dt);
}

export function getMondayOfWeek(key: string): string {
  const dt = parseDateKey(key);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return toLocalDateKey(dt);
}

export function getWeekDates(anchorKey: string): string[] {
  const monday = getMondayOfWeek(anchorKey);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function getIsoWeekKey(key: string): string {
  const monday = getMondayOfWeek(key);
  return monday;
}

export function formatShortDay(key: string): string {
  const dt = parseDateKey(key);
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

export function formatDisplayDate(key: string): string {
  const today = toLocalDateKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  const dt = parseDateKey(key);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function daysBetween(earlierKey: string, laterKey: string): number {
  const a = parseDateKey(earlierKey).getTime();
  const b = parseDateKey(laterKey).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

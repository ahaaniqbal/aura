// Date helpers shared by Today, People and the person sheet.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function todayLabel(): string {
  const d = new Date();
  return `${DAYS[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;
}

// Birthdays arrive as "YYYY-MM-DD" or "MM-DD"; the month and day are always the last two parts.
function monthDay(b?: string | null): [number, number] | null {
  if (!b) return null;
  const parts = String(b).split(/[-/]/).map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
  if (parts.length < 2) return null;
  const month = parts[parts.length - 2], day = parts[parts.length - 1];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [month, day];
}

export function fmtBday(b?: string | null): string {
  const md = monthDay(b);
  return md ? `${MONTHS[md[0] - 1]} ${md[1]}` : "";
}

export function daysUntilBirthday(b?: string | null): number | null {
  const md = monthDay(b);
  if (!md) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let next = new Date(now.getFullYear(), md[0] - 1, md[1]);
  if (next.getTime() < now.getTime()) next = new Date(now.getFullYear() + 1, md[0] - 1, md[1]);
  return Math.round((next.getTime() - now.getTime()) / 86400000);
}

export function inDays(d: number): string {
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export type DueTone = "over" | "soon" | "later";
export function dueMeta(due: string | null): { label: string; tone: DueTone; rank: number } | null {
  if (!due) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(due);
  if (!m) return { label: due, tone: "later", rank: 9000 };
  const d = new Date(+m[1], +m[2] - 1, +m[3]); d.setHours(0, 0, 0, 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (days < 0) return { label: "Overdue", tone: "over", rank: days };
  if (days === 0) return { label: "Due today", tone: "over", rank: 0 };
  if (days === 1) return { label: "Tomorrow", tone: "soon", rank: 1 };
  if (days <= 4) return { label: `In ${days} days`, tone: "soon", rank: days };
  return { label: `${MONTHS[+m[2] - 1]} ${+m[3]}`, tone: "later", rank: days };
}

export function capitalize(s: string): string {
  const v = String(s || "");
  return v ? v[0].toUpperCase() + v.slice(1) : v;
}

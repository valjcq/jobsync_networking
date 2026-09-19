// The UI stores interaction and last-contacted dates as the local midnight of
// the picked day, so MCP input is parsed the same way: YYYY-MM-DD at
// server-local midnight. Anything else is rejected rather than guessed at, so
// a stray ISO timestamp or "next Tuesday" never lands on the wrong day.

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: string, field: string): Date {
  const fail = () =>
    new Error(
      `${field} must be a calendar date in YYYY-MM-DD format (e.g. 2026-09-20), got "${value}".`,
    );
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) throw fail();

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // new Date rolls 2026-02-30 over to March; a round-trip check rejects it.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw fail();
  }
  return date;
}

export function todayLocalMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

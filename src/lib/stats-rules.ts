// Admin dashboard reset ("Statistikani 0 qilish"): figures count only from the reset moment.
// Pure, so it is tested; the records themselves are never deleted.

/** Start of the shown period: the later of the chosen range start and the last reset. */
export function statsStart(periodStart: Date, resetAt: string | undefined): Date {
  const r = resetAt ? new Date(resetAt) : null;
  return r && Number.isFinite(r.getTime()) && r > periodStart ? r : periodStart;
}

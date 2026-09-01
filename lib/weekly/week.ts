/**
 * KST weekly report calendar: Monday 00:00 through Sunday 23:59:59.
 * weekId is the Monday date (YYYY-MM-DD).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export type KstWeek = {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  label: string;
  shortRange: string;
  monthWeek: number;
  year: number;
  month: number;
};

function kstParts(now: Date = new Date()): {
  y: number;
  m: number;
  d: number;
} {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return {
    y: kst.getUTCFullYear(),
    m: kst.getUTCMonth() + 1,
    d: kst.getUTCDate(),
  };
}

export function kstTodayIso(now: Date = new Date()): string {
  const { y, m, d } = kstParts(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isoFromUtcDate(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000;
  const dt = new Date(utc);
  return isoFromUtcDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function weekdayMon0(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return utcDay === 0 ? 6 : utcDay - 1;
}

export function mondayOfIso(iso: string): string {
  return addDaysIso(iso, -weekdayMon0(iso));
}

export function sundayOfMonday(mondayIso: string): string {
  return addDaysIso(mondayIso, 6);
}

/** 1-based week-of-month using weekStart day: 1–7 → 1주차. */
export function monthWeekNumber(weekStartIso: string): number {
  const day = Number(weekStartIso.slice(8, 10));
  return Math.ceil(day / 7);
}

export function formatShortRange(startIso: string, endIso: string): string {
  const s = startIso.split("-").map(Number);
  const e = endIso.split("-").map(Number);
  return `${s[1]}.${String(s[2]).padStart(2, "0")}~${e[1]}.${String(e[2]).padStart(2, "0")}`;
}

export function formatWeekLabel(weekStartIso: string, weekEndIso: string): string {
  const [y, m] = weekStartIso.split("-").map(Number);
  const nth = monthWeekNumber(weekStartIso);
  return `${y}년 ${m}월 ${nth}주차 (${formatShortRange(weekStartIso, weekEndIso)})`;
}

export function getKstWeek(mondayOrAnyIso: string): KstWeek {
  const weekStart = mondayOfIso(mondayOrAnyIso);
  const weekEnd = sundayOfMonday(weekStart);
  const [y, m] = weekStart.split("-").map(Number);
  return {
    weekId: weekStart,
    weekStart,
    weekEnd,
    label: formatWeekLabel(weekStart, weekEnd),
    shortRange: formatShortRange(weekStart, weekEnd),
    monthWeek: monthWeekNumber(weekStart),
    year: y,
    month: m,
  };
}

export function currentKstWeek(now: Date = new Date()): KstWeek {
  return getKstWeek(kstTodayIso(now));
}

export function previousKstWeek(week: KstWeek): KstWeek {
  return getKstWeek(addDaysIso(week.weekStart, -7));
}

export function listRecentKstWeeks(
  count: number,
  now: Date = new Date(),
): KstWeek[] {
  const current = currentKstWeek(now);
  const out: KstWeek[] = [];
  for (let i = 0; i < Math.max(1, count); i += 1) {
    out.push(getKstWeek(addDaysIso(current.weekStart, -7 * i)));
  }
  return out;
}

export function weeksOverlappingRange(
  earliestIso: string,
  latestIso: string,
): KstWeek[] {
  const start = mondayOfIso(earliestIso);
  const endMonday = mondayOfIso(latestIso);
  const out: KstWeek[] = [];
  let cursor = start;
  while (cursor <= endMonday) {
    out.push(getKstWeek(cursor));
    cursor = addDaysIso(cursor, 7);
  }
  return out;
}

export function isPartialWeek(
  week: KstWeek,
  options: { todayIso: string; earliestDataIso?: string | null; analyzableCount: number },
): boolean {
  if (options.analyzableCount < 8) return true;
  if (week.weekEnd >= options.todayIso && week.weekStart <= options.todayIso) {
    return week.weekEnd > options.todayIso || week.weekStart < options.todayIso;
  }
  if (options.earliestDataIso && options.earliestDataIso > week.weekStart) {
    return true;
  }
  return false;
}

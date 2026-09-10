import type { Shift, Weather } from '../types';

/** 実働分数。日をまたぐ稼働（22:00→翌2:00）にも対応する。 */
export function workedMinutes(shift: Pick<Shift, 'startMinutes' | 'endMinutes' | 'breakMinutes'>): number {
  const span = shift.endMinutes >= shift.startMinutes
    ? shift.endMinutes - shift.startMinutes
    : shift.endMinutes + 1440 - shift.startMinutes;
  return Math.max(0, span - Math.max(0, shift.breakMinutes));
}

/** 手取り = 報酬 + チップ - 経費 */
export function netEarnings(shift: Pick<Shift, 'earnings' | 'tips' | 'expenses'>): number {
  return shift.earnings + shift.tips - shift.expenses;
}

/** 実質時給。実働 0 分なら 0 を返す（Infinity を UI に出さないため）。 */
export function hourlyRate(shift: Shift): number {
  const minutes = workedMinutes(shift);
  if (minutes <= 0) return 0;
  return Math.round((netEarnings(shift) / minutes) * 60);
}

/** 1 件あたりの単価 */
export function perDelivery(shift: Shift): number {
  if (shift.deliveries <= 0) return 0;
  return Math.round((shift.earnings + shift.tips) / shift.deliveries);
}

/** 1 時間あたりの件数 */
export function deliveriesPerHour(shift: Shift): number {
  const minutes = workedMinutes(shift);
  if (minutes <= 0) return 0;
  return Math.round((shift.deliveries / minutes) * 60 * 10) / 10;
}

export type Totals = {
  shifts: number;
  minutes: number;
  deliveries: number;
  earnings: number;
  tips: number;
  expenses: number;
  net: number;
  distanceKm: number;
  hourlyRate: number;
  perDelivery: number;
  deliveriesPerHour: number;
};

export const EMPTY_TOTALS: Totals = {
  shifts: 0, minutes: 0, deliveries: 0, earnings: 0, tips: 0,
  expenses: 0, net: 0, distanceKm: 0, hourlyRate: 0, perDelivery: 0, deliveriesPerHour: 0,
};

export function summarize(shifts: Shift[]): Totals {
  if (shifts.length === 0) return EMPTY_TOTALS;
  const t = shifts.reduce((acc, s) => {
    acc.shifts += 1;
    acc.minutes += workedMinutes(s);
    acc.deliveries += s.deliveries;
    acc.earnings += s.earnings;
    acc.tips += s.tips;
    acc.expenses += s.expenses;
    acc.distanceKm += s.distanceKm;
    return acc;
  }, { ...EMPTY_TOTALS });
  t.net = t.earnings + t.tips - t.expenses;
  t.hourlyRate = t.minutes > 0 ? Math.round((t.net / t.minutes) * 60) : 0;
  t.perDelivery = t.deliveries > 0 ? Math.round((t.earnings + t.tips) / t.deliveries) : 0;
  t.deliveriesPerHour = t.minutes > 0 ? Math.round((t.deliveries / t.minutes) * 60 * 10) / 10 : 0;
  t.distanceKm = Math.round(t.distanceKm * 10) / 10;
  return t;
}

/* ---------- 期間 ---------- */

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // 月曜はじまり
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';

/** 指定期間に入る記録だけを返す */
export function filterByPeriod(shifts: Shift[], period: Period, today = new Date()): Shift[] {
  if (period === 'all') return shifts;
  const todayISO = toISODate(today);
  if (period === 'day') return shifts.filter((s) => s.date === todayISO);
  if (period === 'year') return shifts.filter((s) => s.date.slice(0, 4) === todayISO.slice(0, 4));
  if (period === 'month') return shifts.filter((s) => s.date.slice(0, 7) === todayISO.slice(0, 7));
  const from = toISODate(startOfWeek(today));
  return shifts.filter((s) => s.date >= from && s.date <= todayISO);
}

/* ---------- 「いつ稼げるか」の分析 ---------- */

export type Breakdown = { key: string; label: string; totals: Totals };

function group(shifts: Shift[], keyOf: (s: Shift) => string, labelOf: (key: string) => string): Breakdown[] {
  const map = new Map<string, Shift[]>();
  for (const s of shifts) {
    const key = keyOf(s);
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, label: labelOf(key), totals: summarize(list) }))
    .sort((a, b) => b.totals.hourlyRate - a.totals.hourlyRate);
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export function weekdayOf(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 曜日別の実質時給。どの曜日に出るのが得かを見るため。 */
export function byWeekday(shifts: Shift[]): Breakdown[] {
  return group(shifts, (s) => String(weekdayOf(s.date)), (k) => WEEKDAY_LABELS[Number(k)]);
}

const WEATHER_LABELS: Record<Weather, string> = { sunny: '晴れ', cloudy: '曇り', rain: '雨', snow: '雪' };

/** 天気別の実質時給。雨の日に出る価値を数字で見るため。 */
export function byWeather(shifts: Shift[]): Breakdown[] {
  return group(shifts, (s) => s.weather, (k) => WEATHER_LABELS[k as Weather] ?? k);
}

export function byService(shifts: Shift[]): Breakdown[] {
  return group(shifts, (s) => s.service, (k) => k);
}

/** 直近 n 日の日別手取り。棒グラフ用。 */
export function dailyNet(shifts: Shift[], days: number, today = new Date()): { date: string; net: number }[] {
  const out: { date: string; net: number }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const iso = toISODate(d);
    const net = shifts.filter((s) => s.date === iso).reduce((sum, s) => sum + netEarnings(s), 0);
    out.push({ date: iso, net });
  }
  return out;
}

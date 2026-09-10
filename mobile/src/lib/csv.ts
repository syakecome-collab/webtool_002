import type { Shift } from '../types';
import { workedMinutes, netEarnings, hourlyRate } from './calc';

const HEADERS = [
  '日付', 'サービス', '開始', '終了', '休憩(分)', '実働(分)',
  '件数', '報酬', 'チップ', '経費', '手取り', '実質時給', '距離(km)', '天気', 'メモ',
];

const WEATHER_LABELS: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rain: '雨', snow: '雪' };

export function minutesToClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function escape(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * 確定申告や表計算に持っていくための CSV。
 * Excel が UTF-8 を判別できるよう BOM を付ける。
 */
export function buildCSV(shifts: Shift[]): string {
  const rows = [...shifts]
    .sort((a, b) => (a.date === b.date ? a.startMinutes - b.startMinutes : a.date.localeCompare(b.date)))
    .map((s) => [
      s.date,
      s.service,
      minutesToClock(s.startMinutes),
      minutesToClock(s.endMinutes),
      s.breakMinutes,
      workedMinutes(s),
      s.deliveries,
      s.earnings,
      s.tips,
      s.expenses,
      netEarnings(s),
      hourlyRate(s),
      s.distanceKm,
      WEATHER_LABELS[s.weather] ?? s.weather,
      s.memo,
    ].map(escape).join(','));
  return `﻿${HEADERS.join(',')}\n${rows.join('\n')}\n`;
}

/** 年ごとの売上・経費の合計。確定申告の下書きに使う。 */
export function taxSummary(shifts: Shift[], year: number) {
  const target = shifts.filter((s) => s.date.startsWith(String(year)));
  const income = target.reduce((sum, s) => sum + s.earnings + s.tips, 0);
  const expenses = target.reduce((sum, s) => sum + s.expenses, 0);
  return { year, income, expenses, profit: income - expenses, shifts: target.length };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  workedMinutes, netEarnings, hourlyRate, perDelivery, deliveriesPerHour,
  summarize, filterByPeriod, byWeekday, byWeather, dailyNet, startOfWeek, toISODate,
} from '../src/lib/calc.ts';
import { buildCSV, minutesToClock, taxSummary } from '../src/lib/csv.ts';
import type { Shift } from '../src/types.ts';

function shift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'x', date: '2026-09-10', service: 'Uber Eats',
    startMinutes: 11 * 60, endMinutes: 20 * 60, breakMinutes: 60,
    deliveries: 20, earnings: 12000, tips: 800, expenses: 1200,
    distanceKm: 60, weather: 'sunny', memo: '', ...over,
  };
}

test('実働時間から休憩を引く', () => {
  assert.equal(workedMinutes(shift()), 8 * 60);
});

test('日をまたぐ稼働も正しく数える', () => {
  assert.equal(workedMinutes(shift({ startMinutes: 22 * 60, endMinutes: 2 * 60, breakMinutes: 0 })), 4 * 60);
});

test('休憩が実働を超えてもマイナスにしない', () => {
  assert.equal(workedMinutes(shift({ startMinutes: 600, endMinutes: 660, breakMinutes: 120 })), 0);
});

test('手取りは報酬＋チップ−経費', () => {
  assert.equal(netEarnings(shift()), 11600);
});

test('実質時給は経費を引いた額から出す', () => {
  assert.equal(hourlyRate(shift()), 1450);
});

test('実働 0 分でも時給を Infinity にしない', () => {
  assert.equal(hourlyRate(shift({ startMinutes: 600, endMinutes: 600, breakMinutes: 0 })), 0);
});

test('1 件単価と時間あたり件数', () => {
  assert.equal(perDelivery(shift()), 640);
  assert.equal(deliveriesPerHour(shift()), 2.5);
  assert.equal(perDelivery(shift({ deliveries: 0 })), 0);
});

test('複数日をまとめて集計する', () => {
  const t = summarize([shift(), shift({ date: '2026-09-11', earnings: 8000, tips: 0, expenses: 800, deliveries: 12 })]);
  assert.equal(t.shifts, 2);
  assert.equal(t.deliveries, 32);
  assert.equal(t.net, 11600 + 7200);
  assert.equal(t.minutes, 16 * 60);
  assert.equal(t.hourlyRate, Math.round((11600 + 7200) / 16));
});

test('記録が無いときは 0 で埋めた集計を返す', () => {
  assert.equal(summarize([]).hourlyRate, 0);
  assert.equal(summarize([]).shifts, 0);
});

test('週は月曜はじまり', () => {
  assert.equal(toISODate(startOfWeek(new Date('2026-09-10T12:00:00'))), '2026-09-07');
  assert.equal(toISODate(startOfWeek(new Date('2026-09-07T12:00:00'))), '2026-09-07');
});

test('期間で絞り込む', () => {
  const today = new Date('2026-09-10T12:00:00');
  const list = [shift({ date: '2026-09-10' }), shift({ date: '2026-09-08' }), shift({ date: '2026-08-31' }), shift({ date: '2025-12-01' })];
  assert.equal(filterByPeriod(list, 'day', today).length, 1);
  assert.equal(filterByPeriod(list, 'week', today).length, 2);
  assert.equal(filterByPeriod(list, 'month', today).length, 2);
  assert.equal(filterByPeriod(list, 'year', today).length, 3);
  assert.equal(filterByPeriod(list, 'all', today).length, 4);
});

test('曜日別・天気別は時給の高い順に並ぶ', () => {
  const list = [
    shift({ date: '2026-09-10', weather: 'sunny', earnings: 8000, tips: 0, expenses: 0 }),
    shift({ date: '2026-09-12', weather: 'rain', earnings: 16000, tips: 0, expenses: 0 }),
  ];
  const weather = byWeather(list);
  assert.equal(weather[0].label, '雨');
  assert.equal(weather[0].totals.hourlyRate, 2000);
  const weekday = byWeekday(list);
  assert.equal(weekday[0].label, '土');
});

test('直近 n 日の手取りは記録が無い日も 0 で埋める', () => {
  const rows = dailyNet([shift({ date: '2026-09-10' })], 3, new Date('2026-09-10T12:00:00'));
  assert.deepEqual(rows.map((r) => r.date), ['2026-09-08', '2026-09-09', '2026-09-10']);
  assert.deepEqual(rows.map((r) => r.net), [0, 0, 11600]);
});

test('CSV は BOM 付きで、カンマや引用符を壊さない', () => {
  const csv = buildCSV([shift({ memo: '雨,強風の"日"' })]);
  assert.ok(csv.startsWith('﻿日付,'));
  assert.match(csv, /"雨,強風の""日"""/);
  assert.match(csv, /2026-09-10,Uber Eats,11:00,20:00,60,480,20,12000,800,1200,11600,1450,60,晴れ/);
});

test('CSV は日付と開始時刻の順に並ぶ', () => {
  const csv = buildCSV([shift({ date: '2026-09-11' }), shift({ date: '2026-09-10', startMinutes: 600 }), shift({ date: '2026-09-10', startMinutes: 540 })]);
  const dates = csv.trim().split('\n').slice(1).map((l) => l.split(',').slice(0, 3).join(' '));
  assert.deepEqual(dates, ['2026-09-10 Uber Eats 09:00', '2026-09-10 Uber Eats 10:00', '2026-09-11 Uber Eats 11:00']);
});

test('時刻表示は 24 時間を丸める', () => {
  assert.equal(minutesToClock(0), '00:00');
  assert.equal(minutesToClock(1500), '01:00');
  assert.equal(minutesToClock(-60), '23:00');
});

test('年ごとの売上と経費をまとめる', () => {
  const s = taxSummary([shift({ date: '2026-03-01' }), shift({ date: '2025-03-01' })], 2026);
  assert.equal(s.shifts, 1);
  assert.equal(s.income, 12800);
  assert.equal(s.expenses, 1200);
  assert.equal(s.profit, 11600);
});

/* --- 入力の解釈 --- */
import { parseClock, parseNumber, yen, hoursLabel } from '../src/lib/parse.ts';

test('雑に打たれた時刻を解釈する', () => {
  assert.equal(parseClock('9:05'), 545);
  assert.equal(parseClock('０９：０５'), 545);
  assert.equal(parseClock('0930'), 570);
  assert.equal(parseClock('930'), 570);
  assert.equal(parseClock('21'), 21 * 60);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('9:70'), null);
  assert.equal(parseClock('あ'), null);
});

test('金額入力からカンマや単位を取り除く', () => {
  assert.equal(parseNumber('12,000円'), 12000);
  assert.equal(parseNumber('１２０００'), 12000);
  assert.equal(parseNumber('60km'), 60);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber(''), 0);
  assert.equal(parseNumber('abc'), 0);
});

test('表示の整形', () => {
  assert.equal(yen(11600), '¥11,600');
  assert.equal(hoursLabel(480), '8時間');
  assert.equal(hoursLabel(510), '8時間30分');
});

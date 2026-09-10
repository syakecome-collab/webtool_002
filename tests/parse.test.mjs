import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, findDates, findTimes, inferYear } from '../js/parse.js';
import { buildICS, buildCSV, gcalUrl, resolveTimes } from '../js/export.js';
import { sanitize } from '../js/ai.js';

const REF = '2026-09-10';
const parse = (text) => parseEvents(text, { reference: REF });

test('和暦・西暦・スラッシュ表記を同じ日付として扱う', () => {
  for (const line of ['2026年10月12日 秋祭り', '2026/10/12 秋祭り', '令和8年10月12日 秋祭り', '10月12日 秋祭り', '10/12 秋祭り']) {
    const [ev] = parse(line);
    assert.equal(ev.date, '2026-10-12', line);
    assert.equal(ev.title, '秋祭り', line);
  }
});

test('年が無い過去寄りの日付は翌年に送る', () => {
  assert.equal(inferYear(1, 5, new Date(REF)), 2027);
  assert.equal(inferYear(10, 12, new Date(REF)), 2026);
  assert.equal(inferYear(9, 1, new Date(REF)), 2026); // 直近の過去は今年のまま
});

test('全角数字と午前・午後を解釈する', () => {
  const [ev] = parse('１０月１２日　午後２時３０分　説明会');
  assert.equal(ev.date, '2026-10-12');
  assert.equal(ev.start, '14:30');
  assert.equal(ev.allDay, false);
});

test('時刻の範囲と会場を取り出す', () => {
  const [ev] = parse('10月12日(日) 14:00〜16:00 会場: 中央公園');
  assert.equal(ev.start, '14:00');
  assert.equal(ev.end, '16:00');
  assert.equal(ev.location, '中央公園');
});

test('日付の範囲は複数日の終日予定になる', () => {
  const [ev] = parse('スキー合宿 1/5〜1/7');
  assert.equal(ev.date, '2027-01-05');
  assert.equal(ev.endDate, '2027-01-07');
  assert.equal(ev.allDay, true);
});

test('タイトルが行に無ければ前の行から補う', () => {
  const [ev] = parse('第38回 みなと秋まつり\n10月12日(日) 14:00〜16:00');
  assert.equal(ev.title, '第38回 みなと秋まつり');
});

test('次の行に日付があるとき時刻を借りてこない', () => {
  const events = parse('11/3 文化祭\n12/24 18:30 クリスマス会');
  assert.equal(events.length, 2);
  assert.equal(events[0].allDay, true);
  assert.equal(events[1].start, '18:30');
});

test('同じ予定を二重に作らない', () => {
  assert.equal(parse('10/12 秋祭り\n10/12 秋祭り').length, 1);
});

test('日付が無い行からは予定を作らない', () => {
  assert.equal(parse('お問い合わせは 03-1234-5678 まで').length, 0);
});

test('findDates / findTimes は位置を返す', () => {
  assert.equal(findDates('10月12日 開催', new Date(REF))[0].start, 0);
  assert.equal(findTimes('開演 14:00')[0].time, '14:00');
  assert.equal(findTimes('10/12 開催').length, 0, '日付を時刻と誤読しない');
});

test('終了時刻が無ければ既定の長さを足す', () => {
  const { start, end } = resolveTimes({ date: '2026-10-12', start: '14:00', end: '' }, 90);
  assert.equal(start, '14:00');
  assert.equal(end, '15:30');
});

test('終了が開始より前なら翌日に回す', () => {
  const { endDate } = resolveTimes({ date: '2026-12-31', start: '23:00', end: '01:00' });
  assert.equal(endDate, '2027-01-01');
});

test('ICS は日本時間つきで、終日は翌日を DTEND にする', () => {
  const ics = buildICS([
    { title: '秋祭り', date: '2026-10-12', endDate: '2026-10-12', start: '14:00', end: '16:00', allDay: false, location: '中央公園' },
    { title: '合宿', date: '2027-01-05', endDate: '2027-01-07', allDay: true },
  ]);
  assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:20261012T140000/);
  assert.match(ics, /DTEND;TZID=Asia\/Tokyo:20261012T160000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270105/);
  assert.match(ics, /DTEND;VALUE=DATE:20270108/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('ICS の特殊文字をエスケープする', () => {
  const ics = buildICS([{ title: 'a;b,c\nd', date: '2026-10-12', allDay: true }]);
  assert.match(ics, /SUMMARY:a\\;b\\,c\\nd/);
});

test('CSV は Google カレンダーの列名で出す', () => {
  const csv = buildCSV([{ title: '秋祭り', date: '2026-10-12', start: '14:00', end: '16:00', allDay: false }]);
  assert.match(csv.split('\r\n')[0], /^Subject,Start Date,Start Time,End Date,End Time,All Day Event/);
  assert.match(csv, /"10\/12\/2026","14:00"/);
});

test('Google カレンダー URL に日時とタイムゾーンが入る', () => {
  const url = gcalUrl({ title: '秋祭り', date: '2026-10-12', start: '14:00', end: '16:00', allDay: false });
  assert.match(url, /action=TEMPLATE/);
  assert.match(url, /dates=20261012T140000%2F20261012T160000/);
  assert.match(url, /ctz=Asia%2FTokyo/);
});

test('AI の戻り値から壊れた行を落とす', () => {
  const out = sanitize([
    { title: ' 秋祭り ', date: '2026-10-12', start: '14:00', end: '16:00', allDay: false },
    { title: 'ダメな行', date: '来月' },
    { title: '', date: '2026-11-03', allDay: true },
    null,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, '秋祭り');
  assert.equal(out[1].title, '予定');
});

test('タイトルの末尾に範囲記号を残さない', () => {
  const [ev] = parse('前夜祭 10/11(土) 18時 〜 20時');
  assert.equal(ev.title, '前夜祭');
  assert.equal(ev.start, '18:00');
  assert.equal(ev.end, '20:00');
});

test('別の予定の行から会場を拾ってこない', () => {
  const events = parse('文化祭 11/3\nスキー合宿 1/5〜1/7 集合場所: 学校正門');
  assert.equal(events[0].location, '');
  assert.equal(events[1].location, '学校正門');
});

// 日本語まじりのテキストから「予定」を抜き出すパーサ。
// AI を使わなくても動くフォールバック経路であり、AI 出力の後処理にも使う。

const ERA_BASE = { 令和: 2018, R: 2018, 平成: 1988, H: 1988 };
const DASH = '\\-\\u2010\\u2012\\u2013\\u2014\\u2015\\uFF0D';
const TILDE = '~\\uFF5E\\u301C';
const RANGE = `[${DASH}${TILDE}]|から|まで|to`;

/** 全角数字・記号を半角に寄せる（カタカナ長音符は壊さないので触らない） */
export function normalizeText(input) {
  return String(input || '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[／]/g, '/')
    .replace(/　/g, ' ')
    .replace(/\r\n?/g, '\n');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** ローカル日付を YYYY-MM-DD で返す（Date の UTC ずれを避けるため文字列で持つ） */
export function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function isValidDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * 年の書かれていない「10/12」を、基準日から見て一番近い将来の年に寄せる。
 * 60 日以上前になってしまう場合は翌年とみなす（ポスターは未来の告知が普通）。
 */
export function inferYear(month, day, reference = new Date()) {
  const base = reference.getFullYear();
  for (const y of [base - 1, base, base + 1]) {
    if (!isValidDate(y, month, day)) continue;
    const diff = (new Date(y, month - 1, day) - new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())) / 86400000;
    if (diff >= -60) return y;
  }
  return base;
}

const DATE_PATTERNS = [
  // 令和8年10月12日 / R8.10.12
  {
    re: new RegExp(`(令和|平成|R|H)\\s*(元|\\d{1,2})\\s*(?:年|[./])\\s*(\\d{1,2})\\s*(?:月|[./])\\s*(\\d{1,2})\\s*日?`, 'g'),
    take: (m) => {
      const era = ERA_BASE[m[1]];
      const n = m[2] === '元' ? 1 : Number(m[2]);
      return { y: era + n, m: Number(m[3]), d: Number(m[4]) };
    },
  },
  // 2026年10月12日 / 2026/10/12 / 2026-10-12
  {
    re: /(\d{4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})\s*日?/g,
    take: (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }),
  },
  // 10月12日
  {
    re: /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    take: (m) => ({ y: null, m: Number(m[1]), d: Number(m[2]) }),
  },
  // 10/12 （時刻 10:12 と衝突しないよう / と . のみ）
  {
    re: /(?<![\d:])(\d{1,2})\s*[./]\s*(\d{1,2})(?![\d:])/g,
    take: (m) => ({ y: null, m: Number(m[1]), d: Number(m[2]) }),
  },
];

/** 1 行から日付をすべて拾う。戻り値は出現位置つき */
export function findDates(line, reference = new Date()) {
  const found = [];
  const claimed = [];
  for (const { re, take } of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      const start = m.index;
      const end = m.index + m[0].length;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      const raw = take(m);
      const year = raw.y ?? inferYear(raw.m, raw.d, reference);
      if (!isValidDate(year, raw.m, raw.d)) continue;
      claimed.push([start, end]);
      found.push({ date: ymd(year, raw.m, raw.d), start, end, hasYear: raw.y !== null, text: m[0] });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const TIME_RE = new RegExp(`(午前|午後|AM|PM|am|pm)?\\s*(\\d{1,2})\\s*(?::|時)\\s*(\\d{1,2})?\\s*分?`, 'g');

/** 1 行から時刻をすべて拾う */
export function findTimes(line) {
  const out = [];
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(line)) !== null) {
    // 「10/12」のような日付断片を時刻と誤読しないよう、: も 時 も無いものは弾く
    if (!/[:時]/.test(m[0])) continue;
    let h = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    const mer = m[1];
    if ((mer === '午後' || mer === 'PM' || mer === 'pm') && h < 12) h += 12;
    if ((mer === '午前' || mer === 'AM' || mer === 'am') && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    out.push({ time: `${pad(h)}:${pad(min)}`, start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return out;
}

const LOCATION_RE = /(?:会場|場所|開催地|所在地)\s*[:：]?\s*([^\s、。]{2,40})|@\s*([^\s、。]{2,40})/;

function extractLocation(lines, reference) {
  for (const line of lines) {
    if (!line) continue;
    // 別の予定の行にある会場を拾ってしまわないよう、日付を含む行は見ない
    if (line !== lines[0] && findDates(line, reference).length > 0) break;
    const m = line.match(LOCATION_RE);
    if (m) return (m[1] || m[2]).trim();
  }
  return '';
}

const NOISE_RE = new RegExp(`^[\\s:：、。,・|>>／/()（）\\[\\]${DASH}${TILDE}]+|[\\s:：、。,・|／/${DASH}${TILDE}]+$`, 'g');

function cleanTitle(text) {
  return text
    .replace(/\([日月火水木金土祝]\)|（[日月火水木金土祝]）/g, ' ')
    .replace(/(開場|開演|開始|終了|受付|集合|開催)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(NOISE_RE, '')
    .trim();
}

function looksLikeTitle(line) {
  const t = cleanTitle(line);
  return t.length >= 2 && t.length <= 60;
}

/**
 * テキスト全体から予定の配列を作る。
 * @returns {{title,date,endDate,start,end,allDay,location,notes,source}[]}
 */
export function parseEvents(rawText, options = {}) {
  const reference = options.reference ? new Date(options.reference) : new Date();
  const text = normalizeText(rawText);
  const lines = text.split('\n').map((l) => l.trim());
  const events = [];

  lines.forEach((line, i) => {
    if (!line) return;
    const dates = findDates(line, reference);
    if (dates.length === 0) return;

    const times = findTimes(line);
    const nextLine = lines[i + 1] || '';
    // 次行にも日付があるなら別の予定なので、時刻を借りてこない
    const nextHasDate = nextLine ? findDates(nextLine, reference).length > 0 : true;
    const nextTimes = times.length === 0 && !nextHasDate ? findTimes(nextLine) : [];
    const useTimes = times.length ? times : nextTimes;

    // 日付が範囲（10/12〜10/14）かどうか
    const rangeRe = new RegExp(`^\\s*(?:${RANGE})\\s*$`);
    const isRange =
      dates.length >= 2 && rangeRe.test(line.slice(dates[0].end, dates[1].start));

    // 行から日付・時刻を取り除いた残りをタイトル候補にする
    const spans = [...dates, ...times].sort((a, b) => b.start - a.start);
    let remainder = line;
    for (const s of spans) remainder = remainder.slice(0, s.start) + ' ' + remainder.slice(s.end);
    remainder = remainder.replace(LOCATION_RE, ' ');
    let title = cleanTitle(remainder);

    if (title.length < 2) {
      const prev = [lines[i - 1], lines[i - 2]].find((l) => l && findDates(l, reference).length === 0 && looksLikeTitle(l));
      const next = [nextLine, lines[i + 2]].find((l) => l && findDates(l, reference).length === 0 && looksLikeTitle(l));
      title = cleanTitle(prev || next || '') || '予定';
    }

    const allDay = useTimes.length === 0;
    events.push({
      title,
      date: dates[0].date,
      endDate: isRange ? dates[1].date : dates[0].date,
      start: allDay ? '' : useTimes[0].time,
      end: allDay ? '' : useTimes[1] ? useTimes[1].time : '',
      allDay,
      location: extractLocation([line, nextLine, lines[i + 2]], reference),
      notes: '',
      source: line,
    });

    // 同じ行に範囲でない複数日付（10/12・10/19 開催 など）→ それぞれ別予定に
    if (!isRange && dates.length >= 2) {
      for (const d of dates.slice(1)) {
        events.push({
          ...events[events.length - 1],
          date: d.date,
          endDate: d.date,
        });
      }
    }
  });

  return dedupe(events);
}

function dedupe(events) {
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.title}|${e.date}|${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

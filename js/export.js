// 予定配列 → .ics / CSV / Google カレンダー URL への変換。
// タイムゾーンは日本時間固定（VTIMEZONE を同梱するので他国のカレンダーでも正しく開く）。

const TZID = 'Asia/Tokyo';

function compact(dateStr) {
  return dateStr.replace(/-/g, '');
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function addMinutes(timeStr, n) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + n + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 終了時刻が無ければ既定の長さを足す。終了が開始より前なら翌日扱い。 */
export function resolveTimes(ev, defaultMinutes = 60) {
  const start = ev.start || '09:00';
  let end = ev.end || addMinutes(start, defaultMinutes);
  let endDate = ev.endDate || ev.date;
  if (endDate === ev.date && end <= start) endDate = addDays(ev.date, 1);
  return { start, end, endDate };
}

/** 出典 URL は説明文の末尾に残す（カレンダー側で後から確認できるように） */
export function describe(ev) {
  return [ev.notes, ev.sourceUrl].filter(Boolean).join('\n');
}

function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function fold(line) {
  // RFC 5545: 75 オクテット折り返し
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const chSize = new TextEncoder().encode(ch).length;
    if (size + chSize > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += chSize;
  }
  out.push(current);
  return out.join('\r\n ');
}

function uid(i) {
  return `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}@poscal`;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildICS(events, options = {}) {
  const name = options.calendarName || 'ポスカレ';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//poscal//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(name)}`,
    `X-WR-TIMEZONE:${TZID}`,
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  events.forEach((ev, i) => {
    lines.push('BEGIN:VEVENT', `UID:${uid(i)}`, `DTSTAMP:${stamp()}`);
    if (ev.allDay) {
      const endExclusive = addDays(ev.endDate || ev.date, 1);
      lines.push(`DTSTART;VALUE=DATE:${compact(ev.date)}`, `DTEND;VALUE=DATE:${compact(endExclusive)}`);
    } else {
      const { start, end, endDate } = resolveTimes(ev, options.defaultMinutes);
      lines.push(
        `DTSTART;TZID=${TZID}:${compact(ev.date)}T${start.replace(':', '')}00`,
        `DTEND;TZID=${TZID}:${compact(endDate)}T${end.replace(':', '')}00`
      );
    }
    lines.push(`SUMMARY:${escapeICS(ev.title || '予定')}`);
    if (ev.location) lines.push(`LOCATION:${escapeICS(ev.location)}`);
    const description = describe(ev);
    if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
    if (ev.sourceUrl) lines.push(`URL:${ev.sourceUrl}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google カレンダーの CSV インポート形式 */
export function buildCSV(events, options = {}) {
  const header = ['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day Event', 'Description', 'Location'];
  const esc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
  const rows = events.map((ev) => {
    const { start, end, endDate } = ev.allDay ? { start: '', end: '', endDate: ev.endDate || ev.date } : resolveTimes(ev, options.defaultMinutes);
    const fmt = (d) => {
      const [y, m, dd] = d.split('-');
      return `${Number(m)}/${Number(dd)}/${y}`;
    };
    return [ev.title || '予定', fmt(ev.date), start, fmt(endDate), end, ev.allDay ? 'True' : 'False', describe(ev), ev.location || ''].map(esc).join(',');
  });
  return [header.join(','), ...rows].join('\r\n') + '\r\n';
}

/** 1 件を Google カレンダーの登録画面で開く URL */
export function gcalUrl(ev, options = {}) {
  let dates;
  if (ev.allDay) {
    dates = `${compact(ev.date)}/${compact(addDays(ev.endDate || ev.date, 1))}`;
  } else {
    const { start, end, endDate } = resolveTimes(ev, options.defaultMinutes);
    dates = `${compact(ev.date)}T${start.replace(':', '')}00/${compact(endDate)}T${end.replace(':', '')}00`;
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title || '予定',
    dates,
    ctz: TZID,
  });
  if (ev.location) params.set('location', ev.location);
  const details = describe(ev);
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

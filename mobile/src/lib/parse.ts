/** 「9:5」「0930」「21:30」など、現場で雑に打たれる時刻入力を分に直す。 */
export function parseClock(text: string): number | null {
  const cleaned = text.trim().replace(/[：]/g, ':').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const withColon = cleaned.match(/^(\d{1,2}):(\d{1,2})$/);
  const compact = cleaned.match(/^(\d{3,4})$/);
  let hours: number;
  let minutes: number;
  if (withColon) {
    hours = Number(withColon[1]);
    minutes = Number(withColon[2]);
  } else if (compact) {
    const digits = compact[1].padStart(4, '0');
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else if (/^\d{1,2}$/.test(cleaned)) {
    hours = Number(cleaned);
    minutes = 0;
  } else {
    return null;
  }
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 金額・件数の入力。全角やカンマ、「円」が混ざっても拾う。 */
export function parseNumber(text: string): number {
  const cleaned = String(text)
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，円件kmＫｍ\s]/gi, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

export function yen(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

export function hoursLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

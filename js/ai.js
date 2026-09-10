// 画像から予定を読み取る部分。Gemini API をブラウザから直接叩く（鍵はユーザーの端末にだけ保存）。
import { parseEvents, normalizeText } from './parse.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      date: { type: 'STRING' },
      endDate: { type: 'STRING' },
      start: { type: 'STRING' },
      end: { type: 'STRING' },
      allDay: { type: 'BOOLEAN' },
      location: { type: 'STRING' },
      notes: { type: 'STRING' },
    },
    required: ['title', 'date', 'allDay'],
  },
};

function prompt(today) {
  return [
    'あなたは日本語のポスター・チラシ・学校のおたより・スクリーンショットから予定を抽出するアシスタントです。',
    `本日は ${today} です。年が書かれていない日付は、本日以降で最も近い年として解釈してください。`,
    '画像に写っているイベントをすべて JSON 配列で返してください。各要素の項目は次のとおりです。',
    '- title: 予定の名前（会場名や「開催」などの飾りは含めない）',
    '- date: 開始日 YYYY-MM-DD',
    '- endDate: 終了日 YYYY-MM-DD（1 日で終わるなら date と同じ）',
    '- start / end: HH:MM（24 時間表記。時刻の記載が無ければ空文字）',
    '- allDay: 時刻の記載が無ければ true',
    '- location: 会場・場所（無ければ空文字）',
    '- notes: 持ち物・料金・申込方法・問い合わせ先など補足（無ければ空文字）',
    '複数日程が並んでいる場合は 1 日ごとに 1 要素にしてください。',
    '「開場 13:30 / 開演 14:00」のような場合は start に開演時刻を入れ、開場時刻は notes に書いてください。',
    '予定が読み取れない場合は空配列 [] を返してください。JSON 以外は出力しないでください。',
  ].join('\n');
}

function todayISO(reference = new Date()) {
  const d = new Date(reference);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function stripFence(text) {
  return text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
}

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OK = /^\d{2}:\d{2}$/;

/** モデルの戻り値は信用しきらず、形式を整えてから UI に渡す */
export function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && DATE_OK.test(String(e.date || '')))
    .map((e) => {
      const start = TIME_OK.test(String(e.start || '')) ? e.start : '';
      const end = TIME_OK.test(String(e.end || '')) ? e.end : '';
      return {
        title: String(e.title || '予定').trim() || '予定',
        date: e.date,
        endDate: DATE_OK.test(String(e.endDate || '')) ? e.endDate : e.date,
        start,
        end,
        allDay: e.allDay === true || !start,
        location: String(e.location || '').trim(),
        notes: String(e.notes || '').trim(),
        source: 'ai',
      };
    });
}

/**
 * 画像から予定を抽出する。
 * @param {{mimeType:string, base64:string}[]} images
 */
export async function extractFromImages(images, { apiKey, model = 'gemini-2.5-flash', reference } = {}) {
  if (!apiKey) throw new Error('API キーが設定されていません');
  if (!images.length) throw new Error('画像がありません');

  const parts = [{ text: prompt(todayISO(reference)) }, ...images.map((img) => ({
    inline_data: { mime_type: img.mimeType, data: img.base64 },
  }))];

  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API エラー (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  if (!text) throw new Error('モデルから予定を取得できませんでした');

  let parsed;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    // JSON が壊れていたら、テキストとしてローカルパーサに流す
    return parseEvents(normalizeText(text), { reference });
  }
  return sanitize(parsed);
}

// 画像・URL・検索キーワードから予定を読み取る部分。
// Gemini API をブラウザから直接叩く（鍵はユーザーの端末にだけ保存）。
import { parseEvents, normalizeText } from './parse.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** 用途ごとの追加指示。何を「予定」とみなすかは用途でかなり変わる。 */
export const PRESETS = {
  general: {
    label: '汎用',
    hint: '',
  },
  oshi: {
    label: '推し活',
    hint: [
      '公演・ライブ・配信・イベントの開催日だけでなく、',
      'チケットの申込開始日・申込締切・抽選結果（当落）発表日・一般発売日も 1 件ずつ予定にしてください。',
      'title は「アーティスト名 公演名（何の日か）」の形にし、location には会場名と都市名を入れてください。',
    ].join(''),
  },
  school: {
    label: '学校・園の行事',
    hint: [
      '行事名と日付に加えて、持ち物・弁当の要否・提出締切・振替休日・短縮授業の有無を notes に入れてください。',
      '年間行事予定表のように多数並んでいる場合は、1 行 1 予定として漏れなく拾ってください。',
    ].join(''),
  },
};

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
      sourceUrl: { type: 'STRING' },
    },
    required: ['title', 'date', 'allDay'],
  },
};

const FIELDS = [
  '- title: 予定の名前（会場名や「開催」などの飾りは含めない）',
  '- date: 開始日 YYYY-MM-DD',
  '- endDate: 終了日 YYYY-MM-DD（1 日で終わるなら date と同じ）',
  '- start / end: HH:MM（24 時間表記。時刻の記載が無ければ空文字）',
  '- allDay: 時刻の記載が無ければ true',
  '- location: 会場・場所（無ければ空文字）',
  '- notes: 持ち物・料金・申込方法・問い合わせ先など補足（無ければ空文字）',
];

function imagePrompt(today, hint) {
  return [
    'あなたは日本語のポスター・チラシ・学校のおたより・スクリーンショットから予定を抽出するアシスタントです。',
    `本日は ${today} です。年が書かれていない日付は、本日以降で最も近い年として解釈してください。`,
    '画像に写っているイベントをすべて JSON 配列で返してください。各要素の項目は次のとおりです。',
    ...FIELDS,
    hint,
    '複数日程が並んでいる場合は 1 日ごとに 1 要素にしてください。',
    '「開場 13:30 / 開演 14:00」のような場合は start に開演時刻を入れ、開場時刻は notes に書いてください。',
    '予定が読み取れない場合は空配列 [] を返してください。JSON 以外は出力しないでください。',
  ].filter(Boolean).join('\n');
}

function webPrompt(today, { query, urls, hint }) {
  const lines = [
    'あなたは Web ページから予定を抽出するアシスタントです。',
    `本日は ${today} です。年が書かれていない日付は、本日以降で最も近い年として解釈してください。`,
  ];
  if (urls.length) {
    lines.push('次の URL のページを読み、書かれている予定をすべて抽出してください。', ...urls.map((u) => `- ${u}`));
  }
  if (query) {
    lines.push(`次の条件で検索し、見つかった公式・一次情報のページから予定を抽出してください: ${query}`);
  }
  lines.push(
    '結果は JSON 配列で返してください。各要素の項目は次のとおりです。',
    ...FIELDS,
    '- sourceUrl: その予定の根拠になったページの URL（必須）',
    hint,
    '',
    '重要な制約:',
    '- ページに書かれていない日付を推測で作らないでください。日付が確定していない予定は含めないでください。',
    '- 「未定」「調整中」「◯月頃」のように日付が特定できないものは除外してください。',
    '- 同じ公演の複数日程は 1 日ごとに 1 要素にしてください。',
    '- 情報が見つからなければ空配列 [] を返してください。',
    '- JSON 以外は出力しないでください。',
  );
  return lines.filter(Boolean).join('\n');
}

function todayISO(reference = new Date()) {
  const d = new Date(reference);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * モデルの返事から JSON 配列を取り出す。
 * ツール利用時は responseSchema を使えないモデルがあるため、地の文が混ざる前提で拾う。
 */
export function extractJsonArray(text) {
  const stripped = String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const candidates = [stripped];
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start !== -1 && end > start) candidates.push(stripped.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.events)) return value.events;
    } catch {
      /* 次の候補を試す */
    }
  }
  return null;
}

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OK = /^\d{2}:\d{2}$/;

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** モデルの戻り値は信用しきらず、形式を整えてから UI に渡す */
export function sanitize(list, source = 'ai') {
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
        sourceUrl: safeUrl(e.sourceUrl),
        source,
      };
    });
}

async function callGemini({ apiKey, model, parts, tools, useSchema }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0 },
  };
  if (tools) body.tools = tools;
  // ツール利用時に controlled generation を拒否するモデルがあるので、その場合は付けない
  if (useSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = SCHEMA;
  }

  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini API エラー (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

function textOf(data) {
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
}

/** 実際にモデルが読んだページの URL（出典表示に使う） */
export function referencedUrls(data) {
  const candidate = data?.candidates?.[0] || {};
  const fromUrlContext = (candidate.urlContextMetadata?.urlMetadata || []).map((m) => m.retrievedUrl || m.retrieved_url);
  const fromGrounding = (candidate.groundingMetadata?.groundingChunks || []).map((c) => c.web?.uri);
  return [...new Set([...fromUrlContext, ...fromGrounding].map(safeUrl).filter(Boolean))];
}

/**
 * 画像から予定を抽出する。
 * @param {{mimeType:string, base64:string}[]} images
 */
export async function extractFromImages(images, { apiKey, model = 'gemini-2.5-flash', reference, preset = 'general' } = {}) {
  if (!apiKey) throw new Error('API キーが設定されていません');
  if (!images.length) throw new Error('画像がありません');

  const parts = [
    { text: imagePrompt(todayISO(reference), PRESETS[preset]?.hint) },
    ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
  ];
  const data = await callGemini({ apiKey, model, parts, useSchema: true });
  const text = textOf(data);
  if (!text) throw new Error('モデルから予定を取得できませんでした');

  const list = extractJsonArray(text);
  // JSON が壊れていたら、テキストとしてローカルパーサに流す
  return list ? sanitize(list, 'image') : parseEvents(normalizeText(text), { reference });
}

/**
 * URL や検索キーワードから予定を抽出する。
 * url_context でページを読み、google_search で公式ページを探させる。
 */
export async function extractFromWeb({ query = '', urls = [], apiKey, model = 'gemini-2.5-flash', reference, preset = 'general' } = {}) {
  if (!apiKey) throw new Error('API キーが設定されていません');
  const cleanUrls = urls.map(safeUrl).filter(Boolean).slice(0, 20);
  const cleanQuery = String(query || '').trim();
  if (!cleanUrls.length && !cleanQuery) throw new Error('URL か検索キーワードを入力してください');

  const tools = [{ url_context: {} }];
  if (cleanQuery) tools.push({ google_search: {} });

  const parts = [{ text: webPrompt(todayISO(reference), { query: cleanQuery, urls: cleanUrls, hint: PRESETS[preset]?.hint }) }];

  let data;
  try {
    data = await callGemini({ apiKey, model, parts, tools, useSchema: false });
  } catch (err) {
    // 検索ツールを許可していないモデルもあるので、URL だけで一度やり直す
    if (cleanQuery && cleanUrls.length && /400|tool/i.test(err.message)) {
      data = await callGemini({ apiKey, model, parts, tools: [{ url_context: {} }], useSchema: false });
    } else {
      throw err;
    }
  }

  const text = textOf(data);
  if (!text) throw new Error('モデルから予定を取得できませんでした');
  const list = extractJsonArray(text);
  if (!list) throw new Error('予定を JSON として取り出せませんでした。キーワードを具体的にするか、URL を直接指定してください。');

  const events = sanitize(list, 'web');
  const fallback = referencedUrls(data)[0] || cleanUrls[0] || '';
  return events.map((e) => ({ ...e, sourceUrl: e.sourceUrl || fallback }));
}

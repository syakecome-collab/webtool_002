import { parseEvents } from './parse.js';
import { extractFromImages, extractFromWeb } from './ai.js';
import { buildICS, buildCSV, gcalUrl } from './export.js';

const $ = (id) => document.getElementById(id);
const STORE = { key: 'poscal.apiKey', model: 'poscal.model', events: 'poscal.events', duration: 'poscal.duration', preset: 'poscal.preset' };

let images = []; // {mimeType, base64, url}
let events = [];

const SAMPLE = `第38回 みなと秋まつり
10月12日(日) 14:00〜16:00　会場: 中央公園ステージ
前夜祭 10/11(土) 18時 〜 20時
文化祭 令和8年11月3日
スキー合宿 1/5〜1/7 集合場所: 学校正門`;

/* ---------- 保存 ---------- */
function load() {
  $('api-key').value = localStorage.getItem(STORE.key) || '';
  $('model').value = localStorage.getItem(STORE.model) || 'gemini-2.5-flash';
  $('default-duration').value = localStorage.getItem(STORE.duration) || '60';
  $('preset').value = localStorage.getItem(STORE.preset) || 'general';
  try {
    events = JSON.parse(localStorage.getItem(STORE.events) || '[]');
  } catch {
    events = [];
  }
}

function save() {
  localStorage.setItem(STORE.key, $('api-key').value.trim());
  localStorage.setItem(STORE.model, $('model').value.trim() || 'gemini-2.5-flash');
  localStorage.setItem(STORE.duration, $('default-duration').value);
  localStorage.setItem(STORE.preset, $('preset').value);
  localStorage.setItem(STORE.events, JSON.stringify(events));
}

function status(message, kind = '') {
  const el = $('status');
  el.textContent = message;
  el.className = `status ${kind}`;
}

/* ---------- 画像 ---------- */
/** 長辺 1600px / JPEG に落としてから送る（通信量とトークンの節約） */
function shrink(file, maxEdge = 1600) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('画像を読み込めませんでした'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('画像を表示できませんでした'));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.82);
        resolve({ mimeType: 'image/jpeg', base64: url.split(',')[1], url });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/')).slice(0, 5);
  if (!files.length) return;
  status('画像を準備しています…', 'busy');
  for (const file of files) {
    try {
      images.push(await shrink(file));
    } catch (err) {
      status(err.message, 'error');
    }
  }
  renderThumbs();
  status(`${images.length} 枚の画像を読み込みました`);
}

function renderThumbs() {
  const list = $('thumbs');
  list.innerHTML = '';
  images.forEach((img, i) => {
    const li = document.createElement('li');
    const el = document.createElement('img');
    el.src = img.url;
    el.alt = `取り込んだ画像 ${i + 1}`;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', `画像 ${i + 1} を削除`);
    del.addEventListener('click', () => {
      images.splice(i, 1);
      renderThumbs();
    });
    li.append(el, del);
    list.append(li);
  });
  $('scan-btn').disabled = images.length === 0;
}

/* ---------- 予定リスト ---------- */
function addEvents(list) {
  if (!list.length) {
    status('予定を見つけられませんでした。テキスト解析なら日付の書き方を、画像なら明るさやピントを確認してください。', 'error');
    return;
  }
  const seen = new Set(events.map((e) => `${e.title}|${e.date}|${e.start}`));
  const fresh = list.filter((e) => !seen.has(`${e.title}|${e.date}|${e.start}`));
  events = events.concat(fresh.map((e) => ({ ...e, selected: true })));
  render();
  status(`${fresh.length} 件を追加しました${list.length - fresh.length > 0 ? `（重複 ${list.length - fresh.length} 件は除外）` : ''}`);
}

function field(label, type, value, onInput) {
  const wrap = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value || '';
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(span, input);
  return wrap;
}

function render() {
  const box = $('events');
  box.innerHTML = '';
  $('count').textContent = `${events.length} 件`;

  if (!events.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'まだ予定がありません。上で画像を読み取るか、テキストを解析してください。';
    box.append(p);
    save();
    return;
  }

  events.forEach((ev, i) => {
    const card = document.createElement('div');
    card.className = `event${ev.selected === false ? ' off' : ''}`;

    const top = document.createElement('div');
    top.className = 'event-top';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = ev.selected !== false;
    check.setAttribute('aria-label', 'この予定を登録対象にする');
    check.addEventListener('change', () => {
      ev.selected = check.checked;
      render();
    });
    const title = document.createElement('input');
    title.type = 'text';
    title.value = ev.title || '';
    title.setAttribute('aria-label', '予定の名前');
    title.addEventListener('input', () => {
      ev.title = title.value;
      save();
    });
    top.append(check, title);

    const grid = document.createElement('div');
    grid.className = 'event-grid';
    grid.append(
      field('開始日', 'date', ev.date, (v) => { ev.date = v; save(); }),
      field('終了日', 'date', ev.endDate || ev.date, (v) => { ev.endDate = v; save(); }),
      field('開始', 'time', ev.start, (v) => { ev.start = v; ev.allDay = !v; save(); }),
      field('終了', 'time', ev.end, (v) => { ev.end = v; save(); }),
      field('場所', 'text', ev.location, (v) => { ev.location = v; save(); }),
      field('メモ', 'text', ev.notes, (v) => { ev.notes = v; save(); })
    );

    const actions = document.createElement('div');
    actions.className = 'event-actions';
    if (ev.sourceUrl) {
      const src = document.createElement('a');
      src.href = ev.sourceUrl;
      src.target = '_blank';
      src.rel = 'noopener noreferrer';
      src.className = 'source';
      src.textContent = `出典: ${hostOf(ev.sourceUrl)}`;
      actions.append(src);
    }
    const link = document.createElement('a');
    link.href = gcalUrl(ev, { defaultMinutes: duration() });
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'この 1 件だけ Google カレンダーへ';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '削除';
    remove.addEventListener('click', () => {
      events.splice(i, 1);
      render();
    });
    actions.append(link, remove);

    card.append(top, grid, actions);
    box.append(card);
  });
  save();
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'リンク';
  }
}

const duration = () => Number($('default-duration').value || 60);
const preset = () => $('preset').value;
const selected = () => events.filter((e) => e.selected !== false);

/* ---------- 書き出し ---------- */
function download(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- イベント配線 ---------- */
const model = () => $('model').value.trim() || undefined;

function requireKey() {
  const apiKey = $('api-key').value.trim();
  if (!apiKey) {
    $('ai-settings').open = true;
    status('先に Gemini の API キーを登録してください。', 'error');
    return '';
  }
  return apiKey;
}

function init() {
  load();
  render();
  renderThumbs();

  $('camera-input').addEventListener('change', (e) => addFiles(e.target.files));
  $('file-input').addEventListener('change', (e) => addFiles(e.target.files));

  $('scan-btn').addEventListener('click', async () => {
    const apiKey = requireKey();
    if (!apiKey) return;
    $('scan-btn').disabled = true;
    status('画像を読み取っています…', 'busy');
    try {
      const found = await extractFromImages(images, { apiKey, model: model(), preset: preset() });
      addEvents(found);
    } catch (err) {
      status(err.message, 'error');
    } finally {
      $('scan-btn').disabled = images.length === 0;
    }
  });

  $('web-btn').addEventListener('click', async () => {
    const apiKey = requireKey();
    if (!apiKey) return;
    const urls = $('url-input').value.split('\n').map((u) => u.trim()).filter(Boolean);
    const query = $('query-input').value.trim();
    if (!urls.length && !query) {
      status('URL か検索キーワードを入力してください。', 'error');
      return;
    }
    $('web-btn').disabled = true;
    status(query ? '検索してページを読んでいます…（20 秒ほどかかります）' : 'ページを読んでいます…', 'busy');
    try {
      addEvents(await extractFromWeb({ query, urls, apiKey, model: model(), preset: preset() }));
    } catch (err) {
      status(err.message, 'error');
    } finally {
      $('web-btn').disabled = false;
    }
  });

  document.querySelectorAll('.chips [data-query]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('query-input').value = btn.dataset.query;
      $('query-input').focus();
    });
  });

  $('parse-btn').addEventListener('click', () => {
    addEvents(parseEvents($('text-input').value));
  });

  $('sample-btn').addEventListener('click', () => {
    $('text-input').value = SAMPLE;
  });

  $('add-btn').addEventListener('click', () => {
    const today = new Date();
    events.push({
      title: '新しい予定',
      date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
      endDate: '',
      start: '',
      end: '',
      allDay: true,
      location: '',
      notes: '',
      selected: true,
    });
    render();
  });

  $('clear-btn').addEventListener('click', () => {
    if (events.length && !confirm('予定をすべて消します。よろしいですか？')) return;
    events = [];
    render();
    status('予定を消しました');
  });

  $('ics-btn').addEventListener('click', () => {
    const list = selected();
    if (!list.length) return status('登録する予定を選んでください。', 'error');
    download(`poscal-${stamp()}.ics`, buildICS(list, { defaultMinutes: duration() }), 'text/calendar');
    status(`${list.length} 件を .ics に書き出しました。ファイルを開くとカレンダーに取り込めます。`);
  });

  $('csv-btn').addEventListener('click', () => {
    const list = selected();
    if (!list.length) return status('登録する予定を選んでください。', 'error');
    download(`poscal-${stamp()}.csv`, buildCSV(list, { defaultMinutes: duration() }), 'text/csv');
    status(`${list.length} 件を CSV に書き出しました。Google カレンダーの「設定 → インポート」から読み込めます。`);
  });

  $('gcal-btn').addEventListener('click', () => {
    const list = selected();
    if (!list.length) return status('登録する予定を選んでください。', 'error');
    if (list.length > 5 && !confirm(`${list.length} 件のタブを開きます。よろしいですか？`)) return;
    let blocked = 0;
    list.forEach((ev, i) => {
      setTimeout(() => {
        const win = window.open(gcalUrl(ev, { defaultMinutes: duration() }), '_blank', 'noopener');
        if (!win) blocked += 1;
        if (i === list.length - 1 && blocked) {
          status(`${blocked} 件がポップアップブロックされました。.ics での登録をおすすめします。`, 'error');
        }
      }, i * 400);
    });
    status(`${list.length} 件を Google カレンダーの登録画面で開きます…`);
  });

  ['api-key', 'model', 'default-duration', 'preset'].forEach((id) => $(id).addEventListener('change', save));
  $('clear-key').addEventListener('click', () => {
    $('api-key').value = '';
    localStorage.removeItem(STORE.key);
    status('API キーを削除しました');
  });
}

init();

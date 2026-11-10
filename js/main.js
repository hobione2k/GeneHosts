'use strict';

// 画面要素の取得
const $ = (id) => document.getElementById(id);
const form = $('genForm');
const output = $('output');
const message = $('message');
const themeToggle = $('themeToggle');
const copyBtn = $('copyBtn');

const THEME_KEY = 'genhosts-theme';
const INPUT_KEY = 'genhosts-input';

// 保存・復元の対象とする入力欄
const SAVE_IDS = ['ipStart', 'ipEnd','hostPrefix', 'hostStart', 'hostEnd', 'hostDigits'];

// 成功通知を自動で閉じるまでの時間(ミリ秒)
const TOAST_MS = 3000;
// フェード時間(ミリ秒)。CSSの --toast-fade と揃えること
const FADE_MS = 400;
let toastTimer = null; // 自動で閉じるためのタイマー
let swapTimer = null;  // 種別切り替え時のフェードアウト待ちタイマー

// 通知の内容と種別を設定してフェードイン
function revealMessage(text, type) {
  message.textContent = text;
  message.className = `toast ${type} show`;
  if (type === 'ok') toastTimer = setTimeout(hideMessage, TOAST_MS);
}

// フローティング通知を表示(種別: error / ok)
// errorは解消されるまで表示し続け、okは一定時間後に自動で閉じる
function showMessage(text, type) {
  clearTimeout(toastTimer);
  clearTimeout(swapTimer);
  const shown = message.classList.contains('show');

  if (!shown) {
    // 非表示中はそのままフェードイン
    revealMessage(text, type);
  } else if (message.classList.contains(type)) {
    // 同じ種別を表示中は文言だけ差し替え(入力中のちらつき防止)
    revealMessage(text, type);
  } else {
    // 別の種別を表示中は一度フェードアウトしてから切り替え
    message.classList.remove('show');
    swapTimer = setTimeout(() => revealMessage(text, type), FADE_MS);
  }
}

// フローティング通知をフェードアウトで閉じる(種別クラスは残して色を保つ)
function hideMessage() {
  clearTimeout(toastTimer);
  clearTimeout(swapTimer);
  message.classList.remove('show');
}

// IPアドレス文字列を32bit整数に変換(不正ならnull)
function ipToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    // 各オクテットは0〜255の10進数のみ許可
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

// 32bit整数をIPアドレス文字列に変換
function intToIp(n) {
  return [24, 16, 8, 0].map((s) => Math.floor(n / 2 ** s) % 256).join('.');
}

// 開始IPの末尾オクテットを終了欄の値で置き換えて終了IPを組み立てる
// 例: 「192.168.1.10」+「2.20」→「192.168.2.20」
function buildEndIp(startStr, endSuffix) {
  const startParts = startStr.split('.');
  const endParts = endSuffix.split('.');
  // 形式が合わない場合はそのまま返し、後段の検証でエラーにする
  if (startParts.length !== 4 || endParts.length > 4) return endSuffix;
  return [...startParts.slice(0, 4 - endParts.length), ...endParts].join('.');
}

// 終了IPを終了欄向けの末尾表記に変換
// 開始IPと異なるオクテット数と、現在の表記のオクテット数の多い方で表す
function toEndSuffix(startInt, endInt, currentSuffix) {
  const s = intToIp(startInt).split('.');
  const e = intToIp(endInt).split('.');
  // 先頭から見て最初に異なるオクテット以降が必要な部分
  let need = 1;
  for (let i = 0; i < 4; i++) {
    if (s[i] !== e[i]) { need = 4 - i; break; }
  }
  const keep = Math.min(4, Math.max(need, currentSuffix.split('.').length));
  return e.slice(4 - keep).join('.');
}

// 数値を指定桁数で0埋め
function zeroPad(num, digits) {
  return String(num).padStart(digits, '0');
}

// 入力欄IDから所属グループ(ip / host)を判定
const IP_IDS = ['ipStart', 'ipEnd'];
const HOST_IDS = ['hostStart', 'hostEnd'];
function groupOf(id) {
  if (IP_IDS.includes(id)) return 'ip';
  if (HOST_IDS.includes(id)) return 'host';
  return null;
}

// 入力値からhosts形式の行を生成
// priority: 件数の基準にするグループ(ip / host)。nullなら大きい方に合わせる
// 戻り値: 生成行と、件数を揃えた後の各終了値
function generate(priority) {
  const ipStartStr = $('ipStart').value.trim();
  const ipEndSuffix = $('ipEnd').value.trim();
  const ipEndStr = buildEndIp(ipStartStr, ipEndSuffix);
  const hostPrefix = $('hostPrefix').value.trim();
  const hostStart = Number($('hostStart').value);
  const hostEnd = Number($('hostEnd').value);
  const digits = Number($('hostDigits').value);

  // IPアドレスの検証
  const ipStart = ipToInt(ipStartStr);
  const ipEnd = ipToInt(ipEndStr);
  if (ipStart === null) throw new Error('開始IPアドレスが不正です: ' + ipStartStr);
  if (ipEnd === null) throw new Error('終了IPアドレスが不正です: ' + ipEndStr);
  if (ipStart > ipEnd) throw new Error('IPアドレスの開始が終了より大きいです');

  // ホスト名の検証
  if (!/^[A-Za-z0-9.-]*$/.test(hostPrefix)) {
    throw new Error('ホスト名に使えない文字が含まれています');
  }
  if (!Number.isInteger(hostStart) || !Number.isInteger(hostEnd) || hostStart < 0 || hostEnd < 0) {
    throw new Error('ホスト番号は0以上の整数で指定してください');
  }
  if (hostStart > hostEnd) throw new Error('ホスト番号の開始が終了より大きいです');
  if (!Number.isInteger(digits) || digits < 1 || digits > 10) {
    throw new Error('桁数は1〜10で指定してください');
  }

  // IPとホストの件数を揃える
  // 編集中のグループがあればその件数を基準にし、なければ大きい方に合わせる
  const ipCount = ipEnd - ipStart + 1;
  const hostCount = hostEnd - hostStart + 1;
  let count = Math.max(ipCount, hostCount);
  if (priority === 'ip') count = ipCount;
  if (priority === 'host') count = hostCount;

  // 揃えた後のIP終了アドレスが範囲外(255.255.255.255超)にならないか確認
  const lastIp = ipStart + count - 1;
  if (lastIp > 0xFFFFFFFF) {
    throw new Error('IPアドレスがホスト件数分の範囲を超えます');
  }

  // 揃えた後の終了番号の桁数と指定桁数のうち長い方で0埋めし、桁を揃える
  const lastHost = hostStart + count - 1;
  const padDigits = Math.max(digits, String(lastHost).length);

  // 1行ずつ「IPアドレス ホスト名」を組み立て
  const lines = [];
  for (let i = 0; i < count; i++) {
    lines.push(`${intToIp(ipStart + i)} ${hostPrefix}${zeroPad(hostStart + i, padDigits)}`);
  }
  return {
    lines,
    ipEnd: toEndSuffix(ipStart, lastIp, ipEndSuffix), // 終了欄向けの末尾表記
    hostEnd: String(lastHost),
  };
}

// 入力欄の値が異なる場合のみ書き換え(編集中の欄は書き換えない)
function syncInput(id, value, editingId) {
  const el = $(id);
  if (id !== editingId && el.value.trim() !== value) el.value = value;
}

// 出力欄を更新(エラー時は出力を空にして通知を表示)
// e: 入力イベント(初期表示時はなし)
function update(e) {
  const editingId = e?.target?.id ?? null;
  try {
    const result = generate(groupOf(editingId));
    const lines = result.lines;
    output.value = lines.join('\n') + '\n';
    // 件数を揃えた結果を相手側の終了欄に反映
    syncInput('ipEnd', result.ipEnd, editingId);
    syncInput('hostEnd', result.hostEnd, editingId);
    // 入力のたびに通知が出ないよう、成功時はエラー通知を閉じるだけにする
    if (message.classList.contains('error')) hideMessage();
  } catch (err) {
    output.value = '';
    showMessage(err.message, 'error');
  }
}

// 入力値をlocalStorageに保存
function saveInputs() {
  const data = {};
  SAVE_IDS.forEach((id) => { data[id] = $(id).value; });
  try { localStorage.setItem(INPUT_KEY, JSON.stringify(data)); } catch { /* 保存不可環境は無視 */ }
}

// 保存済みの入力値を復元(なければ初期値のまま)
function restoreInputs() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(INPUT_KEY)); } catch { /* 読込不可・破損時は無視 */ }
  if (!data || typeof data !== 'object') return;
  // 旧形式(プリフィックス+開始番号)の保存値は完全なIPに変換
  if (typeof data.ipPrefix === 'string' && typeof data.ipStart === 'string') {
    data.ipStart = data.ipPrefix + data.ipStart;
  }
  SAVE_IDS.forEach((id) => {
    if (typeof data[id] === 'string') $(id).value = data[id];
  });
}

// 入力値が変わるたびに出力を自動更新し、入力値を保存
// (件数合わせで書き換わった終了値も含めるため更新後に保存)
form.addEventListener('input', (e) => {
  update(e);
  saveInputs();
});

// IPアドレス入力欄の値を±1する(IP全体で計算し繰り上げにも対応)
function stepIp(id, delta) {
  const el = $(id);
  const startStr = $('ipStart').value.trim();
  // 開始IPはそのまま、終了は開始IPと組み合わせた完全なIPで計算
  const fullStr = id === 'ipStart' ? startStr : buildEndIp(startStr, el.value.trim());
  const current = ipToInt(fullStr);
  if (current === null) return; // 不正な値のときは何もしない
  const next = current + delta;
  if (next < 0 || next > 0xFFFFFFFF) return; // IPv4の範囲外は無視
  if (id === 'ipStart') {
    el.value = intToIp(next);
  } else {
    // 終了欄は末尾表記に戻す(開始IPの不正時は何もしない)
    const startInt = ipToInt(startStr);
    if (startInt === null) return;
    el.value = toEndSuffix(startInt, next, el.value.trim());
  }
  // 手入力と同じく入力イベントを発火して出力・件数を更新
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// -1/+1ボタン押下時の処理
document.querySelectorAll('.step').forEach((btn) => {
  btn.addEventListener('click', () => stepIp(btn.dataset.target, Number(btn.dataset.step)));
});

// IP開始・終了欄で↑↓キーによる増減
['ipStart', 'ipEnd'].forEach((id) => {
  $(id).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    stepIp(id, e.key === 'ArrowUp' ? 1 : -1);
  });
});

// Enterキーによるフォーム送信(ページ遷移)を防止
form.addEventListener('submit', (e) => e.preventDefault());

// クリップボードへのコピー処理
copyBtn.addEventListener('click', async () => {
  if (!output.value) {
    showMessage('コピーする内容がありません', 'error');
    return;
  }
  try {
    await navigator.clipboard.writeText(output.value);
  } catch {
    // Clipboard API非対応時は選択してコピー
    output.select();
    document.execCommand('copy');
  }
  showMessage('クリップボードにコピーしました', 'ok');
});

// テーマを適用しボタン表示を更新
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  // アイコン表示はCSSで切り替え、説明文のみ更新
  const label = theme === 'dark' ? 'ライトテーマに切り替え' : 'ダークテーマに切り替え';
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
}

// 保存済みテーマ、なければOS設定から初期テーマを決定
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* 保存不可環境は無視 */ }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
}

// テーマ切り替えボタン押下時の処理
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* 保存不可環境は無視 */ }
});

initTheme();

// 前回の入力値を復元してから出力を生成
restoreInputs();
update();

import { CONFIG as C } from './config.ts';
import { efficiency, isActive, processingSeconds, remaining } from './game.ts';
import type { Device, GameState, Task, TaskRecord } from './game.ts';
import { devicesMarkup } from './devices.ts';
import { callAdvice, importance, taskAdvice } from './task-advice.ts';
import { recordDetail, reviewSummary } from './review.ts';
import { ENCORE, briefTerms, insightText } from './encore.ts';

export const names: Record<Device, string> = { computer: '電腦', fan: '電風扇', phone: '手機' };
export const el = (id: string): HTMLElement => document.getElementById(id)!;
export function text(node: Element, value: string): void { if (node.textContent !== value) node.textContent = value; }
const clockText = (seconds: number) => `${Math.floor(Math.ceil(seconds) / 60).toString().padStart(2, '0')}:${(Math.ceil(seconds) % 60).toString().padStart(2, '0')}`;

export function mount(): void {
  el('app').innerHTML = `
  <main class="shell">
    <header><span class="brand"><span class="brand-icon">↯</span> 小房間工作室</span><span class="edition">再一次，不再照單全收 / 003</span></header>
    <section class="heading"><div><p class="eyebrow">ONE OUTLET. TOO MANY DEADLINES.</p><h1>只有一個插座<span>。</span></h1><p class="subtitle">網路壞了，工作還在進來。接案 → 電腦處理 → 手機上傳。</p></div><span class="stamp">距離下班<br><strong>再一次</strong></span></section>
    <section class="game" aria-label="遊戲區域">
      <div id="play-area">
        <div class="control-dock" aria-label="供電與即時狀態">
        <div class="topbar"><span><i class="live-dot"></i><span id="session-label">準備上工</span></span><span class="timer" id="timer">03:00</span><button id="mute" class="quiet">音效：開</button><button id="pause" class="quiet" disabled>暫停</button></div>
        <div class="dashboard">
          <div class="scoreboard"><span>本局得分 <strong id="score">0</strong></span><small id="counts">已交 0 件 · 漏件 0 件</small><small id="best">歷史最高 0 分</small></div>
          <div class="metric"><span>室內溫度</span><strong id="temperature">27.0°C</strong><small id="efficiency">工作效率 100%</small></div>
          <div class="metric"><span>手機電量</span><strong id="battery">32%</strong><small id="battery-note">待機耗電中</small></div>
        </div>
        <div class="room">${devicesMarkup}
          <div class="desk-line"></div><div class="outlet-row"><span class="outlet"><span>▮ ▮</span><i></i></span><div><small>唯一的插座</small><strong id="powered-label">已連接 → 電腦</strong></div><span class="switch-tip">點擊切換供電 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span></div>
        </div>
        <div class="phone-hub"><div><strong id="phone-status">手機待命</strong><small id="phone-queue"></small></div><button id="phone-charge" class="quiet">切到手機充電</button><button id="phone-hangup" class="quiet" hidden>掛斷，先交件</button>
        <div id="delivery-controls" class="delivery-controls" hidden><label for="phone-delivery">選擇待交件工作</label><select id="phone-delivery"><option value="">請選擇工作，不會自動上傳</option></select><button id="phone-send" class="quiet" disabled>上傳所選工作</button><small id="phone-send-reason"></small></div></div>
        </div>
        <div class="operation-strip"><p id="computer-status">電腦：等待工作</p><p id="heat-status">溫度舒適，工作效率正常。</p></div>
        <section class="work-section" aria-labelledby="work-title"><div class="section-title"><h2 id="work-title">限時工作 <span id="task-count">0 / 3</span></h2><span id="arrival-hint">通知到達即開始倒數</span></div>
          <p id="offline" class="offline" hidden>手機已關機，無法接案或交件。通知仍會保留、期限繼續倒數；請供電給手機。</p>
          <p class="priority-guide">分數代表重要程度：<span class="tier-normal">一般</span>／<span class="tier-important">重要</span>／<span class="tier-critical">關鍵</span>；期限越短越急。</p>
          <p id="delivery-summary" class="delivery-summary"></p>
          <div id="tasks" class="tasks"></div><p id="empty-tasks" class="empty">手機通知即將到達。先接收，再處理，最後上傳。</p>
        </section>
        <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true"></div>
        <details class="history"><summary id="history-title">本局紀錄 · 0 件</summary><ol id="history-list"></ol></details>
      </div>
      <div id="overlay" class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow" id="dialog-kicker">接案 → 電腦處理 → 手機上傳</p><h2 id="dialog-title">再來一次，不再照單全收。</h2><div id="dialog-copy"><p><b>第一輪照單全收，第二輪學會談條件。</b><br>同一天重來兩次，每輪 100 秒，約 4 分鐘完成（不含暫停）。</p><ol><li>手機<b>接收</b>通知，電腦通電<b>處理</b>。</li><li>完成後按<b>上傳交件</b>，才會得分。</li><li>第一輪後收到客戶回覆；第二輪可<b>交重點版</b>或<b>打電話延期</b>，改變要求。</li></ol><p>唯一插座：1 電腦／2 風扇／3 手機。<br>熱會拖慢工作；沒電不能交件。上傳時電腦可做另一件。<br>先放心試第一輪，漏件不會提早結束；第二輪還有機會。</p></div><button id="primary" class="primary">開始上工 →</button><button id="retry-same" class="secondary" hidden>重試同一局</button><p class="dialog-foot">切換分頁會暫停全部倒數，回來後按繼續。</p></section></div>
    </section>
    <footer><span>生活很難，插座還只有一個。</span><span>1 / 2 / 3 供電 · Q / W / E 選取已接收工作 · 空白鍵暫停 · <span id="seed-label"></span></span></footer>
  </main>`;
  el('play-area').inert = true;
}

const cardNodes = new Map<number, HTMLElement>();
const cardSlots = new Map<number, number>();
const taskKeys = ['Q', 'W', 'E'];
export function shortcutTaskId(slot: number): number | undefined {
  return [...cardSlots].find(([, assigned]) => assigned === slot)?.[0];
}
function makeCard(t: Task): HTMLElement {
  const card = document.createElement('article');
  card.className = 'task-card'; card.dataset.id = String(t.id);
  card.innerHTML = `<div class="task-meta"><span class="task-label"><kbd data-field="shortcut"></kbd><span data-field="label"></span></span><strong data-field="deadline"></strong></div>
    <div class="reward-badge" data-field="reward"></div>
    <h3 data-field="name"></h3><p class="task-status" data-field="status"></p>
    <div class="task-track" data-field="work-track" aria-hidden="true"><span data-field="work-fill"></span></div>
    <p class="task-detail" data-field="progress"></p>
    <div class="upload-track" data-field="upload-track" aria-hidden="true"><span data-field="upload-fill"></span></div>
    <p class="task-detail" data-field="upload"></p>
    <div class="task-actions main-actions"><button data-action="receive">手機接收</button><button data-action="select">選取處理</button><button data-action="upload">上傳交件</button><button data-action="brief" hidden></button><button data-action="extend" hidden></button></div>
    <p class="action-reason" data-field="reason"></p>
    <section class="terms" data-field="terms" hidden><p data-field="terms-status"></p><small data-field="terms-reason"></small></section>
    <p class="previous-result" data-field="previous" hidden></p>
    <details class="task-more"><summary>估算與客戶回覆</summary><p class="task-slack" data-field="slack" title="假設立即優先處理、維持目前效率且手機有電；包含上傳與通話排隊，不含補電、降溫、操作及其他電腦工作。"></p><p data-field="insight"></p><button class="abandon" data-action="abandon">放棄此件（-${C.missedPenalty} 分）</button></details>
    <div class="abandon-confirm" data-field="abandon-confirm" hidden><p>確認放棄？扣 ${C.missedPenalty} 分並釋放位置。期限仍在倒數。</p><div><button data-action="cancel-abandon">保留工作</button><button data-action="confirm-abandon">確認放棄</button></div></div>`;
  return card;
}
function renderCard(card: HTMLElement, t: Task, s: GameState, earliestId?: number, pendingAbandonId?: number | null, previous?: TaskRecord): void {
  const field = (name: string) => card.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const button = (name: string) => card.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
  const brief = briefTerms(t);
  const left = Math.max(0, t.dueAt - s.elapsed);
  const hidden = t.status === 'pending' && s.battery <= 0;
  const selected = s.selectedId === t.id;
  const slot = cardSlots.get(t.id)!;
  text(field('shortcut'), taskKeys[slot]);
  field('shortcut').title = `${taskKeys[slot]}：選取這份已接收的工作`;
  card.style.setProperty('--task-column', String(slot + 1));
  button('select').setAttribute('aria-keyshortcuts', taskKeys[slot].toLowerCase());
  card.classList.toggle('chosen', selected);
  card.classList.toggle('due-soon', left <= C.deadlineWarning);
  card.classList.toggle('critical', left <= C.deadlineCritical && isActive(s));
  card.classList.toggle('ready-to-send', t.status === 'ready');
  text(field('label'), hidden ? '手機通知・尚未讀取' : `${t.urgent ? '急件 · ' : ''}${earliestId === t.id ? '最快到期' : '交件倒數'}`);
  const tier = importance(t.reward);
  field('reward').className = `reward-badge${hidden ? '' : ` tier-${tier.key}`}`;
  text(field('reward'), hidden ? '報酬待查看' : `${tier.label}委託  +${t.reward} 分`);
  const advice = taskAdvice(s, t);
  field('slack').classList.toggle('tight', !hidden && advice.slack <= C.slackWarning);
  text(field('slack'), hidden ? '復電後可評估交件時間' : s.battery <= 0 ? '先充電，再評估交件時間' : advice.slack < 0 ? `立即優先做：估計超時 ${Math.ceil(-advice.slack)} 秒` : `立即優先做：估計餘裕 ${Math.floor(advice.slack)} 秒${advice.slack <= C.slackWarning ? ' · 吃緊' : ''}`);
  text(field('deadline'), hidden ? '期限倒數中' : `${Math.ceil(left)} 秒`);
  text(field('name'), hidden ? '關機期間保留的通知' : t.name);
  const status = {
    pending: '待接收・期限已開始倒數',
    queued: selected ? '處理暫停・請供電給電腦' : '待處理・點擊卡片選取',
    processing: '處理中・電腦目前工作',
    ready: '處理完成，尚未交件',
    uploading: s.battery > 0 ? '上傳中・電腦可另做一件' : '上傳暫停・手機沒電，請充電',
  }[t.status];
  text(field('previous'), previous ? `上次：${recordDetail(previous)} · ${previous.score} 分` : '第一輪：先熟悉接收、處理與上傳。');
  field('previous').hidden = !previous || hidden;
  text(field('status'), s.paused ? '遊戲暫停・所有進度保留' : status);
  field('work-fill').style.width = `${t.processed / t.work * 100}%`;
  text(field('progress'), hidden ? '復電後可查看工作內容' : `電腦 ${Math.floor(t.processed / t.work * 100)}% · 依目前效率還需 ${processingSeconds(s, t).toFixed(1)} 秒`);
  field('upload-fill').style.width = `${t.uploaded / t.upload * 100}%`;
  text(field('upload'), hidden ? '通知保留，期限不會延後' : `上傳 ${Math.floor(t.uploaded / t.upload * 100)}% · 還需 ${(t.upload - t.uploaded).toFixed(1)} 秒`);
  const finished = ['ready', 'uploading'].includes(t.status);
  field('work-track').hidden = finished; field('progress').hidden = finished;
  field('upload-track').hidden = !finished; field('upload').hidden = !finished;
  button('receive').hidden = t.status !== 'pending';
  button('receive').disabled = !isActive(s) || s.battery <= 0;
  button('select').hidden = !['queued', 'processing'].includes(t.status);
  button('select').disabled = !isActive(s) || selected;
  button('select').setAttribute('aria-pressed', String(selected));
  text(button('select'), selected ? '已選取' : `選取處理 ${taskKeys[slot]}`);
  button('upload').hidden = !['ready', 'uploading'].includes(t.status);
  button('upload').disabled = !isActive(s) || s.battery <= 0 || s.uploadingId !== null || s.call !== null;
  text(button('upload'), t.status === 'uploading' ? '上傳已開始' : `上傳交件 +${t.reward}`);
  const confirming = pendingAbandonId === t.id;
  field('abandon-confirm').hidden = !confirming;
  button('abandon').disabled = !isActive(s) || confirming;
  button('confirm-abandon').disabled = !isActive(s);
  button('cancel-abandon').disabled = !isActive(s);
  let reason = '';
  if (s.paused) reason = '繼續遊戲後才能操作。';
  else if (t.status === 'ready' && s.call) reason = '手機正在協調期限；完成或掛斷後才能上傳。';
  else if (s.battery <= 0 && ['pending', 'ready', 'uploading'].includes(t.status)) reason = '手機已關機，無法接案或交件；請充電。';
  else if (t.status === 'ready' && s.uploadingId !== null) reason = '手機正在上傳另一件，完成後才能交這件。';
  else if (['ready', 'uploading'].includes(t.status) && advice.needsCharge) reason = `上傳還需約 ${Math.ceil(advice.uploadBattery)}% 電量，建議邊充邊傳。`;
  else if (t.status === 'uploading') reason = '上傳會自動完成；不必把插座留給手機。';
  else if (selected && t.status !== 'ready') reason = s.powered === 'computer' ? '已選為電腦目前工作。' : '處理暫停；切回電腦即可繼續。';
  else if (t.status === 'pending') reason = '手機有電即可接收，不需插電。';
  else if (t.status === 'ready') reason = '現在上傳才算交件，期限仍在倒數。';
  text(field('reason'), reason);
  field('reason').classList.toggle('urgent', !hidden && ['ready', 'uploading'].includes(t.status) && advice.needsCharge);
  const learned = s.round === 2 && s.known.includes(t.id) && !!t.insight && !hidden;
  card.classList.toggle('choice-open', learned && !t.choice && t.insight !== 'fixed' && ['pending', 'queued', 'processing'].includes(t.status));
  field('terms').hidden = !learned;
  button('brief').hidden = true; button('extend').hidden = true;
  text(button('receive'), learned ? `完整接案 · ${t.reward} 分／${t.work} 秒` : '手機接收');
  field('insight').hidden = !learned;
  if (learned) {
    text(field('insight'), `上次客戶回覆：${insightText[t.insight!]}`);
    const calling = s.call?.taskId === t.id;
    text(field('terms-status'), calling ? `${s.battery <= 0 ? '通話暫停，請充電' : '通話協調中'} · 還需 ${(ENCORE.callSeconds - s.call!.progress).toFixed(1)} 秒；原期限仍倒數` : t.choice === 'brief' ? '已改交重點版 · 報酬降低，仍需上傳' : t.choice === 'extend' ? `已協調延期 ${ENCORE.extension} 秒 · 下班仍是最後期限` : t.insight === 'fixed' ? '這件須依原要求交件；把協商時間留給其他工作。' : ['ready', 'uploading'].includes(t.status) ? '處理已完成，請依目前條件交件。' : t.insight === 'brief' ? '完整報酬，或少做少賺？按鈕為正常效率總處理時間。' : '原期限交件，或占用手機爭取時間？');
    const eligible = !t.choice && ['pending', 'queued', 'processing'].includes(t.status);
    button('brief').hidden = t.insight !== 'brief' || !eligible;
    button('extend').hidden = t.insight !== 'extend' || !eligible;
    button('brief').disabled = !isActive(s) || s.battery <= 0;
    button('extend').disabled = !isActive(s) || s.battery <= 0 || !!s.call || s.uploadingId !== null;
    text(button('brief'), `重點版 · ${brief.reward} 分／${brief.work} 秒`);
    text(button('extend'), `打電話 ${ENCORE.callSeconds} 秒 · 延期 ${ENCORE.extension} 秒`);
    text(field('terms-reason'), s.battery <= 0 ? '手機關機，先補電。' : calling ? '通話耗電，電腦可同時工作；掛斷會失去本次通話進度。' : eligible && t.insight === 'extend' && s.uploadingId !== null ? '手機正在上傳，完成後才能撥電話。' : eligible && t.insight === 'extend' && s.call ? '正在與另一位客戶通話。' : eligible && t.insight === 'extend' ? '通話完成才延期；若先逾期則失敗。不增加報酬，也不延後下班。' : eligible && t.insight === 'brief' ? `少拿 ${t.reward - brief.reward} 分，減少 ${Math.max(0, t.work - Math.max(t.processed, brief.work)).toFixed(1)} 秒剩餘處理量（正常效率）；仍需上傳 ${t.upload} 秒。` : '');
    if (eligible && t.insight === 'extend') {
      const advice = callAdvice(s, t);
      const reason = field('terms-reason').textContent;
      text(field('terms-reason'), `${reason} 通話 ${ENCORE.callSeconds} 秒，截止時間實際延後 ${advice.gain.toFixed(1)} 秒（受下班限制）。${advice.canFinish ? '' : '剩餘時間不足以完成通話！'}${advice.waitingCount ? ` ${advice.waitingCount} 件／${advice.waitingScore} 分待上傳，通話期間須等待。${advice.endangered ? `其中 ${advice.endangered} 件若先通話再上傳，可能來不及。` : ''}` : ''}`);
    }
  }
}

let historySize = -1;
let feedbackKey = '';
export function resetView(): void {
  (el('phone-delivery') as HTMLSelectElement).replaceChildren(new Option('請選擇工作，不會自動上傳', ''));
  cardNodes.clear(); cardSlots.clear(); el('tasks').replaceChildren(); historySize = -1; feedbackKey = '';
  el('feedback').replaceChildren();
  (document.querySelector('.history') as HTMLDetailsElement).open = false;
}
export function showDialog(kicker: string, title: string, copy: string, label: string): void {
  text(el('dialog-kicker'), kicker); text(el('dialog-title'), title);
  el('dialog-copy').innerHTML = copy; text(el('primary'), label);
  el('retry-same').hidden = true;
  el('overlay').hidden = false; el('play-area').inert = true; el('primary').focus();
}
export function hideDialog(): void { el('overlay').hidden = true; el('retry-same').hidden = true; el('play-area').inert = false; }
const outcomes = { delivered: '已交件', expired: '逾期', abandoned: '主動放棄', unfinished: '下班未完成' };
function historyLine(record: TaskRecord): string {
  return `${clockText(record.at)} · ${record.name}${record.choice === 'brief' ? '（重點版）' : record.choice === 'extend' ? '（曾協調延期）' : ''} · ${outcomes[record.outcome]} · ${record.score > 0 ? '+' : ''}${record.score} 分 · ${recordDetail(record)}`;
}
export function resultReview(history: TaskRecord[]): string {
  const totals = reviewSummary(history);
  const container = document.createElement('section'); container.className = 'result-review';
  const overview = document.createElement('p'); overview.id = 'missed-summary';
  overview.textContent = `漏件階段：未接收 ${totals.unreceived} 件／處理未完 ${totals.processing} 件／處理完成卻未交出 ${totals.unsent} 件。`;
  container.append(overview);
  const missed = history.filter(record => record.outcome !== 'delivered');
  if (missed.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = `查看 ${missed.length} 件漏件當時的進度`;
    const list = document.createElement('ol');
    for (const record of missed) { const li = document.createElement('li'); li.textContent = historyLine(record); list.append(li); }
    details.append(summary, list); container.append(details);
  }
  return container.outerHTML;
}
export function roundBrief(s: GameState): string {
  const root = document.createElement('section'); root.className = 'round-brief';
  const add = (tag: string, value: string, parent: HTMLElement = root) => {
    const node = document.createElement(tag); node.textContent = value; parent.append(node); return node;
  };
  const missed = s.history.filter(r => r.outcome !== 'delivered');
  const highlight = missed.find(r => ['ready', 'uploading'].includes(r.stage)) ?? missed[0];
  add('h3', highlight ? '上次最可惜的一件' : '你已經交出了所有工作');
  add('p', highlight ? `${highlight.name}：${recordDetail(highlight)}。這次可重新安排交件順序。` : '這次比較完整報酬與協商條件，嘗試另一種安排。');
  add('h3', '這次能改變要求');
  add('p', '重點版：少做、少賺，仍須上傳。電話延期：占用手機爭取時間，電腦可同時工作。');
  add('p', '不變的限制：只有一個插座；手機不能同時通話與上傳；下班仍須交件。');
  const details = document.createElement('details'); details.className = 'memory-details'; root.append(details);
  add('summary', '查看六件工作的客戶回覆（第二輪卡片也可查看）', details);
  const list = add('ul', '', details); list.className = 'memory-list';
  for (const [index, appointment] of s.schedule.entries()) {
    const record = s.history.find(r => r.id === index + 1);
    add('li', `${appointment.at} 秒 · ${appointment.template.name}｜${record ? recordDetail(record) : '尚無紀錄'}。${insightText[appointment.insight]}`, list);
  }
  add('p', `第一輪：${s.delivered} 件交件／${s.missed} 件漏件／${s.score} 分。`);
  return root.outerHTML;
}
export function roundComparison(first: TaskRecord[], second: TaskRecord[]): string {
  const section = document.createElement('section'); section.className = 'round-comparison';
  const summary = document.createElement('p');
  const delivered = second.filter(r => r.outcome === 'delivered');
  summary.textContent = `成功交件：原要求 ${delivered.filter(r => !r.choice).length} 件／重點版 ${delivered.filter(r => r.choice === 'brief').length} 件／延期後 ${delivered.filter(r => r.choice === 'extend').length} 件。`;
  section.append(summary);
  const table = document.createElement('table');
  table.innerHTML = '<caption>同一件工作，兩次的選擇</caption><thead><tr><th scope="col">工作</th><th scope="col">第一輪</th><th scope="col">第二輪</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const original of [...first].sort((a, b) => a.id - b.id)) {
    const current = second.find(r => r.id === original.id);
    const row = document.createElement('tr');
    const label = (r: TaskRecord | undefined) => r ? `${r.choice === 'brief' ? '重點版' : r.choice === 'extend' ? '曾協調延期' : '原要求'} · ${outcomes[r.outcome]} ${r.score > 0 ? '+' : ''}${r.score} 分${r.outcome === 'delivered' ? '' : `；${recordDetail(r)}`}` : '尚無紀錄';
    for (const [i, value] of [original.name, label(original), label(current)].entries()) {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) cell.setAttribute('scope', 'row');
      cell.textContent = value; row.append(cell);
    }
    body.append(row);
  }
  table.append(body); section.append(table); return section.outerHTML;
}
export function render(s: GameState, best: number, muted: boolean, pendingAbandonId: number | null = null, previous: TaskRecord[] = []): void {
  document.querySelector('.shell')!.classList.toggle('in-session', s.phase !== 'ready');
  text(el('session-label'), s.paused ? '已暫停' : s.phase === 'playing' ? `第 ${s.round || 1} 輪 · ${s.round === 2 ? '這次，談條件' : '先照要求做'}` : s.phase === 'ended' ? '下班了' : '準備上工');
  text(el('timer'), clockText(remaining(s)));
  el('timer').classList.toggle('urgent', remaining(s) <= 30);
  text(el('score'), String(s.score)); text(el('counts'), `已交 ${s.delivered} 件 · 漏件 ${s.missed} 件`);
  text(el('best'), `歷史最高 ${best} 分`);
  text(el('temperature'), `${s.temperature.toFixed(1)}°C`);
  text(el('efficiency'), `工作效率 ${Math.round(efficiency(s) * 100)}%`);
  el('temperature').classList.toggle('urgent', s.temperature >= C.heatWarning);
  const battery = s.battery > 0 && s.battery < 1 ? '<1' : String(Math.floor(s.battery));
  text(el('battery'), `${battery}%`); text(el('phone-percent'), `${battery}%`);
  el('battery').classList.toggle('urgent', s.battery <= C.lowBattery);
  el('phone-fill').style.width = `${s.battery}%`;
  text(el('battery-note'), s.battery === 0 ? '已關機・請補電' : s.powered === 'phone' ? '充電中・可邊充邊上傳' : s.uploadingId !== null ? '上傳耗電中' : '待機耗電中');
  text(el('powered-label'), `供電中 → ${names[s.powered]}`);
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-device]')) {
    const selected = button.dataset.device === s.powered;
    button.classList.toggle('selected', selected); button.classList.toggle('running', selected && isActive(s));
    button.setAttribute('aria-pressed', String(selected)); button.disabled = !isActive(s);
  }
  const selected = s.tasks.find(t => t.id === s.selectedId);
  const upload = s.tasks.find(t => t.id === s.uploadingId);
  text(el('computer-status'), selected ? selected.status === 'ready' ? `電腦：${selected.name}・處理完成，尚未交件` : `電腦：${selected.name}・${selected.status === 'processing' ? '處理中' : '處理暫停'}・估計還需 ${processingSeconds(s, selected).toFixed(1)} 秒` : s.powered !== 'computer' ? '電腦：處理暫停・尚未選取工作' : '電腦：尚未選取工作，請接收或點擊工作卡');
  text(el('screen-progress'), selected ? `${Math.floor(selected.processed / selected.work * 100)}% ${selected.status === 'ready' ? '待上傳' : '處理'}` : '等待選取工作');
  text(el('phone-status'), s.battery === 0 ? '手機已關機，無法接案或交件' : upload ? `手機：上傳「${upload.name}」${Math.floor(upload.uploaded / upload.upload * 100)}%` : `手機：${s.tasks.filter(t => t.status === 'pending').length} 則待接收通知・熱點待命`);
  if (s.call) text(el('phone-status'), `手機：${s.battery <= 0 ? '沒電，通話暫停' : '通話中'}「${s.tasks.find(t => t.id === s.call!.taskId)?.name}」· 還需 ${(ENCORE.callSeconds - s.call.progress).toFixed(1)} 秒，不能上傳`);
  if (s.call && s.battery > 0) text(el('battery-note'), s.powered === 'phone' ? '邊充電邊通話' : '通話耗電中');
  text(el('heat-status'), s.powered === 'fan' ? `風扇降溫中，每秒 −${C.coolPerSecond}°C；手機可同時上傳。` : s.temperature >= C.heatWarning ? `高溫拖慢處理！可以先搶交快完成的工作，或降溫準備下一件。最低效率 ${Math.round(C.minEfficiency * 100)}%。` : selected?.status === 'processing' ? `電腦工作中，每秒升溫 ${C.workingHeatPerSecond}°C；待機時升溫較慢。` : `電腦待機中，每秒僅升溫 ${C.idleHeatPerSecond}°C，可利用空檔補電或降溫。`);
  el('heat-status').classList.toggle('urgent', s.temperature >= C.heatWarning);
  text(el('task-count'), `${s.tasks.length} / ${C.maxTasks}`);
  const waiting = s.tasks.filter(t => t.status === 'ready');
  const picker = el('phone-delivery') as HTMLSelectElement;
  const pickedId = picker.value;
  for (const option of [...picker.options]) if (option.value && !waiting.some(t => String(t.id) === option.value)) option.remove();
  for (const task of waiting) {
    let option = [...picker.options].find(option => option.value === String(task.id));
    if (!option) { option = new Option('', String(task.id)); picker.add(option); }
    text(option, `${task.name} · 剩 ${Math.ceil(Math.min(task.dueAt - s.elapsed, remaining(s)))} 秒 · ${task.reward} 分`);
  }
  if (pickedId && !waiting.some(t => String(t.id) === pickedId)) picker.value = '';
  el('delivery-controls').hidden = waiting.length === 0;
  picker.disabled = !isActive(s);
  const sendReason = !isActive(s) ? '繼續遊戲後才能上傳' : s.battery <= 0 ? '手機已關機，先充電' : s.call ? '通話完成或掛斷後才能上傳' : s.uploadingId !== null ? '手機正在上傳另一件' : !picker.value ? '請先選擇要交的工作' : '按上傳才交件；不改變電腦選取的工作';
  (el('phone-send') as HTMLButtonElement).disabled = !isActive(s) || s.battery <= 0 || !!s.call || s.uploadingId !== null || !picker.value;
  text(el('phone-send-reason'), sendReason);
  text(el('phone-queue'), `待上傳 ${waiting.length} 件 · ${waiting.reduce((sum, t) => sum + t.reward, 0)} 分${s.call ? '｜通話中無法上傳' : upload ? '｜完成後才能接下一件上傳或通話' : '｜有電即可通訊，不必插電'}`);
  (el('phone-charge') as HTMLButtonElement).disabled = !isActive(s) || s.powered === 'phone';
  text(el('phone-charge'), s.powered === 'phone' ? '手機充電中' : '切到手機充電');
  el('phone-hangup').hidden = !s.call;
  (el('phone-hangup') as HTMLButtonElement).disabled = !isActive(s);
  const inFlight = s.tasks.filter(t => t.status === 'uploading');
  const unsecured = [...waiting, ...inFlight].reduce((sum, t) => sum + t.reward, 0);
  el('delivery-summary').hidden = unsecured === 0;
  text(el('delivery-summary'), `尚未入帳 ${unsecured} 分 · ${waiting.length} 件待上傳${inFlight.length ? ' · 1 件上傳中' : ''}，交件完成才得分。`);
  const arrivalsEnded = s.generator.nextAt === Infinity;
  text(el('arrival-hint'), arrivalsEnded ? '即將下班，不再新增工作' : s.tasks.length >= C.maxTasks ? '工作區已滿，先安排現有工作' : `通知到達就倒數・漏件每件扣 ${C.missedPenalty} 分`);
  el('offline').hidden = s.battery > 0;
  el('empty-tasks').hidden = s.tasks.length > 0;
  text(el('empty-tasks'), s.phase === 'ended' ? '本局工作已結算。' : arrivalsEnded ? '今天的工作告一段落，等待下班。' : '等待手機通知。新工作到達時，先按「手機接收」。');
  const earliest = [...s.tasks].sort((a, b) => a.dueAt - b.dueAt)[0];
  for (const [id, node] of cardNodes) if (!s.tasks.some(t => t.id === id)) { node.remove(); cardNodes.delete(id); cardSlots.delete(id); }
  for (const task of s.tasks) {
    let card = cardNodes.get(task.id);
    if (!card) {
      const slot = [0, 1, 2].find(candidate => ![...cardSlots.values()].includes(candidate))!;
      cardSlots.set(task.id, slot);
      card = makeCard(task); card.dataset.slot = String(slot); cardNodes.set(task.id, card);
      const next = [...el('tasks').children].find(node => Number((node as HTMLElement).dataset.slot) > slot);
      el('tasks').insertBefore(card, next ?? null);
    }
    renderCard(card, task, s, earliest?.id, pendingAbandonId, previous.find(r => r.id === task.id));
  }
  for (let slot = 0; slot < C.maxTasks; slot++) {
    let placeholder = el('tasks').querySelector<HTMLElement>(`[data-empty-slot="${slot}"]`);
    if (!placeholder) {
      placeholder = document.createElement('div'); placeholder.className = 'empty-slot';
      placeholder.dataset.emptySlot = String(slot);
      placeholder.style.setProperty('--task-column', String(slot + 1));
      placeholder.textContent = `${taskKeys[slot]} 空位 · 等待下一則通知`;
      el('tasks').append(placeholder);
    }
    placeholder.hidden = s.tasks.length === 0 || [...cardSlots.values()].includes(slot);
  }
  if (historySize !== s.history.length) {
    historySize = s.history.length;
    el('history-list').replaceChildren(...[...s.history].reverse().map(record => {
      const li = document.createElement('li');
      li.textContent = historyLine(record); return li;
    }));
    text(el('history-title'), `本局紀錄 · 已交 ${s.delivered} 件 / 漏件 ${s.missed} 件`);
  }
  const recent = s.events.filter(event => s.elapsed - event.at < C.noticeDuration).slice(-2);
  const key = recent.map(event => event.id).join(',');
  if (key !== feedbackKey) {
    feedbackKey = key;
    el('feedback').replaceChildren(...recent.map(event => {
      const p = document.createElement('p'); p.className = event.kind; p.textContent = event.text; return p;
    }));
  }
  (el('pause') as HTMLButtonElement).disabled = !isActive(s);
  text(el('mute'), muted ? '音效：關' : '音效：開');
  el('mute').setAttribute('aria-pressed', String(muted));
  text(el('seed-label'), `本局種子 ${s.generator.seed}`);
}

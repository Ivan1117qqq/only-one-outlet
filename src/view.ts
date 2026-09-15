import { CONFIG as C } from './config.ts';
import { efficiency, isActive, processingSeconds, remaining } from './game.ts';
import type { Device, GameState, Task, TaskRecord } from './game.ts';
import { devicesMarkup } from './devices.ts';
import { importance, taskAdvice } from './task-advice.ts';
import { recordDetail, reviewSummary } from './review.ts';

export const names: Record<Device, string> = { computer: '電腦', fan: '電風扇', phone: '手機' };
export const el = (id: string): HTMLElement => document.getElementById(id)!;
export function text(node: Element, value: string): void { if (node.textContent !== value) node.textContent = value; }
const clockText = (seconds: number) => `${Math.floor(Math.ceil(seconds) / 60).toString().padStart(2, '0')}:${(Math.ceil(seconds) % 60).toString().padStart(2, '0')}`;

export function mount(): void {
  el('app').innerHTML = `
  <main class="shell">
    <header><span class="brand"><span class="brand-icon">↯</span> 小房間工作室</span><span class="edition">下班前的最後三分鐘 / 002</span></header>
    <section class="heading"><div><p class="eyebrow">ONE OUTLET. TOO MANY DEADLINES.</p><h1>只有一個插座<span>。</span></h1><p class="subtitle">網路壞了，工作還在進來。接案 → 電腦處理 → 手機上傳。</p></div><span class="stamp">距離下班<br><strong>3 分鐘</strong></span></section>
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
        </div>
        <div class="operation-strip"><p id="computer-status">電腦：等待工作</p><p id="phone-status">手機：熱點待命</p><p id="heat-status">溫度舒適，工作效率正常。</p></div>
        <section class="work-section" aria-labelledby="work-title"><div class="section-title"><h2 id="work-title">限時工作 <span id="task-count">0 / 3</span></h2><span id="arrival-hint">通知到達即開始倒數</span></div>
          <p id="offline" class="offline" hidden>手機已關機，無法接案或交件。通知仍會保留、期限繼續倒數；請供電給手機。</p>
          <p class="priority-guide">分數代表重要程度：<span class="tier-normal">一般</span>／<span class="tier-important">重要</span>／<span class="tier-critical">關鍵</span>；期限越短越急。</p>
          <p id="delivery-summary" class="delivery-summary"></p>
          <div id="tasks" class="tasks"></div><p id="empty-tasks" class="empty">手機通知即將到達。先接收，再處理，最後上傳。</p>
        </section>
        <div id="feedback" class="feedback" role="status" aria-live="polite" aria-atomic="true"></div>
        <details class="history"><summary id="history-title">本局紀錄 · 0 件</summary><ol id="history-list"></ol></details>
      </div>
      <div id="overlay" class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><p class="eyebrow" id="dialog-kicker">接案 → 電腦處理 → 手機上傳</p><h2 id="dialog-title">下班前，能交幾件？</h2><div id="dialog-copy"><p>房間網路壞了，只能靠<b>手機熱點</b>交件。<br>你有 180 秒，但每份工作都有自己的期限。</p><ol><li>在工作通知按<b>「手機接收」</b>，取得任務。</li><li>點工作卡選取，再供電給<b>電腦</b>處理。</li><li>完成後按<b>「上傳交件」</b>，收到才算分！</li></ol><p>手機上傳不必插電，電腦可以同時做另一件。<br>記得補電、吹風；逾期或放棄每件扣 ${C.missedPenalty} 分。</p></div><button id="primary" class="primary">開始上工 →</button><p class="dialog-foot">切換分頁會暫停全部倒數，回來後按繼續。</p></section></div>
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
    <div class="task-track" aria-hidden="true"><span data-field="work-fill"></span></div>
    <p class="task-detail" data-field="progress"></p>
    <div class="upload-track" aria-hidden="true"><span data-field="upload-fill"></span></div>
    <p class="task-detail" data-field="upload"></p>
    <p class="task-slack" data-field="slack" title="假設立即優先處理、維持目前效率且手機有電；包含現有上傳排隊，不含接案操作、補電、降溫與其他電腦工作。"></p>
    <div class="task-actions"><button data-action="receive">手機接收</button><button data-action="select">選取處理</button><button data-action="upload">上傳交件</button></div>
    <p class="action-reason" data-field="reason"></p><button class="abandon" data-action="abandon">放棄此件（-${C.missedPenalty} 分）</button>`;
  return card;
}
function renderCard(card: HTMLElement, t: Task, s: GameState, earliestId?: number): void {
  const field = (name: string) => card.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  const button = (name: string) => card.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
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
  text(field('status'), s.paused ? '遊戲暫停・所有進度保留' : status);
  field('work-fill').style.width = `${t.processed / t.work * 100}%`;
  text(field('progress'), hidden ? '復電後可查看工作內容' : `電腦 ${Math.floor(t.processed / t.work * 100)}% · 依目前效率還需 ${processingSeconds(s, t).toFixed(1)} 秒`);
  field('upload-fill').style.width = `${t.uploaded / t.upload * 100}%`;
  text(field('upload'), hidden ? '通知保留，期限不會延後' : `上傳 ${Math.floor(t.uploaded / t.upload * 100)}% · 還需 ${(t.upload - t.uploaded).toFixed(1)} 秒`);
  button('receive').hidden = t.status !== 'pending';
  button('receive').disabled = !isActive(s) || s.battery <= 0;
  button('select').hidden = !['queued', 'processing'].includes(t.status);
  button('select').disabled = !isActive(s) || selected;
  button('select').setAttribute('aria-pressed', String(selected));
  text(button('select'), selected ? '已選取' : `選取處理 ${taskKeys[slot]}`);
  button('upload').hidden = !['ready', 'uploading'].includes(t.status);
  button('upload').disabled = !isActive(s) || s.battery <= 0 || s.uploadingId !== null;
  text(button('upload'), t.status === 'uploading' ? '上傳已開始' : `上傳交件 +${t.reward}`);
  button('abandon').disabled = !isActive(s);
  let reason = '';
  if (s.paused) reason = '繼續遊戲後才能操作。';
  else if (s.battery <= 0 && ['pending', 'ready', 'uploading'].includes(t.status)) reason = '手機已關機，無法接案或交件；請充電。';
  else if (t.status === 'ready' && s.uploadingId !== null) reason = '手機正在上傳另一件，完成後才能交這件。';
  else if (['ready', 'uploading'].includes(t.status) && advice.needsCharge) reason = `上傳還需約 ${Math.ceil(advice.uploadBattery)}% 電量，建議邊充邊傳。`;
  else if (t.status === 'uploading') reason = '上傳會自動完成；不必把插座留給手機。';
  else if (selected && t.status !== 'ready') reason = s.powered === 'computer' ? '已選為電腦目前工作。' : '處理暫停；切回電腦即可繼續。';
  else if (t.status === 'pending') reason = '手機有電即可接收，不需插電。';
  else if (t.status === 'ready') reason = '現在上傳才算交件，期限仍在倒數。';
  text(field('reason'), reason);
  field('reason').classList.toggle('urgent', !hidden && ['ready', 'uploading'].includes(t.status) && advice.needsCharge);
}

let historySize = -1;
let feedbackKey = '';
export function resetView(): void {
  cardNodes.clear(); cardSlots.clear(); el('tasks').replaceChildren(); historySize = -1; feedbackKey = '';
  el('feedback').replaceChildren();
  (document.querySelector('.history') as HTMLDetailsElement).open = false;
}
export function showDialog(kicker: string, title: string, copy: string, label: string): void {
  text(el('dialog-kicker'), kicker); text(el('dialog-title'), title);
  el('dialog-copy').innerHTML = copy; text(el('primary'), label);
  el('overlay').hidden = false; el('play-area').inert = true; el('primary').focus();
}
export function hideDialog(): void { el('overlay').hidden = true; el('play-area').inert = false; }
const outcomes = { delivered: '已交件', expired: '逾期', abandoned: '主動放棄', unfinished: '下班未完成' };
function historyLine(record: TaskRecord): string {
  return `${clockText(record.at)} · ${record.name} · ${outcomes[record.outcome]} · ${record.score > 0 ? '+' : ''}${record.score} 分 · ${recordDetail(record)}`;
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
export function render(s: GameState, best: number, muted: boolean): void {
  document.querySelector('.shell')!.classList.toggle('in-session', s.phase !== 'ready');
  text(el('session-label'), s.paused ? '已暫停' : s.phase === 'playing' ? '下班倒數' : s.phase === 'ended' ? '下班了' : '準備上工');
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
  text(el('heat-status'), s.powered === 'fan' ? `風扇降溫中，每秒 −${C.coolPerSecond}°C；手機可同時上傳。` : s.temperature >= C.heatWarning ? `高溫拖慢處理！可以先搶交快完成的工作，或降溫準備下一件。最低效率 ${Math.round(C.minEfficiency * 100)}%。` : selected?.status === 'processing' ? `電腦工作中，每秒升溫 ${C.workingHeatPerSecond}°C；待機時升溫較慢。` : `電腦待機中，每秒僅升溫 ${C.idleHeatPerSecond}°C，可利用空檔補電或降溫。`);
  el('heat-status').classList.toggle('urgent', s.temperature >= C.heatWarning);
  text(el('task-count'), `${s.tasks.length} / ${C.maxTasks}`);
  const waiting = s.tasks.filter(t => t.status === 'ready');
  const inFlight = s.tasks.filter(t => t.status === 'uploading');
  const unsecured = [...waiting, ...inFlight].reduce((sum, t) => sum + t.reward, 0);
  el('delivery-summary').hidden = unsecured === 0;
  text(el('delivery-summary'), `尚未入帳 ${unsecured} 分 · ${waiting.length} 件待上傳${inFlight.length ? ' · 1 件上傳中' : ''}，交件完成才得分。`);
  const arrivalsEnded = s.generator.nextAt === Infinity;
  text(el('arrival-hint'), arrivalsEnded ? '即將下班，不再新增工作' : s.tasks.length >= C.maxTasks ? '工作區已滿，下一份工作會延後' : `通知到達就倒數・漏件每件扣 ${C.missedPenalty} 分`);
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
    renderCard(card, task, s, earliest?.id);
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

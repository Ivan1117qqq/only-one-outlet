import './style.css';
import './work.css';
import { abandonTask, cancelCall, changeTerms, createGame, GameClock, isActive, receiveTask, selectTask, setPaused, setPower, startUpload } from './game.ts';
import type { Device, GameState } from './game.ts';
import { ENCORE, insightText } from './encore.ts';
import { el, hideDialog, mount, render, resetView, resultReview, shortcutTaskId, showDialog } from './view.ts';
import { loadBest, loadMuted, saveBest, saveMuted, Sounds } from './preferences.ts';

const seedParam = new URLSearchParams(location.search).get('seed');
const fixedSeed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : undefined;
const newSeed = () => fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];
let state = createGame(newSeed(), 1);
let firstRound: GameState | null = null;
let best = loadBest();
let muted = loadMuted();
let lastTime = performance.now();
let lastEvent = 0;
let resultShown = false;
let pendingAbandonId: number | null = null;
const clock = new GameClock();
const sounds = new Sounds();
mount();
const paint = () => {
  if (!isActive(state) || !state.tasks.some(t => t.id === pendingAbandonId)) pendingAbandonId = null;
  render(state, best, muted, pendingAbandonId);
};

function update(now: number): void {
  const delta = Math.max(0, (now - lastTime) / 1000);
  lastTime = now;
  clock.advance(state, delta);
  const latest = state.events.at(-1);
  if (latest && latest.id > lastEvent) {
    if (!document.hidden && isActive(state)) sounds.beep(latest.kind, muted);
    lastEvent = latest.id;
  }
  if (state.phase === 'ended' && !resultShown) {
    resultShown = true;
    if (state.round === 1) {
      firstRound = state;
      const notes = state.schedule.map((a, index) => {
        const record = state.history.find(r => r.id === index + 1);
        return `<li><b>${a.at} 秒 · ${a.template.name}</b>（${record?.outcome === 'delivered' ? '已交件' : '漏件'}）<br>${insightText[a.insight]}</li>`;
      }).join('');
      showDialog('第一輪結束 · 客戶的事後回覆', '如果再來一次，不必照單全收。',
        `<p>第一輪：交件 ${state.delivered} 件／漏件 ${state.missed} 件／${state.score} 分。</p><p>同一天即將重來，通知與初始設備狀態完全相同。這次能依客戶回覆<b>改交重點版</b>或<b>打電話延期</b>。</p><ul class="memory-list">${notes}</ul><p>重點版：處理量降至 ${ENCORE.briefWorkRatio * 100}%，報酬剩 ${ENCORE.briefRewardRatio * 100}%。<br>延期：通話 ${ENCORE.callSeconds} 秒換 ${ENCORE.extension} 秒期限，耗電且占用手機，不能同時上傳。電腦可繼續工作。</p>`, '帶著經驗，再來一次 →');
      return;
    }
    best = Math.max(best, state.score); saveBest(best);
    const saved = state.history.filter(r => r.outcome === 'delivered' && firstRound?.history.find(old => old.id === r.id)?.outcome !== 'delivered');
    showDialog('兩輪完成 · 再一次的選擇', '這次，你改變了什麼？',
      `<div class="results"><p>第一輪<strong>${firstRound?.score ?? 0} 分</strong></p><p>第二輪<strong>${state.score} 分</strong></p><p>成功／漏件<strong>${state.delivered}／${state.missed} 件</strong></p><p>第二輪最高<strong>${best} 分</strong></p></div><p>救回第一輪漏掉的 ${saved.length} 件：${saved.map(r => r.name).join('、') || '這次沒有新增救回的工作'}。</p><p>分數變化：${state.score - (firstRound?.score ?? 0)} 分。重點版報酬較低，多交件不一定更高分。</p>${resultReview(state.history)}<p>漏件每件扣 40 分；下班仍未交件也算漏件。</p>`, '重新體驗兩輪 →');
  }
}
function pause(): void {
  update(performance.now());
  if (!isActive(state)) return;
  setPaused(state, true);
  showDialog('休息一下，沒關係', '工作暫停中。', '<p>交件期限、工作通知、處理、上傳、溫度與電量全部暫停。<br>準備好後按繼續。</p>', '繼續上工 →');
  paint();
}
function begin(seed: number, round: 1 | 2 = 1): void {
  if (round === 1) firstRound = null;
  state = createGame(seed, round, firstRound?.known); state.phase = 'playing';
  clock.reset(); resetView(); lastEvent = 0; resultShown = false; pendingAbandonId = null;
}
function resumeDisplay(): void {
  lastTime = performance.now(); hideDialog(); paint();
  document.querySelector<HTMLButtonElement>(`[data-device="${state.powered}"]`)!.focus();
}
el('primary').addEventListener('click', () => {
  if (document.hidden) return;
  if (!muted) sounds.enable();
  if (state.paused) setPaused(state, false);
  else if (state.phase === 'ended' && state.round === 1) begin(state.generator.seed, 2);
  else begin(newSeed());
  resumeDisplay();
});
el('retry-same').addEventListener('click', () => {
  if (document.hidden || state.phase !== 'ended') return;
  if (!muted) sounds.enable();
  begin(state.generator.seed); resumeDisplay();
});
function act(action: () => void): void {
  if (document.hidden || !isActive(state)) return;
  update(performance.now());
  if (isActive(state)) action();
  paint();
}
document.querySelectorAll<HTMLButtonElement>('[data-device]').forEach(button => {
  button.addEventListener('click', () => act(() => setPower(state, button.dataset.device as Device)));
});
el('tasks').addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>('[data-id]');
  if (!card) return;
  const id = Number(card.dataset.id);
  const button = target.closest<HTMLButtonElement>('button');
  if (button?.disabled) return;
  const action = button?.dataset.action ?? 'select';
  act(() => {
    if (action === 'abandon') pendingAbandonId = id;
    else if (action === 'confirm-abandon') {
      if (pendingAbandonId === id) abandonTask(state, id);
      pendingAbandonId = null;
    } else {
      pendingAbandonId = null;
      if (action === 'receive') receiveTask(state, id);
      else if (action === 'select') selectTask(state, id);
      else if (action === 'upload') startUpload(state, id);
      else if (action === 'brief' || action === 'extend') changeTerms(state, id, action);
      else if (action === 'cancel-call') cancelCall(state);
    }
  });
  if (action === 'abandon' && pendingAbandonId === id) card.querySelector<HTMLButtonElement>('[data-action="cancel-abandon"]')!.focus();
  if (action === 'cancel-abandon') card.querySelector<HTMLButtonElement>('[data-action="abandon"]')!.focus();
});
el('pause').addEventListener('click', pause);
el('mute').addEventListener('click', () => {
  muted = !muted; saveMuted(muted); if (!muted) sounds.enable(); paint();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  lastTime = performance.now();
});
window.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Escape' && pendingAbandonId !== null) {
    event.preventDefault(); pendingAbandonId = null; paint(); return;
  }
  const device = ({ '1': 'computer', '2': 'fan', '3': 'phone' } as Record<string, Device>)[event.key];
  if (device) act(() => setPower(state, device));
  const slot = ['KeyQ', 'KeyW', 'KeyE'].indexOf(event.code);
  if (slot >= 0 && isActive(state)) {
    event.preventDefault();
    // 先記住按鍵對應的任務；時間更新若令它逾期，不轉而選取補進的新任務。
    const id = shortcutTaskId(slot);
    if (id !== undefined) act(() => { selectTask(state, id); });
  }
  if (event.code === 'Space' && isActive(state)) {
    event.preventDefault(); pause();
  }
  // 按鈕可用 Enter 操作；空白鍵與 Escape 暫停。
  if (event.key === 'Escape' && isActive(state)) pause();
});
function frame(now: number): void { update(now); paint(); requestAnimationFrame(frame); }
paint(); requestAnimationFrame(frame);

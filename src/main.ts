import './style.css';
import './work.css';
import { abandonTask, createGame, GameClock, isActive, receiveTask, selectTask, setPaused, setPower, startUpload } from './game.ts';
import type { Device } from './game.ts';
import { el, hideDialog, mount, render, resetView, resultReview, shortcutTaskId, showDialog } from './view.ts';
import { loadBest, loadMuted, saveBest, saveMuted, Sounds } from './preferences.ts';

const seedParam = new URLSearchParams(location.search).get('seed');
const fixedSeed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) >>> 0 : undefined;
const newSeed = () => fixedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0];
let state = createGame(newSeed());
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
    best = Math.max(best, state.score); saveBest(best);
    showDialog('下班了・本日工作結算', '今天，也努力交件了。',
      `<div class="results"><p>成功交件<strong>${state.delivered} 件</strong></p><p>漏件<strong>${state.missed} 件</strong></p><p>本局總分<strong>${state.score} 分</strong></p><p>歷史最高<strong>${best} 分</strong></p></div>${resultReview(state.history)}<p>漏件包含逾期、主動放棄與下班未完成的工作，每件只扣一次分。</p><p>重試同一局可比較策略；工作區滿時，到達時機仍會隨操作改變。</p>`, fixedSeed === undefined ? '挑戰新一局 →' : '再次挑戰固定種子 →');
    el('retry-same').hidden = fixedSeed !== undefined;
  }
}
function pause(): void {
  update(performance.now());
  if (!isActive(state)) return;
  setPaused(state, true);
  showDialog('休息一下，沒關係', '工作暫停中。', '<p>交件期限、工作通知、處理、上傳、溫度與電量全部暫停。<br>準備好後按繼續。</p>', '繼續上工 →');
  paint();
}
function begin(seed: number): void {
  state = createGame(seed); state.phase = 'playing';
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

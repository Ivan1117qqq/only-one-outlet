import './style.css';
import { createGame, efficiency, GameClock } from './game.ts';
import type { Device } from './game.ts';

const names: Record<Device, string> = { computer: '電腦', fan: '電風扇', phone: '手機' };
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header><a class="brand" href="./"><span class="brand-icon">↯</span> 小房間工作室</a><span class="edition">日常生存練習 / 001</span></header>
    <section class="heading"><div><p class="eyebrow">ONE OUTLET. THREE DEVICES.</p><h1>只有一個插座<span>。</span></h1><p class="subtitle">工作要交、天氣太熱、手機又快沒電。先救哪一個？</p></div><span class="stamp">距離交件<br><strong>3 分鐘</strong></span></section>
    <section class="game" aria-label="遊戲區域">
      <div class="topbar"><span><i class="live-dot"></i> <span id="session-label">準備上工</span></span><span class="timer" id="timer">03:00</span><button id="pause" class="quiet" disabled>暫停</button></div>
      <div class="dashboard">
        <div class="work"><div class="metric-label"><span>交件進度</span><strong id="progress-label">0%</strong></div><div class="work-track"><div id="progress-fill"></div><i style="left:30%">30</i><i style="left:60%">60</i></div><div class="data-row"><span id="data-one">○ 第一份資料</span><span id="data-two">○ 第二份資料</span></div></div>
        <div class="metric"><span>室內溫度</span><strong id="temperature">27.0<span>°C</span></strong><small id="efficiency">工作效率 100%</small></div>
        <div class="metric"><span>手機電量</span><strong id="battery">24<span>%</span></strong><small id="battery-note">待機耗電中</small></div>
      </div>
      <div class="room">
        <div class="room-caption">ROOM 01 <span>／ 一個平凡的趕工午後</span></div>
        <div class="devices">
          <button class="device" data-device="computer" aria-label="供電給電腦"><span class="device-tag">01 / 工作</span><span class="art computer"><span class="monitor"><span class="screen"><span>PROJECT_FINAL</span><span class="code-lines">━━━━━━<br>━━━━<br>━━━━━━━━</span><span id="screen-progress">0% COMPLETE</span></span></span><span class="stand"></span><span class="keyboard"></span></span><span class="device-title">電腦 <b class="power-tag">供電中</b></span><span class="device-description">接上電源，繼續趕工</span></button>
          <button class="device" data-device="fan" aria-label="供電給電風扇"><span class="device-tag">02 / 降溫</span><span class="art fan"><span class="fan-head"><span class="blades">✣</span><span class="fan-center"></span></span><span class="fan-pole"></span><span class="fan-base"></span></span><span class="device-title">電風扇 <b class="power-tag">供電中</b></span><span class="device-description">涼一點，工作快一點</span></button>
          <button class="device" data-device="phone" aria-label="供電給手機"><span class="device-tag">03 / 資料</span><span class="art phone"><span class="phone-body"><span class="phone-speaker"></span><span class="phone-time">14:57</span><span class="battery-art"><span id="phone-fill"></span></span><span id="phone-percent">24%</span><span class="phone-message">資料接收待命</span></span></span><span class="device-title">手機 <b class="power-tag">供電中</b></span><span class="device-description">留點電，才收得到資料</span></button>
        </div>
        <div class="desk-line"></div><div class="outlet-row"><span class="cable"></span><span class="outlet"><span>▮ ▮</span><i></i></span><div><small>唯一的插座</small><strong id="powered-label">已連接 → 電腦</strong></div><span class="switch-tip">點擊設備切換供電 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span></div>
      </div>
      <div class="status" role="status" aria-live="polite"><span id="status-icon">↳</span><span id="status-text">準備好就開始，插座的分配由你決定。</span></div>
      <div id="overlay" class="overlay"><section class="dialog" aria-labelledby="dialog-title"><p class="eyebrow" id="dialog-kicker">一個插座，三件要緊事</p><h2 id="dialog-title">今天也要準時交件。</h2><div id="dialog-copy"><p>你有 <b>180 秒</b>，把工作進度推到 100%。<br>點擊設備切換電源，同時只能插一台。</p><ul><li><b>電腦</b>通電才工作，拔掉也會保留進度。</li><li><b>電風扇</b>能降溫；太熱會讓工作變慢。</li><li><b>手機</b>在 30% 和 60% 要收資料，沒電就得先充電。</li></ul></div><button id="primary" class="primary">開始上工 <span>→</span></button><p class="dialog-foot">切換分頁會自動暫停，回來後按繼續。</p></section></div>
    </section>
    <footer><span>生活很難，插座還只有一個。</span><span>點擊操作 · 也支援鍵盤 1 / 2 / 3 · 空白鍵暫停</span></footer>
  </main>`;

const el = (id: string) => document.getElementById(id)!;
const deviceButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-device]')];
let state = createGame();
let paused = false;
let lastTime = performance.now();
const clock = new GameClock();

function render(): void {
  const active = state.phase === 'playing' && !paused;
  el('session-label').textContent = paused ? '已暫停' : state.phase === 'playing' ? '趕工進行中' : state.phase === 'ready' ? '準備上工' : '本次工作結束';
  const time = Math.ceil(state.remaining);
  el('timer').textContent = `${Math.floor(time / 60).toString().padStart(2, '0')}:${(time % 60).toString().padStart(2, '0')}`;
  el('timer').classList.toggle('urgent', time <= 30);
  el('progress-label').textContent = `${Math.floor(state.progress)}%`;
  el('progress-fill').style.width = `${state.progress}%`;
  el('temperature').innerHTML = `${state.temperature.toFixed(1)}<span>°C</span>`;
  el('temperature').classList.toggle('urgent', state.temperature >= 35);
  el('efficiency').textContent = `工作效率 ${Math.round(efficiency(state) * 100)}%`;
  const battery = state.battery > 0 && state.battery < 1 ? '<1' : String(Math.floor(state.battery));
  el('battery').innerHTML = `${battery}<span>%</span>`;
  el('battery').classList.toggle('urgent', state.battery <= 10);
  el('battery-note').textContent = state.powered === 'phone' ? '充電中' : state.battery === 0 ? '已沒電，無法接收資料' : '待機耗電中';
  el('screen-progress').textContent = `${Math.floor(state.progress)}% COMPLETE`;
  el('phone-fill').style.width = `${state.battery}%`;
  el('phone-percent').textContent = `${battery}%`;
  el('powered-label').textContent = `已連接 → ${names[state.powered]}`;
  el('data-one').textContent = `${state.received >= 1 ? '●' : '○'} 第一份資料${state.received >= 1 ? '已收到' : ' · 30%'}`;
  el('data-two').textContent = `${state.received >= 2 ? '●' : '○'} 第二份資料${state.received >= 2 ? '已收到' : ' · 60%'}`;
  const status = state.waiting ? `等待第 ${state.received + 1} 份資料：手機沒電了！請點擊手機充電，再切回電腦。` : state.powered === 'computer' ? '電腦工作中。留意溫度，也別讓手機沒電！' : state.powered === 'fan' ? '電風扇降溫中。工作進度已保留，切回電腦即可繼續。' : '手機充電中。工作進度已保留，充好電記得切回電腦。';
  const statusText = state.phase === 'ready' ? '準備好就開始，插座的分配由你決定。' : state.phase === 'won' ? '工作完成，辛苦了！' : state.phase === 'lost' ? '交件時間到了，下次再試一次。' : paused ? '遊戲已暫停，時間與所有設備數值都會保留。' : status;
  if (el('status-text').textContent !== statusText) el('status-text').textContent = statusText;
  el('status-text').parentElement!.classList.toggle('waiting', state.waiting);
  for (const button of deviceButtons) {
    const selected = button.dataset.device === state.powered;
    button.classList.toggle('selected', selected);
    button.classList.toggle('running', selected && active);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !active;
  }
  (el('pause') as HTMLButtonElement).disabled = !active;
}

function showDialog(kicker: string, title: string, copy: string, button: string): void {
  el('dialog-kicker').textContent = kicker;
  el('dialog-title').textContent = title;
  el('dialog-copy').innerHTML = copy;
  el('primary').textContent = button;
  el('overlay').hidden = false;
  el('primary').focus();
}

function setPaused(): void {
  if (state.phase !== 'playing' || paused) return;
  paused = true;
  showDialog('休息一下，沒關係', '工作暫停中。', '<p>倒數、工作、溫度與電量已全部暫停。<br>準備好後，再接著完成這份工作。</p>', '繼續上工 →');
  render();
}

el('primary').addEventListener('click', () => {
  if (document.hidden) return;
  if (!paused) { state = createGame(); state.phase = 'playing'; clock.reset(); }
  paused = false;
  lastTime = performance.now();
  el('overlay').hidden = true;
  render();
  deviceButtons.find(button => button.dataset.device === state.powered)!.focus();
});
function switchDevice(device: Device): void {
  if (state.phase !== 'playing' || paused || document.hidden) return;
  update(performance.now());
  if (state.phase === 'playing') state.powered = device;
  render();
}
deviceButtons.forEach(button => button.addEventListener('click', () => switchDevice(button.dataset.device as Device)));
el('pause').addEventListener('click', () => { update(performance.now()); setPaused(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { update(performance.now()); setPaused(); }
  lastTime = performance.now();
});
window.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const device = ({ '1': 'computer', '2': 'fan', '3': 'phone' } as Record<string, Device>)[event.key];
  if (device) switchDevice(device);
  if (event.code === 'Space' && state.phase === 'playing' && !paused) {
    event.preventDefault(); update(performance.now()); setPaused();
  }
});

function update(now: number): void {
  const elapsed = Math.max(0, (now - lastTime) / 1000);
  lastTime = now;
  if (state.phase !== 'playing' || paused) return;
  clock.advance(state, elapsed);
  checkResult();
}

function checkResult(): void {
  if (state.phase === 'won' || state.phase === 'lost') {
    const won = state.phase === 'won';
    showDialog(won ? 'MISSION COMPLETE' : 'DEADLINE REACHED', won ? '壓線生活，順利交件！' : '時間到了，再試一次。',
      `<p>${won ? `你完成了所有工作，還剩下 <b>${Math.ceil(state.remaining)} 秒</b>。` : `這次完成了 <b>${Math.floor(state.progress)}%</b> 的工作。`}<br>${won ? '一個插座，也能安排得剛剛好。' : '試著交替使用電腦與風扇，並在收資料前補充電量。'}</p>`, '再挑戰一次 →');
  }
}
function frame(now: number): void { update(now); render(); requestAnimationFrame(frame); }
render();
requestAnimationFrame(frame);

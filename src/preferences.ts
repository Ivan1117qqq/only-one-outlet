const BEST_KEY = 'only-one-outlet:encore-v2:best';
const MUTE_KEY = 'only-one-outlet:muted';
function read(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* 私密模式或 iframe 限制時仍可遊玩。 */ } }
export function loadBest(): number {
  const value = Number(read(BEST_KEY)); return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
export function saveBest(score: number): void { write(BEST_KEY, String(score)); }
export function loadMuted(): boolean { return read(MUTE_KEY) === 'true'; }
export function saveMuted(muted: boolean): void { write(MUTE_KEY, String(muted)); }

/** 只由開始／音效按鈕啟用，依事件播放一次；不載入任何外部音效。 */
export class Sounds {
  private context?: AudioContext;
  private lastBeep = -1;
  enable(): void {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* 不支援音訊時保留完整遊戲。 */ }
  }
  beep(kind: 'notice' | 'success' | 'warning', muted: boolean): void {
    const ctx = this.context;
    if (muted || !ctx || ctx.state !== 'running' || ctx.currentTime - this.lastBeep < 0.3) return;
    this.lastBeep = ctx.currentTime;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.frequency.value = { notice: 620, success: 880, warning: 260 }[kind];
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + 0.15);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
}

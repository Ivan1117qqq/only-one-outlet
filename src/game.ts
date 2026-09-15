import { CONFIG as C } from './config.ts';

export type Device = 'computer' | 'fan' | 'phone';
export type Phase = 'ready' | 'playing' | 'won' | 'lost';
export interface GameState {
  phase: Phase;
  powered: Device;
  remaining: number;
  progress: number;
  temperature: number;
  battery: number;
  received: number;
  waiting: boolean;
}

export function createGame(): GameState {
  return {
    phase: 'ready', powered: 'computer', remaining: C.duration,
    progress: 0, temperature: C.initialTemperature,
    battery: C.initialBattery, received: 0, waiting: false,
  };
}

export function efficiency(s: GameState): number {
  return Math.max(C.minEfficiency, 1 - Math.max(0, s.temperature - C.efficientTemperature) * C.efficiencyLossPerDegree);
}

function receiveData(s: GameState): void {
  const milestone = C.dataMilestones[s.received];
  if (milestone !== undefined && s.progress >= milestone) {
    if (s.battery > 0) {
      s.received++;
      s.waiting = false;
    } else {
      s.waiting = true;
    }
  }
}

/** 由固定小步長呼叫；以實際經過秒數計算，不以畫面張數計算。 */
export function step(s: GameState, elapsed: number): void {
  if (s.phase !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return;
  const dt = Math.min(elapsed, s.remaining);
  s.temperature = Math.max(C.minTemperature, Math.min(C.maxTemperature,
    s.temperature + (s.powered === 'fan' ? -C.coolPerSecond : C.heatPerSecond) * dt));
  s.battery = Math.max(0, Math.min(100,
    s.battery + (s.powered === 'phone' ? C.chargePerSecond : -C.drainPerSecond) * dt));
  receiveData(s);
  if (s.powered === 'computer' && !s.waiting) {
    const next = C.dataMilestones[s.received] ?? 100;
    s.progress = Math.min(next, s.progress + C.workPerSecond * efficiency(s) * dt);
    receiveData(s);
  }
  s.remaining = Math.max(0, s.remaining - dt);
  if (s.progress >= 100) s.phase = 'won';
  else if (s.remaining <= 0) s.phase = 'lost';
}

/** 保留不足一步的時間，使 30 / 60 / 144 FPS 使用相同的模擬步驟。 */
export class GameClock {
  private pending = 0;
  reset(): void { this.pending = 0; }
  advance(state: GameState, seconds: number): void {
    if (state.phase !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
    this.pending += seconds;
    while (this.pending + 1e-9 >= C.simulationStep && state.phase === 'playing') {
      step(state, C.simulationStep);
      this.pending = Math.max(0, this.pending - C.simulationStep);
    }
  }
}

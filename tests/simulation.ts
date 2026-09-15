import { CONFIG as C } from '../src/config.ts';
import { createGame, GameClock, receiveTask, selectTask, setPower, startUpload } from '../src/game.ts';

export type Strategy = 'balanced' | 'no-fan' | 'no-phone' | 'computer-only';
/** 每 0.5 秒做一次決策，補電／降溫使用上下閾值，避免逐幀切插頭。 */
export function simulateShift(seed: number, strategy: Strategy) {
  const s = createGame(seed); s.phase = 'playing'; const clock = new GameClock();
  let chargeSeconds = 0; let fanSeconds = 0; let competingDeadlines = 0; let switches = 0;
  for (let i = 0; i < C.duration * 2 && s.phase === 'playing'; i++) {
    for (const task of s.tasks) if (task.status === 'pending') receiveTask(s, task.id);
    const ready = s.tasks.filter(t => t.status === 'ready').sort((a, b) => a.dueAt - b.dueAt)[0];
    if (ready) startUpload(s, ready.id);
    const work = s.tasks.filter(t => ['queued', 'processing'].includes(t.status)).sort((a, b) => a.dueAt - b.dueAt)[0];
    if (work) selectTask(s, work.id);
    const previous = s.powered;
    if (strategy === 'computer-only') setPower(s, 'computer');
    else if (strategy !== 'no-phone' && (s.battery < 7 || (s.powered === 'phone' && s.battery < 42))) setPower(s, 'phone');
    else if (strategy !== 'no-fan' && (s.temperature > 32 || (s.powered === 'fan' && s.temperature > 27))) setPower(s, 'fan');
    else if (!work && strategy !== 'no-fan' && s.temperature > 27) setPower(s, 'fan');
    else setPower(s, 'computer');
    if (previous !== s.powered) switches++;
    if (s.powered === 'phone') chargeSeconds += 0.5;
    if (s.powered === 'fan') fanSeconds += 0.5;
    if (s.elapsed > 40 && s.tasks.filter(t => t.dueAt - s.elapsed <= 15).length >= 2) competingDeadlines++;
    clock.advance(s, 0.5);
  }
  return { seed, strategy, delivered: s.delivered, missed: s.missed, score: s.score,
    issued: s.generator.count, chargeSeconds, fanSeconds, competingDeadlines, switches };
}

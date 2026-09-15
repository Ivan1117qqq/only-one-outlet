import { CONFIG as C, TASK_TEMPLATES } from './config.ts';
import type { TaskTemplate } from './config.ts';

export interface GeneratorState { seed: number; randomState: number; nextAt: number; count: number }
export function createGenerator(seed: number): GeneratorState {
  const normalized = Number.isFinite(seed) ? seed >>> 0 : 1;
  return { seed: normalized, randomState: normalized, nextAt: C.generator.firstArrival, count: 0 };
}
function random(g: GeneratorState): number {
  g.randomState = (g.randomState + 0x6D2B79F5) >>> 0;
  let t = g.randomState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** 每次至多產生一件；滿位只延後嘗試，沒有背景待辦佇列。 */
export function generateTask(g: GeneratorState, now: number, activeCount: number, hasUrgent: boolean): TaskTemplate | undefined {
  if (now + 1e-8 < g.nextAt) return;
  if (activeCount >= C.maxTasks) { g.nextAt = now + C.generator.capacityRetry; return; }
  const left = C.duration - now;
  const eligible = TASK_TEMPLATES.filter(t =>
    t.deadline <= left && t.work + t.upload + C.generator.finishBuffer <= left && (!t.urgent || !hasUrgent));
  if (!eligible.length) { g.nextAt = Infinity; return; }
  let template: TaskTemplate;
  if (g.count === 0) template = TASK_TEMPLATES[0];
  else if (g.count === 1) template = TASK_TEMPLATES[2];
  else {
    const urgent = eligible.filter(t => t.urgent);
    const normal = eligible.filter(t => !t.urgent);
    const pool = urgent.length && (normal.length === 0 || random(g) < C.generator.urgentChance) ? urgent : normal;
    template = pool[Math.floor(random(g) * pool.length)];
  }
  if (!eligible.includes(template)) template = eligible[0];
  g.count++;
  if (g.count === 1) g.nextAt = C.generator.secondArrival;
  else if (g.count === 2) g.nextAt = C.generator.thirdArrival;
  else {
    const [min, max] = now < C.generator.lateStage ? C.generator.middleInterval : C.generator.lateInterval;
    g.nextAt = now + min + random(g) * (max - min);
  }
  return template;
}

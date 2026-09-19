import { simulateShift } from './simulation.ts';
import type { Strategy } from './simulation.ts';

const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
console.log('舊版 180 秒核心策略回歸：');
for (const strategy of ['balanced', 'no-fan', 'no-phone', 'computer-only'] as Strategy[]) {
  const runs = seeds.map(seed => simulateShift(seed, strategy));
  const mean = (key: 'delivered' | 'missed' | 'score' | 'chargeSeconds' | 'fanSeconds' | 'switches') =>
    Number((runs.reduce((sum, r) => sum + r[key], 0) / runs.length).toFixed(1));
  console.log(JSON.stringify({ strategy, runs: runs.length, delivered: mean('delivered'), missed: mean('missed'), score: mean('score'),
    deliveryRate: Math.round(100 * runs.reduce((n, r) => n + r.delivered, 0) / runs.reduce((n, r) => n + r.issued, 0)),
    chargeSeconds: mean('chargeSeconds'), fanSeconds: mean('fanSeconds'), switches: mean('switches'),
    roundsWithCompetingDeadlines: runs.filter(r => r.competingDeadlines > 0).length }));
}
console.log('新版 100 秒／輪（受控兩種任務配置；簡單策略不代表真人平衡）：');
for (const round of [1, 2] as const) {
  for (const strategy of ['balanced', 'no-fan', 'no-phone', 'computer-only'] as Strategy[]) {
    const runs = seeds.map(seed => simulateShift(seed, strategy, round));
    console.log(JSON.stringify({ round, strategy,
      delivered: runs.reduce((n, r) => n + r.delivered, 0) / runs.length,
      score: runs.reduce((n, r) => n + r.score, 0) / runs.length,
      competing: runs.filter(r => r.competingDeadlines > 0).length }));
  }
}

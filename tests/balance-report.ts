import { simulateShift } from './simulation.ts';
import type { Strategy } from './simulation.ts';

const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
for (const strategy of ['balanced', 'no-fan', 'no-phone', 'computer-only'] as Strategy[]) {
  const runs = seeds.map(seed => simulateShift(seed, strategy));
  const mean = (key: 'delivered' | 'missed' | 'score' | 'chargeSeconds' | 'fanSeconds' | 'switches') =>
    Number((runs.reduce((sum, r) => sum + r[key], 0) / runs.length).toFixed(1));
  console.log(JSON.stringify({ strategy, runs: runs.length, delivered: mean('delivered'), missed: mean('missed'), score: mean('score'),
    deliveryRate: Math.round(100 * runs.reduce((n, r) => n + r.delivered, 0) / runs.reduce((n, r) => n + r.issued, 0)),
    chargeSeconds: mean('chargeSeconds'), fanSeconds: mean('fanSeconds'), switches: mean('switches'),
    roundsWithCompetingDeadlines: runs.filter(r => r.competingDeadlines > 0).length }));
}

import { ENCORE, TASK_TEMPLATES } from './config.ts';
export { ENCORE } from './config.ts';
import type { TaskTemplate } from './config.ts';

export type Insight = 'brief' | 'extend' | 'fixed';
export function briefTerms(task: { urgent: boolean }) {
  return ENCORE.brief[task.urgent ? 'urgent' : 'normal'];
}
export interface Appointment { at: number; template: TaskTemplate; insight: Insight }
/** 以最晚期限（含延期）安排，無論如何操作都不會有超過三件重疊。 */
export function appointments(seed: number): Appointment[] {
  const entry = (at: number, index: number, insight: Insight, deadline?: number): Appointment => ({
    at, template: { ...TASK_TEMPLATES[index], ...(deadline ? { deadline } : {}) }, insight,
  });
  const [a, b, c, d, e, f] = ENCORE.arrivals;
  return [entry(a, 0, 'brief'), entry(b, 2, 'fixed'), entry(c, 1, 'extend', 37),
    entry(d, 4, 'brief'), entry(e, seed % 2 ? 0 : 3, 'extend', 26), entry(f, 4, 'brief')];
}
export const insightText: Record<Insight, string> = {
  brief: '客戶只急著看重點，可以交精簡版；報酬會減少。',
  extend: '客戶要完整內容，但願意接電話協調延後交件。',
  fixed: '這件會直接送印，內容與期限都不能調整。',
};

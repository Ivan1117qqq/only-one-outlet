import { ENCORE } from './encore.ts';
import { CONFIG as C } from './config.ts';
import { processingSeconds, remaining } from './game.ts';
import type { GameState, Task } from './game.ts';

export function importance(reward: number) {
  if (reward >= C.importance.critical) return { key: 'critical', label: '關鍵' };
  if (reward >= C.importance.important) return { key: 'important', label: '重要' };
  return { key: 'normal', label: '一般' };
}

/** 延期是截止時間的增量，不是額外處理時間；下班會截斷收益。 */
export function callAdvice(s: GameState, t: Task) {
  const gain = Math.max(0, Math.min(s.duration, t.dueAt + ENCORE.extension) - Math.min(s.duration, t.dueAt));
  const timeToCall = Math.min(t.dueAt, s.duration) - s.elapsed;
  const waiting = s.tasks.filter(other => other.status === 'ready');
  return { gain, canFinish: timeToCall + 1e-8 >= ENCORE.callSeconds,
    waitingCount: waiting.length, waitingScore: waiting.reduce((n, other) => n + other.reward, 0),
    endangered: waiting.filter(other => Math.min(other.dueAt, s.duration) - s.elapsed <= ENCORE.callSeconds + other.upload - other.uploaded).length };
}

/** 假設立即優先做此件，維持目前效率且手機可持續供電；處理與現有上傳可並行。 */
export function taskAdvice(s: GameState, t: Task) {
  const otherUpload = s.tasks.find(other => other.id === s.uploadingId && other.id !== t.id);
  const queueSeconds = s.call ? ENCORE.callSeconds - s.call.progress : otherUpload ? Math.max(0, otherUpload.upload - otherUpload.uploaded) : 0;
  const workSeconds = processingSeconds(s, t);
  const uploadSeconds = Math.max(0, t.upload - t.uploaded);
  const needed = Math.max(workSeconds, queueSeconds) + uploadSeconds;
  const slack = Math.min(t.dueAt - s.elapsed, remaining(s)) - needed;
  const uploadBattery = uploadSeconds * (C.drainPerSecond + C.uploadDrainPerSecond);
  return { slack, uploadBattery, needsCharge: s.powered !== 'phone' && s.battery + 1e-8 < uploadBattery };
}

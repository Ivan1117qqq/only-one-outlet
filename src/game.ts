import { CONFIG as C } from './config.ts';
import { createGenerator, generateTask } from './generator.ts';
import type { GeneratorState } from './generator.ts';
import { recordDetail } from './review.ts';
import { ENCORE, appointments, insightText } from './encore.ts';
import type { Appointment, Insight } from './encore.ts';

export type Device = 'computer' | 'fan' | 'phone';
export type TaskStatus = 'pending' | 'queued' | 'processing' | 'ready' | 'uploading';
export type Outcome = 'delivered' | 'expired' | 'abandoned' | 'unfinished';
export interface Task {
  insight?: Insight; choice?: 'brief' | 'extend';
  id: number; name: string; reward: number; urgent: boolean;
  arrivedAt: number; dueAt: number; work: number; processed: number;
  upload: number; uploaded: number; status: TaskStatus;
}
export interface TaskRecord {
  choice?: 'brief' | 'extend';
  id: number; name: string; outcome: Outcome; score: number; at: number;
  stage: TaskStatus; workPercent: number; uploadRemaining: number; phoneOff: boolean;
}
export interface GameEvent { id: number; text: string; kind: 'notice' | 'success' | 'warning'; at: number }
export interface GameState {
  round: 0 | 1 | 2; duration: number; schedule: Appointment[]; known: number[];
  call: { taskId: number; progress: number } | null;
  phase: 'ready' | 'playing' | 'ended'; paused: boolean; powered: Device;
  elapsed: number; temperature: number; battery: number;
  tasks: Task[]; selectedId: number | null; uploadingId: number | null;
  delivered: number; missed: number; score: number;
  history: TaskRecord[]; events: GameEvent[]; eventSequence: number;
  generator: GeneratorState;
}
export function createGame(seed = Date.now(), round: 0 | 1 | 2 = 0, known: number[] = []): GameState {
  return {
    round, duration: round ? ENCORE.duration : C.duration, schedule: round ? appointments(seed) : [], known: [...known], call: null,
    phase: 'ready', paused: false, powered: 'computer', elapsed: 0,
    temperature: C.initialTemperature, battery: C.initialBattery,
    tasks: [], selectedId: null, uploadingId: null,
    delivered: 0, missed: 0, score: 0, history: [], events: [], eventSequence: 0,
    generator: createGenerator(seed),
  };
}
export const isActive = (s: GameState): boolean => s.phase === 'playing' && !s.paused;
export const remaining = (s: GameState): number => Math.max(0, s.duration - s.elapsed);
export function efficiency(s: GameState): number {
  return Math.max(C.minEfficiency, 1 - Math.max(0, s.temperature - C.efficientTemperature) * C.efficiencyLossPerDegree);
}
export function processingSeconds(s: GameState, t: Task): number { return Math.max(0, t.work - t.processed) / efficiency(s); }
function emit(s: GameState, text: string, kind: GameEvent['kind']): void {
  s.events.push({ id: ++s.eventSequence, text, kind, at: s.elapsed });
  if (s.events.length > 30) s.events.shift();
}
function syncProcessing(s: GameState): void {
  for (const t of s.tasks) {
    if (t.status === 'queued' || t.status === 'processing') {
      t.status = isActive(s) && s.powered === 'computer' && s.selectedId === t.id ? 'processing' : 'queued';
    }
  }
}
export function setPaused(s: GameState, paused: boolean): void {
  if (s.phase !== 'playing') return;
  s.paused = paused; syncProcessing(s);
}
export function setPower(s: GameState, device: Device): void {
  if (!isActive(s)) return;
  s.powered = device; syncProcessing(s);
}
export function selectTask(s: GameState, id: number): boolean {
  const t = s.tasks.find(t => t.id === id);
  if (!isActive(s) || !t || !['queued', 'processing', 'ready'].includes(t.status)) return false;
  s.selectedId = id; syncProcessing(s); return true;
}
export function receiveTask(s: GameState, id: number): boolean {
  const t = s.tasks.find(t => t.id === id);
  if (!isActive(s) || s.battery <= 0 || !t || t.status !== 'pending') return false;
  t.status = 'queued';
  if (s.selectedId === null) s.selectedId = t.id;
  syncProcessing(s);
  emit(s, `已接收「${t.name}」，${s.selectedId === t.id ? '電腦已選取這份工作' : '點擊工作卡安排處理'}。`, 'notice');
  return true;
}
export function startUpload(s: GameState, id: number): boolean {
  const t = s.tasks.find(t => t.id === id);
  if (!isActive(s) || s.battery <= 0 || s.uploadingId !== null || s.call !== null || !t || t.status !== 'ready') return false;
  t.status = 'uploading'; s.uploadingId = id;
  if (s.selectedId === id) s.selectedId = null;
  emit(s, `「${t.name}」開始上傳；可讓電腦處理另一份工作。`, 'notice');
  return true;
}
/** 唯一結案入口：移出工作區後，任何重複操作都不再影響分數。 */
function finishTask(s: GameState, t: Task, outcome: Outcome): void {
  if (!s.tasks.includes(t)) return;
  const score = outcome === 'delivered' ? t.reward : -C.missedPenalty;
  s.score += score;
  if (outcome === 'delivered') s.delivered++; else s.missed++;
  s.history.push({ choice: t.choice, id: t.id, name: t.name, outcome, score, at: s.elapsed,
    stage: t.status, workPercent: Math.floor(t.processed / t.work * 100),
    uploadRemaining: Math.ceil(Math.max(0, t.upload - t.uploaded) * 10) / 10,
    phoneOff: s.battery <= 0 });
  if (s.round === 1 && t.insight) {
    s.known.push(t.id);
    emit(s, `客戶回覆：${t.name}——${insightText[t.insight]}`, 'notice');
  }
  if (s.call?.taskId === t.id) s.call = null;
  s.tasks.splice(s.tasks.indexOf(t), 1);
  if (s.selectedId === t.id) s.selectedId = null;
  if (s.uploadingId === t.id) s.uploadingId = null;
  const label = { delivered: '已交件', expired: '已逾期', abandoned: '已放棄', unfinished: '下班未完成' }[outcome];
  const detail = outcome === 'delivered' ? '' : `・${recordDetail(s.history[s.history.length - 1])}`;
  emit(s, `${t.name}・${label} ${score > 0 ? '+' : ''}${score} 分${detail}`, outcome === 'delivered' ? 'success' : 'warning');
}
export function abandonTask(s: GameState, id: number): boolean {
  const t = s.tasks.find(t => t.id === id);
  if (!isActive(s) || !t) return false;
  finishTask(s, t, 'abandoned'); return true;
}
/** 第二輪依第一輪的回覆改一次條件。 */
export function changeTerms(s: GameState, id: number, choice: 'brief' | 'extend'): boolean {
  const t = s.tasks.find(t => t.id === id);
  if (!isActive(s) || s.round !== 2 || !s.known.includes(id) || !t || t.insight !== choice || t.choice || s.battery <= 0 || !['pending', 'queued', 'processing'].includes(t.status)) return false;
  if (choice === 'extend' && (s.call || s.uploadingId !== null)) return false;
  t.choice = choice;
  if (t.status === 'pending') receiveTask(s, id);
  if (choice === 'brief') {
    t.work *= ENCORE.briefWorkRatio;
    t.reward = Math.floor(t.reward * ENCORE.briefRewardRatio);
    t.processed = Math.min(t.processed, t.work);
    if (t.processed >= t.work) t.status = 'ready';
    emit(s, `「${t.name}」改交重點版：報酬 ${t.reward} 分，仍需手機上傳。`, 'notice');
  } else {
    s.call = { taskId: id, progress: 0 };
    emit(s, `正在協調「${t.name}」：通話完成才延期，手機暫時不能上傳。`, 'notice');
  }
  return true;
}
export function cancelCall(s: GameState): void {
  if (!isActive(s) || !s.call) return;
  const t = s.tasks.find(t => t.id === s.call!.taskId);
  if (t) t.choice = undefined;
  s.call = null;
  emit(s, '已掛斷，原期限不變；重新撥打須從頭通話。', 'warning');
}
/** 每次最多 1/60 秒，由 GameClock 累積真實經過時間。 */
export function step(s: GameState, seconds: number): void {
  if (!isActive(s) || !Number.isFinite(seconds) || seconds <= 0) return;
  const dt = Math.min(seconds, remaining(s));
  const end = s.elapsed + dt;
  const selected = s.tasks.find(t => t.id === s.selectedId);
  const heatRate = selected?.status === 'processing' ? C.workingHeatPerSecond : C.idleHeatPerSecond;
  s.temperature = Math.max(C.minTemperature, Math.min(C.maxTemperature,
    s.temperature + (s.powered === 'fan' ? -C.coolPerSecond : heatRate) * dt));
  const oldBattery = s.battery;
  const upload = s.tasks.find(t => t.id === s.uploadingId);
  const baseRate = s.powered === 'phone' ? C.chargePerSecond : -C.drainPerSecond;
  let uploadTime = 0;
  if (upload) {
    const energyTime = s.powered === 'phone' ? dt : s.battery / (C.drainPerSecond + C.uploadDrainPerSecond);
    uploadTime = Math.max(0, Math.min(dt, energyTime, upload.upload - upload.uploaded, upload.dueAt - s.elapsed));
    upload.uploaded = Math.min(upload.upload, upload.uploaded + uploadTime);
  }
  const callTask = s.tasks.find(t => t.id === s.call?.taskId);
  let callTime = 0;
  if (s.call && callTask) {
    const energyTime = s.powered === 'phone' ? dt : s.battery / (C.drainPerSecond + ENCORE.callDrain);
    callTime = Math.max(0, Math.min(dt, energyTime, ENCORE.callSeconds - s.call.progress, callTask.dueAt - s.elapsed));
    s.call.progress += callTime;
    if (s.call.progress + 1e-8 >= ENCORE.callSeconds) {
      callTask.dueAt += ENCORE.extension;
      s.call = null;
      emit(s, `協調成功！「${callTask.name}」期限增加 ${ENCORE.extension} 秒（下班仍須交件）。`, 'success');
    }
  }
  s.battery = Math.max(0, Math.min(100, s.battery + baseRate * dt - C.uploadDrainPerSecond * uploadTime - ENCORE.callDrain * callTime));
  if (selected?.status === 'processing') {
    selected.processed = Math.min(selected.work, selected.processed + efficiency(s) * Math.max(0, Math.min(dt, selected.dueAt - s.elapsed)));
    if (selected.processed + 1e-8 >= selected.work) {
      selected.processed = selected.work; selected.status = 'ready';
      emit(s, `「${selected.name}」處理完成，尚未交件！請點擊「上傳交件」。`, 'notice');
    }
  }
  s.elapsed = Math.min(s.duration, end);
  // 上傳在期限內完成（含恰好同時）先交件，再清理逾期／下班任務。
  if (upload && upload.uploaded + 1e-8 >= upload.upload) finishTask(s, upload, 'delivered');
  for (const t of [...s.tasks]) if (s.elapsed + 1e-8 >= t.dueAt) finishTask(s, t, 'expired');
  if (oldBattery > 0 && s.battery === 0) emit(s, '手機已關機，無法接案或交件；上傳進度保留，請切換手機充電。', 'warning');
  if (oldBattery === 0 && s.battery > 0) emit(s, '手機已復電，保留的通知可接收，暫停的上傳會繼續。', 'notice');
  if (remaining(s) < 1e-8) {
    s.elapsed = s.duration;
    for (const t of [...s.tasks]) finishTask(s, t, 'unfinished');
    s.phase = 'ended'; s.paused = false; return;
  }
  const appointment = s.round ? s.schedule[s.generator.count] : undefined;
  const scheduled = appointment && s.elapsed + 1e-8 >= appointment.at;
  const template = s.round ? (scheduled ? appointment.template : undefined) : generateTask(s.generator, s.elapsed, s.tasks.length, s.tasks.some(t => t.urgent));
  if (s.round && scheduled) {
    s.generator.count++;
    s.generator.nextAt = s.schedule[s.generator.count]?.at ?? Infinity;
  }
  if (template) {
    s.tasks.push({ insight: s.round ? appointment?.insight : undefined, id: s.generator.count, name: template.name, reward: template.reward, urgent: template.urgent,
      arrivedAt: s.round ? appointment!.at : s.elapsed, dueAt: (s.round ? appointment!.at : s.elapsed) + template.deadline,
      work: template.work, processed: 0, upload: template.upload, uploaded: 0, status: 'pending' });
    emit(s, s.battery > 0 ? `新通知：「${template.name}」・${template.deadline} 秒內交件，先用手機接收。` : '手機關機中，有通知保留在工作區；期限仍在倒數。', 'notice');
  }
  syncProcessing(s);
}
export class GameClock {
  private pending = 0;
  reset(): void { this.pending = 0; }
  advance(s: GameState, seconds: number): void {
    if (!isActive(s) || !Number.isFinite(seconds) || seconds <= 0) return;
    this.pending += seconds;
    while (this.pending + 1e-9 >= C.simulationStep && isActive(s)) {
      step(s, C.simulationStep);
      this.pending = Math.max(0, this.pending - C.simulationStep);
    }
  }
}

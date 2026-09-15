import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abandonTask, createGame, efficiency, GameClock, receiveTask, selectTask, setPaused, setPower, startUpload } from '../src/game.ts';
import type { GameState, Task } from '../src/game.ts';
import { CONFIG as C, TASK_TEMPLATES } from '../src/config.ts';
import { createGenerator, generateTask } from '../src/generator.ts';
import { simulateShift } from './simulation.ts';
import { taskAdvice } from '../src/task-advice.ts';
import { recordDetail, reviewSummary } from '../src/review.ts';

function fixture() {
  const s = createGame(42); s.phase = 'playing'; s.generator.nextAt = Infinity;
  const clock = new GameClock();
  return { s, tick: (seconds: number) => clock.advance(s, seconds), clock };
}
function add(s: GameState, fields: Partial<Task> = {}): Task {
  const t: Task = { id: s.tasks.length + s.history.length + 1, name: '測試工作', reward: 100, urgent: false,
    arrivedAt: s.elapsed, dueAt: s.elapsed + 80, work: 2, processed: 0, upload: 3, uploaded: 0, status: 'pending', ...fields };
  s.tasks.push(t); return t;
}

test('交件餘裕包含上傳排隊，但不把並行處理重複累加；上傳中只計剩餘時間', () => {
  const { s } = fixture();
  const uploading = add(s, { status: 'uploading', processed: 2, upload: 8, uploaded: 3 });
  s.uploadingId = uploading.id;
  const task = add(s, { work: 10, processed: 7, upload: 3, dueAt: 20 });
  assert.equal(taskAdvice(s, task).slack, 12); // max(3 秒處理, 5 秒排隊) + 3 秒上傳
  assert.equal(taskAdvice(s, uploading).slack, 75);
  s.elapsed = 175; task.dueAt = 200;
  assert.equal(taskAdvice(s, task).slack, -3); // 下班也是截止時間
  s.battery = 1;
  assert.equal(taskAdvice(s, task).needsCharge, true);
  s.powered = 'phone'; assert.equal(taskAdvice(s, task).needsCharge, false);
});

test('接收 → 處理 → 上傳 → 計分，完成處理不等於交件', () => {
  const { s, tick } = fixture(); const t = add(s);
  assert.equal(receiveTask(s, t.id), true); assert.equal(t.status, 'processing');
  tick(2.1); assert.equal(t.status, 'ready'); assert.equal(s.score, 0);
  assert.equal(startUpload(s, t.id), true); assert.equal(startUpload(s, t.id), false);
  tick(3.1); assert.equal(s.delivered, 1); assert.equal(s.score, 100); assert.equal(s.tasks.length, 0);
  assert.equal(startUpload(s, t.id), false); assert.equal(abandonTask(s, t.id), false);
  tick(5); assert.equal(s.score, 100); assert.equal(s.history.length, 1);
});

test('逾期、放棄與下班保存漏件階段，後續任務變動不會修改結案快照', () => {
  for (const outcome of ['expired', 'abandoned', 'unfinished'] as const) {
    const { s, tick } = fixture(); s.battery = 0;
    const pending = add(s, { dueAt: outcome === 'expired' ? 1 : 200 });
    const processing = add(s, { work: 10, processed: 8.2, status: 'queued', dueAt: pending.dueAt });
    const uploading = add(s, { processed: 2, uploaded: 1.8, status: 'uploading', dueAt: pending.dueAt });
    s.uploadingId = uploading.id;
    if (outcome === 'abandoned') for (const t of [...s.tasks]) abandonTask(s, t.id);
    else tick(outcome === 'expired' ? 1 : 180);
    assert.equal(s.history.length, 3);
    assert.ok(s.history.every(r => r.outcome === outcome));
    assert.deepEqual(reviewSummary(s.history), { unreceived: 1, processing: 1, unsent: 1 });
    assert.match(recordDetail(s.history[0]), /尚未接收/);
    assert.match(recordDetail(s.history[1]), /處理到 82%/);
    assert.match(recordDetail(s.history[2]), /上傳還剩 1.2 秒；當時手機已關機/);
    processing.processed = 10; uploading.uploaded = 3;
    assert.equal(s.history[1].workPercent, 82); assert.equal(s.history[2].uploadRemaining, 1.2);
    assert.equal(s.score, -3 * C.missedPenalty);
  }
  const { s } = fixture(); const ready = add(s, { processed: 2, status: 'ready' });
  abandonTask(s, ready.id);
  assert.match(recordDetail(s.history[0]), /處理完成，尚未開始上傳/);
  assert.equal(reviewSummary(s.history).unsent, 1);
});
test('電腦斷電、切換任務都保留進度，而且一次只處理一份', () => {
  const { s, tick } = fixture(); const a = add(s, { work: 10 }); const b = add(s, { work: 10 });
  receiveTask(s, a.id); receiveTask(s, b.id); tick(1);
  const first = a.processed; assert.ok(first > 0); assert.equal(b.processed, 0);
  selectTask(s, b.id); tick(1); assert.equal(a.processed, first); assert.ok(b.processed > 0);
  const second = b.processed; setPower(s, 'fan'); tick(2);
  assert.equal(a.processed, first); assert.equal(b.processed, second); assert.equal(b.status, 'queued');
  setPower(s, 'computer'); tick(1); assert.ok(b.processed > second);
});
test('手機關機不能接案或開始上傳；充電立即恢復，通知期限不延後', () => {
  const { s, tick } = fixture(); const t = add(s); const ready = add(s, { status: 'ready', processed: 2 });
  s.battery = 0; const deadline = t.dueAt;
  assert.equal(receiveTask(s, t.id), false); assert.equal(startUpload(s, ready.id), false);
  tick(2); assert.equal(t.dueAt, deadline); assert.equal(t.status, 'pending');
  setPower(s, 'phone'); tick(0.2); assert.ok(s.battery > 0);
  assert.equal(receiveTask(s, t.id), true); assert.equal(startUpload(s, ready.id), true);
});
test('沒電途中保留上傳進度；邊充邊上傳恢復電量', () => {
  const { s, tick } = fixture(); const t = add(s, { status: 'ready', processed: 2 });
  s.battery = 1; startUpload(s, t.id); tick(1);
  assert.equal(s.battery, 0); assert.ok(t.uploaded > 0 && t.uploaded < t.upload);
  const progress = t.uploaded; tick(2); assert.equal(t.uploaded, progress);
  setPower(s, 'phone'); tick(0.5); assert.ok(s.battery > 0); assert.ok(t.uploaded > progress);
  tick(3); assert.equal(s.delivered, 1);
});
test('手機上傳與電腦處理可以並行，但手機只接受一份上傳', () => {
  const { s, tick } = fixture(); const a = add(s, { status: 'ready', processed: 2 });
  const b = add(s, { work: 8 }); const c = add(s, { status: 'ready', processed: 2 });
  startUpload(s, a.id); receiveTask(s, b.id); selectTask(s, b.id);
  assert.equal(startUpload(s, c.id), false); tick(1);
  assert.ok(a.uploaded > 0); assert.ok(b.processed > 0); assert.equal(c.uploaded, 0);
});
test('上傳仍會逾期，取消上傳且只扣一次；放棄與下班同樣只結算一次', () => {
  const { s, tick } = fixture();
  const expiring = add(s, { status: 'ready', processed: 2, dueAt: 1 }); startUpload(s, expiring.id);
  tick(2); assert.equal(s.uploadingId, null); assert.equal(s.missed, 1); assert.equal(s.score, -C.missedPenalty);
  assert.equal(startUpload(s, expiring.id), false); assert.equal(abandonTask(s, expiring.id), false);
  const abandoned = add(s); assert.equal(abandonTask(s, abandoned.id), true); assert.equal(abandonTask(s, abandoned.id), false);
  add(s, { dueAt: 200 }); tick(180);
  assert.equal(s.phase, 'ended'); assert.equal(s.missed, 3); assert.equal(s.score, -3 * C.missedPenalty);
  assert.deepEqual(s.history.map(r => r.outcome), ['expired', 'abandoned', 'unfinished']);
  const snapshot = structuredClone(s); tick(100); assert.deepEqual(s, snapshot);
});
test('恰好期限完成上傳算交件；差一個步長則逾期', () => {
  for (const [duration, delivered] of [[1, true], [1 + C.simulationStep, false]] as const) {
    const { s, tick } = fixture(); const t = add(s, { status: 'ready', processed: 2, upload: duration, dueAt: 1 });
    startUpload(s, t.id); tick(2); assert.equal(s.delivered, Number(delivered)); assert.equal(s.history.length, 1);
  }
});
test('所有未接收通知都會逾期，手機沒電仍保留新通知', () => {
  const { s, tick } = fixture(); s.generator.nextAt = 1; s.battery = 0;
  tick(2); assert.equal(s.tasks.length, 1); const id = s.tasks[0].id;
  assert.equal(s.tasks[0].status, 'pending'); const deadline = s.tasks[0].dueAt;
  tick(deadline - s.elapsed + 0.1);
  assert.equal(s.history.find(t => t.id === id)?.outcome, 'expired');
});
test('暫停凍結期限、生成、處理、上傳、溫度、電量，且禁止操作', () => {
  const { s, tick } = fixture(); s.generator.nextAt = 3;
  const a = add(s, { work: 20 }); const b = add(s, { status: 'ready', processed: 2 });
  receiveTask(s, a.id); startUpload(s, b.id); tick(1); setPaused(s, true);
  const snapshot = structuredClone(s); tick(100);
  setPower(s, 'phone'); assert.equal(abandonTask(s, a.id), false); assert.equal(selectTask(s, a.id), false);
  assert.deepEqual(s, snapshot); setPaused(s, false); tick(1);
  assert.ok(s.elapsed > snapshot.elapsed); assert.ok(a.processed > snapshot.tasks[0].processed);
  assert.ok(b.uploaded > snapshot.tasks[1].uploaded);
});
test('重開完整清空本局與生成器；時鐘餘數清除', () => {
  const { s, tick, clock } = fixture(); add(s); tick(4); setPaused(s, true);
  const reset = createGame(42); assert.deepEqual(reset, createGame(42));
  assert.equal(reset.tasks.length, 0); assert.equal(reset.history.length, 0); assert.equal(reset.events.length, 0);
  assert.equal(reset.elapsed, 0); assert.equal(reset.battery, C.initialBattery); assert.equal(reset.temperature, C.initialTemperature);
  assert.equal(reset.powered, 'computer'); assert.equal(reset.selectedId, null); assert.equal(reset.uploadingId, null);
  reset.phase = 'playing'; clock.advance(reset, 0.01); clock.reset(); clock.advance(reset, 0.01); assert.equal(reset.elapsed, 0);
});
test('30、60、144 FPS 與一次長延遲具有相同遊戲結果', () => {
  const simulate = (fps: number) => { const s = createGame(42); s.phase = 'playing'; const clock = new GameClock();
    for (let i = 0; i < 60 * fps; i++) clock.advance(s, 1 / fps); return s; };
  assert.deepEqual(simulate(30), simulate(60)); assert.deepEqual(simulate(60), simulate(144));
  const s = createGame(42); s.phase = 'playing'; new GameClock().advance(s, 60); assert.deepEqual(s, simulate(60));
});
test('效率連續下降但始終大於零；溫度與電量有上下界', () => {
  const { s, tick } = fixture(); const normal = efficiency(s); s.temperature = 36;
  assert.ok(efficiency(s) < normal); s.temperature = C.maxTemperature; tick(10);
  assert.equal(s.temperature, C.maxTemperature); assert.equal(efficiency(s), C.minEfficiency);
  setPower(s, 'fan'); tick(40); assert.equal(s.temperature, C.minTemperature);
  setPower(s, 'phone'); tick(15); assert.equal(s.battery, 100);
});

test('實際處理時升溫較快；選好但斷電、完成待上傳時使用待機升溫', () => {
  const active = fixture(); const idle = fixture();
  const task = add(active.s, { work: 18 }); receiveTask(active.s, task.id);
  active.tick(3); idle.tick(3);
  assert.ok(Math.abs(active.s.temperature - (C.initialTemperature + C.workingHeatPerSecond * 3)) < 1e-8);
  assert.ok(Math.abs(idle.s.temperature - (C.initialTemperature + C.idleHeatPerSecond * 3)) < 1e-8);
  setPower(active.s, 'phone'); const before = active.s.temperature; active.tick(2);
  assert.ok(Math.abs(active.s.temperature - before - C.idleHeatPerSecond * 2) < 1e-8);
  task.status = 'ready'; task.processed = task.work; setPower(active.s, 'computer');
  const readyTemperature = active.s.temperature; active.tick(2);
  assert.ok(Math.abs(active.s.temperature - readyTemperature - C.idleHeatPerSecond * 2) < 1e-8);
});

test('高溫下可搶交快完成的任務；較長工作先降溫能增加處理量', () => {
  const rush = fixture(); rush.s.temperature = C.maxTemperature;
  const task = add(rush.s, { work: 8, processed: 7, status: 'queued', dueAt: 6 });
  selectTask(rush.s, task.id); rush.tick(3); assert.equal(task.status, 'ready');
  startUpload(rush.s, task.id); rush.tick(3); assert.equal(rush.s.delivered, 1);
  const longWork = (coolFirst: boolean) => {
    const run = fixture(); run.s.temperature = 38;
    const work = add(run.s, { work: 18 }); receiveTask(run.s, work.id);
    if (coolFirst) { setPower(run.s, 'fan'); run.tick(5); setPower(run.s, 'computer'); run.tick(15); }
    else run.tick(20);
    return work.processed;
  };
  assert.ok(longWork(true) > longWork(false));
});
test('生成器固定種子可重現；前段引導、最多三件、最多一份急件、末段留足期限', () => {
  const run = (seed: number) => {
    const s = createGame(seed); s.phase = 'playing'; const clock = new GameClock(); const arrivals: string[] = [];
    let last = 0;
    for (let i = 0; i < 1800; i++) {
      clock.advance(s, 0.1);
      assert.ok(s.tasks.length <= C.maxTasks); assert.ok(s.tasks.filter(t => t.urgent).length <= 1);
      for (const t of s.tasks) {
        assert.ok(t.dueAt <= C.duration + 1e-8);
        assert.ok(t.dueAt - t.arrivedAt >= t.work + t.upload + C.generator.finishBuffer);
        if (t.id > last) { arrivals.push(`${t.arrivedAt.toFixed(2)}:${t.name}`); last = t.id; }
      }
    }
    assert.match(arrivals[0], /^1.00:修改簡報$/); assert.match(arrivals[1], /^24.00:校對文案$/);
    return arrivals;
  };
  assert.deepEqual(run(42), run(42)); assert.notDeepEqual(run(42), run(43));
  const g = createGenerator(1); generateTask(g, 50, 3, false); assert.equal(g.count, 0);
  assert.equal(generateTask(g, 50.5, 0, false), undefined);
  assert.ok(generateTask(g, 52, 0, false)); assert.equal(g.count, 1);
  assert.ok(TASK_TEMPLATES.every(t => t.deadline >= t.work + t.upload + C.generator.finishBuffer));
});
test('多種種子的策略檢查：補電與降溫有價值，中後段會有期限競爭', () => {
  const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
  const balanced = seeds.map(seed => simulateShift(seed, 'balanced'));
  const noFan = seeds.map(seed => simulateShift(seed, 'no-fan'));
  const computer = seeds.map(seed => simulateShift(seed, 'computer-only'));
  const noPhone = seeds.map(seed => simulateShift(seed, 'no-phone'));
  const total = (runs: ReturnType<typeof simulateShift>[]) => runs.reduce((n, r) => n + r.delivered, 0);
  const issued = balanced.reduce((n, r) => n + r.issued, 0);
  assert.ok(total(balanced) / issued > 0.65, '合理策略應交出大部分工作');
  assert.ok(total(balanced) > total(noFan) * 1.15, '風扇應明顯改善交件能力');
  assert.ok(total(balanced) > total(computer) * 1.5, '只供電給電腦不能維持交件');
  assert.ok(total(balanced) > total(noPhone) * 1.5, '即使有降溫，手機不補電仍無法維持交件');
  assert.ok(balanced.every(r => r.chargeSeconds > 0));
  assert.ok(balanced.some(r => r.competingDeadlines > 0));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, GameClock, receiveTask, changeTerms, startUpload, setPower, setPaused, cancelCall, abandonTask } from '../src/game.ts';
import { appointments, ENCORE } from '../src/encore.ts';

function fixture(round: 1 | 2 = 2) {
  const s = createGame(42, round, [1, 2, 3, 4, 5, 6]); s.phase = 'playing';
  const clock = new GameClock(); return { s, tick: (dt: number) => clock.advance(s, dt) };
}
test('第一輪不能談條件；結案解鎖，第二輪重新建立設備與進度', () => {
  const { s, tick } = fixture(1); s.known = []; tick(1);
  assert.equal(changeTerms(s, 1, 'brief'), false);
  abandonTask(s, 1); assert.deepEqual(s.known, [1]);
  const second = createGame(42, 2, s.known);
  assert.deepEqual(second.schedule, s.schedule);
  assert.equal(second.elapsed, 0); assert.equal(second.battery, 32);
  assert.equal(second.score, 0); assert.equal(second.call, null);
  assert.equal(second.tasks.length, 0); assert.equal(second.history.length, 0);
});
test('重點版減少工量和報酬，需上傳才計分，不得重複改條件', () => {
  const { s, tick } = fixture(); tick(1);
  s.battery = 0; assert.equal(changeTerms(s, 1, 'brief'), false);
  setPower(s, 'phone'); tick(.1); setPower(s, 'computer');
  assert.equal(changeTerms(s, 1, 'brief'), true);
  assert.equal(s.tasks[0].work, 3.6); assert.equal(s.tasks[0].reward, 52);
  assert.equal(changeTerms(s, 1, 'brief'), false);
  tick(4); assert.equal(s.tasks[0].status, 'ready'); assert.equal(s.score, 0);
  setPower(s, 'phone'); tick(1); assert.equal(startUpload(s, 1), true);
  tick(3); assert.equal(s.score, 52); assert.equal(s.delivered, 1);
  assert.equal(startUpload(s, 1), false); assert.equal(s.history[0].choice, 'brief');
});
test('通話占手機但電腦繼續工作；暫停、沒電與充電續談，完成才延期', () => {
  const { s, tick } = fixture(); tick(35); s.battery = 20;
  const t = s.tasks.find(t => t.id === 3)!; const due = t.dueAt;
  assert.equal(changeTerms(s, 3, 'extend'), true);
  const ready = s.tasks.find(t => t.id === 2)!; ready.status = 'ready'; ready.processed = ready.work;
  assert.equal(startUpload(s, ready.id), false);
  tick(1); assert.ok(t.processed > 0); assert.equal(t.dueAt, due);
  setPaused(s, true); const frozen = JSON.stringify(s); tick(10); assert.equal(JSON.stringify(s), frozen);
  setPaused(s, false); s.battery = 0; const progress = s.call!.progress; tick(1);
  assert.equal(s.call!.progress, progress);
  setPower(s, 'phone'); tick(3.1);
  assert.equal(s.call, null); assert.equal(t.dueAt, due + ENCORE.extension);
  assert.ok(s.battery > 0); assert.equal(changeTerms(s, 3, 'extend'), false);
});
test('掛斷可釋放手機，重新撥打從零開始；上傳期間不能撥打', () => {
  const { s, tick } = fixture(); tick(35); s.battery = 100;
  const t = s.tasks.find(t => t.id === 3)!; const due = t.dueAt;
  changeTerms(s, 3, 'extend'); tick(1); cancelCall(s);
  assert.equal(s.call, null); assert.equal(t.dueAt, due);
  const ready = s.tasks.find(t => t.id === 2)!; ready.status = 'ready';
  assert.equal(startUpload(s, ready.id), true);
  assert.equal(changeTerms(s, 3, 'extend'), false);
  tick(3); assert.equal(changeTerms(s, 3, 'extend'), true);
  assert.equal(s.call!.progress, 0);
});
test('通話未完成先逾期則取消，放棄與下班不會重複扣分', () => {
  for (const mode of ['expired', 'abandoned', 'unfinished']) {
    const { s, tick } = fixture(); tick(35); s.battery = 100;
    const t = s.tasks.find(t => t.id === 3)!;
    changeTerms(s, 3, 'extend');
    if (mode === 'expired') { t.dueAt = s.elapsed + .5; tick(1); }
    if (mode === 'abandoned') abandonTask(s, 3);
    if (mode === 'unfinished') { s.elapsed = 99; t.dueAt = 120; tick(1); }
    assert.equal(s.call, null);
    assert.equal(s.history.filter(r => r.id === 3).length, 1);
    assert.equal(s.history.find(r => r.id === 3)!.outcome, mode);
    assert.equal(changeTerms(s, 3, 'extend'), false);
    tick(100); assert.equal(s.history.filter(r => r.id === 3).length, 1);
  }
});
test('兩輪到達時間與工作相同；即使全延期也最多三件、一件急件', () => {
  for (let seed = 0; seed < 30; seed++) {
    const schedule = appointments(seed);
    for (let time = 0; time < 100; time += .5) {
      const active = schedule.filter(a => time >= a.at && time < a.at + a.template.deadline + (a.insight === 'extend' ? ENCORE.extension : 0));
      assert.ok(active.length <= 3); assert.ok(active.filter(a => a.template.urgent).length <= 1);
    }
  }
  const first = fixture(1), second = fixture(2);
  for (let i = 0; i < 100; i++) {
    first.tick(1); second.tick(1);
    for (const t of [...second.s.tasks]) abandonTask(second.s, t.id);
  }
  assert.deepEqual(first.s.history.map(r => r.id).sort(), second.s.history.map(r => r.id).sort());
  assert.equal(first.s.history.length, 6); assert.equal(first.s.phase, 'ended');
});

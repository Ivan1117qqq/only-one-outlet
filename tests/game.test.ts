import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, efficiency, GameClock, step } from '../src/game.ts';
import { CONFIG as C } from '../src/config.ts';

function playing() { const s = createGame(); s.phase = 'playing'; return s; }

test('電腦工作，其他設備保留進度；供電對象唯一', () => {
  const s = playing(); step(s, 1); assert.ok(s.progress > 0);
  const progress = s.progress; s.powered = 'fan'; const temperature = s.temperature;
  step(s, 1); assert.equal(s.progress, progress); assert.ok(s.temperature < temperature);
  s.powered = 'phone'; const battery = s.battery; step(s, 1);
  assert.equal(s.progress, progress); assert.ok(s.battery > battery);
});

test('兩個資料門檻：沒電等待，充電後自動接收，進度不會跳過門檻', () => {
  const s = playing();
  for (const [index, milestone] of C.dataMilestones.entries()) {
    s.powered = 'computer'; s.progress = milestone - 0.01; s.battery = 0;
    step(s, 1); assert.equal(s.progress, milestone); assert.equal(s.waiting, true);
    step(s, 1); assert.equal(s.progress, milestone);
    s.powered = 'phone'; step(s, 0.1);
    assert.equal(s.received, index + 1); assert.equal(s.waiting, false);
    assert.equal(s.progress, milestone);
    s.powered = 'computer'; step(s, 0.1); assert.ok(s.progress > milestone);
  }
});

test('有電即可接收，不需將插座切給手機', () => {
  const s = playing(); s.progress = 29.99; step(s, 0.1);
  assert.equal(s.received, 1); assert.equal(s.waiting, false); assert.equal(s.powered, 'computer');
});

test('溫度、電量有上下界，高溫仍有工作效率', () => {
  const s = playing(); s.temperature = C.maxTemperature; s.battery = 0;
  step(s, 1); assert.equal(s.temperature, C.maxTemperature); assert.equal(s.battery, 0);
  assert.ok(efficiency(s) > 0); assert.ok(s.progress > 0);
  s.temperature = C.minTemperature; s.powered = 'fan'; step(s, 1);
  assert.equal(s.temperature, C.minTemperature);
  s.powered = 'phone'; s.battery = 100; step(s, 1); assert.equal(s.battery, 100);
});

test('勝敗判定、結果凍結，以及完整重設', () => {
  const s = playing(); s.progress = 99.99; s.received = 2; step(s, 1);
  assert.equal(s.phase, 'won'); assert.equal(s.progress, 100);
  const snapshot = { ...s }; step(s, 10); assert.deepEqual(s, snapshot);
  const lost = playing(); lost.remaining = 0.05; step(lost, 1);
  assert.equal(lost.phase, 'lost'); assert.equal(lost.remaining, 0);
  const reset = createGame(); assert.equal(reset.phase, 'ready');
  assert.equal(reset.remaining, 180); assert.equal(reset.progress, 0);
  assert.equal(reset.received, 0); assert.equal(reset.waiting, false);
  assert.equal(reset.battery, C.initialBattery); assert.equal(reset.temperature, C.initialTemperature);
  assert.equal(reset.powered, 'computer');
});

test('30、60、144 FPS 與延遲畫面保持相同結果', () => {
  const simulate = (fps: number) => { const s = playing(); const clock = new GameClock();
    for (let i = 0; i < fps * 20; i++) clock.advance(s, 1 / fps); return s; };
  assert.deepEqual(simulate(30), simulate(60)); assert.deepEqual(simulate(60), simulate(144));
  const delayed = playing(); new GameClock().advance(delayed, 20);
  assert.deepEqual(delayed, simulate(60));
});

test('計時重設清除餘數；尚未開始時不更新', () => {
  const s = createGame(); const clock = new GameClock(); clock.advance(s, 10);
  assert.deepEqual(s, createGame()); s.phase = 'playing';
  clock.advance(s, 0.01); clock.reset(); clock.advance(s, 0.01);
  assert.equal(s.remaining, C.duration);
});

test('交替降溫、充電的策略能在期限內獲勝', () => {
  const s = playing(); const clock = new GameClock();
  for (let i = 0; i < 180 * 60 && s.phase === 'playing'; i++) {
    if (s.battery < 3 || (s.powered === 'phone' && s.battery < 35)) s.powered = 'phone';
    else if (s.temperature > 31 || (s.powered === 'fan' && s.temperature > 26)) s.powered = 'fan';
    else s.powered = 'computer';
    clock.advance(s, 1 / 60);
  }
  assert.equal(s.phase, 'won'); assert.equal(s.received, 2);
});

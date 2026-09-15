import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// 使用本機 Chrome；BROWSER_CHANNEL=msedge 可改用 Edge，不需下載瀏覽器。
const server = await createServer({ server: { host: '127.0.0.1', port: 5183, strictPort: true } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install({ time: new Date('2026-01-01T00:00:00') });
  await page.goto('http://127.0.0.1:5183/?seed=42');
  await page.clock.pauseAt(new Date('2026-01-01T00:00:10'));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/start.png', fullPage: true });
  await page.locator('#primary').click();
  await page.clock.runFor(1100);
  const card = page.locator('.task-card').first();
  assert.match(await card.innerText(), /修改簡報/);
  assert.match(await card.locator('[data-field="reward"]').innerText(), /一般委託.*80 分/);
  assert.match(await card.locator('[data-field="slack"]').innerText(), /估計餘裕/);
  assert.equal(await card.locator('[data-field="shortcut"]').innerText(), 'Q');
  await card.locator('[data-action="receive"]').click();
  await page.clock.runFor(9000);
  assert.match(await card.innerText(), /處理完成，尚未交件/);
  assert.equal(await page.locator('#score').innerText(), '0');
  assert.match(await page.locator('#delivery-summary').innerText(), /尚未入帳 80 分/);
  await card.locator('[data-action="upload"]').click();
  await page.clock.runFor(3100);
  assert.equal(await page.locator('#score').innerText(), '80');
  assert.equal(await page.locator('.task-card').count(), 0);
  assert.equal(await page.locator('#delivery-summary').isVisible(), false);
  console.log('PASS browser: 接收、處理、上傳與首次得分');

  await page.locator('#pause').click();
  const snapshot = await page.locator('#play-area').innerText();
  await page.clock.fastForward(60000);
  assert.equal(await page.locator('#play-area').innerText(), snapshot);
  await page.locator('#primary').click();
  // 模擬 Page Visibility 事件，驗證主程式接線；不是改寫遊戲狀態。
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.match(await page.locator('#dialog-title').innerText(), /暫停/);
  const pausedTime = await page.locator('#timer').innerText();
  await page.clock.fastForward(30000);
  assert.equal(await page.locator('#timer').innerText(), pausedTime);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('#overlay').isVisible(), true);
  await page.locator('#primary').click();
  console.log('PASS browser: 手動暫停、分頁事件暫停、手動繼續');

  let captured = false;
  // 只讀畫面資訊、點 UI 按鈕，以虛擬時鐘完整跑到 180 秒。
  for (let second = 0; second < 181 && !(await page.locator('#overlay').isVisible()); second++) {
    await page.evaluate(() => {
      const cards = () => [...document.querySelectorAll('.task-card')];
      const press = button => { if (button && !button.disabled && !button.hidden) button.click(); };
      for (const card of cards()) press(card.querySelector('[data-action="receive"]'));
      const deadline = card => parseFloat(card.querySelector('[data-field="deadline"]').textContent) || Infinity;
      const sorted = cards().sort((a, b) => deadline(a) - deadline(b));
      for (const card of sorted) press(card.querySelector('[data-action="upload"]'));
      const work = sorted.find(card => !card.querySelector('[data-action="select"]').hidden);
      if (work) press(work.querySelector('[data-action="select"]'));
      const battery = parseFloat(document.querySelector('#battery').textContent.replace('<', ''));
      const temp = parseFloat(document.querySelector('#temperature').textContent);
      const powered = document.querySelector('.device.selected').dataset.device;
      let next = 'computer';
      if (battery < 7 || powered === 'phone' && battery < 42) next = 'phone';
      else if (temp > 32 || powered === 'fan' && temp > 27 || !work && temp > 27) next = 'fan';
      press(document.querySelector(`[data-device="${next}"]`));
    });
    await page.clock.fastForward(1000);
    if (!captured && second > 60 && await page.locator('.task-card').count() >= 2) {
      const workingCard = page.locator('.task-card.chosen');
      const workingId = await workingCard.getAttribute('data-id');
      const workingKey = await workingCard.locator('[data-field="shortcut"]').innerText();
      await page.keyboard.press(workingKey.toLowerCase());
      assert.equal(await page.locator('.task-card.chosen').getAttribute('data-id'), workingId);
      const beforeIds = await page.locator('.task-card').evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.id, key: node.querySelector('[data-field="shortcut"]').textContent })));
      await page.screenshot({ path: 'test-results/playing-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => window.scrollTo(0, 0));
      assert.ok(await page.locator('.task-card').first().evaluate(node => node.getBoundingClientRect().top < 560), '工作卡應出現在手機第一個畫面');
      await page.screenshot({ path: 'test-results/playing-mobile.png', fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => window.scrollTo(0, 500));
      assert.ok(await page.locator('.control-dock').evaluate(node => Math.abs(node.getBoundingClientRect().top) < 1), '捲動時操作列應固定在頂端');
      await page.locator('.device.selected').click();
      await page.screenshot({ path: 'test-results/mobile-scrolled.png' });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.setViewportSize({ width: 1200, height: 1000 });
      // 上傳結案後，仍存在的卡片必須保留自己的快捷鍵，不跳到前一格。
      await page.clock.fastForward(1000);
      for (const before of beforeIds) {
        const survivor = page.locator(`.task-card[data-id="${before.id}"]`);
        if (await survivor.count()) assert.equal(await survivor.locator('[data-field="shortcut"]').innerText(), before.key);
      }
      captured = true;
    }
  }
  assert.match(await page.locator('#dialog-title').innerText(), /努力交件/);
  const result = await page.locator('.results').innerText();
  assert.match(await page.locator('#missed-summary').innerText(), /處理完成卻未交出/);
  await page.locator('.result-review summary').click();
  const missedCount = Number((await page.locator('#counts').innerText()).match(/漏件 (\d+)/)[1]);
  assert.equal(await page.locator('.result-review li').count(), missedCount);
  assert.match(await page.locator('.result-review').innerText(), /電腦處理到|尚未接收|上傳還剩|尚未開始上傳/);
  assert.ok(Number.parseInt((await page.locator('#counts').innerText()).match(/已交 (\d+)/)[1]) >= 5);
  await page.screenshot({ path: 'test-results/result.png', fullPage: true });
  console.log(`PASS browser: 完整 180 秒 UI 操作（加速時鐘）\n${result}`);
  const best = await page.locator('#best').innerText();
  await page.locator('#primary').click();
  assert.equal(await page.locator('#score').innerText(), '0');
  assert.equal(await page.locator('#timer').innerText(), '03:00');
  assert.equal(await page.locator('.task-card').count(), 0);
  assert.equal(await page.locator('#history-list li').count(), 0);
  assert.equal(await page.locator('.result-review').isVisible(), false);
  assert.equal(await page.locator('#best').innerText(), best);
  assert.equal(await page.locator('#temperature').innerText(), '27.0°C');
  assert.equal(await page.locator('#battery').innerText(), '32%');
  await page.clock.fastForward(24500);
  await page.locator('.task-card[data-slot="0"] [data-action="receive"]').click();
  await page.locator('.task-card[data-slot="1"] [data-action="receive"]').click();
  const secondId = await page.locator('.task-card[data-slot="1"]').getAttribute('data-id');
  await page.keyboard.press('w');
  assert.equal(await page.locator('.task-card.chosen').getAttribute('data-id'), secondId);
  await page.keyboard.press('q');
  assert.equal(await page.locator('.task-card.chosen').getAttribute('data-slot'), '0');
  await page.locator('.task-card[data-slot="0"] [data-action="abandon"]').click();
  assert.equal(await page.locator(`.task-card[data-id="${secondId}"] [data-field="shortcut"]`).innerText(), 'W');
  await page.clock.fastForward(15600);
  assert.equal(await page.locator('.task-card[data-slot="0"] [data-field="shortcut"]').innerText(), 'Q');
  await page.keyboard.press('w');
  assert.equal(await page.locator('.task-card.chosen').getAttribute('data-id'), secondId);
  await page.keyboard.press('q'); // 新通知尚未接收，不會被快捷鍵直接接案。
  assert.equal(await page.locator('.task-card.chosen').getAttribute('data-id'), secondId);
  console.log('PASS browser: Q/W 切換、結案後保留 W、新工作補 Q 空位、未接收工作不會誤選');
  await page.locator('#mute').click();
  assert.equal(await page.locator('#mute').innerText(), '音效：關');
  await page.reload();
  assert.equal(await page.locator('#mute').innerText(), '音效：關');
  assert.equal(await page.locator('#best').innerText(), best);
  await page.locator('#primary').click();
  await page.clock.fastForward(110000);
  assert.equal(await page.locator('#offline').isVisible(), true);
  assert.equal(await page.locator('#battery').innerText(), '0%');
  assert.ok(await page.locator('.task-card').count() > 0);
  assert.match(await page.locator('.task-card').first().innerText(), /關機期間保留的通知/);
  assert.equal(await page.locator('[data-action="receive"]').first().isDisabled(), true);
  await page.locator('[data-device="phone"]').click();
  await page.clock.runFor(300);
  assert.equal(await page.locator('#offline').isVisible(), false);
  assert.equal(await page.locator('[data-action="receive"]').first().isEnabled(), true);
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.keyboard.press('Space');
  assert.match(await page.locator('#dialog-title').innerText(), /暫停/);
  assert.deepEqual(errors, []);
  console.log('PASS browser: 重新開始、最高分與靜音保存、關機通知與充電恢復、空白鍵暫停、320/390px 無水平溢出、無執行錯誤');
} finally {
  await browser?.close();
  await server.close();
}

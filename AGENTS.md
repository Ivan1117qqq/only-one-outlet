# 專案指引

- 使用 TypeScript、Vite、原生 HTML/CSS 與 npm；介面為繁體中文，無後端或外部 API。
- `src/config.ts` 集中管理數值與任務模板；`src/generator.ts` 管理種子與生成；`src/game.ts` 為純遊戲狀態與固定時間步進。
- `src/main.ts` 處理生命週期與操作，`src/view.ts` 更新畫面，`src/preferences.ts` 保存最高分與音效偏好。
- 第二版只在 180 秒結算；交件／逾期／放棄／下班漏件共用唯一結案入口，避免重複計分。暫停必須停止全部模擬。
- 使用 Node.js 22.18+（建議 Node 24）。不要提交 `node_modules` 或 `dist`。
- 驗證指令：`npm test`、`npm run balance`、`npm run build`；`npm run test:browser` 使用本機 Chrome 驗證介面（可用 BROWSER_CHANNEL=msedge）。截圖在忽略的 `test-results/`。
- `npm run dev` 或 `npm run preview` 手動試玩；`?seed=42` 固定種子。策略模擬不代表真人難度已平衡。
- 維持 Vite `base: './'`，確保 itch.io 子目錄內能載入資源。

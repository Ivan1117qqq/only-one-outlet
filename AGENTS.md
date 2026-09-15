# 專案指引

- 使用 TypeScript、Vite、原生 HTML/CSS 與 npm；介面為繁體中文，無後端或外部 API。
- `src/config.ts` 集中管理數值，`src/game.ts` 為純遊戲狀態與固定時間步進，`src/main.ts` 處理畫面與操作。
- 使用 Node.js 22.18+（建議 Node 24）。不要提交 `node_modules` 或 `dist`。
- 驗證指令：`npm test`、`npm run build`。畫面與操作可用 `npm run dev` 或 `npm run preview` 手動確認。
- 維持 Vite `base: './'`，確保 itch.io 子目錄內能載入資源。

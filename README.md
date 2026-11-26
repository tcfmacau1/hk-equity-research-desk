# iPhone 港股研究工作區

GitHub Pages 提供離線介面。iPhone 名單、公司圖示及研究紀錄同步到專用 Supabase 專案。原私人 Sites 工作區及其排程獨立運作。

## 首次啟用

1. 在 Supabase 建立專用專案，在 SQL Editor 執行 [iphone.sql](supabase/iphone.sql)。這會建立按登入者隔離的資料表及版本控制函式。
2. 在 Authentication → Users 建立一個已確認電郵的使用者，並設定密碼。記下專案 URL 及 Settings → API Keys 的 publishable key（sb_publishable_ 開首）。
3. 在 GitHub 儲存庫的 Settings → Secrets and variables → Actions → Repository secrets 新增下表四項。請用專用研究帳戶，手機和排程均須使用同一帳戶。

| Secret | 內容 |
|---|---|
| IPHONE_SUPABASE_URL | 專案 HTTPS 網址 |
| IPHONE_PUBLISHABLE_KEY | 專案 publishable key |
| IPHONE_EMAIL | 專用研究帳戶電郵 |
| IPHONE_PASSWORD | 專用研究帳戶密碼 |

4. 在原 iPhone GitHub Pages 入口點「檢查新版」，確認更新後點「連接 iPhone 獨立雲端」。輸入同一組設定。請保留原網站資料，原入口的 IndexedDB 待辦會在登入後同步。離線時可繼續編輯；回到網站恢復連線後重試。首次登入的資料庫使用者會與本機資料綁定。
5. 在 GitHub Actions 選「iPhone 港股公告監察」→ Run workflow，確認成功。排程設於 00:00 UTC（澳門 08:00），實際啟動時間視 GitHub 排隊情況而定。網站開啟時載入雲端紀錄。

## 公告範圍

排程檢查已啟用網站追蹤或提醒的公司，逐股讀取披露易繁體公告標題及分類，重查近七天，按公司及公告編號去重。納入標題符合規則的業績、指引、重大交易及監管事項，略過常規披露。確認範圍為官方已刊登公告，股價影響及估值留待研究。此版本提供站內紀錄，未配置 iOS 背景推播及媒體全文監測。

## 建置

執行 `node scripts/pages.mjs` 產生 public/。主分支更新後由 Publish Pages 工作流程部署。每次發佈均保留原有的手動 PWA 版本更新機制。

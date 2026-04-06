# J-Buddy 學日文

你的 AI 日文隨身家教。選取日文文字，即時獲得單字解析與語法說明。

---

## 架構總覽

```
Chrome Extension (Side Panel)
        │
        │  Firebase Callable Functions (HTTPS)
        ▼
┌─────────────────────────────┐
│  explain()   saveItems()    │  Firebase Functions (us-central1)
│       │            │        │
│       ▼            ▼        │
│  Gemini API    Firestore    │
└─────────────────────────────┘
        │
        ▼
  Next.js Webapp
  (讀取 Firestore，顯示已儲存的單字與語法)
```

**認證**：Firebase Auth（Google 登入）  
**密鑰管理**：Firebase Secret Manager，secret 名稱 `JAPANESE_ALCHEMY_CONFIG`

---

## 三個子專案

### 1. `japanese-alchemy-chrome-extension`

Chrome Extension MV3，核心功能在 Side Panel。

| 檔案 | 說明 |
|------|------|
| `src/manifest.json` | MV3 manifest，權限：sidePanel、storage、offscreen |
| `src/scripts/background.js` | Service Worker，管理 Side Panel 開關 |
| `src/scripts/contentScript.js` | 監聽頁面文字選取，傳送至 background |
| `src/scripts/jaAlchemyApiService.js` | 呼叫 Firebase Functions（explain / saveItems） |
| `src/scripts/authService.js` | Firebase Auth 登入/登出 |
| `src/scripts/firebaseConfig.js` | Firebase 設定 |
| `src/sidepanel/sidepanel.js` | Side Panel 主邏輯，渲染分析結果 |
| `src/offscreen/offscreen.js` | Offscreen document，處理 Firebase Auth popup |

**流程**：選取文字 → contentScript → background storage → sidepanel 讀取 → `jaAlchemyApiService.generateResponse()` → Firebase `explain` function → Gemini API → 渲染結果

**建置**：
```bash
cd japanese-alchemy-chrome-extension
npm install
npm run build   # 輸出至 dist/
```

---

### 2. `japanese-alchemy-hosting` (Firebase)

Firebase 後端，包含 Cloud Functions 與 Firestore 規則。

#### Cloud Functions

| Function | 說明 |
|----------|------|
| `explain` | 接收日文文字，呼叫 Gemini API 回傳分析結果（單字 + 語法） |
| `saveItems` | 將分析結果儲存至 Firestore（支援個人 / 共用集合） |

**Prompt 版本**：`v1`（基礎）、`v2`（含 ruby 注音，預設）

**Secret 設定**（Firebase Secret Manager）：
```json
// JAPANESE_ALCHEMY_CONFIG
{
  "google": { "api_url": "https://..." },
  "gemini": { "api_key": "...", "model": "gemini-2.0-flash" }
}
```

#### Firestore 資料結構

```
users/{userId}/
  vocabularies/{id}   # 個人單字
  grammars/{id}       # 個人語法
```

**部署**：
```bash
cd japanese-alchemy-hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

---

### 3. `japanese-alchemy-webapp` (Next.js)

讀取 Firestore，顯示使用者儲存的單字與語法清單。

**技術棧**：Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Firebase SDK 12

**頁面**：
- `/` — 主頁，顯示單字與語法 tabs
- `/auth` — Google 登入頁

**環境變數**（`.env.local`）：
```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

**啟動**：
```bash
cd japanese-alchemy-webapp
npm install
cp .env.local.example .env.local  # 填入 Firebase 設定
npm run dev
```

---

## 快速開始

1. **Firebase 專案**：建立 Firebase 專案，啟用 Auth（Google）、Firestore、Functions
2. **Secret**：在 Firebase Secret Manager 建立 `JAPANESE_ALCHEMY_CONFIG`
3. **部署 Functions**：`cd japanese-alchemy-hosting && firebase deploy --only functions`
4. **建置 Extension**：`cd japanese-alchemy-chrome-extension && npm run build`，載入 `dist/` 至 Chrome
5. **啟動 Webapp**：`cd japanese-alchemy-webapp && npm run dev`

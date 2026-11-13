# ASCEND — Personal Offline Self-Care & Progress OS

ASCEND is a 100% offline, single-user appearance-progress, daily protocol, lifestyle tracker, and on-device facial landmark analysis Progressive Web App (PWA) built with React, TypeScript, Tailwind CSS, Dexie (IndexedDB), and MediaPipe Face Landmarker.

Zero accounts, zero login, zero network calls at runtime, zero ads, and zero fake data.

## 1. Local Development & Production Build

```bash
npm install
npm run dev      # Starts dev server on port 3000 with PWA service worker enabled
npm run lint     # TypeScript type-check (tsc --noEmit)
npm run build    # Production bundle in dist/
```

## 2. Where MediaPipe Local Files Live (100% Offline)

ASCEND runs the 478-landmark MediaPipe Face Landmarker completely on-device without any CDN requests:

- `public/mediapipe/face_landmarker.task` — Local float16 MediaPipe Face Landmarker model
- `public/mediapipe/wasm/` — Local WASM runtime (`vision_wasm_internal.js`, `vision_wasm_internal.wasm`, `vision_wasm_module_internal.js`, `vision_wasm_module_internal.wasm`)

These are loaded in `src/lib/faceAnalysis.ts` via `/mediapipe/wasm` and `/mediapipe/face_landmarker.task` and cached in the Workbox service worker (`vite.config.ts` with `maximumFileSizeToCacheInBytes: 25 * 1024 * 1024`) for full offline operation.

## 3. Building an Android APK with Capacitor

`capacitor.config.ts` is already configured (`webDir: 'dist'`). To package as a native Android APK:

```bash
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications
npx cap add android
npx cap sync android
npx cap open android
```

Then build a signed or debug APK directly inside Android Studio (`Build > Build Bundle(s) / APK(s) > Build APK(s)`). `src/lib/notifications.ts` automatically detects `Capacitor.Plugins.LocalNotifications` when running inside the APK and falls back to Web Notifications / in-app reminder banners in the browser.

## 4. How to Add or Edit Curated Protocols & Academy Guides

All content lives in clean typed TypeScript files under `src/data/`:

- **Protocols (~30 curated items)**: Edit `src/data/protocols.ts` (`CURATED_PROTOCOLS`). Each item specifies `title`, `actionLine`, `minutes`, `xp`, `category`, `defaultBlock`, `steps`, `evidence` (`'Proven' | 'Likely works' | 'Not proven'`), `why`, and optional `safetyNote`.
- **Academy Guides, Glossary, Myths Wall & Medical Info**: Edit `src/data/academy.ts` (`ACADEMY_GUIDES`, `GLOSSARY_TERMS`, `MYTHS_WALL`, `MEDICAL_INFO_CARDS`).
- **Care Hub (Haircuts by Face Shape, Skin Starter Guides, Style Basics)**: Edit `src/data/care.ts`.
- **Milestone Badges & Level Curve**: Edit `src/data/badges.ts`.

## 5. Privacy & Safety Notes

- All logs, scans, thumbnails, products, and workouts are stored strictly in browser IndexedDB via Dexie (`ascend_offline_db`).
- Optional encrypted backups in Settings use Web Crypto PBKDF2 (100,000 iterations) + AES-GCM-256.
- Self-tracking estimates are informational only and never medical advice.

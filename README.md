# ASCEND — Daily Health, Looks Care, Face Scanner & Habit OS

ASCEND is a mobile-first, local-first Progressive Web App (PWA) built with React, TypeScript, Tailwind CSS, Dexie (IndexedDB), and MediaPipe Face Landmarker.

Core tracking, Face Scanner (478 landmarks), WHO-calibrated height tracker, Face Exercises, Looks Care, Meal Library, Quit habits, and offline coach FAQ run **100% on-device without a network connection**. Online AI Food Scan (`/api/analyze-food`) and Online AI Coach (`/api/coach`) require explicit user opt-in and only run when enabled.

---

## 1. Local Development, Tests & Production Build

```bash
npm install
npm run dev      # Starts Vite dev server on port 3000 with PWA enabled
npx tsc --noEmit # Strict TypeScript type-check
npm run lint     # Lint / type verification
npx vitest run   # Unit tests (formulas, WHO LMS, PSL tiers, age guards, diet, quit stats)
npm run build    # Production bundle in dist/ + Workbox precache SW
```

---

## 2. Vercel Deployment & Server Environment Variables

Vercel routes serverless functions in `/api/` (`api/health.ts`, `api/analyze-food.ts`, `api/coach.ts`, `api/push.ts`, `api/send-reminders.ts`) with security headers and CSP defined in `vercel.json`.

Configure these environment variables in your Vercel project (never commit secrets; see `.env.example`):

| Variable | Required? | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For online AI | Server-side key for `/api/analyze-food` and `/api/coach` |
| `GEMINI_FOOD_MODEL` | Optional | Defaults to `gemini-3.1-flash-lite` |
| `GEMINI_COACH_MODEL` | Optional | Defaults to `gemini-3.1-flash-lite` |
| `DISABLE_AI_ENDPOINTS` | Optional | Set `"true"` to immediately disable AI serverless endpoints |
| `ALLOWED_ORIGINS` | Optional | Extra comma-separated origins allowed past same-origin checks |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optional | Enables Web Push registration in `/api/push` & `/api/send-reminders` |
| `CRON_SECRET` | Optional | Bearer secret guarding `/api/send-reminders` |

---

## 3. Where Replaceable Data, Assets & Local Models Live

- **WHO 2007 Height LMS Table**: `src/data/who2007.json` (used by `src/data/growthTables.ts`). Marked as approximate reference in the UI until verified against your official WHO LMS file.
- **MediaPipe On-Device Face Landmarker (Offline)**:
  - `public/mediapipe/face_landmarker.task`
  - `public/mediapipe/wasm/` (`vision_wasm_internal.*`, `vision_wasm_module_internal.*`)
- **Face Exercise Illustrations (Optional)**:
  - Drop custom WebP illustrations at `public/exercises/{slug}.webp` (e.g., `/public/exercises/jawline-release.webp`). If omitted, the built-in animated SVG demonstration (`src/components/exercises/SvgExerciseDemo.tsx`) renders automatically with zero broken images.
- **Curated Content Modules (`src/data/`)**:
  - `src/data/protocols.ts` — Core daily habits & optional extras
  - `src/data/exercisePrograms.ts` — Face Exercises & Jaw/Neck/Posture/Eye/Relax programs
  - `src/data/care.ts` — Looks Care routines (skin types, face-shape haircuts, grooming, style, posture)
  - `src/data/mealLibrary.ts` — ~60 editable everyday meals including Egyptian & regional staples
  - `src/data/academy.ts` — Evidence-tagged guides, glossary (PSL, HTN, LTN, Chad, mewing, etc.), and myths
  - `src/data/badges.ts` — XP curve and milestone medallions

---

## 4. Building an Android APK with Capacitor

`capacitor.config.ts` is pre-configured (`webDir: 'dist'`). To build an Android APK with native local notifications:

```bash
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/local-notifications
npx cap add android
npx cap sync android
npx cap open android
```

Build a signed or debug APK in Android Studio (**Build > Build Bundle(s) / APK(s) > Build APK(s)**). `src/lib/notifications.ts` automatically detects `Capacitor.Plugins.LocalNotifications` inside the APK, falling back cleanly to Web Notifications, in-app due cards, and `.ics` calendar export in the browser.

### Optional: Enabling Android Health Connect in the APK
In `src/lib/connections.ts`, `HEALTH_CONNECT` is `false` on the web build (because websites cannot read other phone apps). When packaging the Android APK with Capacitor:

1. Install a Capacitor Health Connect plugin (e.g. `capacitor-health-connect` or `@devmaxime/capacitor-health-connect`) and run `npx cap sync android`.
2. Add Health Connect read permissions to `android/app/src/main/AndroidManifest.xml` (off by default, requested per data type: `READ_STEPS`, `READ_SLEEP`, `READ_WEIGHT`, `READ_EXERCISE`).
3. Flip `HEALTH_CONNECT = true` in `src/lib/connections.ts` inside your Android APK branch and wire the per-type permission buttons in `src/components/settings/ConnectionsSection.tsx`. All imported metrics remain in local IndexedDB unless you turn on the Online Coach.

---

## 5. Phone Manual Test Checklist (Verify on Real Mobile Device)

Automated CLI checks (`tsc --noEmit`, `vitest`, `vite build`) cannot simulate physical phone touch gestures, live camera sensors, Android Share Target sheets, or OS permission prompts. Run through this checklist on your phone after deploying:

1. **Install & Offline Boot**: Open in mobile Chrome/Safari → tap **Add to Home Screen** → toggle Airplane Mode → reopen app and confirm Plan, Food library, Face Exercises, and Grow load cleanly.
2. **Online AI Consent & Food Scan / Share Target**: Open **Food → AI Photo** → confirm the Online AI consent modal appears before any photo leaves the device. After installing PWA on Android Chrome, tap Share on a gallery food photo → choose **ASCEND** → verify it opens Food scan with consent gating.
3. **3-Angle Face Scanner, Tier Ladder & Your Path**: Open **Face → Scanner & Results** → verify tier badge (`Chad (Elite)` / `Chadlite` / `HTN` / `True Normie` / `LTN` / `Developing`), 6-rung Tier Ladder, **Your Path** top 3 levers + **"Add to Today"**, and **4-week re-scan reminder**.
4. **Under-18 / Unknown-Age Safety & Fight Camp**: In **Settings**, set age to `15` (or skip age setup) → confirm Fight Camp & `Lose fat` lock with `"Weight for a fight is a coach + doctor call at your age."` vs setting age `>= 18` with Fight Camp goal.
5. **CSV / JSON Import Preview & Ear-Shoulder Check**: Open **Settings → Connections** → upload a sample CSV/JSON export → test column mapping + preview + confirm. Open **Grow** → test side-photo Ear & Shoulder tap points.
6. **No-Guilt Quit List & Privacy**: Open **Health → Quit habits** → confirm **Days in control** does not reset on slips and never appears on PNG share cards or Weekly Leader Review cards.
7. **Reminders & Calendar Export**: Open the bell icon → test **Allow OS Alerts**, **Done / Snooze 30m / Later**, and **Export .ics** into Google/Apple Calendar.
8. **Self-Check & Backup**: Open **Settings → Diagnostics → Run self-check** and test exporting + importing a JSON and encrypted backup.

---

## 6. Privacy & Disclaimer

- Face scan photos/landmarks, skin logs, workouts, and Quit habits remain locally in IndexedDB (`ascend_offline_db`).
- Exported encrypted backups use Web Crypto PBKDF2 (100,000 iterations) + AES-GCM-256.
- All scores, body-fat estimates, calorie targets, and growth estimates are self-tracking tools for informational purposes only — not medical advice.

# ASCEND — FINAL UPGRADE RUN (all remaining phases in one go)

Phases A, A.1 and B are done and I like them. KEEP the current look and structure. This final run UPGRADES the whole app (backend, frontend, data layer, UI, performance, security) and finishes everything that is still open. Do not redesign, do not rename or remove existing features, keep every label I am used to. Zero fake data. Keep the under-18 / still-growing safety rules.

## HOW TO RUN THIS
1. Execute in this order WITHOUT waiting for me: **FIXES (section 2) → Phase C → C2 → C3 → C4 → D → E** (as defined in the master prompt; the key deliverables are repeated in section 4).
2. Edit the files directly. Do NOT paste code in your replies (it wastes budget). After each phase run `tsc --noEmit` and the production build, then write a 5-line status ("Phase X DONE: what works / what not") and continue to the next phase immediately.
3. If your budget runs out, stop cleanly at the end of a finished item and write "RESUME FROM: <phase and item>" plus the list of what is left, so I can say "Resume".
4. Be honest: say what you tested and what you could only verify by reading the code.

## 1. TIER NAMES I AM USED TO (make them clearly visible)
Use the community PSL ladder, centred on whole numbers (replace the old thresholds and tell me which labels changed):
- 7.5+ **Chad (Elite)** · 6.5-7.49 **Chadlite** · 5.5-6.49 **HTN (High-Tier Normie)** · 4.5-5.49 **True Normie** · 3.5-4.49 **LTN (Low-Tier Normie)** · below 3.5 **Developing**.
- Keep the calibration honest: most people land around 4.0-5.5, so most people are True Normie or LTN; 7+ is very rare. Never use "unattractive", "flawed" or "very low".
- Show the tier name in ALL of these places: the PSL LAB result header (big badge + the /8 number), a "Your tier" card on the Face tab, a small tier badge next to the level on Plan after the first scan, the Progress screen (tier history over scans), the saved report image, and a **Tier ladder** card (6 rungs, "You are here" marker, and what realistically moves you up: leanness, skin, hair, grooming, posture, neck/traps). Settings toggle "Slang tier names" stays ON by default; OFF shows neutral names in brackets.
- Also keep the looksmaxxing vocabulary I know in the glossary and UI where it fits (PSL, HTN, LTN, Chad, mogging, mewing, hunter eyes, canthal tilt, gonial angle, softmaxxing/hardmaxxing), each with an honest one-line take.

## 2. FIXES (flaws found in the Phase A.1 and B reports)
F1. **WHO growth tables:** check where the LMS numbers came from. If they were not copied from the official WHO file, label the curves "approximate reference" in the UI, add a "Sources and accuracy" note, put the data in one JSON file (src/data/who2007.json) that I can replace with the official WHO table, and add unit tests that compare a few computed medians with published WHO values. Never present unverified numbers as official.
F2. **Finished-growth logic:** if the user is probably done growing (boys about 18+, girls about 16+, or "No, I'm done"), "Growth complete" must be about 99-100% and the dream-height chance must be based on the CURRENT height plus 0-1 cm remaining (small SD, documented), not on the parental outlook. For younger users keep the outlook approach. Make the two numbers always consistent with each other.
F3. **Quit list:** the live "abstinence counters" with a hard reset create guilt. Replace them with the Phase C4 design: "days in control" + 30-day success rate, a no-shame "I slipped" flow, urge timer, private labels, generic notification text, hidden from share cards. Counters are hidden by default on screens other than the Quit list.
F4. **Unknown age is treated as under-18** until an age is saved: hide deficit/cutting tools and show "set your age to unlock this".
F5. **Bundle size:** the main chunk was about 670 kB (199 kB gzip). Lazy-load the WHO data, charts, scanner, face analysis and exercise player with dynamic imports, split vendor chunks, remove unused dependencies. Target: main chunk under about 150 kB gzip. Report before/after sizes.
F6. **Tests:** add Vitest unit tests for pure logic (Mifflin-St Jeor, US Navy body fat, mid-parental height, LMS percentile/z-score, dream-height probability, XP/level formula, unit conversions, tier mapping, under-18 guard). Run them if you can; if not, say so.
F7. **Self-check screen:** Settings → Diagnostics → "Run self-check" shows pass/fail for: database read/write, persistent storage, service worker and cache, camera permission state, notification permission, /api/health, /api/analyze-food reachability, MediaPipe files loaded, app version and build date. Also a local error log I can export.
F8. **Migrations:** before the Dexie upgrade runs, offer an automatic backup download; test importing an old (v5 or older) backup; never lose data on upgrade.
F9. **Hard-coded text:** grep the whole app for strings not coming from src/i18n/en.ts and move them (Tone, Easy/Pro keep working). Remove leftover placeholders.
F10. **PWA update flow:** "New version available: refresh" banner, cache busting, no stale builds.
F11. **Accessibility:** contrast, labels on every icon button, focus order, 44 px targets, font scaling, reduced motion.
F12. **Real-device honesty:** you have not tapped through the UI in a browser. Add a short manual test checklist to the README (what I should tap on my phone) and report which items could not be verified by you.

## 3. FULL-STACK UPGRADE (backend → frontend → UI)
- **Backend (Vercel serverless):** `/api/health`, `/api/analyze-food`, `/api/coach`, `/api/push` and `/api/send-reminders` with: input validation, size and content-type limits, same-origin check, per-IP rate limit, daily cap, kill switch env var, typed `{ ok, data | error }` responses, no secrets in logs, and security headers/CSP in vercel.json. Check that no key is committed to the repo.
- **API layer in the app:** one `src/lib/api.ts` wrapper (timeout, one retry, typed errors, offline detection) used by every online feature; friendly error messages; opt-in consent screen for online features (food photos, coach) with a toggle to turn them off.
- **Data layer:** versioned Dexie schema with tested migrations, validated import/export (schema check, preview before replace, optional encrypted backup with WebCrypto AES-GCM + PBKDF2), storage usage screen and persistent storage request, local-date keys and an optional "day starts at 4 AM".
- **Frontend architecture:** TypeScript strict mode, error boundary per screen, no per-frame React state in camera code, memoised lists, React.lazy for every heavy screen, dead-code removal.
- **UI:** keep the current design system; polish spacing, empty/loading/error states, dark and light themes, one-hand reach, smooth 150-250 ms transitions, "Ask why" and "Ask" coach on every screen, pictures/icons first and text short.

## 4. REMAINING PHASES (key deliverables; full details are in the master prompt)
**Phase C:** simple-words pass (Plan/Face/Grow/Health copy, jargon only behind "What's this?"); Looks care pages (skin routine by skin type, hair and haircut by face shape, grooming, style, posture) kept short with evidence tags; **Face Exercises** programs (Jawline & Neck, Neck & Chin, Posture, Eye Comfort, Face Relax) with 7-day dots, levels, the shared exercise player (timer, reps, rest, auto-advance, saved progress), Watch on YouTube/TikTok on every exercise, optional images from /public/exercises/{slug}.webp, SVG fallback, safety notes and honest "what it can / cannot do" copy (gentle tongue posture only, never press on the eyeballs, no neck weight under 18).
**Phase C2:** one Diet system (Lose fat / Stay the same / Build muscle) on top of the existing Food tab: Mifflin-St Jeor targets, safe floors, weekly auto-adjust from the 7-day weight average, "What should I eat?" from a local library of about 60 meals including Egyptian staples (approximate, editable, labelled "estimate"), weight and waist trends.
**Phase C3:** in-app AI coach (floating Ask button, "Ask why" chips, chat with quick chips, /api/coach with the answer-first friendly system prompt from the master prompt, opt-in context, offline FAQ fallback, "add to plan" suggestions) and the Reminder Center (water, meals, skin AM/PM, SPF, exercise, posture, sleep wind-down, weekly photo, monthly height, optional prayer and study), quiet hours, max 6 a day, snooze, Done/Later actions, delivery via Capacitor local notifications (APK, README steps) or Web Push with a scheduler, .ics fallback, honest status of which path is active.
**Phase C4:** Quit list as in F3 (picks, reason, triggers, swap plan, urge timer, fact cards, support card, privacy rules, honest limits).
**Phase D:** visual polish pass, light/dark check, README (run, build, deploy, env vars, add content, Capacitor APK, where the WHO file and MediaPipe files live).
**Phase E:** red-team audit table (privacy contradiction and consent, API abuse, data loss and backups, health and minors, security headers, scanning other people, scan stability, mirror/EXIF bugs, setup-match for comparisons, bias wording, content accuracy and sources, input sanity, battery/memory, reminders honesty, time handling, storage, diagnostics, accessibility/legal), then fix everything found. Finish with a Red-team report and the 5 weakest remaining points.

## FINAL ACCEPTANCE (report pass/fail honestly)
1. Tier names (Chad, Chadlite, HTN, True Normie, LTN) show in all the listed places and the Tier ladder works.
2. Grow numbers are consistent for a 14-year-old and for a 20-year-old; unverified tables are labelled.
3. Quit list has no guilt reset; notifications never name a private habit.
4. Face Exercises run end to end with the player and Watch links.
5. Food, diet goal, "What should I eat?" and the coach work; online features need my opt-in; the app still works offline without them.
6. Self-check screen passes on my phone; `tsc --noEmit`, Vitest and the production build pass; main chunk size reported.
7. Final report: what works, what you could not finish or verify, and the top 5 weakest points.

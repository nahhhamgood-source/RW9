# ASCEND — RUN 2: VERIFY, FINISH, AND ADD

Your previous run (63 files edited) was cut off by the daily limit, so its final checks and reports never arrived. DO NOT redo finished work and do not redesign anything. Keep every label, look and feature I already have (including the PSL tier names Chad / Chadlite / HTN / True Normie / LTN / Developing). Zero fake data. Keep the under-18 and unknown-age safety rules. Edit files directly, do not paste code in replies, and reply with short summaries only.

## HOW TO RUN (budget-safe)
1. Do the steps in this order: **STEP 1 audit → STEP 2 config robustness → STEP 3 finish gaps → STEP 4 new items → STEP 5 final QA.**
2. After each step run `tsc --noEmit`, the unit tests and the production build, then write a 5-line status and continue.
3. If your budget runs out, stop cleanly after a finished item and write "RESUME FROM: <step and item>" with what is left.

## STEP 1 — SELF-AUDIT (be honest, evidence from the code)
Build a table "Item | Status (Done / Partial / Missing) | Evidence (file and function)" for: fixes F1-F12 from the last prompt (WHO tables labelled and replaceable, finished-growth logic, Quit list without guilt counters, unknown age treated as under-18, bundle size with before/after numbers, Vitest tests, Settings → Diagnostics "Run self-check", migration backup, hard-coded strings, PWA update banner, accessibility, README manual test checklist), the tier-name placements (result header, Face tab "Your tier", Plan badge, Progress history, saved report, Tier ladder), the backend (/api/health, analyze-food, coach, push, send-reminders with validation, rate limit, size limits, origin check, kill switch), the API wrapper and consent screen, Phase C (looks care, Face Exercises programs, shared player, Watch links, SVG fallback), C2 (diet system, meal library, "What should I eat?"), C3 (AI coach, Reminder Center), C4 (Quit list), D (README) and E (red-team table + report). Check that package.json really contains every dependency used (for example vitest, web-push) and that no file imports a missing package. Then FIX everything Partial or Missing before moving on.

## STEP 2 — CONFIG ROBUSTNESS (environment variables)
The app must work with ONLY `GEMINI_API_KEY` set. Every other variable is optional with a safe default:
- `GEMINI_FOOD_MODEL`, `GEMINI_COACH_MODEL`: defaults in code, one constant per model, easy to change; a clear error if the model name is rejected.
- `DISABLE_AI_ENDPOINTS`: empty or false by default; "true" turns the AI endpoints off and the app falls back to manual entry and the offline FAQ.
- `ALLOWED_ORIGINS`: if empty, allow same-origin only.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`: only for web push. If missing, the Reminder Center shows "Push is not set up" and uses the in-app reminders and the .ics export; nothing crashes.
- Settings → Diagnostics lists which variables are set (names only, never values) and what each missing one disables.
- README: a table of every variable (what it does, required or optional, example value, how to generate VAPID keys with `npx web-push generate-vapid-keys`, how to make a CRON_SECRET, how to set them in Vercel and redeploy), the push scheduler options (note that Vercel Hobby cron may be limited to once a day), and where push subscriptions are stored. Confirm that `.env` is git-ignored and that no secret is in the repo. Make sure server.ts and any dev-only server code cannot leak keys or ship to production.

## STEP 3 — FINISH THE GAPS
Anything still Partial or Missing from the earlier plan: Phase E red-team table and report (privacy consent, API abuse, data-loss backups, minors and health, security headers/CSP, scan stability, mirror and EXIF handling, setup-match for comparisons, bias wording, content accuracy, input sanity, battery/memory, reminders honesty, time handling, storage screen, accessibility), then fix what you find.

## STEP 4 — NEW ITEMS (from the TikTok and Taller screenshots I collected)
**4.1 Hyoid / Neck program content** (inside the Neck & Chin program, with Watch links, 7-day dots, levels, exercise player). Use these steps in plain words:
- **Neck curls:** lie on your back with knees bent, tuck your chin slightly, lift only your head off the floor slowly, lower slowly, repeat. 2 sets x 8-10 to start.
- **Chin tucks:** stand with your back and head against a wall, draw your chin straight back (a gentle double chin), hold 5-10 s x 10. Optional: while holding the tuck, tilt the head a little left and right, slowly.
- **Tongue posture:** rest the whole tongue on the roof of the mouth, lips closed, teeth slightly apart, breathe through the nose.
- **Forehead press:** palm on the forehead, gentle isometric push, 10 s x 5.
Safety: effort about 30-50% (never "press as hard as you can"), stop on pain, dizziness or tingling, no weights on the neck under 18.
Honest copy: "These train deep neck muscles and posture, and can make the area under the chin look tighter if you are lean. They do not move or change the hyoid bone, and fat only changes with overall fat loss." Tags: Likely works (posture and neck strength), Not proven (hyoid or jaw-shape claims).

**4.2 "See the change" visualizer** (Face tab):
- Mode 1, **My photos:** a drag slider comparing my first and latest same-setup photos or scans, with the real measured changes underneath.
- Mode 2, **How leanness changes the jawline (education):** a slider over 5 illustrative stages (higher body fat → leaner) using local images in /public/learn/ or SVG diagrams, labelled "Illustration, not a prediction for you; bone structure differs." A button "Scan your face to see where you stand".

**4.3 Optional tools card (info only, no shop links):** gua sha stone, neck resistance band, measuring tape, sunscreen, razor. Each has an evidence tag and "not needed". Gua sha: "may relax tension; Not proven for lasting shape change; be gentle".

**4.4 Growth dashboard check** against the paid app layout: Current height, Predicted range (labelled "estimate"), "Optimize" shown honestly as posture gain up to about 1-2 cm of apparent height, Height/Age chart, "Taller than X%", Dream-height odds, Growth complete %. Add a **Sleep-first insight** card that shows my real sleep consistency next to my growth habits ("Sleep is the habit with the strongest support for growth") and a **Share growth report** button (local PNG, no network).

**4.5 Posture check from photo:** on a side photo I tap two points (ear and shoulder/base of the neck) and the app shows the head-forward angle with a plain verdict, a tip, and a trend over time. Label it "approximate", never a diagnosis.

**4.6 Weekly review (Sunday):** a short screen generated from my real logs: what went well, what to fix, next week's one focus, with a "Save as image" button.

## STEP 5 — FINAL QA AND REPORT
- Run the self-check, unit tests, `tsc --noEmit` and the production build; report main chunk size (gzip) before and after.
- Re-verify: tier names visible in all placements; Food tab and the diet goal; coach works with consent and falls back offline; reminders show which delivery path is active; Quit list has no reset-to-zero; all screens scroll on 360-430 px widths.
- Final report: what works, what you could not verify (you cannot tap through a real phone), the 5 weakest points left, and the exact environment variables I must set in Vercel for each feature to work.

# ASCEND — RUN 3: "THE APP WORKS FOR ME" (Autopilot + Fight Camp + Path)

KEEP the current look, structure, labels and every feature already built (PSL tier names Chad / Chadlite / HTN / True Normie / LTN / Developing stay). DEVELOP, do not redesign. Zero fake data. Edit files directly, no code in replies, short summaries only.
If Run 2 (the "VERIFY, FINISH, AND ADD" prompt) is not finished, finish it first, then start here. If your budget runs out, stop after a finished item and write "RESUME FROM: <part and item>".
After each part: `tsc --noEmit`, unit tests, production build, then a 5-line status.

## The user, in one paragraph
Egyptian guy, trains gym + MMA. His coach told him to enter a tournament and drop weight to compete. He wants an app that is comfortable, easy, and polished, that uses only things he already knows, that does the work FOR him (he should not have to run it), that never leaves him stuck after a face scan, and that he actually wants to open every day.

## HARD RULES (do not break, even if a screen would look better)
- Age first: if age is unknown or under 18 -> NO calorie-deficit, no weight-cut plan, no weight-class countdown. Show: "Weight for a fight is a coach + doctor call at your age. Ask your coach and a doctor." Everything else stays available.
- Never plan or suggest: water cutting / dehydration, sauna or sweat suits, diuretics or laxatives, fasting >16 h, skipping meals as a plan, crash diets, banned substances. These can appear ONLY as one info card: "Why we don't plan this: it hurts performance and can be dangerous. If a weight class needs it, that is a coach + doctor decision." No dosing, no how-to.
- No fake data, no invented stats. Every number comes from his logs, a shown formula, or a labelled estimate.
- Evidence tags stay (Proven / Likely works / Not proven). No guilt wording, no insults, no "unattractive".
- Bone structure and adult height do not change from exercises. Say it once, kindly, then give the useful stuff (see Part 6).
- A web app (PWA) CANNOT read other apps on the phone. Never pretend it can (see Part 5).

## PART 1 — Onboarding that sets up the whole autopilot (max 6 taps, skippable)
Ask once, store in Dexie, editable in Settings:
1. Age (number) 2. Height + current weight 3. Main goal: **Fight camp** / Look better / Both 4. Training days per week (gym, MMA) 5. Wake and sleep times 6. If Fight camp: tournament date + weight class (or target kg) + "Do you know the weigh-in rule? same-day / day-before / not sure".
No long forms. Every question has a "Not sure" button that picks a safe default and says what it picked.

## PART 2 — FIGHT CAMP mode (new module under Plan, also in More)
Show only if age >= 18 and goal includes Fight camp.
- **Camp card on Plan:** days to tournament, current kg, target kg, kg left, "on track / behind / ahead" from the 7-day weight average, a calm progress bar (no red alarm).
- **Reality check (honest, computed):** safe pace = about 0.5-0.75 kg per week (roughly 0.5-1% of body weight). Compute the earliest realistic date for the target. If the tournament is sooner, say plainly: "At a safe pace you reach X kg around <date>. Options: a higher weight class, a later event, or ask your coach what the weigh-in rule allows." Never invent a faster plan. If the cut is more than about 5% of body weight, show a "talk to your coach and a doctor" card.
- **Fuel for training, not starvation:** daily calorie target = maintenance (Mifflin-St Jeor x activity) minus a moderate deficit (about 300-500 kcal, never below the safe floor). Protein target about 1.6-2.2 g per kg. Hard training days get a carbs-before-training reminder; rest days a bit lower. Show "performance check": if sleep, energy or training quality drops (his 1-5 energy tap), the app automatically eases the deficit and says so.
- **Weekly auto-adjust:** every Sunday compare the 7-day weight average with the plan and adjust calories by a small step. Show "why" in one line.
- **Weigh-in week card (info only):** eat normally, sleep, keep food simple and familiar, nothing new on fight week, follow the coach. No water or salt manipulation instructions.
- Daily tasks stay tiny: log morning weight (one tap, optional), eat to the plan, sleep window, training done (one tap).

## PART 3 — Only things he already knows (simplicity)
- Build one **Core library of ~12 familiar tasks** from what already exists in the app: water, protein at meals, walk/steps, sleep on time, training done, stretch/mobility, posture check, face wash AM/PM, SPF, neck set, tongue posture, weigh-in. No new task types.
- **"Starter 6"** is the default daily plan: pick the 6 that fit his goal and schedule. Everything else lives in an "Explore more" shelf, collapsed, never auto-added.
- When a new task is offered, label it "New" with a one-line why and an "Add" button. It never appears in Today unless he adds it.
- Do-this-now keeps the priority order from before. Max 6 tasks visible on Today.

## PART 4 — Autopilot (the app helps me, I do not help it)
- **Auto-plan:** every morning the app builds Today from profile, goal, camp stage, training days, last night's sleep and yesterday's completion. No setup screens.
- **One-tap everything:** quick buttons for "Same as usual" meal (copies his most common meal for that slot), "Repeat yesterday", water +1, "Trained" with type chips (Gym / MMA / Rest).
- **Smart defaults:** remember the last value for every input; pre-fill; ask only what is missing.
- **Photo-first logging:** food photo -> /api/analyze-food -> editable result (keep consent rules). Web Share Target: register `share_target` in the manifest so he can share a food photo from the gallery to ASCEND and it opens the meal scan.
- **Leader view (the "head" of the other things he does):** a Sunday "Weekly Leader Review" screen from his real logs: training sessions, sleep consistency, calories vs plan, protein, weight trend, face/skin consistency, what went well, ONE thing to fix, next week's plan (auto-generated, one tap "Accept"). Saved as an image to share if he wants. If data is missing, say "Not enough data yet" and name the one tap that fixes it. Optional AI polish through /api/coach with opt-in; offline fallback is a template.
- **Quiet nudges:** max 4 reminders a day, smart timing (after training, before sleep), generic wording, quiet hours.

## PART 5 — Data from other apps (honest and real)
Show a **Connections** screen with plain status for each path and the honest limits:
1. **Import files:** CSV/JSON import for weight, sleep, steps, workouts (Google Fit / Health Connect exports, Samsung Health, Strava, Garmin and similar). Preview before saving, map columns, never overwrite without confirmation.
2. **Share into ASCEND:** Web Share Target for photos and text (food photos, screenshots of a weight).
3. **Android APK (Capacitor) path:** a Health Connect plugin for steps, sleep, weight and workouts with explicit per-type permission, off by default, data stays on the phone. Write the README steps and a feature flag `HEALTH_CONNECT` that is hidden in the web build with the line "Needs the Android app. A website cannot read your other apps."
4. State clearly in the UI: the web version cannot read WhatsApp, TikTok, other fitness apps, or the phone's health data by itself.
No scraping, no background spying, no hidden collection. Privacy line on the screen: "Stays on your phone unless you turn on the online coach."

## PART 6 — Honest Height (works even if growth is ~99% done)
- If the app says growth is about complete, show once: "Your bones are mostly done growing. Exercises cannot add bone length. They CAN help you stand tall and look taller by up to about 1-2 cm."
- Then switch to **Stand Tall plan** with real, useful exercises (all with Watch links, dose, evidence tags): dead hang, cobra, cat-cow, child's pose, wall angels, hip flexor stretch, glute bridge, chin tucks, face-the-wall posture reset, plus sleep and daily steps. Add "morning vs evening height check" using his own measurements (people are slightly taller in the morning).
- Keep the posture-from-photo check (ear-shoulder angle) and its trend.
- Younger or unfinished growth: keep the routine from Phase B. No supplement claims, no tricks.

## PART 7 — PATH after the scan: never a dead end
- After every face scan, the result ends with **"Your Path"**: the top 3 levers picked from his own measurements and logs, in plain words, each with a button that adds the program to Today:
  1. **Leanness / jawline fat** (the biggest visible lever for most people): ties to the diet goal and camp progress. Honest: leaner face shows the jaw better, spot-fat-loss does not exist.
  2. **Neck & posture:** neck curls, chin tucks, tongue posture, forehead press (30-50% effort, stop on pain, no neck weight under 18). Honest: trains muscle and posture, does not change bone or the hyoid.
  3. **Skin / hair / grooming / sleep:** the cheapest glow-up with the best evidence.
  Plus **Face Exercises**, **Debloat habits** (sodium, water, sleep, alcohol-free, not dehydration), and the **See the change** slider.
- A **Re-scan in 4 weeks** reminder with same-setup instructions, and a before/after of real measured changes only.
- Tier ladder shows "what realistically moves you up". Kind wording, no harsh labels.
- Looksmaxxing vocabulary stays (PSL, mogging, mewing, hunter eyes, canthal tilt, gonial angle) with an honest one-line take each.

## PART 8 — Easy, current English (copy pass)
- All text in src/i18n/en.ts. Short, modern, direct. Tone setting keeps Normal / Chill / Serious. Chill may use current slang (locked in, lowkey, W, no cap, grind, cooked, mid) sparingly. Never cringe, never insulting, never "bro" spam. No slang in safety, health or fight-camp warnings (always plain).
- Jargon only behind "What's this?". Every button is a verb. Buttons are at least 44 px.

## PART 9 — Street-food library (Egyptian staples, from his real menu photo)
Add to the meal library with ranges, always labelled "estimate, edit to match your plate", and a lighter swap for each:
- Shawarma sandwich (about 450-650 kcal), hawawshi (about 600-850), kofta sandwich (about 400-600), sausage / sogoq sandwich (about 450-650), liver / kebda sandwich (about 350-500), breaded chicken / pane sandwich (about 550-750), macaroni tagine portion (about 500-800).
- Do NOT include the menu's phone numbers or prices. If an item name is unclear to you, keep it out instead of guessing.
- Fight-camp view: show protein per item, a "fits today?" tag using calories left, and swaps (extra meat, less bread/sauce, add salad, share the side). No food is "bad"; show the trade-off.

## PART 10 — Make me want to open it (daily pull, honest)
- A 5-second **Today entrance**: one big "Your one thing today", the ring, streak flame + rest shield, camp countdown if active, a kind one-line message from real data ("3 sessions this week, good."). No fake urgency, no loss-aversion tricks, no guilt.
- **Win moments:** small celebration on first scan, 7-day streak, new weight milestone, level up, trophy at the end of each journey level. Short, skippable, reduced-motion safe.
- **Progress you can see:** weight trend, strength/training log, sleep bars, face-scan changes, height/posture trend; Journey path; share cards (hide private items).
- **Weekly Leader Review** (Part 4) is the Sunday ritual.
- Performance: Today loads under 1 s on a mid phone; lazy-load heavy screens; skeletons not spinners.

## PART 11 — QA and honest report
1. Run self-check, unit tests (add tests for safe pace, earliest-date calculator, deficit floor, under-18/unknown-age guard, calorie adjust step), `tsc --noEmit`, production build; report main chunk gzip size.
2. Verify by reading code: age gate hides the weight-cut tools for under 18 and unknown age; no dehydration / sauna / diuretic instruction anywhere (grep for water cut, sauna, diuretic, sweat suit, fasting plans); no placeholder names; no fake numbers.
3. Verify what you can in the preview; list what you could NOT verify (real phone, Share Target, Health Connect, push).
4. Final report: what works, what is not finished, 5 weakest points, and the exact env vars needed (only `GEMINI_API_KEY` is required).

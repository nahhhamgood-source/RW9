# ASCEND — Master Build Prompt (merged: R9 ASCEND + PROJECT ASCEND + ASCEND.OS ideas)

Build "ASCEND": a PERSONAL, 100% OFFLINE, single-user appearance-progress and self-care system. English only. One user (me). No accounts, no login, no backend, no leaderboard, no ads, no paywall, no network calls at runtime.

**Success definition:** after 3 months I am more consistent with self-care, I understand my skin and hair, I look after my health, and I have my own style. Everything is judged by that, not by feature count.

## 0. PRINCIPLES (override everything below if they conflict)
1. REAL OVER PRETTY: zero fake data, zero random numbers shown as results, zero lorem ipsum, zero decorative buttons. Every button works, every chart uses stored data, every checklist persists.
2. FEWER, BETTER: exactly ~30 curated protocols (not 200+), each one clear and doable. No giant libraries for the sake of size.
3. HONESTY: every tip carries an evidence tag: "Proven" / "Likely works" / "Not proven". "Learn more" shows a 1-2 line "Why" in simple words.
4. COMPARE ME TO ME: progress is only versus my own past. No comparisons to other faces/bodies/celebrities.
5. SAFETY: no bonesmashing, DIY injections/fillers, steroids/SARMs/hormones, extreme dieting/dehydration, jaw devices, forced jaw positioning, or aggressive chewing protocols. Medical topics (tretinoin, minoxidil, finasteride, isotretinoin, orthodontics, fillers, surgery) = neutral info card only: what it is, evidence, risks, "talk to a doctor/dermatologist". Never dosing.
6. NO DEGRADING LANGUAGE: never "subhuman", "ugly", "incel", "LTN/HTN". Use "focus area". Tone: calm, direct, professional. No hype, no motivational-speaker talk.
7. CARE CHECKS: if I log very low calories/weight or scan more than 3 times a day, show a gentle caution card and suggest a break. Footer: "Self-tracking estimates, not medical advice."

## 1. STACK
React + Vite + TypeScript + Tailwind. Dexie (IndexedDB) for ALL data. JSON export/import backup (optional encrypted backup). PWA with a proper service worker, Capacitor-ready for APK. Mobile-first (360-430px), no horizontal scroll. Local notifications via Capacitor LocalNotifications, falling back to in-app reminders.
UI: follow section 1B (Design Direction). Dark theme with light-mode toggle. Fast startup, smooth 60fps, animations only where they carry meaning (ring fill, chart draw, check-off).
Reliability: ErrorBoundary per screen; every async task has a timeout + Retry; no alert()/confirm() (use sheets and toasts); offline status indicator.
Content lives in typed JSON/TS data files so I can edit it.

## 1B. DESIGN DIRECTION (premium modern health-app look; build with real data only)
Overall feel: a polished dark "health OS" like top-tier wellness apps: soft glass-like cards, big readable numbers, circular progress rings, calm spacing. Premium but FAST: no heavy blur stacks or large gradients that hurt performance on mid-range Android.

**PRIMARY VISUAL REFERENCES (match these two above all others; user's top picks):**
(A) "LitFit" dashboard: deep black-green glass cards with soft green glow, rounded floating pill bottom nav + circular sparkle/quick-action button, Dashboard with D / W / M / Y toggle, big "Move goal" style segmented bar, curved sleep arc with bedtime/wake cards, "Your current state" tiles, profile with round award medals + quick-link icons, greeting "Good morning, {name}", suggestion chips.
(B) Mood/health app: dark forest-green charcoal background, pastel mint / butter-yellow / lavender used for rings, bars and charts; "How are you today?" greeting with 7-day strip and mood faces; concentric 3-ring Health Overview with three big stats underneath; crescent-moon sleep score with sleep-stage step chart; mood tracker row; tab switcher Today / Week / Month / Year; bento grid of small cards on Home (dot-grid streak card, weight mini-chart, bar chart, donut).
Combine them: LitFit's glass cards, glow and floating nav + the mood app's pastel ring/chart palette and bento Home grid. Default accent = mint green (#7FE0C4-ish) with butter-yellow and lavender as secondary series colors.
IMPORTANT: copy the LAYOUT and STYLE only. Their sample numbers are fake and must not appear: no "Metabolic Age", no fake "Daily Health Score", no "AI is creating suggestions" loader, no resting heart rate unless I enter it manually. Every value comes from my own logs, with a clean empty state until I log something.

**Colors**
- Background near-black charcoal (#0A0A0F to #0F1411), cards slightly lighter (#12121A / #171A1D) with 1px subtle border and 20-28px rounded corners. Optional very soft radial glow behind the hero card only.
- One PRIMARY accent (default electric violet or mint-teal; user can switch accent in Settings from 4 presets).
- Semantic status colors used consistently everywhere: green = on track, amber = needs attention, red = missed/low. Soft pastel secondary tones (mint, butter yellow, lavender) allowed for rings and chart series.
- White primary text, muted gray secondary text, high contrast.

**Typography**: modern geometric sans (Inter / Plus Jakarta Sans / Manrope, bundled locally, no CDN). Large bold numbers for key stats (score, %, streak), small uppercase muted labels, clean hierarchy.

**Signature components (reuse everywhere)**
1. **Week strip** at top of Home/Protocol: Mon-Sun pills (or dashed circles) showing check mark = day completed, highlighted ring = today, empty = future. Tap a day to view/edit that day. Prev/next arrows and a "Today" chip.
2. **Hero score card**: ring + big number + one-line message + streak (e.g. "Routine Score 75, 3-day streak, keep it up to hit your weekly goal"). Score = real % of today's planned tasks done (weighted by minutes). Never invented.
3. **Routine rings**: separate AM Routine and PM Routine cards, each a circular progress ring with sun/moon icon and %. Plus an overall "Today's Tasks" ring.
4. **Metric tiles row**: compact 4-up tiles (Water, Protein, Sleep, Steps/Workout) with icon, value/target, label. Values come from my logs; empty state says "Log it" instead of fake numbers.
5. **Daily score bar chart (7 days)**: colored bars by score (green high, lime mid, red low), value on top of each bar, day labels with "Yday/Today".
6. **"Strongest" vs "Needs focus" cards**: last 7 days, show the habit with highest and lowest completion with a mini ring and %. This directly answers "which habits improved and which need work".
7. **Habit completion rate list**: horizontal progress bars per habit (all-time %), color-coded, sorted.
8. **Concentric ring health overview** (3 rings, e.g. consistency / sleep / skincare adherence) with the 3 numbers underneath, plus week/month/year segmented toggle (D / W / M / Y).
9. **Sleep screen**: moon-style score, sleep time, irregular days, step chart of bedtime-to-wake blocks (only if I log bed/wake times; otherwise simple duration chart).
10. **Skin Diary**: month calendar with dots on days I logged, tap a day for notes/photo, "Average hydration/feel" bar from my own ratings, and a Texture/Look compare (before/after slider) from my own photos.
11. **Progress line chart**: smooth gradient-filled line (e.g. PSL LAB estimate or Skin rating over W1-W4/months) with highlighted last point and week/month toggle. Axis labels simple (High/Med/Low or real numbers).
12. **Mood/energy tracker**: simple emoji row per day (7 faces) + weekly mini chart.
13. **Awards**: round medal badges for real milestones (7-day streak, first scan, 30 workouts, 8 weeks of SPF), shown on Profile with "See all".
14. **Quick-link icon row** on Profile: Add Goals, Add Product, Add Measurement, Add Skin Note (4 round icon buttons with labels).
15. **Day greeting**: "Good morning, {name}" + date. Optional "How are you today?" mood check as first card.

**Navigation pattern**: floating rounded pill bottom bar (4 items with icon + label, active item in a highlighted pill) plus a separate circular floating action button on the right for QUICK LOG (water, weight, mood, skin note, photo). Top bar: small app logo left, bell or gear right.
- Bottom pill items: Home · Routine · PSL LAB · Progress
- Care (Skin Lab / Hair & Grooming / Style) and Academy are large module cards on Home, and Settings is the gear icon top-right. Nothing is more than 2 taps away.

**Rules for the design**
- Every number on screen is computed from stored data. If there is no data yet, show a clean empty state with one clear action button (never sample data, never "N/A" walls).
- Do NOT add fake "AI is analyzing..." loaders, fake health metrics (no cortisol, "metabolic age", or health scores that cannot be measured), or fake social features. Progress bars are shown only when something is really running (model load, export).
- Touch targets >= 44px, readable in sunlight, works one-handed, respects system font scale.
- Skeleton/empty/error states for every screen. 

## 2. NAVIGATION
Bottom pill: Home · Routine · PSL LAB · Progress, plus floating Quick Log button. Care and Academy via Home cards; Settings via gear icon.

## 3. PHASE ORDER (finish + test each phase; if budget runs out, stop at the end of a finished phase and tell me which is next)

### Phase 1 — Architecture, profile, Home
- Skippable first-run setup (all editable later): name, age, sex, height, weight, waist (optional), skin type + concerns, hair type + concerns, gym level, workout days, equipment, sleep hours, sun exposure, goals, daily time available (15/30/60/90 min).
- Home: today's checklist (6-10 tasks), progress bar, streak, level/XP, "Next best action" card, date selector for past days, weekly consistency, quick access to modules. All numbers come from the database.

### Phase 2 — Daily Protocol engine + Care
- Protocol engine: deterministic, rule-based plan generator from profile + latest PSL LAB focus areas + logs. Morning / Afternoon / Evening blocks. Tasks are editable, addable, removable, reschedulable, with completion history. Gradual weekly progression (Week 1 foundations, 2-4 build, 5-12 push) shown as a 12-week roadmap.
- The ~30 protocols (each: title 2-4 words, 1 sentence max 12 words starting with a verb, minutes, XP, category, up to 4 steps, evidence tag, Why):
  - Sleep & recovery (5): fixed sleep time, wind-down, morning light, caffeine cutoff, weekly review
  - Hydration & food (4): water target, protein target, limit alcohol/sugar day, balanced meals
  - Skin (7): gentle cleanse AM/PM, moisturizer, SPF 30-50 + reapply, patch test, barrier-reset week, breakout/irritation journal entry, optional active ramp-up (only after basics are stable, gentle, with dermatologist warning)
  - Hair & grooming (5): wash schedule by hair type, scalp care, barber card, brow clean-up, hygiene checklist (teeth, nails, deodorant)
  - Posture & movement (5): chin tucks, wall angels, thoracic mobility, posture breaks, 15-min mobility flow
  - Training (2-3): beginner 3-day full body, optional neck/traps add-on (progressive, safe form cues)
  - Presence (2): eye-contact/voice drill, one photo-practice session
- Skin Lab: skin-type questionnaire, AM/PM routine builder, product inventory (only what I own), usage tracking, breakout + irritation journals, consistency stats, "see a dermatologist" warning for persistent problems. Gentle first: cleanser, moisturizer, SPF; actives are info + ramp-up guide, never default.
- Hair & Grooming: routine builder, wash schedule, product inventory, haircut references by face shape (from scan), barber phrase cards, favorites saved locally, maintenance reminders.
- Style: small wardrobe inventory, outfit combos, daily outfit planner, fit and color basics (offline).
- XP: per task, full-day bonus, streak multiplier up to 1.5x, 1 free streak freeze per week, level XP = 100 * level^1.3, ranks and badges for real milestones. XP rewards CONSISTENCY, not appearance.

### Phase 3 — PSL LAB (core feature) + Photo Journal
Camera via getUserMedia with live oval/profile guide, live hints ("face detected", "turn 10 degrees left", "too dark", "remove glasses / hair from forehead", "neutral expression"), auto-capture after 1 s stable, 3-second timer, Upload option. Capture: Front, Left 45°/profile, Right 45°/profile (+ optional smile).
- MediaPipe Face Landmarker (478 landmarks) ON DEVICE. Bundle WASM + .task model in public/mediapipe/, load from local paths, preload at startup, show "Scanner ready". On failure: clear error + Retry, never a fake result.
- Quality gate: reject on roll/yaw/pitch out of tolerance, no face, eyes closed, mouth open, face too small, blur, too dark. Say exactly why and how to retake.
- Measurements (normalised by interpupillary distance or face width; show raw value, typical range, status): facial thirds, fWHR, cheek vs jaw width, chin ratios, canthal tilt (L/R), eye aspect ratio, eye spacing, brow height/tilt, symmetry (mirrored landmark pairs; list biggest asymmetries), mouth vs nose width, lip ratio, midface ratio. From profiles (marked "approximate"): gonial angle estimate, chin projection, E-line, submental angle, forward head posture.
- Honest score: a "PSL-style estimate" out of 8 on a calibrated curve (most people 4.0-5.5, 7+ extremely rare, no inflation) with tiers: Developing <3.5, Mid 3.5-4.9, High 5.0-5.9, Top 6.0-6.9, Elite 7.0+; sub-scores: Symmetry, Proportions, Jaw/Neck, Eye area, Skin (texture/evenness/redness), Leanness. Always shown with: "PSL is an internet scale. This is a rough estimate from one photo, not science and not your worth." Never claim to measure attractiveness, bone structure, or medical conditions. Lighting and distance change values: use the same setup every time (arm's length, same light, neutral face).
- Results: top 3 strengths, top 3 focus areas; for each focus area, actions ranked by real impact (body fat, skin routine, haircut, brow grooming, posture, neck training, lighting, smile care) and a clear note on what cannot change without medical help. "Add to my plan" converts focus areas into protocol tasks.
- Photo Journal: history, weekly comparison slider, metric trend charts, rescan reminder every 14 days (not more often), photo-quality-consistency score, local deletion, thumbnails on/off. Only measurements + optional small thumbnail are saved.
- Photo tips card: eye level, distance distortion, window light, no filters.

### Phase 4 — Lifestyle trackers + Offline coach
- Trackers with simple charts: weight, waist, body-fat estimate (US Navy method, formula shown, "approximate"), water, sleep (hours + quality), mood/energy, workout log (sets x reps x weight, estimated 1RM, PRs, rest timer). Calorie/protein calculator (Mifflin-St Jeor, formula shown, safe floors, realistic pace). Facial fat cannot be spot-reduced.
- Offline rule-based coach: answers only from my data + local library; understands intents ("why is my face puffy", "what should I do today", "fix my skin", "explain my scan", "what haircut suits me", "analyze my month"); max 4 short bullets + "More"; can add suggested tasks to today with one tap; honest about limits; escalates to doctor/dermatologist when appropriate.

### Phase 5 — Progress, Academy, Settings
- Progress: daily/weekly/monthly consistency, skincare/haircare/grooming/posture adherence, sleep and activity consistency, PSL LAB trend, weight/waist trend, streaks, heatmap, before/after slider, weekly review (Sundays, auto-generated), monthly "Ascension report" exportable as image/PDF. Answers the question: "which habits improved and which need work?"
- Academy: ~14 deep guides (sleep, hydration/debloat, body fat & the face, skin, hair, facial hair & brows, eye area, jaw/chin/neck, posture & frame, training, teeth/smile, style/grooming, presence, photography). Each: 3-bullet summary, steps, common mistakes, myth vs reality, evidence tag, when to see a professional. Searchable offline. Plus a Glossary (PSL, canthal tilt, fWHR, gonial angle, submental, mogging, hunter eyes, softmaxxing/hardmaxxing...) with an honest take, and a Myths Wall of 40+ viral claims with verdict True / Partly true / False.
- Honest on bones: adult bone structure does not change from exercises, mewing, chewing, or "hunter eyes" tricks (tag "Not proven"). What really changes how a face looks: body fat, skin, hair, grooming, posture, sleep, puffiness, sun care, teeth/smile, glasses/clothes, neck/traps/shoulders.
- Settings: units, dark/light, reminders (morning routine, SPF reapply, workout, sleep prep, weekly scan), thumbnails, export/import (optional encryption), optional PIN lock (local), storage management, delete-all (typed confirmation), "About these scores".

## 4. DELIVERABLE
Complete working app + README (run, APK build with Capacitor, where MediaPipe files live, how to add protocols/guides). Run the build, fix all TypeScript errors, and test: setup, daily plan, task completion, workout logging, scan with camera denied / no face / good photo, results, add-to-plan, coach, backup/restore, and OFFLINE mode (network off). Reply with a SHORT list of what works and what you could not finish. Do not claim anything works that is only a placeholder.

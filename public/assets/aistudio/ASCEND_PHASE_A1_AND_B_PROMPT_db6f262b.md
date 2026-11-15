# ASCEND — Phase A.1 (fixes after my first test) + Phase B (Height Growth)

Phase A is good: I like the new look and structure. KEEP IT. From now on DEVELOP the app, do not redesign it. Rules for everything below:
- Do NOT rename or remove any existing feature or label. If something was moved, it must stay reachable from the "More" screen. Where you renamed or hid something in Phase A, restore its original name and place (list what you restored).
- Zero fake data. Everything from my logs, shown formulas or bundled public datasets. Keep the under-18 safety rules.
- Work in this order: A.1 first, then Phase B. Output only the changed files (complete). After A.1 write "A.1 DONE" with a 5-line status, then continue straight into Phase B and stop with "PHASE B DONE".

## PHASE A.1 — Fixes

### 1. Food must be one tap away (nav + Food tab + More)
- Bottom bar becomes 5 items: **Plan · Food · Face · Grow · Health**, plus the "+" button. The top bar keeps Ask coach, reminders and the avatar.
- **Food tab (new):** today as a timeline with **Breakfast, Lunch, Dinner, Snacks**. Each meal card lists what I ate with calories and protein and has a small "+ Add". A calories ring (eaten / target / left) and a protein ring at the top, a water tracker, and buttons: **Scan meal**, **Quick add**, **What should I eat?**, **Repeat yesterday**. The meal type is chosen automatically by the time of day and can be changed in one tap. Under-18 / still-growing rules stay (no deficits).
- The "+" sheet: Meal now asks for the meal type (Breakfast / Lunch / Dinner / Snack), then Scan or Quick add.
- **More screen** (from the avatar or a "More" row in the top bar): a searchable list of EVERY module so nothing is hidden: Progress/Insights, Trackers, Skin Lab, Hair & Grooming, Style, Academy and Myths, Quit list, Reminders, Coach, Backup, Settings.
- Add a compact "Today at a glance" row under the Now card: calories left, water, workout, sleep. Pro mode shows the denser details that existed before.

### 2. "Do this now" logic and the "(optional)" label
- Never pick an optional task as the main "Do this now" unless nothing else is left. Priority: due reminders (water, meals, skin by time of day) → essential tasks → my focus tasks → extras.
- Remove "(optional)" from titles. Use a small "Extra" badge and a one-line explanation ("Good bonus, skip it if you're tired"). Title example: "Neck set" + badge.

### 3. Every how-to task gets a "Watch" link (no images needed for now)
- For every exercise or task that needs a demo, add two buttons: **Watch on YouTube** and **Watch on TikTok**. They open a search for the exact exercise name plus "proper form" (for example https://www.youtube.com/results?search_query=dead+hang+proper+form and the matching TikTok search URL), in a new tab with rel="noopener". No API keys, no embedded players. If offline, show "Needs internet".
- Keep the 3-4 short text steps, the dose (sets/reps/seconds) and the evidence tag. Images can be added later through /public/exercises/{slug}.webp; if a file exists, show it, otherwise just the Watch buttons.

### 4. Restore the names I liked, calmer words
- Face results show the PSL-style tier names again: Chad (Elite) · Chadlite · HTN (High-Tier Normie) · True Normie · LTN (Low-Tier Normie) · Developing, with a Settings toggle "Slang tier names" ON by default. Never hide them behind Pro mode. No harsh words like "unattractive".
- Tone: default **Normal** (clear and short: no "hi", no jokes, no chatty filler). "Chill" stays as an option. The greeting uses my real saved name; if none is saved, say "Good afternoon" without a name. Never show a placeholder name like "Alex".

### 5. Make me FEEL the progress (accomplishment visuals, all from real logs)
- A progress ring for today on Now and Today.
- A 7-day bar chart on Plan (completion % per day, green/amber/red, value above each bar).
- A **90-day Journey path**: a map of levels (Level 1 = Days 1-7, and so on) with day nodes: completed / today / locked, a trophy node at the end of each level. Finishing a level shows a small celebration and unlocks the next one.
- An XP bar with the level, a streak flame with the rest shield, and milestone toasts.
- Empty states say what to do first. Animations are short and respect reduced motion.

## PHASE B — Height Growth ("Grow"): practical, honest, motivating
Goal: not just a height log. A full "how to grow taller and stand taller" hub like the paid apps, free, but truthful about what each habit really does. The Grow tab shows, in this order:

1. **Top cards:** Current height | **Height outlook** (a range with the formula under "What's this?"). Mid-parental estimate: boys (father + mother + 13) / 2, girls (father + mother − 13) / 2, shown as a range (about ± 8.5 cm). Ask for the parents' heights if missing.
2. **Posture gain:** "Good posture and spine stretching can give back up to about 1-2 cm of apparent height after sitting." State clearly that this is not bone growth.
3. **Height / Age chart** with percentile curves from the public WHO/CDC growth tables (LMS) and my own points (a line that animates in). If you cannot get the official tables, hide the curves and say "Percentile unavailable"; never invent numbers.
4. **Taller than X% of people your age** (from the LMS formula, real data only).
5. **Growth complete ≈ Y%:** my current height divided by the middle of my outlook range, labelled "approximate". If I am probably finished growing, say so plainly with the reasoning.
6. **Dream height:** my goal, the honest gap in cm, and "chance to reach it": Low / Medium / High with an approximate percent computed from a normal distribution around the outlook (SD about 4.5 cm, documented in code). Show it only when parents' heights are known; always add "rough estimate, adult height varies".
7. **Daily Growth Routine** (a checklist like the paid apps, with a streak and a Growth Habits Score from my real check-offs). Each item has dose, a Watch link, an evidence tag and "Ask why":
   - Sleep on time, 8-10 h for teens (7-9 adults) — Proven for health and growth hormone release in sleep.
   - Protein at every meal; calcium foods (milk, yogurt, cheese) and vitamin D foods — Likely works (only if the diet is lacking).
   - 15 minutes outdoors in daylight — Likely works.
   - Dead hang 3 x 20-30 s (skip if shoulder pain), cobra stretch 3 x 10, child's pose, superman hold, cat-cow — posture and spine health, temporary decompression: Likely works for apparent height; Not proven for bone growth.
   - 20+ minutes of jumping, skipping or basketball/swimming — Likely works for general growth and bone health.
   - Posture check 3 times a day, water.
8. **Supplements and "tricks" (info cards only, never tasks):** vitamin D, calcium, omega-3/fish oil, zinc, glucosamine, collagen, "growth pills", milk + honey. Plain verdict: "Not proven to add height. Only correct a diagnosed deficiency with a doctor." Growth hormone, steroids and limb-lengthening surgery: what it is, evidence, risks, "doctor only". No dosing, no sourcing.
9. **Programs with 7-day dots and levels** (same UI as the face programs): Spine & Posture, Stretch & Flow, Active Play.
10. **"Can I still grow?" card:** age-based explanation (growth plates close at different ages, a bone-age X-ray is how a doctor knows for sure), plus "talk to a doctor" for very slow growth or delayed puberty. If I am probably finished, the tab switches to "Stand taller" mode (posture, mobility, spine decompression, footwear/presentation tips).
11. **Achievements:** a real "since you started" line ("+1.2 cm measured", "14-day routine streak"), monthly measuring reminder with the measuring guide (barefoot, back to the wall, same time of day, average of 3), and an "Ask coach about height" button.
No forum, no fake countdown timers, no "optimize up to X cm" promises, no paywall.

## Acceptance checks (report pass/fail honestly)
1. Food is reachable in one tap (Food tab) and I can log breakfast, lunch, dinner and a snack separately, with calories left updating.
2. The Now card never shows an Extra task before essentials; no "(optional)" in titles.
3. Every exercise opens YouTube and TikTok searches correctly.
4. PSL tier names show again; greeting has my real name or none.
5. Ring, 7-day bars and the 90-day Journey path show real data and look good on a 360-430 px screen.
6. Grow tab shows all 11 parts, uses real data only, with "Not enough data yet" where needed.
7. `tsc --noEmit` and the production build pass; nothing that worked before is broken.

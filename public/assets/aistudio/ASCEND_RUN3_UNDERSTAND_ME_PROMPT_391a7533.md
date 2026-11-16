# ASCEND — "UNDERSTAND ME" MODULE (deep personalization, send after Run 3 + Add-on)

Keep everything already built. Develop, do not redesign. Zero fake data. No code in replies. After each part: `tsc --noEmit`, build, 3-line status. If budget ends: "RESUME FROM: <part>".

## GOAL
The app should feel like it knows this user, not like a generic fitness app. Everything below is stored ONLY on the phone (Dexie), editable and deletable in Settings > "About me", and only sent to the AI coach if he opted in to online features.

## PART 1 — "About me" profile (seeded, editable, never invented)
Pre-fill these as SUGGESTED answers he confirms with one tap (never assume silently; show "Is this right?"):
- Lives in Egypt. Local foods and street food matter (shawarma, hawawshi, kofta, sausage, liver, pane, macaroni tagine, ful, ta'miya, koshari, fiteer).
- Trains: gym (a few months in) and MMA (a couple of months in). Competition coming: tournament + weight class set by his coach. Ask age, current kg, target kg, date.
- Eating pattern he reported: often skips breakfast (only coffee with milk) and overeats at lunch.
- Identity: looksmaxxing is part of who he is; wants a glow-up mentality, tiny bites for face, body and mind, study and programming time, light prayer check-ins (optional), a short motivational line (not excessive).
- Wants: quit-bad-habits support with no shame, an AI coach that is friendly, picture-first and short text, the app does the work for him.
Settings > About me shows every stored item with Edit and Delete, plus "Delete everything about me".

## PART 2 — Pattern detection (real logs only, plain words, no guilt)
Compute from his own data and show as small "I noticed" cards (max 2 a day, each with "Why?" and a "Not useful" button that stops that card type):
- **Breakfast gap:** if breakfast is skipped 4+ of the last 7 days and lunch calories are above his usual, suggest a tiny fix: "Add 25-30 g protein in the morning (eggs, ful with egg, yogurt, milk). It usually makes lunch easier to control." Evidence tag: Likely works, individual results vary. Never "you must eat breakfast".
- **Big-lunch plate tip:** when lunch is more than about 40% of the day's calories, offer the plate method (protein first, half veg/salad, then bread/rice portion) and a "same lunch, smaller carbs" swap. Not a rule, a suggestion.
- **Training load vs sleep:** when sessions are high and sleep is under his target for 3+ nights, say so and suggest an easier day. Performance first.
- **Weight trend honesty:** use 7-day averages; ignore single-day swings; say "normal day-to-day change is about 0.5-1.5 kg of water and food".
- **Consistency by time of day:** which reminders he actually completes, and move the weak ones to a better time (ask first, one tap Accept).
Every card uses only real logged data; if there is not enough, say "Not enough data yet, log X for N more days".

## PART 3 — Daily rhythm (the app adapts to his day)
- Morning: one glance card: today's training (gym / MMA / rest), calories and protein plan, the 6 daily tasks, camp countdown.
- Training day logic: carbs and fluids reminder before, protein after; rest day: lighter plan; hard sparring day: a recovery nudge at night.
- Evening: 2-minute wind-down: tomorrow's plan, screen-down reminder, skin PM, neck set, optional prayer/reflection. One tap "Day done" that closes the ring.
- Quiet hours respected; no reminder during his logged training window.
- Friday and holidays: optional "relaxed day" with fewer tasks.

## PART 4 — Coach that knows him (consent required)
`/api/coach` system prompt (server-side) gets an optional context block built from About me + last 7 days summary (numbers only, no photos, no names of private habits). Rules for the coach:
- Answer first in 2-4 short sentences, then offer one next step. Friendly, direct, honest, never preachy, no shaming.
- Egyptian context aware: suggests local foods and realistic budgets.
- Fight-camp aware: never advises dehydration, sauna, diuretics, fasting, supplements with doses, or banned substances; sends weight-class questions to his coach and a doctor.
- Says "I don't know" or "not proven" when true. Evidence tags on claims about looks, height, jaw and bones.
- Under 18 or unknown age: no deficits, no cutting.
- Offline: local FAQ + the pattern cards above (no AI needed).
Show a clear line before sending: "This sends a short summary (no photos) to the coach. Turn off in Settings."

## PART 5 — Language comfort
- Keep English as the main language. Add an optional "Arabic hint" toggle: key buttons and the daily one-liner show a short Arabic gloss under the English (Egyptian-friendly wording). RTL-safe layout, no broken alignment. All strings in i18n files.
- Numbers, units: kg, cm, kcal; allow Arabic-Indic digits as an option.

## PART 6 — Emotional tone and motivation (honest)
- Short daily line from real data ("3 training sessions this week. That's real."). No fake hype, no comparison to other people, no "you're behind".
- Bad day mode: one tap "Rough day" shrinks Today to 2 tasks and the coach replies kindly. If he writes anything suggesting real distress, the coach responds with care and suggests talking to someone he trusts or a professional; the app never plays doctor.
- Looksmaxxing healthy-frame card: "Looks are one part of you. Sleep, fitness, skills and people matter more for how life goes." Shown rarely, not preachy.

## PART 7 — Privacy and control
- A "What the app knows about me" screen listing every stored category, size, and a delete button each. Export all (JSON) and optional encrypted backup.
- No analytics, no third-party trackers. Online features are opt-in and each states exactly what leaves the phone.

## PART 8 — QA
Unit tests for pattern-detection rules (breakfast gap, big lunch, load vs sleep), the age gate, and the "not enough data" cases. Report: what works, what you could not verify on a real phone, 5 weakest points, env vars needed (only GEMINI_API_KEY is required).

# ASCEND — REAL LIFE PATCH: "I'm at a wedding, I'm not touching my phone"

Send this together with, or right after, the FINAL POLISH prompt. Keep everything already built. DEVELOP, do not redesign or rename. Zero fake data. Keep every safety rule (under-18 / unknown age, no dehydration or banned-substance advice, no shaming, evidence tags). No code in replies, short summaries only. After each part: `tsc --noEmit`, build, 3-line status. If budget ends: "RESUME FROM: <part>".

## THE PROBLEM
A person who eats at weddings, birthdays, family lunches and restaurants will NOT take out his phone and log. If the app only works when he logs in the moment, it fails exactly on the days that matter, and he stops opening it. The app must work with LATE, PARTIAL and MISSING data, never punish gaps, and make catching up take seconds.

## THE RULES
1. A missing log is not a failure and never produces guilt, red states, "you broke your streak" or a "you missed" message.
2. The app never assumes silently. Anything it fills in is marked "estimate" and one tap fixes it.
3. Every behaviour below is a SETTING (Settings > Food & Calories > "Real life"). Defaults are listed; each can be turned off.
4. Calorie counting stays NORMAL and complete by default: daily calories, protein, rings, targets, camp plan. These options only add ways to get the data in.

## PART 1 — Catch-up logging (fast, anytime, up to 7 days back)
- **Day picker everywhere:** the Food tab and "Tell me" box have a date chip (Today / Yesterday / 2 days ago / pick date) and a meal chip. Logging yesterday takes the same 10 seconds.
- **Gallery import (best idea for events):** a button "Add photos from my gallery". He takes 1-3 normal photos of the plate at the party (or any photo with food), and later picks them (multi-select). The app reads each photo's capture time to group them into meals, runs the existing food scan, and shows result cards to confirm in one go. Works with the phone's normal camera, no ASCEND open needed during the event. Strip location data; never upload without the online-features consent; say what is sent.
- **Voice note later:** at night he can say once "Lunch was fiteer and tea, dinner was my aunt's mahshi, about 2 plates" and the app splits it into meals (reuse the Food Chat parser).
- **Share into ASCEND:** Web Share Target accepts text and images: a screenshot of a delivery order (Talabat, Elmenus, etc.), a WhatsApp message to himself ("lunch: koshari large"), or a photo. The app parses it into a draft meal to confirm. Honest note: it reads what is on the screenshot, it cannot see inside other apps.
- **Home-screen shortcuts:** PWA manifest shortcuts and a Capacitor quick action: "Talk to ASCEND" (opens the mic immediately), "Add meal", "Water +1", "Trained". Reachable from a long-press on the app icon.
- **Notification with quick reply (APK):** at a time he picks, a local notification "Quick one: how was eating today?" with action chips (Light / Normal / Heavy / Big event) that log without opening the app. In the PWA, tapping opens a one-screen sheet with the same chips.

## PART 2 — "Out today" Event mode (planned or after the fact)
- A button on Today and Food: **"I'm out today"** (also "Event" in the "+" sheet). Choose event type: Wedding / Birthday / Family lunch / Restaurant / Street food outing / Travel day / Other.
- When ON for the day: food reminders pause, the daily calorie ring shows "Event day (estimated)", and there is no red/overshoot state. A tiny optional note: "Have fun. Tell me roughly how it went later."
- **Plan-ahead tips (optional, short, no starving):** do not skip meals before the event; keep protein normal earlier in the day; drink water normally; eat slowly and start with protein and salad if available; enjoy the food. Never suggest fasting, dehydration, laxatives or "earning" food with exercise.
- **After the event (1 tap, any time):** "How did it go?" with chips: Light (about 300-500 kcal) / Normal (600-900) / Heavy (1000-1400) / Very heavy (1500+), tied to the event type for a default (a wedding buffet or a big family lunch defaults to Heavy). One optional follow-up: "How many plates?" or "Dessert? yes/no". The app saves an estimated meal with a visible range and confidence "Low", and offers "Add details" (voice, gallery photos, pick foods) if he wants more precision.
- **Event presets library (estimates, editable):** wedding buffet plate, celebration cake slice, family Friday lunch (rice, vegetables, chicken or meat), mahshi plate, grilled meat plate, restaurant main + sides, soft drink, dessert. Each preset shows a calorie range and protein range labelled "estimate".
- **No compensation:** the next day is a normal day. The app never lowers calories to "pay back" an event. For fight camp, it shows the weekly average and says one event barely moves the weekly trend. If he wants, a weekly budget view absorbs it (Part 4).

## PART 3 — Autopilot gap filling (the app helps, he does not have to remember)
- **Next-morning check-in (default ON, 1 screen):** in the Morning Briefing, "Yesterday has gaps. Fill in?" with only the missing meals, each with: "Same as usual" / "Event" / "Skipped" / "Say it" (voice) / "Skip, don't track". "Skip, don't track" is always allowed and never nags again for that day.
- **Meal memory:** the app learns repeating situations from his own logs (for example "Friday family lunch", "gym day dinner", "weekday breakfast = Nescafe with milk") and offers them as pre-filled drafts to confirm with one tap. Never auto-saves without a tap unless the setting "Auto-fill usual meals" is ON (default OFF).
- **Smart prompts by context:** if the day has a gym or MMA session logged but no food, suggest the post-training meal he usually has. If it is Friday and there is no lunch log by 6 pm, ask once.
- **One question per day:** at his chosen time (default 9 pm), a single "How was eating today? Light / Normal / Heavy" tap creates an estimated day total if nothing was logged. Can be turned off or moved.
- **Partial-day honesty:** every day is labelled Complete / Partial / Estimated / Not tracked. Averages, weekly trends and the diet auto-adjust use only Complete and Estimated days with their confidence, never silently treat missing data as zero. The weight trend (7-day average) remains the main truth for fat loss; the calorie log supports it.
- **Streaks:** logging gaps never break the app streak; the streak counts "checked in" (any tap: a log, an event chip, a Day done), not perfect logging.
- **Calibration over time (precision without effort):** after 3+ weeks of weight and calorie data, the app estimates his real maintenance calories from the trend (adaptive estimate: average intake versus weight change), labelled "estimate, improves with data", and offers to update the target with one tap. This is more accurate than any single meal estimate.

## PART 4 — Precision and calorie-counting options (Settings > Food & Calories)
Default stays: **normal, complete calorie and protein counting**. Honest line in Settings: "Photo and voice logging is an estimate (often within 15-30%). More detail gives better numbers."
Options (each with a one-line explanation):
- **Logging detail:** Easy (everyday units, default) / Balanced (adds portion confirmation and common brands) / Precise (optional grams, kitchen scale mode, packaged-food barcode scan using a free product database when online, nutrition-label photo reader). Precise never becomes required.
- **Budget view:** Daily (default) / Weekly (a weekly calorie budget so a big event is absorbed over the week, with a plain progress bar).
- **Show numbers:** Full (calories and protein everywhere) / Simple (rings and "on track / low / high" words) / Hidden numbers on Today (only in Food). For people who feel pressure from numbers; default Full because he asked for normal counting.
- **Real life features:** Event mode (on), Gallery import (on), Next-morning check-in (on), Daily one-question check-in (on at 9 pm), Auto-fill usual meals (off), Share-into-ASCEND (on), Estimated days included in averages (on, with confidence weighting).
- **Reminders for food:** off / only if nothing logged by a chosen time / mealtime nudges. Quiet during events.
- **Protein and target:** auto from his profile or manual; age gate stays (under 18 or unknown age: no deficit tools).
Everything has an "Ask why" and a Reset to defaults.

## PART 5 — Out-of-the-box helpers (build the ones that fit, keep each optional)
1. **Menu helper before a restaurant or event:** he can photo a menu or type the place's dishes and the app suggests the option that fits his protein and calorie plan with one line of reasoning. Estimates only.
2. **"What did I probably eat?" recall mode:** a 30-second guided recap at night: picture chips of common foods by meal slot (bread, rice, chicken, meat, vegetables, sweets, drinks) he taps, then portion chips. Faster than typing and good when memory is fuzzy.
3. **Family meals as templates:** save "Mom's Friday lunch" once with his usual portion; reuse with one tap, edit the portion, done.
4. **Weekly 2-minute "fill the gaps" review (Sunday Leader Review):** shows the week as 7 dots (Complete / Partial / Estimated / Not tracked). One button "Quick fill" walks through the partial days. Skipping is always fine.
5. **Do-not-disturb awareness:** if he marks "Event" or "Travel", quiet hours extend automatically and all non-essential reminders pause until he ends it or the day ends.
6. **Photo-first for lazy days:** one setting "Just take photos": during the day he uses his normal camera; the next-morning check-in suggests "I found 3 photos from yesterday that look like food. Add them?" Only from photos he selects in the picker (no background scanning of his gallery, no hidden access).
7. **Habit stacking:** link food check-in to an existing habit he chooses (after morning Nescafe, after dinner, after the gym).

## PART 6 — Principles for the AI builder
- Never moralize about food, events or portions. No "cheat day" language, no "bad food".
- Never shame a gap. Wording examples: "No log for lunch. Want to fill it quickly or leave it?" / "Event day logged as estimate. Nice."
- Keep every flow to under 15 seconds and one hand.
- Do not poll the user. Maximum one food prompt per day outside of his own reminders.
- All new text lives in src/i18n/en.ts; Tone setting applies; the Arabic hint toggle covers these screens too.
- Privacy: photos are processed only after consent, location stripped, nothing stored on a server; the Settings screen says exactly what leaves the phone.

## PART 7 — QA
- Unit tests: day status (Complete / Partial / Estimated / Not tracked), exclusion of untracked days from averages, event presets ranges, "How did it go" mapping, no-compensation rule, adaptive maintenance estimate, weekly budget math, gallery photo grouping by timestamp, age gate, and "Skip, don't track".
- Verify by reading code: no screen shows red/overshoot on an Event day, no streak is lost for a gap, no auto-fill happens when the setting is off, nothing is uploaded without consent.
- Report what you could not test on a real phone (gallery picker, share target, quick actions, local notification actions, speech recognition), the 5 weakest points, and env vars (only GEMINI_API_KEY required).

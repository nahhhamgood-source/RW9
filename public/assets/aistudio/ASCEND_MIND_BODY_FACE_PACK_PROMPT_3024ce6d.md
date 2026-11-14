# ASCEND — Pack 3: Tiny Daily Stack (Face · Body · Mind), Real PSL Tiers, Thin Thirds Lines

Work on the EXISTING ASCEND codebase. Do not rewrite the project. Change or add only what is listed. Return only changed/new files, complete, with their paths. 100% English UI, 100% offline, mobile 360-430px, zero fake data (every number computed from my photos and logs; clean empty states until I log something). Smooth performance, no per-frame React state.

## 1. Thirds overlay: thin, light, with the percentage written on the line
Current look (thick green dashed lines, a number box in the corner) must change:
- Lines: 1px, white at about 45% opacity, dashed 6-6, drawn on a canvas overlay. No neon green. Slightly stronger only while dragging.
- Put the percentage ON the face guide itself: for each third, a small label (11-12px, pill with a dark translucent background) sits at the left end of the segment's middle, e.g. "33%" or "31.8%". Under it, in even smaller muted text, "ideal 33%". Color the label text only: green within ±3 points of 33.3, amber ±3-6, soft red beyond.
- 4 horizontal lines only (hairline, brow line, nose base, chin bottom) + one thin vertical midline. Remove any extra lines.
- Remove the bottom-corner box ("Thirds: 26% · 37% · 37%"); the numbers now live on the lines.
- My upper third currently reads about 26%: this is the hairline estimate being too low. Raise the extrapolation constant, and let me DRAG the hairline line up/down (small handle on the line) and recompute live. Mark it "adjusted by you" after I drag, and "estimated" otherwise.
- Use de-rotated, IPD-normalised landmarks so a small head tilt does not skew the lines.

## 2. PSL tier names (keep the internet names I like) + calibrated real rating
- Overall estimate stays out of 8, calibrated and NOT inflated: most people land 4.0-5.5, 7+ is extremely rare. Show confidence ("Based on 3 angles", quality %).
- Tier names (setting "Slang tier names", ON by default; OFF shows neutral names in brackets):
  - 7.0+ Chad (Elite) · 6.0-6.9 Chadlite · 5.0-5.9 HTN (High-Tier Normie) · 4.5-4.9 True Normie · 3.5-4.4 LTN (Low-Tier Normie) · below 3.5 "Developing".
  - Every tier shows ONE constructive line, e.g. "Biggest levers for you: skin, leanness, grooming". Never use "unattractive", "major flaws", "very low", "subhuman", "incel".
- Footer on every score screen: "PSL is an internet scale. This is a rough estimate from photos, not science and not your worth."
- "Scale guide" card showing the full 1-8 scale and what moves a score realistically (body fat, skin, hair, grooming, posture, neck/traps, lighting) and what does not (adult bone structure).

## 3. Goals: face + body + mind in small doses
First-run and Settings get a "My focus" picker (multi-select): Face, Body, Mind. Mind has sub-goals: Study, Learn programming, Calm/focus. Each goal adds tiny tasks to Today's Stack. Never more than 8-10 tasks a day, each 1-10 minutes. One short motivational line per day at the top of Home (from a local list of 60 short lines, max 12 words, no hype). Example tone: "Small reps. Every day. That's the whole game."

Starter task library (about 30, each: title 2-4 words, 1 sentence max 12 words starting with a verb, minutes, XP, category, up to 4 short steps, evidence tag, Why):
- FACE (8): Gentle cleanse AM, Gentle cleanse PM, Moisturize, SPF 30-50 + reapply, Tongue posture check (see section 5), Brow tidy (weekly), Debloat water, Weekly progress photo (same setup).
- BODY (9): 10-min walk, Posture reset (chin tucks 2 x 10), Wall angels 2 x 10, 15-min mobility flow, Neck set (progressive, optional), Workout of the day (from my split), Protein target check, Sleep wind-down, Sleep at fixed time.
- MIND (9): Study block 25 min (focus timer + 5 min break), Review notes 5 min, 1 coding micro-lesson 20 min (if "Learn programming"), Code a tiny thing 15 min, Plan tomorrow 3 min, Phone-free 30 min, Read 10 pages, Breathing 3 min, Gratitude line (1 sentence).
- PRAYER (light, optional toggle in Settings): five simple check-ins (Fajr, Dhuhr, Asr, Maghrib, Isha) as one-tap ticks with optional reminders at times I set myself. A missed one never breaks a streak and never shows a negative message. Optional "Dhikr / Quran 5 min" task.
Streak logic: a day counts as complete at 70% of today's tasks. One free streak freeze per week. XP rewards consistency only.

## 4. Glow-up mentality card (Mind tab, short)
Three small cards, 2-3 lines each: "Habits over obsession" (track actions, not your face), "Same setup, same time" (compare like with like), "Looks are one part of life" (study, skills, health and character compound too). A daily one-tap check "Did I do my minimums today?" feeding a weekly review line.

## 5. Mewing (light) and the hard stuff (honest)
- Mewing: ONE gentle reminder task ("Tongue posture check", 1 minute, 3 reminder times optional). Tag: "Not proven" for changing bone in adults, "harmless if gentle". Cue: lips closed, tongue resting on the palate, teeth lightly apart, no clenching, nasal breathing. No force, no pressure on the teeth.
- Bonesmashing: NOT a task and never will be. Put it on the Myths Wall as "False and risky": hitting the face can fracture bone, damage nerves, teeth and eyes, and there is no evidence that it improves structure. Say what to do instead (leanness, skin, grooming, posture, neck/traps).
- Chewing / mastic gum: optional "light chew" card with a hard daily cap of 15 minutes and a stop-if-jaw-pain warning. Tag "Not proven".

## 6. Hardmaxxing info cards (info only, never tasks, no dosing, no sourcing)
Growth hormone (HGH): "What it is: a hormone prescribed by doctors for diagnosed deficiency. What the evidence says: no proven benefit for looks in healthy people; effects on jaw/face in adults are not supported. Risks: joint and nerve pain, insulin resistance, swelling, abnormal tissue growth, and fake products are common. Legal: prescription only in most countries. What actually supports your natural growth hormone: deep sleep and resistance training (small, short-term effects). If you are still growing or worried about height, talk to a doctor." Same neutral card format for testosterone/steroids/SARMs ("not taught here"), tretinoin, minoxidil, finasteride, isotretinoin, orthodontics, fillers, surgery: what it is, evidence, main risks, "talk to a doctor or dermatologist".

## Acceptance tests (report pass/fail honestly)
1. Thirds lines are thin and light, each third shows its real % on the line, the hairline can be dragged and the % updates; no corner box.
2. Tier names show HTN/LTN/Chad/etc. and can be toggled; no harsh labels anywhere.
3. Choosing Mind → Study / Learn programming adds the study and coding tasks; Prayer toggle adds the five ticks; a missed tick never shows a negative message.
4. Daily motivational line changes daily from the local list.
5. Mewing is a single gentle reminder; bonesmashing appears only on the Myths Wall as a warning; HGH appears only as an info card.
6. Works offline; zero TypeScript errors; every screen scrolls by wheel and touch.

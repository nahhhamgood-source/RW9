# ASCEND — FOOD CHAT: "Just tell me what you ate"

Keep everything already built (Food tab, Diet button, rings, meal library, photo scan, camp mode). Develop, do not redesign. Zero fake data. No code in replies, short summaries. After each part: `tsc --noEmit`, build, 3-line status. If budget ends: "RESUME FROM: <part>".

## GOAL
The user does NOT know grams, calories or protein. He should only say or type WHAT he ate and roughly HOW MUCH, in everyday words. The app does the rest: asks one or two tiny follow-up questions, estimates calories and protein, and saves it. Total effort: about 10 seconds per meal.

## PART 1 — One "Tell me" box (the main way to log food)
- On the Food tab and in the "+" sheet: a big input "What did you eat?" with a **mic button**, a **camera button**, and a **Pick from list** button. Same box everywhere.
- Accepts English, Arabic (Egyptian) and Franco-Arabic ("akalt 2 ra3if 3eish w foul", "شربت نسكافيه بلبن"). Handles several foods in one sentence and the meal type ("breakfast", "الفطار", "lunch", "غدا", "عشا", "snack"), defaulting to the meal by time of day.
- Parse with `/api/food-chat` (Gemini, server-side key, structured JSON output), with a local fallback: keyword match against the local food library (Arabic, Franco and English aliases) so it still works offline for common foods.
- Never ask for grams. Never show a form with grams, protein or calories fields as the first step.

## PART 2 — Tiny follow-up questions in everyday units (max 2 per item, skippable)
If the amount is missing, ask ONE short question with big tappable chips, using units he understands, and show a picture/icon where possible:
- Drinks: "How big?" -> small cup (about 150 ml) / mug (about 250 ml) / big mug (about 350 ml) / glass. Then "With what?" -> no milk / a little milk / half milk / with sugar (1 spoon / 2 spoons).
  Example: "I drank a Nescafe" -> "How big was it? [small cup] [mug] [big mug]" -> "Milk or sugar? [black] [milk] [milk + sugar]" -> result "Nescafe with milk, mug: about 60 kcal, 3 g protein. Saved."
- Bread: "How many? [1/2] [1] [2] [3] baladi loaf" (a baladi loaf is about the size of a plate). Sandwiches: "small / regular / big".
- Rice, pasta, koshari, mahshi: "Portion size by hand: [fist = small] [2 fists = normal] [3 fists = big]" and "plate: [quarter] [half] [full]".
- Meat/chicken/fish: "How many pieces? [1] [2] [3]" and "palm size: [small] [palm] [2 palms]".
- Eggs, fruit, dates: count (1, 2, 3...).
- Spoons for oil, ghee, tahini, sugar: 1 / 2 / 3.
- **Fullness question after the meal (optional, 1 tap):** "How full are you? [Still hungry] [Good] [Very full]". Save it; use it for patterns ("lunch makes you very full 4 days this week").
If he answers "I don't know" or "usual", use a default portion and label it "average portion".

## PART 3 — Result card (always shows an estimate, always editable)
After parsing, show one card per food: picture/icon, name, portion in everyday words, **calories**, **protein**, a confidence badge (High / Medium / Low), and buttons **Edit portion** (chips, not grams), **Swap food**, **Remove**, **Save**. Footer: "Estimate. Edit if it looks off." Totals update the day's rings. Show "protein: good / low for you" only if his target is known (age >= 18 and goal set).
Never invent precision: show calories rounded (to the nearest 5-10) and protein to the nearest gram, and ranges for restaurant or mixed dishes.

## PART 3b — Voice (mic)
- Primary: browser speech recognition (Web Speech API) when available, language switch EN / AR (ar-EG). Show the live transcript, let him fix it with one tap before parsing.
- Fallback when speech recognition is not available (many browsers/iOS): record a short voice note (MediaRecorder, max 30 s), send the audio to `/api/food-chat` (Gemini audio input) ONLY after the online-features consent, get a transcript + the parsed foods back, show the transcript for confirmation.
- State honestly in the UI: "Voice needs internet and a microphone permission. If it fails, type it or pick from the list." Never store the audio after processing; say so.
- Example: user says "I had 2 eggs and a baladi bread and tea with milk" -> breakfast with 3 items, 2 follow-up chips at most.

## PART 4 — Pick from list (built-in food finder)
- Searchable list inside the app (no external site): categories (Breakfast, Egyptian home food, Street food, Fast food, Drinks, Sweets, Fruit, Snacks), recent, favorites, and "My usual" (his most common meals per slot).
- Each item shows a picture/icon, name (English + Arabic), and the default portion in everyday words. Tap = choose portion by chips = save.
- Library target about 150 items with calories and protein per standard portion, labelled "estimate". Include: ful medames, ta'miya (falafel), eggs (boiled/fried/omelette), jibna (white cheese), labneh, yogurt, milk, baladi bread, fino, eish shami, fiteer, koshari, rice, macaroni béchamel, molokhia, mahshi, grilled chicken, fried chicken, kebab/kofta, liver, shawarma, hawawshi, sausage sandwich, pane, fish, tuna, lentil soup, salads, tahini, dates, fruit, nuts, Nescafe/coffee/tea (with milk/sugar options), juice, soda, energy drink, protein shake, koshari, basbousa, konafa. Do not invent items you are unsure about; mark unknown items "ask AI" or let him add a custom food.
- Custom food: he types a name + "about how much" and the AI estimates; it is saved to his library after he confirms.

## PART 5 — Photo (keep the existing scan, make it conversational)
After a photo scan, show the foods it found with portion chips and the same result card. Ask at most one question ("Is this rice or macaroni?"). He can also add a voice note to a photo ("this is my usual lunch, no sauce").

## PART 6 — Smart help (no thinking required)
- **Same as usual:** one tap copies a typical meal for that slot. **Repeat yesterday** stays.
- **Quick answers:** "How much protein am I missing?" -> shows the number and suggests 2 easy Egyptian options (e.g., eggs + jibna, yogurt + dates, tuna sandwich, ful with egg).
- **Plain explanations:** under each total a one-line "why" ("Protein helps recovery after training"). Jargon only behind "What's this?".
- **Weekly pattern card (real data only):** e.g., "You skipped breakfast 4 days; lunch was your biggest meal." No guilt, no rules.
- Fight camp and under-18 rules stay: unknown or under-18 age -> no deficits or cutting; fight camp never suggests dehydration, fasting or banned substances.

## PART 7 — Backend `/api/food-chat`
- Input: `{ text?, audioBase64?, mime?, lang, mealType, locale: "eg" }`, size and type limits, same-origin check, per-IP rate limit, daily cap, kill switch (DISABLE_AI_ENDPOINTS), typed `{ ok, data | error }` responses, no secrets or user text in logs, timeout under 25 s with one retry, models from env with defaults (GEMINI_FOOD_MODEL).
- Output (strict JSON schema): items[{ name, nameAr, portionLabel, quantity, unit, kcal, proteinG, confidence, needsQuestion, question{ text, chips[] } }], mealType, transcript.
- System prompt rules: Egyptian food knowledge, everyday units, estimates not facts, ask the minimum, never ask for grams, never moralize about food, never give medical advice.
- Only needs `GEMINI_API_KEY`. If AI is off or offline, fall back to local library matching and manual chips.
- Consent: first use shows what leaves the phone (text, and audio/photo if used), with a toggle in Settings. No audio or photo is stored.

## PART 8 — QA
Add unit tests for the local parser (English, Arabic, Franco, multi-food sentences), the portion-to-calorie math, the Nescafe example above, the age gate, and offline fallback. Verify by code reading that no grams-first form remains in the main flow. Report: what works, what you could not test on a real phone (microphone, speech recognition, Gemini audio), the 5 weakest points, and env vars (only GEMINI_API_KEY is required).

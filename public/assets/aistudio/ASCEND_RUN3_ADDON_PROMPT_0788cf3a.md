# ASCEND — ADD-ON (send together with, or right after, Run 3)

Keep everything already built. Do not rename or remove anything. Zero fake data. No code in replies, short summaries. After each part run `tsc --noEmit` and the build, then a 3-line status.

## PART A — Bring the DIET button back (clearly visible)
- Add a **Diet** button in 3 places: top of the Food tab (next to Scan meal / Quick add), on the Plan screen as a small card ("Diet: <goal> · <kcal left>"), and in More (searchable).
- It opens the Diet screen: goal (Lose fat / Stay the same / Build muscle, and Fight camp if age >= 18), daily calories and protein target, "What should I eat?", weekly weight trend, weekly auto-adjust note, meal library incl. Egyptian street food (estimates, editable).
- Under-18 or unknown age: the screen opens but hides deficit/cutting options and says "Set your age to unlock this".
- Verify by grep that no earlier change removed a Diet route or label, and list what you restored.

## PART B — Mewing and Neck reminders that actually feel good
- Reminder Center gets two new reminder types: **Mewing check** (tongue on the roof of the mouth, lips closed, teeth slightly apart, nose breathing) and **Neck set** (chin tucks, neck curls, forehead press). Defaults: Mewing check 3x a day (late morning, afternoon, evening), Neck set once a day after training or in the evening. User can edit times, turn each off, snooze, set quiet hours. Max 6 reminders a day total.
- **Friendly voice, rotating lines** (Tone setting decides). Normal: "Quick tongue check: tongue up, lips closed, breathe through your nose." / "Neck set time. 2 minutes, easy effort." Chill: "Tongue check, lock in." / "Neck set? 2 mins, let's go." Never guilt, never shame, no "you failed". Rotate 8+ lines per reminder, use his real name only if saved.
- Notification actions: **Done** (logs it and counts toward streak and XP), **Later** (+30 min), **Skip today**. Tapping opens the 30-second mini routine with the Watch links and a timer.
- Tiny reward on Done: a short toast and ring progress ("Neck set done. 4-day streak"). Optional weekly line: "You did mewing checks 14 of 21 times this week."
- **Be honest about delivery**, show which path is active in the Reminder Center:
  1. Android APK (Capacitor local notifications): the most reliable, works offline, no server. README steps.
  2. Web Push (installed PWA + VAPID + a scheduler): works on Android Chrome when installed; on iPhone only after "Add to Home Screen"; delivery is not guaranteed and Vercel Hobby cron may run only once a day, so say so.
  3. Fallback: in-app banner when the app is open + a downloadable .ics calendar file with repeating alarms.
  If push is not set up, show "Push is not set up. Use the Android app or the calendar file." Never claim a reminder will fire if the active path cannot guarantee it.
- Notification text is generic and private-safe ("Quick check-in"), with the full friendly line shown only inside the app, unless the user turns on "Show details in notifications".

## PART C — New info card from the TikTok slides ("CCW rotation / temporalis training")
Add to Face > Learn as an **info card only, never a daily task**, tag **Not proven**:
- What the slides claim: training the temporalis (biting lightly on the molars with the mouth slightly open and shifting the jaw back and up) "rotates the jaw counter-clockwise" and reshapes the face.
- Honest take: the temporalis does lift and retract the jaw, but there is no good evidence that voluntary biting drills change adult bone shape or jaw rotation. The "growth direction" research the slides mention is about children and orthodontic appliances, not adults doing a clenching exercise.
- Risks: repeated biting or clenching can cause jaw (TMJ) pain, headaches, tooth wear and tight muscles. Do not add this as an exercise, timer or reminder. If the user already has jaw pain or clicking, see a dentist.
- What helps instead, with evidence tags: relaxed jaw with lips closed and teeth slightly apart (Likely works for comfort), good posture and chin tucks (Likely works), leanness for a sharper jawline (Proven for appearance), skin and grooming.
- Add "CCW rotation" and "temporalis training" to the glossary with this one-line take.

## PART D — QA
List what changed, what you verified by code reading, and what you could not test on a real phone (notifications, push, calendar file). Report the exact env vars (only GEMINI_API_KEY is required; VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET only for web push).

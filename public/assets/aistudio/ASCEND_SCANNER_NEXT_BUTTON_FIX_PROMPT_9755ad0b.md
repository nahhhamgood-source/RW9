# ASCEND — BUG FIX: Scanner will not advance (Capture / Skip / Finish do nothing)

Symptom: in the multi-angle scanner, tapping "Capture", "Skip for now" or the final "Finish/Analyze" does not move to the next step, even when the shutter is green. The user is stuck on the same step (seen on the Left-side step). Fix this reliably. Change only the scanner flow files (state, handlers, step screens, analysis hand-off). Do not rewrite the project. Return only changed files, complete, with paths.

## 1. Find the root cause first (report it in 3 lines)
Check each of these in the code and say which one(s) were the cause:
1. The step index/state never changes because the handler awaits a landmark detection on the captured still that never resolves, throws silently, or returns "no face" (side photos at 45° often fail on a still) and the code just returns.
2. Handlers read a stale value (closure) of the step/captured data, so setStep(step + 1) uses an old step.
3. An overlay (canvas, mesh layer, guide ring, toast/banner) sits on top of the buttons and swallows the tap: missing `pointer-events: none` on overlays, wrong z-index.
4. Buttons are inside a `<form>` without `type="button"`, or have `disabled` or `aria-disabled` computed from a gate that is still BLOCK for another reason.
5. The "Finish/Analyze" button requires all three angles, and "Skip for now" does not mark a step as skipped, so the completion condition is never true.
6. A promise/timeout rejects, the error is swallowed, and the UI stays in a "busy" state forever (busy flag never reset in finally).
7. The camera stream or landmarker was disposed after the first capture, so the next step has no detector.

## 2. Replace ad-hoc state with ONE explicit state machine (useReducer)
States per step: `idle → live → capturing → reviewing → accepted | skipped`. Global: `stepIndex`, `captures: {front, left, right, profile90}` (each: image, landmarks, confidence, status), `busy`, `error`.
- Every button dispatches an action; the reducer is the only place that changes the step. Use functional updates, no stale closures.
- Actions: CAPTURE_START, CAPTURE_SUCCESS(imageData, landmarks, confidence), CAPTURE_FAILED(reason), ACCEPT, RETAKE, SKIP, GO_TO(step), FINISH.
- `busy` is always reset in a `finally` block. Every async call has a 4 s timeout that dispatches CAPTURE_FAILED with a readable reason.

## 3. Capture must never depend on a second detection succeeding
- On tap, grab the frame AND the most recent good landmarks from the live stream (keep them in a ref). Use those landmarks for the capture. Only run an extra detection on the still if the live landmarks are missing; if that fails or times out, save the photo anyway as `status: "captured, landmarks missing"`, show a clear message ("Face not detected on this photo, retake or continue with lower accuracy"), and offer Retake and Continue. Never fail silently.
- After a successful capture, show the preview with "Use this photo" and "Retake". "Use this photo" dispatches ACCEPT and moves to the next step immediately.

## 4. Skip, Back and Finish always work
- "Skip for now" dispatches SKIP, marks the step skipped (counts as complete for navigation) and moves on.
- "Finish / Analyze" is enabled as soon as the FRONT capture is accepted. It runs the analysis with whatever angles exist; missing sides show "Not measurable" in the report. If analysis throws, show the error with Retry; never leave a spinner.
- Back goes to the previous step without losing captured data. Progress dots are tappable.
- The final step shows a big "See my report" button and the transition to the report is triggered by FINISH only.

## 5. Make taps reliable
- All overlays (mesh canvas, guide ring, banners) get `pointer-events: none` except the banner's own Dismiss button. Control bar has a higher z-index than the video/canvas layers, `position: relative`, and extra bottom padding for the mobile safe area.
- Every button: `type="button"`, minimum 48px height, visible pressed state, no double-fire (ignore taps while `busy`).
- Show instant feedback on every tap (button label changes to "Capturing...", toast on failure).

## 6. Temporary debug strip (dev only, behind `?debug=1`)
Small bar at the bottom showing: stepIndex, step state, busy, last error, captured steps. Remove or hide in production.

## Acceptance tests (run and report pass/fail honestly)
1. Front: Capture → preview → Use this photo → moves to Left side.
2. Left side with a normal 45° turn: Capture → preview → Use this photo → moves to Right side, even if landmarks fail on the still (shows the message, can continue).
3. "Skip for now" moves forward on every step.
4. After the Right step (captured or skipped), "See my report" opens the report with real values and "Not measurable" for skipped angles.
5. Tapping fast multiple times never double-advances or freezes.
6. Camera still works after returning from the preview (Retake).
7. Zero TypeScript errors, works offline.

# ASCEND — Scanner: Make It Easy to Use WITHOUT Lowering Result Quality

Context: the multi-angle face scanner works and looks great, but the quality gate is too strict. Real users cannot get the shutter to unlock and cannot reach the next step or the report. Fix the USABILITY, not the accuracy. Change only the scanner files (gate logic, scanner UI, metrics confidence). Do not rewrite the project. Return only the changed files, complete.

## 1. Three-level quality checks (replace the pass/fail gate)
Every check returns one of: PASS, WARN, BLOCK.
- BLOCK (shutter disabled, only for things that make measurement impossible): no face detected; face width < 25% of frame; extreme darkness (mean luminance < 35) or blown-out (> 230); head turned wildly wrong (front: |yaw| > 20°; sides: yaw < 15° or > 70° or wrong direction); eyes clearly closed on the front shot.
- WARN (shutter ENABLED, amber, label "Capture (lower accuracy)"): small pose error (front |yaw| 8-20°, |pitch| > 10°, |roll| > 6°; sides yaw 25-30° or 55-70°), mouth slightly open, uneven lighting, mild blur, glasses/hair over brows.
- PASS (shutter green, label "Capture Angle"): everything inside the comfortable ranges (front |yaw| ≤ 8°, |roll| ≤ 5°, |pitch| ≤ 10°; sides yaw 30-55°).
Show ONE instruction at a time (the most important failing check), in large friendly text, e.g. "Move a little closer", "Turn slightly more to the right". Never show a wall of red errors. Add a pose ring around the face guide that fills as the head approaches the target, and a short vibration (navigator.vibrate) when it turns green.

## 2. Keep accuracy by correcting pose in the math
- Enable MediaPipe `outputFacialTransformationMatrixes` and use it to estimate yaw/pitch/roll AND to de-rotate the landmarks before computing ratios, so small head tilts no longer distort the metrics. (If the matrix is unavailable, fall back to landmark-based yaw/roll and say so in the code comments.)
- Normalise by interpupillary distance after de-rotation. Compute metrics from the median of 5 consecutive detections on the captured still/short burst (200-300 ms) to reduce jitter.
- Every metric carries a confidence level. A WARN capture lowers the confidence of the affected metrics (not all of them) instead of rejecting the photo. The report shows the confidence next to each metric, and the overall estimate uses confidence-weighted averaging. Low-confidence metrics are marked "Approximate".

## 3. Make the flow impossible to get stuck in
- Only the FRONT capture is required. Left side and right side are optional: each has "Capture Angle", "Skip for now" and "Upload photo". If skipped, side-based metrics show "Not measurable — add a side photo" and the report still opens. A banner in the report offers "Add side photos" later and re-computes the report.
- If detection keeps failing for 10 s, show a help sheet with 4 tips (eye-level camera, face a window, hair off forehead, hold the phone at arm's length) and a "Use upload instead" button. Never leave the user on a dead screen.
- Add "Retake" on every preview. Remember captured steps if the user leaves and comes back (store in memory/Dexie draft for 30 minutes).
- Progress dots at the top: Front · Left · Right, with check marks. The user can tap a completed dot to retake it.

## 4. Performance
Keep detection throttled (about 10-15 fps), stop camera tracks and detection when the screen is left, run the burst/median only after the tap. Do not add per-frame React state.

## 5. Acceptance tests (report pass/fail honestly)
1. A normal front selfie at arm's length in an ordinary room unlocks the shutter within 5 seconds.
2. A slightly tilted head produces WARN (amber) and still captures, with lower confidence shown on affected metrics.
3. A dark room or no face produces BLOCK with a single clear instruction.
4. Skipping both side photos still opens the report, with side metrics marked "Not measurable".
5. Adding side photos later updates the report.
6. No fake values anywhere; build passes with zero TypeScript errors.

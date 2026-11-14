# ASCEND — Scanner Fix: A Silly or Non-Neutral Face Must NOT Get a High Rating

Problem found in testing: pulling a goofy face during the face scan still produced a high rating. The expression is not checked and low-quality scans can still produce high scores. Fix ONLY this, nothing else. Do not rewrite the project. Return only the changed files, complete, with paths. Keep it small and safe. Report pass/fail honestly.

## 1. Neutral-expression check (MediaPipe blendshapes)
- Enable `outputFaceBlendshapes` on the Face Landmarker (keep the existing settings).
- Compute an `expressionScore` (0 = neutral, 1 = very expressive) from these blendshapes: mouthSmileLeft/Right, jawOpen, mouthFunnel, mouthPucker, cheekPuff, browInnerUp, browDownLeft/Right, eyeSquintLeft/Right, eyeWideLeft/Right, mouthStretch, mouthPressLeft/Right, noseSneerLeft/Right. Put the weights and thresholds in one constants file with comments.
- Gate: expressionScore below 0.15 = PASS; 0.15-0.30 = WARN (shutter enabled, amber, "Relax your face a little"); above 0.30 = BLOCK ("Neutral face please: mouth closed, relax your forehead"). Use the specific cue (e.g. "Smile detected", "Mouth open", "Eyebrows raised").
- Check it on the live preview AND again on the captured still; if the still fails, reject it with the reason and a Retake button.

## 2. Low confidence must pull the score toward average
- Every scan gets a `scanConfidence` (0-1) from: pose accuracy, expressionScore, lighting, sharpness, number of angles captured.
- Final sub-scores and the overall estimate use shrinkage: `final = mean + scanConfidence * (raw - mean)`, where `mean` is the calibrated population mean from the existing calibration curve. So a poor-quality scan cannot produce a very high (or very low) rating. Show the confidence next to the score.
- A WARN-level expression lowers the confidence of mouth, lip, jaw and eye metrics specifically.

## 3. Plausibility check
- If several metrics fall outside realistic human ranges (documented ranges in the constants file), show "This scan looks unusual — retake with a neutral face, camera at eye level" instead of a report.

## 4. Developer test panel (hidden)
Add a hidden toggle (tap the Scan ID 5 times) that shows live blendshape values, expressionScore, scanConfidence and the raw metrics on the scanner screen, so I can verify behaviour. Never shown by default.

## Acceptance tests
1. Neutral face: shutter green, normal report.
2. Big smile, tongue out, wide eyes, mouth open or puffed cheeks: blocked or amber with the exact reason; if captured on WARN, the report shows lower confidence and no extreme score.
3. Same face, one neutral scan vs. one silly scan: the silly one never scores higher than the neutral one.
4. Build passes with zero TypeScript errors; scanner performance unchanged.

# ASCEND — Fix Pack: Scroll Bug + Multi-Angle Face Scanner + Report

You are working on the EXISTING "ASCEND" codebase (React + Vite + TypeScript + Tailwind + Dexie). Do NOT rewrite the whole project. Read the current code first, then change only what is needed. 100% English UI, 100% offline, no network calls at runtime.

## NON-NEGOTIABLE RULES
1. ZERO fake data. Every number on screen is computed from real landmarks on a real captured photo. Example values like "82/100" in this prompt are FORMAT EXAMPLES ONLY, never hardcode or randomize them. If a metric cannot be measured from the photos, show "Not measurable" and say why.
2. Never freeze: every async step has a timeout and a Retry button. ErrorBoundary around the scanner and the report. No alert()/confirm().
3. Honest labels: all scores are ESTIMATES from phone photos. Lighting, lens distance and head angle change values.
4. No degrading words. Use "focus area", not "flaw".
5. Respond with the changed files only, complete, one by one, each with its path as a heading. Do not paste the whole project.

---

## PART A — FIX THE "CAN'T SCROLL" BUG (do this FIRST)
Symptom: on some screens the page will not scroll up or down with the mouse wheel or by finger on mobile.
Audit and fix all of these:
- Remove `overflow: hidden` / `overflow-hidden` from `html`, `body`, `#root` and the main app shell (unless a full-screen camera overlay is open).
- Replace `h-screen`, `height: 100vh` and `min-h-screen` on the shell with `min-height: 100dvh`. Use `dvh` (not `vh`) so mobile browser bars do not break layout.
- The page shell should be a flex column: fixed top bar + `main` with `flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;` + floating bottom nav. Add bottom padding to `main` (nav height + 24px) so content is never hidden under the floating nav.
- Remove `touch-action: none` and `pointer-events: none` from any container that holds scrollable content. Only the camera video element may use `touch-action: none`, and ONLY while the camera is open.
- Overlays, sheets and modals: when closed they must be unmounted or `pointer-events: none` and `visibility: hidden`. When open, lock body scroll with a class and ALWAYS unlock it on close, on unmount and on route change (cleanup in `useEffect`). A forgotten scroll lock is the most likely cause.
- No `position: fixed` full-height wrappers around normal pages.
- Check every tab/screen (Home, Routine, PSL LAB, Progress, Care, Academy, Settings, Scanner, Report) by scrolling with wheel and touch. Add `overscroll-behavior-y: contain` only on inner scroll areas, not on the body.
- Add a tiny dev-only check: on route change, scroll `main` to top.
Report in 3 lines what the root cause was.

---

## PART B — MULTI-ANGLE GUIDED SCANNER (replace the single front capture)
Use MediaPipe Face Landmarker (478 landmarks) running ON DEVICE. Model + WASM live in `public/mediapipe/` and load from local paths. Preload at app start, show "Scanner ready". If loading fails: clear error + Retry button + "Upload photos instead" fallback. Never show fake results.

### Capture flow (sequential, each step has its own MANUAL shutter button "Capture Angle")
Step indicator at top: 1 Front · 2 Left side · 3 Right side (+ optional 4 True profile 90°).
1. **Front (0°)** — oval guide + blue wireframe mesh overlay (thin lines, semi-transparent, turns green when the pose is aligned) drawn from live landmarks (draw on a canvas at max 15 fps; throttle with requestAnimationFrame + frame skip). Hint: "Look straight at the camera, neutral face, hair off forehead."
2. **Left side (about 45°)** — copy: "Turn your head to the RIGHT so the camera sees your LEFT jaw." Show an arrow and a live yaw gauge with a target zone.
3. **Right side (about 45°)** — copy: "Turn your head to the LEFT so the camera sees your RIGHT jaw."
4. **Optional true side profile (90°)** — higher-confidence gonial angle. Skippable.
Each step: show the live yaw/roll/pitch estimate and the quality checklist. Allow Retake and Upload for every step. Save thumbnails only if the setting is on; always save the measurements.

### Shutter button logic (prevents bad captures and freezes)
- The button is ALWAYS visible. It is DISABLED while the quality gate fails and shows the exact reason underneath (e.g. "Too dark", "Turn a bit more to the right", "Mouth open", "Face too small", "Hold still").
- When the gate passes it turns active (accent color). Tapping it captures one frame to an offscreen canvas, runs landmark detection on that still image (not the live stream), and shows a preview with "Use this photo" / "Retake".
- NO auto-capture. Landmark detection on live video runs at a throttled rate (about 10-15 fps) and stops entirely when the screen is left. Always stop camera tracks on unmount.
- Every detection call has a 5 s timeout with Retry.

### Quality gate (computed from landmarks and pixels)
- Face detected, face width at least 35% of frame width.
- Front: |yaw| ≤ 8°, |roll| ≤ 5°, |pitch| ≤ 8°.
- Side steps: yaw within 30-55° in the correct direction (estimate yaw from nose tip vs. left/right face-edge landmarks), |roll| ≤ 8°.
- Eyes open, mouth closed (neutral), no big smile.
- Brightness: mean luminance between 60 and 200 and no strong one-sided lighting (compare left/right face halves).
- Sharpness: Laplacian variance above a threshold (document the number in a constant).
- Warn (not block) about glasses, hair covering brows/forehead.

---

## PART C — REAL METRICS FROM THE 3 ANGLES
Put all geometry in `src/lib/faceMetrics.ts` as pure, typed, unit-testable functions. Normalise by interpupillary distance (IPD) or face width. For every metric store: raw value, typical range, status (in range / below / above), confidence (high / medium / low), and a one-line plain explanation.

**From FRONT:**
- Facial thirds (hairline-brow, brow-nasal base, nasal base-chin) as percentages. Note: the hairline is not a landmark; estimate it from the forehead landmarks and mark confidence "low".
- fWHR; bizygomatic width vs bigonial (jaw) width ratio; chin width and chin height ratio.
- Canthal tilt, left and right, in degrees (inner to outer eye corner vs. horizontal, corrected for head roll). Classify Positive / Neutral / Negative using a documented threshold.
- Eye aspect ratio, eye spacing (interocular distance vs. eye width), brow height and brow tilt.
- Symmetry: mirror landmark pairs around the facial midline; report the 3 largest asymmetries.
- Mouth vs nose width, lip fullness ratio, midface ratio.

**From SIDES (combine left + right, average, and report left/right difference):**
- Jaw contour projection and jawline definition: angle and length of the jaw contour from the ear-side landmark through the jaw-angle region to the chin (landmarks along the face oval, e.g. 172/397, 152 and 234/454).
- **Gonial angle estimate** from the jaw-contour points. IMPORTANT: from a 45° view this is foreshortened and approximate. Label it "Approximate" with confidence "low"; with the optional 90° photo, confidence "medium". Do not claim a pass/fail threshold: show my value next to a typical adult range and say what it means.
- Chin projection, submental (neck-chin) angle (strongly affected by body fat and posture), forehead slope, nose-lip-chin line.
- If a metric needs a view that is missing, show "Not measurable — capture a 90° profile".

**Scoring (ESTIMATE):**
- Sub-scores 0-100: Symmetry, Proportions/Thirds, Eye Area, Jaw & Chin, Cheekbones/Midface, Skin (texture/evenness/redness from the image), Facial Leanness. Each uses a documented mapping from distance-to-typical-range, written in a constants file with comments. Metrics with low confidence count less.
- Overall "PSL-style estimate" out of 8 from a weighted combination with a calibrated curve (most people land 4.0-5.5, 7+ extremely rare, NO inflation). Tier names: Developing <3.5 · Mid 3.5-4.9 · High 5.0-5.9 · Top 6.0-6.9 · Elite 7.0+. Also show a plain label (e.g. Below average / Average / Above average / High) mapped from the tier.
- Always show: "PSL is an internet scale. This is a rough estimate from photos, not science and not your worth."

---

## PART C2 — TRANSITION
After the last required angle is captured, show a short "Analyzing your photos" step that reflects REAL work only (landmark detection on each still, metric computation) with a real progress state, then slide smoothly into the report. If anything fails, show which step failed with Retry. Name the top card "Overall Estimate" (not "Attractiveness Potential"): it describes today's photos, not a prediction of the future.

## PART D — REPORT SCREEN (PSL LAB results)
Mobile-first (360-430px), clean cards, bento layout, fits the app's design (dark cards, mint accent, pastel rings). Order:
1. **Top score card**: overall PSL-style estimate (/8) with tier + plain label, plus a small confidence note ("Based on 3 angles" or "Front only").
2. **Metrics list** with a score ring or bar (/100, estimate) + one-line description + "Learn more" (evidence tag: Proven / Likely works / Not proven, with a 1-2 line Why):
   - Facial Symmetry
   - Facial Thirds (upper / middle / lower %)
   - Eye Spacing, Shape and Canthal Tilt
   - Jawline & Chin (projection, gonial estimate)
   - Cheekbones & Midface
   - Skin (texture / evenness)
3. **Key Strengths** (top 3) and **Focus Areas** (top 3), as two clean cards. Focus areas must say what can realistically change and what cannot without medical help.
4. **Actionable Recommendations** grouped: Skincare · Haircut/Grooming (use my face shape from the scan) · Fitness/Leanness · Posture/Neck · Photo setup. Ranked by real impact. Include honest notes: adult bone structure does not change from chewing, mewing or face exercises; leanness, skin, hair, grooming, posture and neck/trap training are what move the result.
5. **"Add to my plan"** button that turns the focus areas into protocol tasks.
6. **Compare**: side-by-side and metric trend vs. my previous scans (me vs. me only). Rescan reminder after 14 days.
7. Photo tips card (eye level, arm's length, window light, no filter) and the disclaimer.

---

## PART D2 — EXTRA REPORT CONTENT (looksmaxing vocabulary + layout, kept honest)
Use these extra items ONLY where they can be computed from landmarks; otherwise show "Not measurable". Never invent a value to fill a slot.

**Extra metric cards** (each: score /100 as an estimate, one-line descriptor, confidence, "Learn more" with evidence tag):
- Eye Area & Canthal Tilt (descriptor from real tilt: Upward / Neutral / Downward)
- Jawline Projection (side views) and Lower-Third Definition (jaw contour clarity + submental angle; says that body fat strongly affects it)
- Midface Ratio
- Facial Thirds (draw the real thirds guide lines on the captured front photo, with each third's % beside it)
- Visible Bone Structure (cheekbone/jaw width balance; descriptor says it describes what the camera sees, not bone density)
- Facial Harmony (how the other ratios sit together: a weighted blend of in-range metrics, explained in one sentence)
- Brow Ridge & Orbital Depth (side views, confidence LOW, honest note that lighting changes it)
- Maxilla / Midface Projection (side views, confidence LOW)
- Masculine-Feminine Feature Balance ("dimorphism", optional, low confidence, neutral wording, no value judgment)
- Nose Harmony and Lip Proportions (width and fullness ratios)
- Skin Texture & Tone (from image: evenness, redness, dark-circle estimate)
Do NOT include items that cannot be measured from photos (hairline quality, "Hairstyle score", "Grooming score", "Photogenic Potential"). Hair/grooming advice goes in Recommendations instead.

**Report layout (inspired by a clean "Facial Aesthetics Report" sheet):**
- Header: app crown/logo, "FACIAL AESTHETICS REPORT", subtitle "Analysis · Evaluation · Recommendations", tagline "Small improvements. Big difference."
- Left: my front photo with the thirds guide lines and midline overlay (drawn from real landmarks). Right: the Overall Estimate card, then the Detailed Analysis table (metric / score /100 / short descriptor).
- Under that: three cards side by side on tablet, stacked on phone: Key Strengths · Areas to Improve · Actionable Recommendations (Skincare, Brows, Haircut, Fitness/Leanness, Posture, Photos; optional cosmetic items shown as neutral info cards with "talk to a professional").
- **Final Verdict** card: 2-3 sentences generated from my REAL metrics with templates (strongest areas, biggest realistic levers, what cannot change without medical help). NO predictions like "your potential can reach 85-90". Say what habits move which metric instead.
- **Feature chips** under the overall score (e.g. "Symmetrical", "Defined jaw", "Balanced thirds", "Positive canthal tilt"). A chip appears ONLY if its metric is in the favorable range with at least medium confidence.
- "Save report as image" button (local PNG export from the report DOM, no network) and "Add focus areas to my plan".
- Include a Scan ID (local counter + date) and the "estimate" disclaimer in the footer.

**Scale guide card** ("How to read the PSL-style scale"): 1-8 scale with neutral tier names (Developing, Below average, Average, Above average, High, Top, Elite) and a one-line explanation per tier, plus: "Internet scale, based on opinions, not science."
**Glossary additions** (honest take on each): PSL, canthal tilt, gonial angle, fWHR, midface, submental angle, maxilla, dimorphism, symmetry, "mogging", "hunter eyes", "softmaxxing / hardmaxxing". Also one entry explaining that internet tier labels (Chad, Chadlite, HTN, LTN, "normie") are slang for rough rankings; the app does NOT use them as labels for me and never uses labels like "unattractive" or "flawed".

## PART E — PERFORMANCE
- Load the model once (singleton), reuse the landmarker, run detection only when the camera screen is visible, and dispose of it on leave.
- Downscale the video frame for detection (e.g. 480px wide), draw the overlay on a single canvas, no React re-render per frame (use refs).
- Lazy-load the scanner and report screens with `React.lazy`.
- Memoize heavy lists; avoid layout thrash; keep bundle small.

---

## ACCEPTANCE TESTS (run them and report pass/fail honestly)
1. Every screen scrolls with mouse wheel and by touch; no stuck scroll after closing a sheet or camera.
2. Camera permission denied → clear message + Upload fallback.
3. No face / too dark / too tilted → shutter disabled with the exact reason.
4. Good front photo → captured manually, preview, accepted.
5. Left and right side steps guide the head turn and gate on yaw.
6. Report shows only computed values; changing the photo changes the numbers; "Not measurable" appears when a view is missing.
7. Works with the network off. Build passes with zero TypeScript errors.
Finish with a SHORT list of what works and what you could not finish. Do not claim anything works that you did not test.

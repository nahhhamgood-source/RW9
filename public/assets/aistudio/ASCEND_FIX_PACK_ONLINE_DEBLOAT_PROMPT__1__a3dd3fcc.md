# ASCEND — Fix Pack 4: Food Scan Error, "First Time Every Time" Bug, Mobile Layout, Lean Face (Debloat) Module

Work on the EXISTING ASCEND codebase (deployed on Vercel as a Vite static site, used on phones). Do not rewrite the project. Return only changed/new files, complete, with paths. 100% English UI. The app may now use the internet for specific features (food photo analysis); everything else must keep working offline. Zero fake data. Report pass/fail honestly at the end.

## PART 1 — Fix the Food Scan error
Symptom (Fuel AI → Live Camera Scanner / Snap Mobile Photo / Upload from Gallery): `Unexpected token 'T', "The page c"... is not valid JSON`.
Likely cause: the client calls an API route (e.g. `/api/...`) that does not exist on the static Vercel deployment, so the server returns a plain-text "The page could not be found" page and the code calls `res.json()` on it. Verify this in the code first and say what you found.
Fix:
1. Create a Vercel serverless function `api/analyze-food.ts` (Node runtime). It receives `{ imageBase64, mimeType, context }`, calls the Gemini API using `process.env.GEMINI_API_KEY`, requests structured JSON output (name, portion_g, calories, protein_g, carbs_g, fats_g, sodium_mg, sugar_g, confidence 0-1, notes), and always returns JSON: `{ ok: true, data }` or `{ ok: false, error }` with a proper status code. Never put the API key in client code or in the bundle. If `vercel.json` has a catch-all rewrite to `index.html`, exclude `/api/*`.
2. Client: downscale the photo to max 1024 px JPEG (quality about 0.7) before sending; 25 s timeout; check `res.ok` AND the `content-type` header BEFORE parsing JSON; on any failure show a friendly message ("Food scan is unavailable right now"), a Retry button and the existing Manual Quick-Add fallback. Never show raw parser errors to the user.
3. Results screen: all values editable before saving, labeled "AI estimate", with the confidence shown. If confidence is low, say so.
4. Camera: for food use the back camera (`facingMode: { ideal: "environment" }`); handle permission denied, no camera, and in-use errors with specific messages; stop all tracks on unmount; keep "Snap Mobile Photo" as an `<input type="file" accept="image/*" capture="environment">` fallback.
5. Tell me exactly which environment variable to add in Vercel (Project → Settings → Environment Variables → `GEMINI_API_KEY`) and that a redeploy is required.

## PART 2 — Fix "it treats me like a first-time user every time"
Likely causes: onboarding/profile flag not persisted; the first render shows onboarding before the database read finishes; or storage is blocked or lives on a different origin.
Fix:
1. Add a boot state: show a small splash until Dexie has loaded profile + settings. Show onboarding ONLY if the profile record truly does not exist after the read completes.
2. Persist `onboardingComplete` and the profile to Dexie (and a tiny localStorage mirror for instant boot). After saving, read it back once to verify; if the write fails show a toast with Retry.
3. Request persistent storage (`navigator.storage.persist()`); if storage is unavailable (private mode, in-app browser, blocked site data) show a clear banner instead of silently resetting.
4. Remove any login/PIN gate unless "PIN lock" is turned on in Settings. No welcome screen after the first completed setup.
5. Explain in-app (Settings → "About my data"): data lives on each device separately; to move it use Export / Import backup. (Optional later: cloud sync. Do not build it now.)
6. Test: finish setup, hard refresh, close the tab, reopen → lands on Home with the same profile.

## PART 3 — Mobile layout bugs
- The floating bottom nav and the "+" button cover form fields (Protein, Carbs, Fats, Sodium). Add bottom padding to the scroll area equal to nav height + 24 px, hide the nav while a text field is focused, and make the "+" menu close on outside tap.
- Use `100dvh`, 16 px side gutters, no horizontal scroll, inputs at least 16 px font (prevents iOS zoom), touch targets at least 44 px. Verify at 360, 390 and 430 px widths.
- Every screen scrolls by touch and wheel.

## PART 4 — Lean Face (Debloat) module, short and honest
A small module in Care → "Lean Face". Goals the user has: slimmer cheeks / hollow-cheek look, a stronger-looking structure, a "hunter eyes" look. Be direct and honest in the copy:
- **What really changes the cheeks:** overall body fat (facial fat cannot be spot-reduced) and water retention. Realistic pace 0.5-1% of bodyweight per week, protein about 1.6-2.2 g/kg, calories never below a safe floor (Mifflin-St Jeor, formula shown). Stop-cutting signs card: low energy, poor sleep, constant hunger or obsessing, a gaunt/tired face. Extreme cutting makes a face look older and tired, not "hollow". If the profile age is under 18 or the user is still growing: hide the cut calculator and show a "talk to a doctor / focus on training, sleep and food quality" card.
- **Debloat tasks (light):** consistent daily water target (by bodyweight, not a fixed 4 L), moderate and consistent salt (not zero), limit alcohol/sugar/ultra-processed food, 7-9 h sleep, a 10-minute walk, potassium-rich foods. Banned: dehydration tricks, diuretics, sauna dumping, "water fasting".
- **Puffiness log (real data):** a 10-second morning check (face puffiness 1-5, sleep hours, alcohol/salty meal yes/no). After 14 days show a simple chart and the pattern found in MY data. Weekly photo with the same setup.
- **Hollow cheeks and bone:** show a plain card: how cheek hollowness depends mostly on leanness plus bone structure and the buccal fat pad (genetic). Buccal fat removal = neutral info card only (irreversible, can make the face look older with time, surgical risks, see a surgeon). Adult facial bone does NOT gain mass from exercises or chewing (tag "Not proven"); what changes how structure looks: leanness, skin, hair, grooming, posture, neck/traps and shoulder training.
- **Hunter eyes:** the shape is mostly bone and genetics and cannot be trained. What changes the look: leanness, sleep, de-puffing, brow grooming, haircut, lighting/camera angle, glasses. Eyelid/canthal surgery = neutral info card, "talk to a specialist".
- Footer: "Self-tracking estimates, not medical advice."

## ACCEPTANCE TESTS
1. Food photo (all three entry methods) returns an editable AI estimate, or a friendly error with Retry; no raw JSON parse error anywhere.
2. With the API key missing the app says so clearly and keeps manual entry working.
3. After setup, reopening the app (phone and PC separately) goes straight to Home.
4. No form field is hidden under the nav at 360, 390, 430 px.
5. Lean Face module works from my logs only; empty states until I log something.
6. Build passes with zero TypeScript errors.

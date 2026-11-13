import type { EvidenceTag } from '../types';

export interface AcademyGuide {
  id: string;
  title: string;
  category: string;
  evidence: EvidenceTag;
  summary: [string, string, string];
  steps: string[];
  commonMistakes: string[];
  mythVsReality: { myth: string; reality: string };
  whenToSeeDoctor: string;
}

export interface GlossaryTerm {
  term: string;
  meaning: string;
  honestTake: string;
}

export interface MythClaim {
  id: string;
  claim: string;
  verdict: 'True' | 'Partly true' | 'False';
  evidence: EvidenceTag;
  explanation: string;
}

export interface MedicalTopicCard {
  id: string;
  name: string;
  whatItIs: string;
  evidence: EvidenceTag;
  risks: string;
  guidance: string;
}

export const ACADEMY_GUIDES: AcademyGuide[] = [
  {
    id: 'guide-sleep',
    title: 'Sleep & Overnight Recovery',
    category: 'Recovery',
    evidence: 'Proven',
    summary: [
      '7.5–8.5 hours of consistent sleep reduces facial fluid retention and dark periorbital shadows.',
      'Timing consistency (same wake time daily) matters nearly as much as total duration.',
      'Skin barrier repair and growth hormone pulses peak during early slow-wave sleep.',
    ],
    steps: [
      'Lock a wake time within a 30-minute window 7 days a week.',
      'Get 10 minutes of outdoor light soon after waking.',
      'Keep caffeine before 1:00 PM and dim overhead screens 45 minutes before bed.',
      'Sleep slightly cool (17–19°C) and avoid heavy salty meals right before lying down.',
    ],
    commonMistakes: [
      'Sleeping 5 hours on weekdays and 11 hours on Sunday (creates social jetlag).',
      'Using alcohol as a sleep aid—it fragments REM and dehydrates skin.',
    ],
    mythVsReality: {
      myth: 'Sleep tracking rings or mouth tape alone fix daytime fatigue.',
      reality: 'Light exposure, consistent wake time, and sleep-apnea screening fix real sleep debt.',
    },
    whenToSeeDoctor: 'If you snore loudly, wake gasping, or stay exhausted after 8 hours, ask a doctor about sleep apnea.',
  },
  {
    id: 'guide-debloat',
    title: 'Hydration & Facial Debloat',
    category: 'Hydration',
    evidence: 'Proven',
    summary: [
      'Morning facial puffiness comes mostly from sodium swings, alcohol, poor sleep, and allergies.',
      'Steady water intake and potassium-rich foods help kidneys clear excess sodium smoothly.',
      'Dehydrating yourself makes you look flat and triggers rebound water retention.',
    ],
    steps: [
      'Drink water steadily through the day rather than chugging 2L at night.',
      'Balance sodium with potassium sources (spinach, potatoes, bananas, avocado).',
      'Take a brisk 15-minute morning walk to stimulate lymphatic drainage.',
      'Elevate your head slightly on one supportive pillow if you wake up puffy.',
    ],
    commonMistakes: [
      'Cutting water intake to "dry out"—this spikes aldosterone and worsens puffiness.',
      'Expecting ice rollers to permanently slim cheek fat.',
    ],
    mythVsReality: {
      myth: 'Dunking your face in ice water permanently tightens skin or slims cheeks.',
      reality: 'Cold briefly constricts blood vessels for 20–30 minutes; long-term leanness is nutrition and sleep.',
    },
    whenToSeeDoctor: 'Sudden persistent swelling around eyes, lips, or ankles needs medical evaluation.',
  },
  {
    id: 'guide-bodyfat',
    title: 'Body Fat & Facial Definition',
    category: 'Body Composition',
    evidence: 'Proven',
    summary: [
      'Body fat percentage is one of the highest-impact controllable factors for jawline and cheekbone clarity.',
      'Facial fat cannot be spot-reduced with facial exercises or chewing gum.',
      'Safe, sustainable fat loss (0.5–0.7% body weight per week) preserves muscle and avoids gauntness.',
    ],
    steps: [
      'Estimate maintenance calories with Mifflin-St Jeor and use a modest 300–450 kcal deficit.',
      'Keep protein high (1.6–2.2 g/kg body weight) and lift weights 3x weekly.',
      'Track 7-day rolling weight averages and waist circumference every 1–2 weeks.',
    ],
    commonMistakes: [
      'Crash dieting under 1200 kcal—causes muscle loss, dull skin, hair shedding, and rebound gain.',
      'Chasing single-digit body fat if you lose energy, sleep quality, or hormonal health.',
    ],
    mythVsReality: {
      myth: 'Chewing gum or jawline trainers burn cheek fat.',
      reality: 'Fat loss is systemic across the entire body; spot reduction does not exist.',
    },
    whenToSeeDoctor: 'Seek medical support if you feel compelled to restrict food severely or BMI drops below 18.5.',
  },
  {
    id: 'guide-skin',
    title: 'Skin Barrier, Acne & UV Protection',
    category: 'Skin',
    evidence: 'Proven',
    summary: [
      '80% of visible improvement comes from three boring basics: gentle cleanser, moisturizer, daily SPF 30–50.',
      'Over-exfoliating destroys the lipid barrier, causing shiny redness and stubborn breakouts.',
      'New products take 4–8 weeks to judge; patch test first.',
    ],
    steps: [
      'Morning: lukewarm water or gentle cleanser, light moisturizer, two-finger broad-spectrum SPF.',
      'Evening: gentle cleanser for 30s, fragrance-free moisturizer on damp skin.',
      'Only after 4+ calm weeks, consider one gentle targeted active slowly.',
    ],
    commonMistakes: [
      'Stacking salicylic acid, glycolic toner, benzoyl peroxide, and retinoid all in week one.',
      'Skipping moisturizer because skin is oily (dehydrated skin often overproduces oil).',
    ],
    mythVsReality: {
      myth: 'Natural lemon juice, baking soda, or toothpaste clear pimples safely.',
      reality: 'Household acids and alkalis burn the stratum corneum and leave dark marks.',
    },
    whenToSeeDoctor: 'Cystic acne, scarring, severe rosacea, or changing moles warrant a dermatologist.',
  },
  {
    id: 'guide-hair',
    title: 'Hair Health, Styling & Hairline Care',
    category: 'Hair',
    evidence: 'Proven',
    summary: [
      'The right haircut for your face shape creates immediate proportional balance.',
      'Wash frequency should match scalp oiliness—clean scalp, conditioned ends.',
      'Early thinning responds best when evaluated early by a physician rather than ignored.',
    ],
    steps: [
      'Identify your hair texture and face shape from your scan or measurements.',
      'Keep a consistent 3–4 week trim cadence and bring clear barber guard notes.',
      'Avoid tight traction hairstyles and extreme flat-iron heat without protectant.',
    ],
    commonMistakes: [
      'Using heavy waxy pomade on thin hair, which clumps strands and exposes scalp.',
      'Waiting years to investigate noticeable crown or temple miniaturization.',
    ],
    mythVsReality: {
      myth: 'Rosemary oil or upside-down scalp massages regrow advanced male pattern baldness.',
      reality: 'Gentle massage improves comfort and blood flow briefly, but androgenetic thinning has medical drivers.',
    },
    whenToSeeDoctor: 'Sudden patchy shedding, scalp sores, or progressive thinning should be checked by a dermatologist.',
  },
  {
    id: 'guide-brows-beard',
    title: 'Facial Hair & Eyebrow Framing',
    category: 'Grooming',
    evidence: 'Proven',
    summary: [
      'Clean, natural eyebrows anchor eye contrast without looking overly sculpted.',
      'Patchy facial hair usually looks sharper kept clean-shaven or short boxed stubble.',
      'Neckline placement makes or breaks beard structure.',
    ],
    steps: [
      'Remove only stray hairs between brows and obvious strays below the outer arch.',
      'If growing stubble/beard, define the neckline ~2 fingers above the Adam’s apple.',
      'Moisturize skin beneath facial hair to stop flaking.',
    ],
    commonMistakes: [
      'Shaving the beard neckline right along the jawbone—it disappears when you talk or look down.',
      'Over-tweezing brows into thin high arches.',
    ],
    mythVsReality: {
      myth: 'Shaving makes hair grow back thicker and darker.',
      reality: 'Shaving leaves a blunt tip that feels coarser briefly; follicle density does not change.',
    },
    whenToSeeDoctor: 'Persistent ingrown bumps (pseudofolliculitis) or sudden patchy beard loss warrant medical advice.',
  },
  {
    id: 'guide-eyes',
    title: 'Eye Area & Under-Eye Care',
    category: 'Eye Area',
    evidence: 'Likely works',
    summary: [
      'Most "tired eyes" come from sleep debt, allergies, dehydration, or thin under-eye skin showing vessels.',
      'Daily SPF around the orbital bone prevents UV collagen loss that deepens hollows.',
      'Allergy rubbing darkens periorbital pigment over time.',
    ],
    steps: [
      'Apply gentle moisturizer and non-stinging SPF around the orbital area.',
      'Treat seasonal nasal allergies so you stop rubbing your eyes.',
      'Use a cool damp compress for 3 minutes if morning lids are puffy.',
    ],
    commonMistakes: [
      'Squinting constantly in photos or daily life ("hunter eyes" strain)—causes tension headaches and crow’s feet.',
      'Applying harsh acne acids near thin eyelid skin.',
    ],
    mythVsReality: {
      myth: 'Squinting exercises permanently raise lower eyelids or change canthal tilt.',
      reality: 'Canthal tilt is determined by orbital bone and tendon attachment; squinting only strains skin.',
    },
    whenToSeeDoctor: 'Chronic dark circles with nasal congestion or sudden eyelid drooping need a medical check.',
  },
  {
    id: 'guide-jaw-neck',
    title: 'Jaw, Chin & Neck Frame',
    category: 'Frame',
    evidence: 'Likely works',
    summary: [
      'Adult jawbone shape does not change from chewing gadgets, mewing, or tapping bone (Not proven).',
      'Relaxed nasal breathing, gentle tongue posture, lower body fat, and low bloat maximize under-chin definition.',
      'Safe cervical alignment (chin tucks) and progressive neck/trap curls strengthen the lower-face frame.',
    ],
    steps: [
      'Keep lips sealed, teeth slightly apart, and tongue resting lightly on the palate during daytime nasal breathing.',
      'Chew normal whole foods evenly on both sides—avoid hard silicone devices or marathon gum sessions.',
      'Perform 2x/week controlled chin tucks and light progressive neck flexion/extension + dumbbell shrugs.',
      'Reduce evening sodium and maintain steady hydration so submental tissue stays lean.',
    ],
    commonMistakes: [
      'Hard chewing silicone blocks or aggressive gum—causes TMJ pain, ear clicking, headaches, and asymmetric masseters.',
      'Forcing hard upward palate pressure or clenching teeth ("hard mewing").',
      'Bonesmashing (hitting face)—dangerous, causes bruising, nerve injury, and fractures.',
    ],
    mythVsReality: {
      myth: 'Mewing or jaw exercisers remodel adult skull sutures in months.',
      reality: 'Adult cranial bones are fused; relaxed tongue/nasal posture only supports submental tone and oral comfort.',
    },
    whenToSeeDoctor: 'Jaw clicking, locking, dental bite pain, or chronic nasal obstruction belong with a dentist or ENT.',
  },
  {
    id: 'guide-posture',
    title: 'Posture & Upper-Body Frame',
    category: 'Posture',
    evidence: 'Proven',
    summary: [
      'Forward head posture and rounded shoulders shorten your neck visually and soften the submental line.',
      'Ergonomics plus 10 minutes of upper-back mobility beats occasional posture "remembering".',
      'Upper-back, rear-delt, and lateral-delt training naturally pulls shoulders open.',
    ],
    steps: [
      'Raise desk monitors to eye height and bring phone up instead of dropping chin.',
      'Do chin tucks, wall angels, and thoracic extensions 4–5x weekly.',
      'Pair mobility with rows, face pulls, and overhead stability in the gym.',
    ],
    commonMistakes: [
      'Forcing a rigid military arch that strains the lower back.',
      'Ignoring 8 hours of slumped sitting while expecting 2 minutes of stretching to erase it.',
    ],
    mythVsReality: {
      myth: 'Back-brace straps fix posture permanently.',
      reality: 'Braces weaken postural muscles if overused; strength and desk setup build lasting alignment.',
    },
    whenToSeeDoctor: 'Numbness, tingling down arms, or persistent spinal pain requires physiotherapy/medical evaluation.',
  },
  {
    id: 'guide-training',
    title: 'Resistance Training for Aesthetics',
    category: 'Training',
    evidence: 'Proven',
    summary: [
      'Three structured full-body sessions per week build 80%+ of achievable lean muscle gains.',
      'Lateral delts, upper back, chest, and legs create the V-taper silhouette that elevates how clothes fit.',
      'Progressive overload beats random high-fatigue circuits.',
    ],
    steps: [
      'Train 3–4 days weekly covering horizontal/vertical push, pull, squat, and hip hinge.',
      'Log every working set and aim to add 1 rep or 1–2.5 kg over weeks.',
      'Sleep 7.5+ hours and eat sufficient protein to recover.',
    ],
    commonMistakes: [
      'Skipping legs or back and only doing curls and crunches.',
      'Chasing soreness or changing routines every week.',
    ],
    mythVsReality: {
      myth: 'You need 6 days a week and exotic supplements to transform your physique.',
      reality: 'Consistent 3–4 day compound progression over 12 months outperforms complicated splits.',
    },
    whenToSeeDoctor: 'Joint pain that worsens under load or chest pain during exertion requires medical clearance.',
  },
  {
    id: 'guide-teeth',
    title: 'Teeth, Breath & Smile Care',
    category: 'Grooming',
    evidence: 'Proven',
    summary: [
      'Clean, healthy teeth and fresh breath carry huge everyday social impact.',
      'Gentle daily flossing, tongue scraping, and fluoride brushing prevent staining and gum inflammation.',
      'Over-the-counter whitening strips help surface stains, while bite alignment needs an orthodontist.',
    ],
    steps: [
      'Brush twice daily for 2 minutes with soft bristles; do not scrub gums hard.',
      'Floss every night and rinse with water after coffee or dark tea.',
      'Visit a dentist every 6 months for cleanings.',
    ],
    commonMistakes: [
      'Brushing with charcoal or baking soda abrasives that thin enamel (making teeth look yellower long-term).',
      'Ignoring bleeding gums.',
    ],
    mythVsReality: {
      myth: 'Mail-order DIY aligners or teeth filing are safe shortcuts.',
      reality: 'Unmonitored tooth movement risks root damage and gum recession; enamel never grows back.',
    },
    whenToSeeDoctor: 'Crowding, bite issues, bleeding gums, or tooth sensitivity require a licensed dentist or orthodontist.',
  },
  {
    id: 'guide-style',
    title: 'Style, Fit & Color Basics',
    category: 'Style',
    evidence: 'Proven',
    summary: [
      'Shoulder seam placement, sleeve length, and trouser hem matter more than brand logos.',
      'A tight capsule of 10–15 well-fitting neutral pieces creates dozens of sharp outfits.',
      'Match garment contrast and warmth to your skin undertone and hair contrast.',
    ],
    steps: [
      'Check shoulder seams sit right on the shoulder bone—not drooping down the arm.',
      'Stick to 2–3 core neutrals (navy, charcoal, off-white, olive, tan) plus 1 accent.',
      'Keep shoes clean and proportioned to trouser leg opening.',
    ],
    commonMistakes: [
      'Buying expensive pieces in poor fits instead of tailoring affordable basics.',
      'Wearing overly tight skinny cuts or sloppy oversized sweats everywhere.',
    ],
    mythVsReality: {
      myth: 'Trendy streetwear pieces fix sloppy grooming or poor fit.',
      reality: 'Simple clean silhouettes that fit your frame always outlast micro-trends.',
    },
    whenToSeeDoctor: 'N/A — pure style craft.',
  },
  {
    id: 'guide-presence',
    title: 'Voice, Eye Contact & Composure',
    category: 'Presence',
    evidence: 'Likely works',
    summary: [
      'Unhurried pacing, clear articulation, and warm eye contact transform how people perceive you.',
      'Nasal/diaphragmatic breathing lowers nervous tension and steadies vocal tone.',
      'Calm posture signals comfort in your own skin.',
    ],
    steps: [
      'Speak 10–15% slower and pause cleanly instead of filling gaps with "um/like".',
      'Relax shoulders down and keep hands visible and unhurried.',
      'Practice genuine warm smiles in real conversations.',
    ],
    commonMistakes: [
      'Forcing an unnaturally deep "podcast voice" that sounds strained.',
      'Staring intensely without blinking—aim for relaxed 60–70% eye contact.',
    ],
    mythVsReality: {
      myth: 'Charisma is purely genetic.',
      reality: 'Pacing, listening, and composure improve rapidly with deliberate repetition.',
    },
    whenToSeeDoctor: 'Chronic hoarseness lasting >3 weeks should be evaluated by an ENT.',
  },
  {
    id: 'guide-photography',
    title: 'Honest Photography & Scan Setup',
    category: 'Measurement',
    evidence: 'Proven',
    summary: [
      'Close-up wide-angle phone lenses (24mm) inflate nose size by 20–30% and shrink ears/jaw.',
      'Overhead bathroom lighting casts harsh under-eye shadows and exaggerates skin texture.',
      'Use identical distance, eye level, and soft window light for fair 14-day comparisons.',
    ],
    steps: [
      'Stand facing a soft daylight window (no direct harsh sunbeam).',
      'Hold phone at full arm’s length at exact eye height, or use 2x lens from 1.2m away.',
      'Keep expression neutral, hair off forehead, and glasses removed.',
    ],
    commonMistakes: [
      'Scanning once in dark yellow indoor light and 2 days later in bright daylight, then thinking your face changed.',
      'Tilting camera upward or downward, which fakes jawline or brow tilt changes.',
    ],
    mythVsReality: {
      myth: 'A single selfie reflects your true immutable bone structure.',
      reality: 'Focal length, lighting angle, and lens distortion alter facial ratios dramatically.',
    },
    whenToSeeDoctor: 'N/A — measurement hygiene.',
  },
];

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    term: 'PSL (Prettyboy / Aesthetics Scale)',
    meaning: 'An internet forum scale (often 1–8) used to rate facial harmony.',
    honestTake: 'Subjective internet slang, not a clinical metric. Useful at most as a rough consistency check against your own past photos under identical lighting.',
  },
  {
    term: 'Canthal Tilt',
    meaning: 'The angle between the inner eye corner (medial canthus) and outer eye corner (lateral canthus).',
    honestTake: 'Slightly positive or neutral tilt is common, but eye health, rested lids, and clean brows matter far more in motion than a 2-degree tilt difference.',
  },
  {
    term: 'fWHR (Facial Width-to-Height Ratio)',
    meaning: 'Bizygomatic cheekbone width divided by upper face height (brow ridge to upper lip).',
    honestTake: 'Highly sensitive to camera distance and expression. Cannot be altered without surgery; framing via hair and body fat changes perceived width.',
  },
  {
    term: 'Gonial Angle',
    meaning: 'The angle at the back corner of the lower jaw between the ramus and jaw body.',
    honestTake: 'Determined by genetics and skeletal growth. Lowering body fat, improving neck posture, and tidy facial hair change how clearly the angle reads.',
  },
  {
    term: 'Submental Angle',
    meaning: 'The angle under the chin where the underside of the jaw meets the front of the neck.',
    honestTake: 'Strongly influenced by body fat, fluid retention, and forward head posture—all controllable without extreme measures.',
  },
  {
    term: 'Ricketts E-Line',
    meaning: 'A profile reference line drawn from the tip of the nose to the front tip of the chin.',
    honestTake: 'An orthodontic reference used to assess lip protrusion. Only orthodontics or surgery moves teeth/jaws relative to this line.',
  },
  {
    term: 'Facial Thirds',
    meaning: 'Dividing face height into upper (hairline to brow), middle (brow to nose base), and lower (nose base to chin).',
    honestTake: 'A classic art proportion guideline. Hairstyle volume easily shifts perceived upper-third balance.',
  },
  {
    term: 'Midface Ratio',
    meaning: 'Interpupillary distance divided by distance from pupil center to upper lip line.',
    honestTake: 'Purely skeletal and heavily distorted by wide-angle selfie lenses taken close up.',
  },
  {
    term: 'Softmaxxing',
    meaning: 'Non-invasive self-care improvements: skincare, fitness, nutrition, sleep, hair, grooming, posture, and style.',
    honestTake: 'Delivers 90%+ of realistic improvement safely for almost everyone.',
  },
  {
    term: 'Hardmaxxing',
    meaning: 'Invasive medical or surgical interventions (orthognathic surgery, implants, rhinoplasty, fillers).',
    honestTake: 'Carries real medical, financial, and psychological risks. Strictly belongs in consultations with board-certified physicians.',
  },
  {
    term: 'Mewing',
    meaning: 'Keeping the tongue resting against the roof of the mouth with nasal breathing.',
    honestTake: 'Fine as relaxed oral/nasal posture, NOT proven to reshape adult jawbone or cheekbones.',
  },
  {
    term: 'Hunter Eyes',
    meaning: 'Internet term for deep-set, low-brow, slightly positive-tilt eyes.',
    honestTake: 'Skeletal orbit trait. Forcing a constant squint only looks unnatural and creates tension.',
  },
  {
    term: 'Mogging',
    meaning: 'Slang for noticeably outshining someone else in appearance.',
    honestTake: 'Comparison mindset hurts consistency. Only compare yourself to your own past baseline.',
  },
  {
    term: 'Skin Barrier',
    meaning: 'The outermost lipid-and-cell layer (stratum corneum) holding moisture in and irritants out.',
    honestTake: 'Protecting your barrier is the secret behind calm, clear skin.',
  },
  {
    term: 'Retinoid Purging',
    meaning: 'Temporary flare of preexisting micro-comedones when starting cell-turnover actives like retinoids.',
    honestTake: 'True purging clears within 4–8 weeks in usual breakout zones; widespread burning or rash is irritation, not purging.',
  },
  {
    term: 'Interpupillary Distance (IPD)',
    meaning: 'Distance between the centers of left and right pupils, used to scale facial ratios.',
    honestTake: 'A reliable internal ruler on front photos so measurements stay independent of pixel resolution.',
  },
];

export const MYTHS_WALL: MythClaim[] = [
  { id: 'm1', claim: 'Bonesmashing (hitting cheekbones/jaw) builds stronger facial bone.', verdict: 'False', evidence: 'Not proven', explanation: 'Micro-fractures and blunt trauma cause bruising, nerve damage, swelling, and asymmetry—not aesthetic bone sculpting.' },
  { id: 'm2', claim: 'Mewing reshapes adult skull and maxilla bones in months.', verdict: 'False', evidence: 'Not proven', explanation: 'Adult cranial sutures are fused. Tongue posture only supports comfortable nasal breathing and momentary submental lift.' },
  { id: 'm3', claim: 'Hard silicone jaw exercisers give everyone a sculpted model jaw.', verdict: 'False', evidence: 'Not proven', explanation: 'Overworking masseters risks TMJ joint pain, headaches, and bloated lower-cheek width without sharpening bone.' },
  { id: 'm4', claim: 'Chewing gum burns cheek fat locally.', verdict: 'False', evidence: 'Not proven', explanation: 'Spot reduction of fat is physiologically impossible; fat drops systemically from calorie balance.' },
  { id: 'm5', claim: 'Lowering excess body fat reveals existing jawline structure.', verdict: 'True', evidence: 'Proven', explanation: 'Reducing subcutaneous facial fat is one of the strongest safe ways to sharpen jaw and cheek contours.' },
  { id: 'm6', claim: 'Daily broad-spectrum SPF slows visible skin aging.', verdict: 'True', evidence: 'Proven', explanation: 'UVA/UVB rays drive collagen breakdown, dark spots, and rough texture; daily SPF 30–50 blocks this.' },
  { id: 'm7', claim: 'Squinting exercises permanently change your canthal tilt.', verdict: 'False', evidence: 'Not proven', explanation: 'Eye tilt is fixed by orbital bone and tendon attachment. Chronic squinting strains skin and muscles.' },
  { id: 'm8', claim: 'High evening sodium and alcohol cause morning facial puffiness.', verdict: 'True', evidence: 'Proven', explanation: 'Sodium and alcohol shift fluid balance overnight, pooling water in loose facial tissues by morning.' },
  { id: 'm9', claim: 'Drinking 5+ liters of water a day clears severe acne on its own.', verdict: 'False', evidence: 'Not proven', explanation: 'Hydration supports skin health, but acne is driven by oil, clogged pores, bacteria, and inflammation.' },
  { id: 'm10', claim: 'Toothpaste or lemon juice safely shrinks pimples overnight.', verdict: 'False', evidence: 'Not proven', explanation: 'Both severely irritate and burn the skin barrier, often leaving longer-lasting dark marks.' },
  { id: 'm11', claim: 'Consistent 7.5–8 hours of sleep reduces under-eye puffiness.', verdict: 'True', evidence: 'Proven', explanation: 'Sleep regulates cortisol, microcirculation, and overnight tissue recovery.' },
  { id: 'm12', claim: 'Fixing forward head posture improves how your neck and chin look from the side.', verdict: 'True', evidence: 'Proven', explanation: 'Pulling the head back over the spine immediately lengthens the neck and tightens submental skin tension.' },
  { id: 'm13', claim: 'Wide-angle selfie cameras at 25 cm distort facial proportions.', verdict: 'True', evidence: 'Proven', explanation: 'Close perspective enlarges the nose and narrows the outer jaw/ears compared to a 1.2m portrait lens.' },
  { id: 'm14', claim: 'Shaving your face makes facial hair grow back thicker.', verdict: 'False', evidence: 'Not proven', explanation: 'Blunt cut tips feel stubbly briefly, but follicle count and shaft thickness are unchanged.' },
  { id: 'm15', claim: 'Oily skin does not need moisturizer.', verdict: 'False', evidence: 'Not proven', explanation: 'Lightweight non-comedogenic moisturizer prevents barrier dehydration and rebound oiliness.' },
  { id: 'm16', claim: 'More skincare actives at higher percentages always give faster results.', verdict: 'False', evidence: 'Not proven', explanation: 'Stacking strong acids and retinoids strips the barrier and worsens inflammation.' },
  { id: 'm17', claim: 'Haircuts matched to face shape improve visual symmetry and balance.', verdict: 'True', evidence: 'Likely works', explanation: 'Adding volume or length in strategic zones offsets narrow, round, or long facial proportions.' },
  { id: 'm18', claim: 'Mouth taping fixes skeletal jaw recession.', verdict: 'False', evidence: 'Not proven', explanation: 'It does not alter bone; if nasal breathing is blocked at night, forcing mouth closure is unsafe without medical advice.' },
  { id: 'm19', claim: 'Cold showers or ice plunges boost testosterone long-term for jaw growth.', verdict: 'False', evidence: 'Not proven', explanation: 'Brief cold exposure gives short alertness spikes, not meaningful chronic hormone or skeletal remodeling.' },
  { id: 'm20', claim: 'Strength training 3x weekly improves overall frame and clothing drape.', verdict: 'True', evidence: 'Proven', explanation: 'Building shoulders, upper back, and legs reshapes silhouette far more reliably than micro-isolation hacks.' },
  { id: 'm21', claim: 'Pores can permanently "open" and "close" with steam and cold water.', verdict: 'False', evidence: 'Not proven', explanation: 'Pores have no muscles; gentle cleansing keeps them clear so they appear smaller.' },
  { id: 'm22', claim: 'Using sunscreen indoors near sunny windows still helps.', verdict: 'True', evidence: 'Proven', explanation: 'Standard window glass blocks UVB but transmits significant UVA rays that age skin.' },
  { id: 'm23', claim: 'Charcoal toothpaste safely whitens teeth daily.', verdict: 'False', evidence: 'Not proven', explanation: 'Abrasive charcoal erodes white enamel over time, exposing yellower dentin beneath.' },
  { id: 'm24', claim: 'Neck and upper-trap training makes the lower face frame look stronger.', verdict: 'Partly true', evidence: 'Likely works', explanation: 'Adding proportional neck muscle frames the jaw well, though safe light loads are essential.' },
  { id: 'm25', claim: 'Natural "no-shampoo" permanently cures dandruff.', verdict: 'False', evidence: 'Not proven', explanation: 'Seborrheic dandruff is linked to Malassezia yeast and scalp sebum; medicated cleansers manage it best.' },
  { id: 'm26', claim: 'Eating high protein supports hair, skin collagen, and lean body composition.', verdict: 'True', evidence: 'Proven', explanation: 'Amino acids are building blocks for keratin, collagen turnover, and muscle retention.' },
  { id: 'm27', claim: 'Lymphatic gua sha permanently lifts facial structure.', verdict: 'Partly true', evidence: 'Likely works', explanation: 'Gentle massage temporarily moves morning fluid for a few hours; it does not tighten ligaments permanently.' },
  { id: 'm28', claim: 'Dairy or high-glycemic spikes worsen acne in some people.', verdict: 'Partly true', evidence: 'Likely works', explanation: 'High-glycemic diets and skim milk correlate with breakouts in susceptible individuals, though triggers vary.' },
  { id: 'm29', claim: 'Tanning beds give a healthy protective "base tan".', verdict: 'False', evidence: 'Not proven', explanation: 'Tanning is visible DNA/UV stress damage that accelerates wrinkling and skin cancer risk.' },
  { id: 'm30', claim: 'Patch testing new skincare for 48 hours prevents costly full-face flare-ups.', verdict: 'True', evidence: 'Proven', explanation: 'Testing one new product behind the ear or forearm catches contact allergies early.' },
  { id: 'm31', claim: 'Sucking cheeks inward ("hollow cheek" exercises) creates hollow cheekbones.', verdict: 'False', evidence: 'Not proven', explanation: 'Buccal fat and facial fat distribution respond to genetics and overall body fat, not cheek-sucking.' },
  { id: 'm32', claim: 'Clean pillowcases weekly help reduce cheek breakouts.', verdict: 'Partly true', evidence: 'Likely works', explanation: 'Replacing oil, hair product, and sweat buildup on pillowcases lowers friction and pore transfer.' },
  { id: 'm33', claim: 'A single AI scan score defines your real-world attractiveness.', verdict: 'False', evidence: 'Not proven', explanation: 'Static 2D geometry ignores expression, voice, warmth, movement, styling, and lighting variance.' },
  { id: 'm34', claim: 'Wearing well-fitted shoulder seams changes perceived frame immediately.', verdict: 'True', evidence: 'Proven', explanation: 'Clothes fitted cleanly at shoulders and hem sharpen posture and body proportions instantly.' },
  { id: 'm35', claim: 'Eyebrow serums or oils grow eyebrows rapidly for everyone.', verdict: 'False', evidence: 'Not proven', explanation: 'Oils condition hairs so they break less; only specific medical/prescription compounds affect follicle cycle.' },
  { id: 'm36', claim: 'Smoking and vaping noticeably dull skin tone and accelerate lines.', verdict: 'True', evidence: 'Proven', explanation: 'Nicotine constricts skin micro-vessels and degrades collagen and elastin.' },
  { id: 'm37', claim: 'You can lengthen adult clavicles or height with hanging stretches.', verdict: 'False', evidence: 'Not proven', explanation: 'Once growth plates fuse, bones do not lengthen; posture decompression only restores lost slouch height.' },
  { id: 'm38', claim: 'Potassium-rich whole foods help offset high-sodium meal bloat.', verdict: 'True', evidence: 'Proven', explanation: 'Potassium promotes renal sodium excretion and stabilizes fluid balance.' },
  { id: 'm39', claim: 'Topical collagen creams penetrate deep enough to rebuild dermal collagen.', verdict: 'False', evidence: 'Not proven', explanation: 'Collagen molecules are too large to penetrate dermis; they act only as surface humectant moisturizers.' },
  { id: 'm40', claim: 'Hot water facial washes clean pores better than lukewarm water.', verdict: 'False', evidence: 'Not proven', explanation: 'Hot water strips protective lipids and triggers redness and broken capillaries.' },
  { id: 'm41', claim: 'Stopping all skincare actives during irritation heals redness faster.', verdict: 'True', evidence: 'Proven', explanation: 'A 7-day bland cleanser + moisturizer reset lets the barrier rebuild lipids.' },
  { id: 'm42', claim: 'Consistent self-care habits over 90 days beat extreme 7-day sprints.', verdict: 'True', evidence: 'Proven', explanation: 'Skin turnover (~28 days), hair cycles, and body recomposition all reward steady multi-month consistency.' },
];

export const MEDICAL_INFO_CARDS: MedicalTopicCard[] = [
  {
    id: 'med-tretinoin',
    name: 'Tretinoin (Topical Retinoid)',
    whatItIs: 'A prescription-strength vitamin A derivative used for acne, skin texture, and photoaging.',
    evidence: 'Proven',
    risks: 'Dryness, peeling, barrier irritation, increased sun sensitivity, and contraindication in pregnancy.',
    guidance: 'Talk to a dermatologist for evaluation, prescription suitability, and safe supervision.',
  },
  {
    id: 'med-minoxidil',
    name: 'Minoxidil',
    whatItIs: 'A vasodilator medication (topical or oral) used clinically to support hair follicle growth phase.',
    evidence: 'Proven',
    risks: 'Scalp irritation, initial shedding phase, unwanted facial hair if transferred, or systemic blood-pressure/heart effects if oral.',
    guidance: 'Talk to a physician or dermatologist before starting—and note it requires ongoing medical maintenance.',
  },
  {
    id: 'med-finasteride',
    name: 'Finasteride',
    whatItIs: 'A prescription 5-alpha-reductase inhibitor that lowers DHT to slow male pattern hair loss.',
    evidence: 'Proven',
    risks: 'Hormonal/sexual side effects in a minority of users, mood changes, and strict handling precautions around pregnancy.',
    guidance: 'Requires an in-person or licensed physician consultation with full risk-benefit review.',
  },
  {
    id: 'med-isotretinoin',
    name: 'Isotretinoin',
    whatItIs: 'A potent oral prescription medication reserved for severe, scarring, or treatment-resistant cystic acne.',
    evidence: 'Proven',
    risks: 'Severe dryness, blood lipid/liver enzyme shifts, joint aches, mood monitoring, and strict teratogenic risk.',
    guidance: 'Only prescribed and monitored closely by a dermatologist with regular lab checks.',
  },
  {
    id: 'med-orthodontics',
    name: 'Orthodontics',
    whatItIs: 'Braces or clear aligners supervised clinically to correct dental crowding, bite misalignment, or jaw function.',
    evidence: 'Proven',
    risks: 'Root resorption, enamel decalcification if hygiene lapses, gum recession, and relapse without retainers.',
    guidance: 'Consult an accredited orthodontist for X-rays and functional bite assessment.',
  },
  {
    id: 'med-fillers',
    name: 'Dermal Fillers',
    whatItIs: 'Injectable gels (commonly hyaluronic acid) placed medically to restore or contour soft-tissue volume.',
    evidence: 'Proven',
    risks: 'Bruising, asymmetry, migration, granulomas, and rare but serious vascular occlusion.',
    guidance: 'Only discuss with a board-certified dermatologist or plastic surgeon with emergency reversal protocols.',
  },
  {
    id: 'med-surgery',
    name: 'Aesthetic & Maxillofacial Surgery',
    whatItIs: 'Permanent structural procedures (e.g., rhinoplasty, genioplasty, orthognathic jaw surgery) for functional or aesthetic correction.',
    evidence: 'Proven',
    risks: 'Anesthesia complications, nerve numbness, scarring, infection, dissatisfaction, and long recovery.',
    guidance: 'Always consult board-certified surgeons and get second opinions; never rush permanent surgery.',
  },
];

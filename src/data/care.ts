import type { FaceShape, SkinType } from '../types';

export interface HaircutRecommendation {
  faceShape: FaceShape;
  summary: string;
  cuts: Array<{
    name: string;
    whyItWorks: string;
    barberScript: string;
  }>;
}

export const HAIRCUT_BY_FACE_SHAPE: Record<FaceShape, HaircutRecommendation> = {
  oval: {
    faceShape: 'oval',
    summary: 'Balanced proportions suit almost any cut—avoid heavy forward bangs that hide natural symmetry.',
    cuts: [
      {
        name: 'Textured Crop / Taper',
        whyItWorks: 'Clean side taper frames cheekbones while natural top texture adds dimension.',
        barberScript: 'Low-to-mid drop taper on the sides (#2 fading down), 2.5–3 inches textured with point-cutting on top, natural hairline.',
      },
      {
        name: 'Classic Side Part',
        whyItWorks: 'Sharpens upper-third framing without elongating the face unnecessarily.',
        barberScript: 'Scissor-cut sides tapered cleanly around the ears, 3.5 inches on top with light layering to sweep cleanly to one side.',
      },
    ],
  },
  square: {
    faceShape: 'square',
    summary: 'Strong jaw width pairs best with either crisp short sides or medium textured volume on top.',
    cuts: [
      {
        name: 'Medium Textured Quiff',
        whyItWorks: 'Adds slight vertical height to complement wide jaw angles.',
        barberScript: 'Mid skin or #1.5 taper on sides, leave 3.5–4 inches on top blended cleanly, point-cut front for lift.',
      },
      {
        name: 'Clean Buzz with Tapered Sides',
        whyItWorks: 'Highlights natural jaw geometry cleanly when hair density is even.',
        barberScript: '#4 or #5 guard on top, seamless #1.5 fade on the sides and back, natural squared nape.',
      },
    ],
  },
  round: {
    faceShape: 'round',
    summary: 'Create subtle vertical lift on top and keep sides tighter to visually lengthen and sharpen.',
    cuts: [
      {
        name: 'Angular Fringe / Textured Crop',
        whyItWorks: 'Tight sides trim lateral fullness while textured height elongates the upper third.',
        barberScript: 'High-mid taper (#1 to #2 on sides) kept tight near temples, 3–3.5 inches textured on top styled slightly up and forward.',
      },
      {
        name: 'Side-Swept Brush Up',
        whyItWorks: 'Asymmetric diagonal volume breaks circular symmetry cleanly.',
        barberScript: 'Tight #1.5–#2 tapered sides, 3.5–4 inches on top with crown slightly shorter than front for natural lift.',
      },
    ],
  },
  diamond: {
    faceShape: 'diamond',
    summary: 'Cheekbones are widest; add modest fullness at temples and forehead to balance narrow jaw/forehead.',
    cuts: [
      {
        name: 'Layered Side-Swept Fringe',
        whyItWorks: 'Softens wide cheekbones and widens the upper forehead visually.',
        barberScript: 'Scissor-tapered sides (leave #3–#4 bulk around temples, not skin-tight), 3.5–4 inches textured layers on top.',
      },
      {
        name: 'Medium Flow / Curtain Layers',
        whyItWorks: 'Frames temple width and balances pointed chin proportions.',
        barberScript: 'All-scissor layered cut, 4–5 inches on top parted softly, light graduation around ears and nape.',
      },
    ],
  },
  heart: {
    faceShape: 'heart',
    summary: 'Wider forehead and narrower chin benefit from textured mid-length sides and softer forehead framing.',
    cuts: [
      {
        name: 'Textured Medium Flow',
        whyItWorks: 'Adds gentle width near jawline while keeping crown controlled.',
        barberScript: 'Keep sides scissor-cut at 1.5–2 inches rather than tight fade, 3.5–4.5 inches layered top, soft natural fringe.',
      },
      {
        name: 'Relaxed Side Part',
        whyItWorks: 'Breaks up forehead width without adding excessive height.',
        barberScript: 'Low scissor taper (#3 equivalent on sides), 3 inches on top styled with matte paste.',
      },
    ],
  },
  oblong: {
    faceShape: 'oblong',
    summary: 'Longer vertical face looks most balanced with side fullness and moderate forehead coverage—avoid tall spikes.',
    cuts: [
      {
        name: 'Textured Fringe with Scissor Sides',
        whyItWorks: 'Reduces visual vertical length by covering upper forehead and keeping side structure.',
        barberScript: 'Scissor cut sides (#3–#4 length, no high fade), 2.5–3 inches forward-textured top with light choppy fringe.',
      },
      {
        name: 'Mid-Length Layered Sweep',
        whyItWorks: 'Adds horizontal width around temples and cheekbones.',
        barberScript: 'Medium scissor-over-comb taper, 3–3.5 inches balanced across top and crown, natural low volume.',
      },
    ],
  },
};

export const SKIN_STARTER_GUIDE: Record<SkinType, { summary: string; am: string[]; pm: string[]; avoid: string }> = {
  normal: {
    summary: 'Balanced oil and hydration. Keep your skin barrier calm with simple daily basics.',
    am: ['Lukewarm water rinse or gentle wash', 'Light lotion moisturizer', 'Sunscreen SPF 30–50'],
    pm: ['Gentle non-drying face wash', 'Barrier cream (ceramides) on slightly damp skin'],
    avoid: 'Harsh scrubs or stacking multiple strong acids.',
  },
  oily: {
    summary: 'Higher natural oil. Wash gently and use light gel hydration so skin does not make rebound oil.',
    am: ['Gentle gel cleanser', 'Oil-free light gel lotion (skip if very humid)', 'Light non-greasy SPF 30–50'],
    pm: ['Gentle gel cleanser (30s soft massage)', 'Light oil-free hydrating gel or lotion'],
    avoid: 'Alcohol-heavy toners and hot water — both irritate skin and trigger more oil.',
  },
  dry: {
    summary: 'Loses moisture easily. Use creamy non-foaming wash and richer barrier creams.',
    am: ['Lukewarm water rinse only (skip morning soap)', 'Rich barrier cream on damp skin', 'Moisturizing SPF 30–50'],
    pm: ['Cream or hydrating milk cleanser', 'Rich barrier cream (ceramide or squalane)'],
    avoid: 'Strong foaming soaps, clay masks, and frequent exfoliating.',
  },
  combination: {
    summary: 'Oily nose/forehead (T-zone) with drier cheeks. Use a mild wash and layer cream only where dry.',
    am: ['Gentle balanced face wash', 'Light lotion over whole face', 'Non-greasy SPF 30–50'],
    pm: ['Gentle cleanser', 'Light lotion overall + extra layer on dry cheeks'],
    avoid: 'Harsh oil-stripping washes that leave your cheeks tight or flaky.',
  },
  sensitive: {
    summary: 'Reacts fast to fragrance, essential oils, and strong actives. Fewer products work best.',
    am: ['Lukewarm water rinse', 'Fragrance-free barrier cream', 'Mineral zinc/titanium SPF 30–50'],
    pm: ['Ultra-gentle fragrance-free wash', 'Plain barrier balm or lotion'],
    avoid: 'Perfume/fragrance, essential oils, scrubs, and testing >1 new product every 2–3 weeks.',
  },
};

export interface CareGuideCard {
  title: string;
  evidence: 'Proven' | 'Likely works' | 'Not proven';
  steps: string[];
  mistake: string;
}

export const SKIN_ESSENTIAL_CARDS: CareGuideCard[] = [
  {
    title: 'Patch test new products first',
    evidence: 'Proven',
    steps: [
      'Dab a tiny amount behind one ear or on your inner forearm.',
      'Wait 24–48 hours before putting it on your whole face.',
      'Start only 1 new product every 2 weeks so you know what caused any reaction.',
    ],
    mistake: 'Trying 3 new serums on the same night — makes irritation hard to trace.',
  },
  {
    title: 'Daily sunscreen (SPF 30–50)',
    evidence: 'Proven',
    steps: [
      'Use two finger-lengths of SPF for face and neck every morning.',
      'Reapply if outside in midday sun for 2+ hours.',
      'Protects even skin tone, dark marks, and long-term skin texture.',
    ],
    mistake: 'Skipping SPF on cloudy days or applying a tiny pea-sized dot.',
  },
  {
    title: '7-day barrier reset',
    evidence: 'Proven',
    steps: [
      'If skin stings, flakes, or turns red, stop all acids, scrubs, and retinoids for 7 days.',
      'Use only: lukewarm water / gentle wash + plain moisturizer + SPF.',
      'See a board-certified dermatologist if deep cystic or painful breakouts continue.',
    ],
    mistake: 'Scrubbing or drying out irritated skin with harsh acne washes.',
  },
];

export const GROOMING_CHECKLIST_CARDS: CareGuideCard[] = [
  {
    title: 'Eyebrows',
    evidence: 'Likely works',
    steps: [
      'Only tidy stray hairs in the center (between brows) and clearly below the tail.',
      'Leave natural thickness and top shape untouched.',
    ],
    mistake: 'Over-thinning or shaving the brow arch — looks unnatural and grows slowly.',
  },
  {
    title: 'Facial hair & neck line',
    evidence: 'Likely works',
    steps: [
      'Place two fingers right above your Adam’s apple: trim clean below that line, never higher onto the jawline.',
      'Keep clean-shaven or trimmed to one even length (e.g., 3–5 mm) if growth is patchy.',
    ],
    mistake: 'Carving the neckline too high up toward the jaw — shrinks your profile from the side.',
  },
  {
    title: 'Teeth, breath & nails',
    evidence: 'Proven',
    steps: [
      'Brush gently 2 min morning & night, floss once daily, and use a soft tongue scraper.',
      'Trim fingernails evenly once a week and keep cuticles clean.',
    ],
    mistake: 'Scrubbing teeth too hard or skipping flossing.',
  },
];

export const STYLE_BASICS = {
  fitChecklist: [
    'Shoulder seams sit cleanly on the outer edge of your shoulder bone — not drooping down your arm.',
    'T-shirt sleeves hit mid-bicep with a little breathing room (not tight, not flaring wide).',
    'Untucked shirts stop near mid-zipper / mid-pocket — not halfway down your thighs.',
    'Pants sit cleanly at your waist with little or no bunching over clean shoes.',
  ],
  colorPalettes: [
    { name: 'Clean Monochrome', colors: ['Charcoal', 'Gray', 'Off-White', 'Black'], bestFor: 'Easy sharp everyday outfits' },
    { name: 'Warm Earth Tones', colors: ['Olive', 'Stone', 'Espresso', 'Cream'], bestFor: 'Warm & olive skin undertones' },
    { name: 'Classic Crisp Navy', colors: ['Deep Navy', 'Slate Blue', 'Crisp White', 'Sand'], bestFor: 'Works cleanly on almost everyone' },
  ],
};

export const POSTURE_CARE_TIPS: CareGuideCard[] = [
  {
    title: 'Phone & desk posture reset',
    evidence: 'Proven',
    steps: [
      'Bring your phone closer to eye height instead of dropping your chin down.',
      'Keep ears stacked over shoulders and ribs gently down when standing.',
    ],
    mistake: 'Forcing shoulders painfully back while arching your lower back.',
  },
];

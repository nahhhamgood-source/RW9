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
    summary: 'Balanced oil and hydration. Protect your barrier with simple daily basics.',
    am: ['Lukewarm rinse or gentle cleanser', 'Lightweight lotion moisturizer', 'Broad-spectrum SPF 30–50'],
    pm: ['Gentle non-stripping cleanser', 'Ceramide moisturizer on damp skin'],
    avoid: 'Unnecessary harsh scrubs or stacking multiple acids.',
  },
  oily: {
    summary: 'Higher sebum output. Cleanse gently and hydrate with light gel textures so skin does not rebound-oil.',
    am: ['Gentle foaming/gel cleanser', 'Oil-free gel moisturizer (optional if humid)', 'Lightweight matte/fluid SPF 30–50'],
    pm: ['Gentle gel cleanser (30s massage)', 'Oil-free hydrating gel or lotion'],
    avoid: 'Alcohol-heavy astringents and hot water—both trigger more oil.',
  },
  dry: {
    summary: 'Low lipid retention. Focus on creamy non-foaming cleansing and barrier-rich moisturizers.',
    am: ['Lukewarm water rinse only (skip morning soap)', 'Rich ceramide cream on damp skin', 'Moisturizing SPF 30–50'],
    pm: ['Cream/hydrating milk cleanser', 'Ceramide + squalane cream'],
    avoid: 'Foaming sulfates, clay masks, and frequent exfoliation.',
  },
  combination: {
    summary: 'Oily T-zone with normal or dry cheeks. Keep cleanser mild and adjust moisturizer thickness by zone.',
    am: ['Gentle balanced cleanser', 'Light lotion across whole face', 'Non-greasy SPF 30–50'],
    pm: ['Gentle cleanser', 'Light lotion overall + extra layer on dry cheeks'],
    avoid: 'Stripping cleansers aimed at T-zone oil that parch your cheeks.',
  },
  sensitive: {
    summary: 'Reacts easily to fragrance, essential oils, and strong actives. Less is always more.',
    am: ['Lukewarm water rinse', 'Fragrance-free barrier cream', 'Mineral zinc/titanium SPF 30–50'],
    pm: ['Ultra-gentle fragrance-free cleanser', 'Bland ceramide barrier balm'],
    avoid: 'Fragrance, essential oils, scrubs, and introducing >1 product every 2–3 weeks.',
  },
};

export const STYLE_BASICS = {
  fitChecklist: [
    'Shoulder seams sit cleanly on the edge of the acromion bone—never drooping halfway down the bicep.',
    'T-shirt sleeves hit mid-bicep with 1–2 cm ease (not cutting circulation, not billowing).',
    'Shirts end around mid-fly; untucked button-downs hit mid-pocket.',
    'Trousers sit cleanly at waist/hip with zero or slight quarter-break over clean shoes.',
  ],
  colorPalettes: [
    { name: 'Low-Contrast Monochrome', colors: ['Charcoal', 'Heather Gray', 'Off-White', 'Black'], bestFor: 'Sharp everyday minimalism' },
    { name: 'Warm Earth Neutrals', colors: ['Olive', 'Stone', 'Espresso', 'Cream'], bestFor: 'Warm/olive skin undertones' },
    { name: 'Cool Crisp Navy', colors: ['Deep Navy', 'Slate Blue', 'Crisp White', 'Sand'], bestFor: 'Universal smart-casual baseline' },
  ],
};

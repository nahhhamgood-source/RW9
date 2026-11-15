import type { EvidenceTag, GrowthProgramProgress } from '../types';
import type { GuidedExerciseStep } from './exercisePrograms';

export interface DailyGrowthHabit {
  id: string;
  title: string;
  dose: string;
  evidence: EvidenceTag;
  evidenceDetail: string;
  why: string;
  xp: number;
  slug?: string;
  watchQuery?: string;
}

export const DAILY_GROWTH_HABITS: DailyGrowthHabit[] = [
  {
    id: 'sleep-window',
    title: 'Sleep on time',
    dose: '8–10h teens · 7–9h adults',
    evidence: 'Proven',
    evidenceDetail: 'Proven for health and natural growth hormone release during deep sleep.',
    why: 'Deep slow-wave sleep early in the night triggers your largest daily growth hormone pulses and repairs muscle & cartilage tissue.',
    xp: 20,
  },
  {
    id: 'protein-calcium-d',
    title: 'Protein at every meal + calcium & vitamin D foods',
    dose: 'Protein + milk, yogurt, eggs, or fish',
    evidence: 'Likely works',
    evidenceDetail: 'Likely works when diet lacks protein, calcium, or vitamin D.',
    why: 'Bone matrix needs amino acids and minerals to grow and stay dense. Food first beats random pills unless a doctor finds a deficiency.',
    xp: 15,
  },
  {
    id: 'outdoor-daylight',
    title: '15 minutes outdoors in daylight',
    dose: '15 min outdoor light',
    evidence: 'Likely works',
    evidenceDetail: 'Supports vitamin D levels and locks in an earlier sleep cycle.',
    why: 'Morning or midday sunlight helps vitamin D production and keeps your circadian rhythm anchored so sleep happens on time.',
    xp: 12,
  },
  {
    id: 'dead-hang',
    title: 'Dead hang',
    dose: '3 × 20–30s (skip if shoulder pain)',
    evidence: 'Not proven',
    evidenceDetail: 'Likely works for temporary spine decompression · Not proven for bone growth.',
    why: 'Hanging gently unloads compressed spinal discs and stretches tight lats, recovering 1–2 cm of slumped posture—it does not lengthen bone.',
    xp: 15,
    slug: 'dead-hang',
    watchQuery: 'dead hang bar posture exercise proper form',
  },
  {
    id: 'spine-stretch-flow',
    title: 'Cobra stretch, Child’s pose, Superman hold & Cat-Cow',
    dose: 'Cobra 3 × 10 + 60s flow',
    evidence: 'Not proven',
    evidenceDetail: 'Likely works for apparent height & upright spine · Not proven for bone growth.',
    why: 'Extends a stiff mid-back from phone/desk sitting and strengthens deep spinal extensors so you naturally stand at your true height.',
    xp: 15,
    slug: 'cobra-cat-cow',
    watchQuery: 'cobra stretch child pose superman cat cow proper form',
  },
  {
    id: 'jump-skip-sport',
    title: 'Jumping, skipping, basketball, or swimming',
    dose: '20+ min active play or cardio',
    evidence: 'Likely works',
    evidenceDetail: 'Likely works for bone mineral density and overall growth health.',
    why: 'Regular impact sports and swimming stimulate healthy bone strength, cardiovascular fitness, and deeper nighttime sleep.',
    xp: 20,
    slug: 'jump-rope-sports',
    watchQuery: 'jump rope skipping athletic warm up proper form',
  },
  {
    id: 'posture-hydration-check',
    title: 'Posture check 3×/day + steady water',
    dose: '3 upright resets + water target',
    evidence: 'Likely works',
    evidenceDetail: 'Supports spinal disc hydration and stacked head-over-shoulder posture.',
    why: 'Spinal discs are ~80% water and compress over the day. Checking ears over shoulders and staying hydrated helps retain natural height.',
    xp: 12,
    slug: 'wall-posture-check',
    watchQuery: 'standing wall posture check chin tuck proper form',
  },
];

export interface SupplementInfoCard {
  name: string;
  category: 'supplement' | 'medical';
  whatItIs: string;
  evidenceSummary: string;
  verdict: string;
  risks?: string;
}

export const GROWTH_SUPPLEMENTS_INFO: SupplementInfoCard[] = [
  {
    name: 'Vitamin D',
    category: 'supplement',
    whatItIs: 'Fat-soluble vitamin made in skin from sunlight and found in fortified foods or oily fish.',
    evidenceSummary: 'Essential for calcium absorption and bone health.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: 'Calcium',
    category: 'supplement',
    whatItIs: 'Core structural mineral in bones and teeth.',
    evidenceSummary: 'Supports bone density; milk, yogurt, cheese, and greens usually cover daily needs.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: 'Omega-3 / Fish oil',
    category: 'supplement',
    whatItIs: 'Essential fatty acids from salmon, sardines, walnuts, or capsules.',
    evidenceSummary: 'Good for cardiovascular, joint, and brain health.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: 'Zinc',
    category: 'supplement',
    whatItIs: 'Trace mineral involved in cell division and immune health.',
    evidenceSummary: 'True deficiency can slow growth; extra zinc when levels are normal adds zero height.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: 'Glucosamine',
    category: 'supplement',
    whatItIs: 'Joint cartilage compound marketed for joint comfort.',
    evidenceSummary: 'No reliable evidence for height increase in teens or adults.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: 'Collagen',
    category: 'supplement',
    whatItIs: 'Structural protein broken down into ordinary amino acids during digestion.',
    evidenceSummary: 'Regular high-protein foods work just as well for growth.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: '"Growth pills" & Milk + honey',
    category: 'supplement',
    whatItIs: 'Proprietary herbal blends online or traditional bedtime milk drinks.',
    evidenceSummary: 'Milk adds normal protein and calcium; pills never reopen fused growth plates.',
    verdict: 'Not proven to add height. Only correct a diagnosed deficiency with a doctor.',
  },
  {
    name: 'Growth hormone (HGH)',
    category: 'medical',
    whatItIs: 'Prescription injectable hormone used in endocrinology for verified clinical growth-hormone deficiency.',
    evidenceSummary: 'Doctor only. Only effective under medical supervision when growth plates are open and a clinical deficiency is proven.',
    verdict: 'Doctor only — never self-prescribe or buy online.',
    risks: 'Joint pain, swelling, insulin resistance / diabetes risk, carpal tunnel, and abnormal bone/organ growth.',
  },
  {
    name: 'Steroids / Aromatase inhibitors',
    category: 'medical',
    whatItIs: 'Hormone-altering prescription medications sometimes discussed online to delay growth plate closure.',
    evidenceSummary: 'Doctor only. Used strictly by pediatric endocrinologists for rare diagnosed conditions.',
    verdict: 'Doctor only — misuse during teen years is dangerous.',
    risks: 'Premature growth plate fusion, liver strain, mood changes, bone thinning, and hormone suppression.',
  },
  {
    name: 'Limb-lengthening surgery',
    category: 'medical',
    whatItIs: 'Orthopedic surgical cutting of the femur or tibia with a motorized internal rod.',
    evidenceSummary: 'Doctor only. Major reconstructive surgery with months of rehab.',
    verdict: 'Doctor only — carries serious surgical risk and long recovery.',
    risks: 'Nerve damage, infection, blood clots, joint stiffness, non-union bones, and chronic pain.',
  },
];

export interface GrowthProgramDefinition {
  id: GrowthProgramProgress['id'];
  title: string;
  subtitle: string;
  dailyFocus: string[];
  guidedSteps: GuidedExerciseStep[];
}

export const SEVEN_DAY_GROWTH_PROGRAMS: GrowthProgramDefinition[] = [
  {
    id: 'spine_posture',
    title: 'Spine & Posture',
    subtitle: 'Fix desk slump & head-forward posture in 7 daily resets',
    dailyFocus: [
      'Day 1: Wall posture alignment test (heels, hips, shoulders, back of head touching wall for 60s)',
      'Day 2: Chin tucks 3 × 10 slow holds (strengthens deep neck flexors)',
      'Day 3: Thoracic towel/foam extension 2 × 45s (opens rounded upper back)',
      'Day 4: Dead hang 3 × 20–30s + shoulder blade squeezes 3 × 12',
      'Day 5: Hip flexor kneeling stretch 2 × 40s per side (fixes anterior pelvic tilt)',
      'Day 6: Glute bridge 3 × 15 + core brace (stabilizes lower spine)',
      'Day 7: Full stacked posture walk + morning vs evening measurement comparison',
    ],
    guidedSteps: [
      {
        id: 'gp-sp-wall',
        title: 'Wall Posture Alignment Hold',
        slug: 'wall-posture-check',
        demoShape: 'wall_posture',
        seconds: 45,
        repsLabel: '45s tall wall stack',
        restSeconds: 10,
        cues: [
          'Heels, hips, shoulder blades, and back of head lightly touch the wall.',
          'Keep ribs gently down so low back does not arch.',
          'Breathe slowly through your nose.',
        ],
        safetyRule: 'Keep neck relaxed — never jam your head against the wall.',
        watchQuery: 'standing wall posture check chin tuck proper form',
      },
      {
        id: 'gp-sp-chintuck',
        title: 'Deep Chin Tucks',
        slug: 'seated-chin-tuck',
        demoShape: 'chin_tuck',
        seconds: 40,
        repsLabel: '8 slow reps × 4s hold',
        restSeconds: 10,
        cues: [
          'Look straight ahead and glide chin straight back.',
          'Keep jaw soft and shoulders down.',
          'Return to neutral slowly between reps.',
        ],
        safetyRule: 'Pain-free range only.',
        watchQuery: 'deep neck flexor chin tuck exercise proper form',
      },
      {
        id: 'gp-sp-hang',
        title: 'Bar Dead Hang / Doorway Chest Stretch',
        slug: 'dead-hang',
        demoShape: 'dead_hang',
        seconds: 35,
        repsLabel: '25–35s gentle decompression',
        restSeconds: 10,
        cues: [
          'Hold a pull-up bar with relaxed shoulders (or rest forearms in a doorway if no bar).',
          'Let your spine lengthen gently with calm breathing.',
          'Step down softly onto bent knees.',
        ],
        safetyRule: 'Skip overhead bar hanging if shoulders ache or pinch.',
        watchQuery: 'dead hang bar posture exercise proper form',
      },
    ],
  },
  {
    id: 'stretch_flow',
    title: 'Stretch & Flow',
    subtitle: 'Evening spinal decompression & full-body mobility sequence',
    dailyFocus: [
      'Day 1: Cat-Cow 2 × 10 slow breaths + Child’s pose 60s',
      'Day 2: Cobra stretch 3 × 10 + gentle hamstring stretch 45s/side',
      'Day 3: Superman hold 3 × 20s + seated spinal twist',
      'Day 4: Dead hang decompression 3 × 20–30s + doorway chest opener',
      'Day 5: Calf & ankle mobility + world’s greatest stretch 5 reps/side',
      'Day 6: Combined 8-min Cobra, Cat-Cow, Child’s pose, Superman flow',
      'Day 7: Easy evening stretch flow 45 min before bed',
    ],
    guidedSteps: [
      {
        id: 'gp-sf-cobra',
        title: 'Gentle Cobra Spine Lift',
        slug: 'cobra-cat-cow',
        demoShape: 'cobra_stretch',
        seconds: 40,
        repsLabel: '6 slow lifts + hold',
        restSeconds: 10,
        cues: [
          'Lie face-down, hands beside shoulders, legs relaxed.',
          'Press gently into hands to lift upper chest while keeping hips on the floor.',
          'Breathe out calmly and lower slowly.',
        ],
        safetyRule: 'Keep lift comfortable — stop if your lower back pinches.',
        watchQuery: 'cobra stretch child pose superman cat cow proper form',
      },
      {
        id: 'gp-sf-child',
        title: 'Child’s Pose Spine Lengthener',
        slug: 'childs-pose-flow',
        demoShape: 'cobra_stretch',
        seconds: 45,
        repsLabel: '45s deep nasal breathing',
        restSeconds: 10,
        cues: [
          'Kneel comfortably, sit hips back toward heels, reach hands softly forward.',
          'Breathe into the sides of your ribcage.',
          'Relax forehead onto mat or folded towel.',
        ],
        safetyRule: 'Put a pillow behind knees if knees feel tight.',
        watchQuery: 'childs pose spine stretch breathing proper form',
      },
      {
        id: 'gp-sf-wall',
        title: 'Tall Standing Thoracic Reset',
        slug: 'wall-posture-check',
        demoShape: 'wall_posture',
        seconds: 35,
        repsLabel: '35s upright reset',
        restSeconds: 10,
        cues: [
          'Stand tall with shoulders rolled back and down.',
          'Imagine a string lifting gently from the crown of your head.',
        ],
        safetyRule: 'Natural breathing without stiffening.',
        watchQuery: 'standing posture reset thoracic alignment exercise',
      },
    ],
  },
  {
    id: 'active_play',
    title: 'Active Play',
    subtitle: '20+ min daily bone-healthy movement & outdoor daylight',
    dailyFocus: [
      'Day 1: 20 min outdoor brisk walk or basketball shootaround in daylight',
      'Day 2: Jump rope / light plyometric hops 4 × 45s + 15 min jog',
      'Day 3: 25 min swimming, cycling, or active court sport',
      'Day 4: Bodyweight squat, push-up, pull/row circuit (15 min)',
      'Day 5: 20 min skipping or sprint intervals with full rest between sets',
      'Day 6: Outdoor pickup sport or long hike (30+ min)',
      'Day 7: Active recovery walk + stretch & protect 8–10h sleep window',
    ],
    guidedSteps: [
      {
        id: 'gp-ap-jump',
        title: 'Light Jump-Rope / Rhythm Hops Warm-Up',
        slug: 'jump-rope-sports',
        demoShape: 'jump_play',
        seconds: 45,
        repsLabel: '45s light bounce',
        restSeconds: 15,
        cues: [
          'Land softly on the balls of your feet with springy knees.',
          'Keep posture upright and elbows tucked.',
          'Step-touch instead of jumping if shins or knees feel sore.',
        ],
        safetyRule: 'Wear cushioned shoes on hard ground.',
        watchQuery: 'jump rope skipping athletic warm up proper form',
      },
      {
        id: 'gp-ap-squat',
        title: 'Bodyweight Athletic Squat + Reach',
        slug: 'athletic-squat-reach',
        demoShape: 'jump_play',
        seconds: 45,
        repsLabel: '12 smooth reps',
        restSeconds: 10,
        cues: [
          'Sit hips back comfortably with heels flat on the floor.',
          'Drive up tall and reach arms overhead at the top.',
        ],
        safetyRule: 'Keep knees tracking softly over toes.',
        watchQuery: 'bodyweight squat posture warm up proper form',
      },
      {
        id: 'gp-ap-cooldown',
        title: 'Tall Walk & Daylight Cool-Down',
        slug: 'tall-walk-cooldown',
        demoShape: 'wall_posture',
        seconds: 45,
        repsLabel: '45s steady pace',
        restSeconds: 10,
        cues: [
          'Slow your breathing: 4s inhale through nose, 6s exhale.',
          'Keep eyes on the horizon rather than looking down at a phone.',
        ],
        safetyRule: 'Hydrate right after your session.',
        watchQuery: 'upright walking posture form exercise',
      },
    ],
  },
];

export const STAND_TALLER_TIPS: Array<{ title: string; detail: string }> = [
  {
    title: 'Recover 1–2 cm of spinal height',
    detail: 'Morning dead hangs, thoracic extension, and hip-flexor stretching prevent desk slouch from stealing height.',
  },
  {
    title: 'Upper-back & rear-delt strength',
    detail: 'Face pulls, rows, and chin tucks pull your shoulders back naturally so your frame looks taller without forcing it.',
  },
  {
    title: 'Clean visual proportions',
    detail: 'Monochrome or low-contrast waistlines, properly hemmed trousers, and subtle structured footwear (2–3 cm sole) lengthen silhouette cleanly.',
  },
  {
    title: 'Protect disc hydration & bone density',
    detail: 'Resistance training 3×/week, daily water, vitamin D, calcium from food, and 7–9h sleep preserve every millimeter over decades.',
  },
];

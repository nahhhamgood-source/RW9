import type { EvidenceTag } from '../types';

export type ExerciseDemoShape =
  | 'tongue_posture'
  | 'chin_tuck'
  | 'neck_lift'
  | 'jaw_release'
  | 'cheek_lift'
  | 'eye_gaze'
  | 'forehead_relax'
  | 'wall_posture'
  | 'cobra_stretch'
  | 'dead_hang'
  | 'jump_play';

export interface GuidedExerciseStep {
  id: string;
  title: string;
  slug: string;
  demoShape: ExerciseDemoShape;
  seconds: number;
  repsLabel: string;
  restSeconds: number;
  cues: string[];
  safetyRule: string;
  watchQuery: string;
}

export interface GuidedExerciseProgram {
  id: string;
  title: string;
  domain: 'face' | 'grow';
  subtitle: string;
  evidence: EvidenceTag;
  whatItCanDo: string;
  safetySummary: string;
  level1: GuidedExerciseStep[];
  level2: GuidedExerciseStep[];
}

export const FACE_EXERCISE_HONEST_NOTE = {
  canDo:
    'Helps reduce morning puffiness, relax tight jaw & forehead muscles, relieve screen eye strain, and train upright head-over-shoulder posture.',
  cannotDo:
    'Does not reshape adult skull/jaw bone, burn facial spot fat, or replace healthy body composition and medical dental care.',
};

export const FACE_EXERCISE_PROGRAMS: GuidedExerciseProgram[] = [
  {
    id: 'jawline_neck',
    title: 'Jawline & Neck',
    domain: 'face',
    subtitle: 'Submental tone, gentle tongue posture & upright neck alignment',
    evidence: 'Likely works',
    whatItCanDo: 'Improves under-chin muscle posture and head angle in photos and mirrors.',
    safetySummary: 'Gentle tongue posture only — zero teeth clenching or forced pressure.',
    level1: [
      {
        id: 'jn-1-tongue',
        title: 'Gentle Tongue Posture Hold',
        slug: 'gentle-tongue-posture',
        demoShape: 'tongue_posture',
        seconds: 40,
        repsLabel: '2 × 20s relaxed holds',
        restSeconds: 10,
        cues: [
          'Close your lips softly and breathe steadily through your nose.',
          'Rest the whole tongue lightly against the roof of your mouth.',
          'Keep upper and lower molars slightly apart — never clench.',
        ],
        safetyRule: 'Gentle tongue posture only. Stop if your jaw joints feel tight or sore.',
        watchQuery: 'proper tongue posture mewing gentle technique form',
      },
      {
        id: 'jn-1-ceiling',
        title: 'Chin-to-Ceiling Gently Raised Hold',
        slug: 'chin-to-ceiling-hold',
        demoShape: 'neck_lift',
        seconds: 35,
        repsLabel: '5 slow reps × 5s hold',
        restSeconds: 10,
        cues: [
          'Sit tall and look gently toward the ceiling without crunching your back neck.',
          'Softly kiss upward or close lips cleanly to engage the front neck.',
          'Return slowly to neutral eye level between reps.',
        ],
        safetyRule: 'Keep neck extension comfortable — never force your head backward.',
        watchQuery: 'chin to ceiling neck tone exercise proper form',
      },
      {
        id: 'jn-1-masseter',
        title: 'Masseter Tension Release',
        slug: 'masseter-tension-release',
        demoShape: 'jaw_release',
        seconds: 40,
        repsLabel: '40s slow circles',
        restSeconds: 10,
        cues: [
          'Let your lower jaw hang loose with teeth slightly parted.',
          'Use clean fingertips in slow circles along the side jaw muscle.',
          'Exhale slowly so your jaw stops bracing.',
        ],
        safetyRule: 'Use light fingertip pressure only — skip if jaw joint clicks painfully.',
        watchQuery: 'masseter jaw release self massage TMJ relief',
      },
    ],
    level2: [
      {
        id: 'jn-2-tongue-swallow',
        title: 'Balanced Swallow + Tongue Hold',
        slug: 'balanced-swallow-tongue-hold',
        demoShape: 'tongue_posture',
        seconds: 45,
        repsLabel: '3 × 15s calm holds',
        restSeconds: 10,
        cues: [
          'Keep lips relaxed without pursing your chin or cheeks.',
          'Press tongue lightly upward on the palate while breathing slowly.',
          'Release completely for 3 seconds between holds.',
        ],
        safetyRule: 'No hard pressure on front teeth; keep teeth apart.',
        watchQuery: 'gentle tongue posture swallow habit reset',
      },
      {
        id: 'jn-2-resisted-chin',
        title: 'Fist-Under-Chin Isometric Hold',
        slug: 'fist-under-chin-hold',
        demoShape: 'chin_tuck',
        seconds: 45,
        repsLabel: '6 × 5s light holds',
        restSeconds: 10,
        cues: [
          'Place two gentle fingers or a light fist under your chin.',
          'Slightly nod chin down against very light hand support.',
          'Keep shoulders dropped and neck long.',
        ],
        safetyRule: 'Use ~20% effort only — no neck weight or jerking.',
        watchQuery: 'chin resistance suprahyoid neck exercise light form',
      },
      {
        id: 'jn-2-lymph',
        title: 'Under-Jaw Lymphatic Sweep',
        slug: 'under-jaw-lymphatic-sweep',
        demoShape: 'jaw_release',
        seconds: 45,
        repsLabel: '8 sweeps per side',
        restSeconds: 10,
        cues: [
          'Apply moisturizer or oil first so fingers glide smoothly.',
          'Sweep feather-lightly from center chin toward below the ear.',
          'Follow with a slow downward sweep along the side of the neck.',
        ],
        safetyRule: 'Feather-light skin touch only — do not pull or stretch dry skin.',
        watchQuery: 'gentle facial lymphatic drainage jawline sweep',
      },
    ],
  },
  {
    id: 'neck_chin',
    title: 'Neck & Chin',
    domain: 'face',
    subtitle: 'Fix forward head posture and tighten under-chin angle',
    evidence: 'Proven',
    whatItCanDo: 'Fixes forward head slump that hides jawline definition from the side.',
    safetySummary: 'No neck weights under 18. Bodyweight & light towel resistance only.',
    level1: [
      {
        id: 'nc-1-chintuck',
        title: 'Seated Deep Chin Tucks',
        slug: 'seated-chin-tuck',
        demoShape: 'chin_tuck',
        seconds: 45,
        repsLabel: '8 reps × 4s hold',
        restSeconds: 10,
        cues: [
          'Look straight ahead and glide your chin straight back like making a double chin.',
          'Feel a gentle stretch up the back of the skull.',
          'Keep jaw relaxed — do not tilt nose down.',
        ],
        safetyRule: 'Move slowly in a pain-free range; never yank the neck.',
        watchQuery: 'deep neck flexor chin tuck exercise proper form',
      },
      {
        id: 'nc-1-sidetilt',
        title: 'Upper Trap & Side Neck Release',
        slug: 'side-neck-release',
        demoShape: 'neck_lift',
        seconds: 50,
        repsLabel: '25s per side',
        restSeconds: 10,
        cues: [
          'Drop both shoulders down away from your ears.',
          'Tilt right ear gently toward right shoulder; hold for 25 seconds.',
          'Switch sides slowly while keeping chest upright.',
        ],
        safetyRule: 'Do not pull your head forcefully with your hand.',
        watchQuery: 'gentle upper trapezius side neck stretch proper form',
      },
      {
        id: 'nc-1-supine',
        title: 'Wall-Supported Head Hover',
        slug: 'wall-head-hover',
        demoShape: 'wall_posture',
        seconds: 40,
        repsLabel: '3 × 10s holds',
        restSeconds: 10,
        cues: [
          'Stand with upper back touching a wall and chin gently tucked.',
          'Press the back of your head lightly into the wall (~20% effort).',
          'Breathe evenly without lifting shoulders.',
        ],
        safetyRule: 'Bodyweight alignment only — no neck weights under 18.',
        watchQuery: 'wall chin tuck posture isometric hold proper form',
      },
    ],
    level2: [
      {
        id: 'nc-2-curl',
        title: 'Supine Bodyweight Neck Flexor Lift',
        slug: 'supine-neck-flexor-lift',
        demoShape: 'chin_tuck',
        seconds: 45,
        repsLabel: '2 × 8 slow reps',
        restSeconds: 12,
        cues: [
          'Lie flat on your back on a mat or bed with chin tucked first.',
          'Lift the back of your head just 2 cm off the mat and hold 2 seconds.',
          'Lower softly with full control.',
        ],
        safetyRule: 'Strict bodyweight only (no plates/weights under 18). Stop if neck aches.',
        watchQuery: 'deep neck flexor supine head lift exercise form',
      },
      {
        id: 'nc-2-towel',
        title: 'Light Hand-Towel Isometric Back Press',
        slug: 'towel-neck-isometric',
        demoShape: 'neck_lift',
        seconds: 40,
        repsLabel: '4 × 6s gentle holds',
        restSeconds: 10,
        cues: [
          'Loop a soft hand towel behind your head with light forward tension.',
          'Tuck chin and press straight back gently into the towel.',
          'Keep spine upright and breathing calm.',
        ],
        safetyRule: 'No heavy resistance or neck harness under 18.',
        watchQuery: 'isometric neck extension towel exercise light form',
      },
    ],
  },
  {
    id: 'face_posture',
    title: 'Posture',
    domain: 'face',
    subtitle: 'Open chest, align ears over shoulders, carry yourself taller',
    evidence: 'Proven',
    whatItCanDo: 'Undoes desk slouch so shoulders widen visually and neck looks longer.',
    safetySummary: 'Move within comfortable shoulder range; skip overhead angles if shoulders pinch.',
    level1: [
      {
        id: 'fp-1-wall-angel',
        title: 'Wall Angels',
        slug: 'wall-angels',
        demoShape: 'wall_posture',
        seconds: 50,
        repsLabel: '10 slow sweeps',
        restSeconds: 10,
        cues: [
          'Stand with heels 10 cm from wall; back, shoulders, and head lightly touching.',
          'Raise arms into a W shape against the wall and glide slowly toward Y.',
          'Keep lower ribs tucked so your low back stays quiet.',
        ],
        safetyRule: 'Only slide as high as wrists stay comfortable.',
        watchQuery: 'wall angels shoulder posture exercise proper form',
      },
      {
        id: 'fp-1-doorway',
        title: 'Doorway Chest Opener',
        slug: 'doorway-chest-opener',
        demoShape: 'cobra_stretch',
        seconds: 45,
        repsLabel: '2 × 20s holds',
        restSeconds: 10,
        cues: [
          'Place forearms on a doorway frame at shoulder height.',
          'Step forward smoothly until you feel a mild chest stretch.',
          'Keep chin level and ribs down.',
        ],
        safetyRule: 'Stretch should feel mild in the chest, never sharp in the front shoulder.',
        watchQuery: 'doorway pec stretch posture exercise proper form',
      },
      {
        id: 'fp-1-scap',
        title: 'Standing Shoulder Blade Squeeze',
        slug: 'shoulder-blade-squeeze',
        demoShape: 'wall_posture',
        seconds: 40,
        repsLabel: '10 × 3s holds',
        restSeconds: 10,
        cues: [
          'Let arms hang by sides with thumbs pointing outward.',
          'Pull shoulder blades back and slightly down as if tucking them into back pockets.',
          'Hold 3 seconds, then relax completely.',
        ],
        safetyRule: 'Do not shrug traps upward toward your ears.',
        watchQuery: 'scapular retraction shoulder blade squeeze posture',
      },
    ],
    level2: [
      {
        id: 'fp-2-ytw',
        title: 'Prone Y-T-W Upper Back Raise',
        slug: 'prone-ytw-raise',
        demoShape: 'cobra_stretch',
        seconds: 55,
        repsLabel: '6 slow reps each',
        restSeconds: 12,
        cues: [
          'Lie face-down on a mat with forehead resting lightly on a folded towel.',
          'Lift thumbs gently in Y, T, and W shapes squeezing mid-back.',
          'Pause 2 seconds at top of each rep.',
        ],
        safetyRule: 'Keep forehead down so your neck stays neutral.',
        watchQuery: 'prone Y T W posture exercise proper form',
      },
      {
        id: 'fp-2-thoracic',
        title: 'Seated Thoracic Chair Extension',
        slug: 'thoracic-chair-extension',
        demoShape: 'cobra_stretch',
        seconds: 45,
        repsLabel: '8 slow extensions',
        restSeconds: 10,
        cues: [
          'Sit on a mid-back chair with hands laced gently behind head.',
          'Lean upper back smoothly over the chair edge while looking slightly up.',
          'Exhale fully and return to upright.',
        ],
        safetyRule: 'Keep low back steady against the chair — move from mid-back only.',
        watchQuery: 'seated chair thoracic extension upper back posture',
      },
    ],
  },
  {
    id: 'eye_comfort',
    title: 'Eye Comfort',
    domain: 'face',
    subtitle: 'Rest screen-tired eyes and relax squinting brow habits',
    evidence: 'Likely works',
    whatItCanDo: 'Reduces digital eye strain, squinting lines, and tired eyelids.',
    safetySummary: 'NEVER press on your eyeballs or tug thin under-eye skin.',
    level1: [
      {
        id: 'ec-1-202020',
        title: '20-20-20 Far Gaze Reset',
        slug: 'far-gaze-reset',
        demoShape: 'eye_gaze',
        seconds: 35,
        repsLabel: '30s distant focus',
        restSeconds: 10,
        cues: [
          'Look away from your phone at an object 6 meters (20 feet) or farther away.',
          'Blink slowly 10 times to refresh your tear film.',
          'Relax your eyebrows and forehead while breathing out.',
        ],
        safetyRule: 'Never press on your eyeballs — hands stay off eyes.',
        watchQuery: '20 20 20 rule eye strain relief exercise',
      },
      {
        id: 'ec-1-palm',
        title: 'Cupped-Palm Light Blocking Rest',
        slug: 'cupped-palm-eye-rest',
        demoShape: 'forehead_relax',
        seconds: 40,
        repsLabel: '40s dark rest',
        restSeconds: 10,
        cues: [
          'Warm clean palms together and close your eyelids softly.',
          'Cup hands lightly over eye sockets resting on cheekbones and brow bone only.',
          'Leave open space over the eyeballs so nothing touches the lids.',
        ],
        safetyRule: 'CRITICAL: Cup only on surrounding bone — NEVER press on eyeballs.',
        watchQuery: 'gentle eye palming without pressure screen relief',
      },
      {
        id: 'ec-1-gaze-clock',
        title: 'Slow Eye Tracking (12 to 6 & Left/Right)',
        slug: 'slow-eye-tracking',
        demoShape: 'eye_gaze',
        seconds: 40,
        repsLabel: '4 calm directions',
        restSeconds: 10,
        cues: [
          'Keep your head still and look smoothly far right, center, far left.',
          'Then look softly up, center, down without wrinkling your forehead.',
          'Blink cleanly at the end.',
        ],
        safetyRule: 'Stop immediately if you feel dizziness or eye pain.',
        watchQuery: 'gentle eye mobility tracking exercises screen fatigue',
      },
    ],
    level2: [
      {
        id: 'ec-2-brow-fix',
        title: 'Squint-Free Eye Focus Practice',
        slug: 'squint-free-focus',
        demoShape: 'cheek_lift',
        seconds: 40,
        repsLabel: '4 × 8s soft focus',
        restSeconds: 10,
        cues: [
          'Open eyes naturally at ease without raising eyebrows.',
          'Focus clearly on a fingertip moving smoothly from arm’s length to 20 cm away.',
          'Keep cheek and brow muscles completely quiet.',
        ],
        safetyRule: 'Never touch or rub eyeballs; remove contact lenses if irritated.',
        watchQuery: 'eye near far focus comfort drill',
      },
    ],
  },
  {
    id: 'face_relax',
    title: 'Face Relax',
    domain: 'face',
    subtitle: 'Lymphatic morning sweep, cheek tone & forehead tension release',
    evidence: 'Likely works',
    whatItCanDo: 'Eases brow tension, refreshes morning puffiness, and improves relaxed symmetry.',
    safetySummary: 'Always use clean hands + moisturizer; never tug dry skin.',
    level1: [
      {
        id: 'fr-1-forehead',
        title: 'Forehead Tension Smooth',
        slug: 'forehead-tension-smooth',
        demoShape: 'forehead_relax',
        seconds: 40,
        repsLabel: '30–40s smooth exhale',
        restSeconds: 10,
        cues: [
          'Notice if you hold tension between your brows and let both eyebrows drop.',
          'Glide flat fingertips from center forehead softly out toward temples.',
          'Slowly breathe out for 6 seconds.',
        ],
        safetyRule: 'Gentle glide with serum/lotion only — zero heavy scrubbing.',
        watchQuery: 'forehead tension release face yoga gentle routine',
      },
      {
        id: 'fr-1-cheek',
        title: 'Natural Cheek Smile Lift',
        slug: 'cheek-smile-lift',
        demoShape: 'cheek_lift',
        seconds: 40,
        repsLabel: '6 × 5s balanced holds',
        restSeconds: 10,
        cues: [
          'Lift the corners of your cheeks upward softly without squinting eyes.',
          'Hold 5 seconds with balanced left/right feel.',
          'Relax completely between reps.',
        ],
        safetyRule: 'Keep movements mild so you do not crease outer eye skin.',
        watchQuery: 'gentle cheek lift face exercise natural smile form',
      },
      {
        id: 'fr-1-cheek-release',
        title: 'Warm Puff-Cheek Relax',
        slug: 'puff-cheek-relax',
        demoShape: 'jaw_release',
        seconds: 35,
        repsLabel: '5 slow airs + release',
        restSeconds: 10,
        cues: [
          'Fill cheeks with a small breath of air for 3 seconds.',
          'Pass gently side to side once, then release cleanly.',
          'Drop shoulders and jaw at the finish.',
        ],
        safetyRule: 'Keep air pressure mild and comfortable.',
        watchQuery: 'face yoga cheek tension relax puff cheek exercise',
      },
    ],
    level2: [
      {
        id: 'fr-2-lymph-full',
        title: 'Full Morning Lymphatic Drain Flow',
        slug: 'morning-lymphatic-flow',
        demoShape: 'jaw_release',
        seconds: 55,
        repsLabel: '10 slow feather strokes',
        restSeconds: 10,
        cues: [
          'Start above collarbones with 5 very gentle downward presses.',
          'Sweep lightly from nose outward across cheekbones toward ears.',
          'Finish sweeping softly down neck sides toward collarbones.',
        ],
        safetyRule: 'Feather-light contact only; skip over active irritated acne.',
        watchQuery: 'morning lymphatic drainage face massage de-puff',
      },
    ],
  },
];

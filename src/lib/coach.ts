import { HAIRCUT_BY_FACE_SHAPE } from '../data/care';
import { addDays, toLocalDateKey } from './date';
import type {
  ActiveProtocolTask,
  DailyLog,
  FaceScanResult,
  SkinEntry,
  TaskCompletion,
  UserProfile,
  WorkoutSession,
} from '../types';

export interface CoachSuggestionAction {
  label: string;
  protocolId: string;
}

export interface CoachResponse {
  title: string;
  bullets: string[]; // max 4 short bullets
  moreDetail: string;
  suggestedActions: CoachSuggestionAction[];
  escalateNote?: string;
}

export interface CoachContext {
  profile: UserProfile;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  skinEntries: SkinEntry[];
  scans: FaceScanResult[];
  workouts: WorkoutSession[];
}

export function answerCoachQuery(query: string, ctx: CoachContext): CoachResponse {
  const q = query.trim().toLowerCase();
  const today = toLocalDateKey();
  const todayLog = ctx.dailyLogs.find((l) => l.date === today);
  const recentLogs = ctx.dailyLogs.filter((l) => l.date >= addDays(today, -6));
  const latestScan = ctx.scans[0] ?? null;
  const recentSkin = ctx.skinEntries.slice(0, 7);

  // 1. Puffy face / bloat
  if (q.includes('puffy') || q.includes('bloat') || q.includes('swollen') || q.includes('water retention')) {
    const avgSleep =
      recentLogs.filter((l) => l.sleepHours > 0).reduce((s, l) => s + l.sleepHours, 0) /
      Math.max(1, recentLogs.filter((l) => l.sleepHours > 0).length);
    const lowWater = (todayLog?.waterMl ?? 0) < ctx.profile.waterTargetMl * 0.6;
    const bullets = [
      avgSleep > 0 && avgSleep < 7
        ? `Your logged sleep averaged ${avgSleep.toFixed(1)}h this week—sleep debt raises morning fluid retention.`
        : 'Morning puffiness usually tracks high evening sodium, alcohol, or short sleep.',
      lowWater
        ? `Water logged today is ${todayLog?.waterMl ?? 0} ml vs your ${ctx.profile.waterTargetMl} ml target.`
        : 'Keep water steady earlier in the day and taper right before bed.',
      'Pair potassium-rich whole foods (spinach, banana, potato) with a 10-minute morning walk.',
      'Sleep slightly elevated on one supportive pillow if morning swelling persists.',
    ];
    return {
      title: 'Managing Facial Puffiness',
      bullets,
      moreDetail:
        'Dehydrating yourself makes puffiness worse by triggering fluid-retention hormones. Steady hydration, lower late-night salt, and consistent 7.5–8h sleep resolve most harmless morning swelling within 48 hours.',
      suggestedActions: [
        { label: 'Add Low-Sodium Check', protocolId: 'hydration-sodium-sugar' },
        { label: 'Add Morning Daylight Walk', protocolId: 'sleep-morning-light' },
      ],
      escalateNote: 'If swelling is sudden, painful, asymmetric, or affects breathing/eyelids, seek medical care immediately.',
    };
  }

  // 2. What should I do today?
  if (q.includes('today') || q.includes('what should') || q.includes('next') || q.includes('plan')) {
    const todayDoneIds = new Set(ctx.completions.filter((c) => c.date === today).map((c) => c.taskId));
    const pending = ctx.tasks.filter((t) => t.enabled && !todayDoneIds.has(t.id));
    const topPending = pending.slice(0, 3);
    const bullets = topPending.length
      ? [
          `You have ${pending.length} planned tasks remaining today.`,
          ...topPending.map((t) => `${t.title} (${t.minutes}m): ${t.actionLine}`),
        ]
      : [
          'All planned protocol tasks for today are checked off.',
          `Water logged: ${todayLog?.waterMl ?? 0}/${ctx.profile.waterTargetMl} ml · Protein: ${todayLog?.proteinG ?? 0}/${ctx.profile.proteinTargetG} g.`,
          'Protect tonight’s sleep window to lock in recovery.',
        ];

    return {
      title: 'Today’s Priority Stack',
      bullets: bullets.slice(0, 4),
      moreDetail: `Your current plan is sized for your ${ctx.profile.dailyTimeBudgetMin}-minute daily time budget. Consistency over 90 days beats trying to cram 20 habits in one week.`,
      suggestedActions: [],
    };
  }

  // 3. Fix my skin
  if (q.includes('skin') || q.includes('acne') || q.includes('breakout') || q.includes('redness') || q.includes('dry')) {
    const highIrritation = recentSkin.some((s) => s.irritationLevel >= 2);
    const persistentBreakouts = recentSkin.filter((s) => s.breakoutsCount >= 3).length >= 3;
    const bullets = [
      highIrritation
        ? 'Your Skin Lab log shows moderate/high irritation recently—pause all exfoliants and actives for 7 days.'
        : `Skin type is set to ${ctx.profile.skinType}. Stick to gentle cleanser, bland moisturizer, and daily SPF 30–50.`,
      'Introduce only one new product at a time after a 48-hour inner-arm patch test.',
      'Avoid hot water and harsh physical scrubs that strip your barrier.',
      'Track hydration and breakout counts for 4 weeks before judging a routine.',
    ];
    return {
      title: 'Skin Lab Guidance',
      bullets,
      moreDetail:
        'A calm skin barrier reflects light smoothly and breaks out less. Most over-the-counter damage comes from stacking acids and retinoids together without sunscreen.',
      suggestedActions: [
        { label: highIrritation ? 'Add 7-Day Barrier Reset' : 'Add Daily SPF 30+', protocolId: highIrritation ? 'skin-barrier-reset' : 'skin-spf-daily' },
        { label: 'Add Skin Journal Check-In', protocolId: 'skin-journal-log' },
      ],
      escalateNote: persistentBreakouts
        ? 'Repeated flare-ups logged in your journal warrant an evaluation with a licensed dermatologist.'
        : 'See a dermatologist for cystic acne, scarring, or rashes lasting beyond 6–8 weeks.',
    };
  }

  // 4. Explain my scan
  if (q.includes('scan') || q.includes('psl') || q.includes('score') || q.includes('face') || q.includes('result')) {
    if (!latestScan) {
      return {
        title: 'No PSL LAB Scan Logged Yet',
        bullets: [
          'Open PSL LAB in the bottom bar to run your first on-device baseline scan.',
          'Stand facing soft window light at arm’s length with a neutral expression.',
          'Your photos stay 100% on your device; only metrics and optional small thumbnails save locally.',
        ],
        moreDetail: 'Rescan no more than once every 14 days under identical lighting so trends reflect real habit changes instead of lighting noise.',
        suggestedActions: [{ label: 'Add Camera Posture Practice', protocolId: 'presence-photo-practice' }],
      };
    }

    const topFocus = latestScan.focusAreas[0];
    return {
      title: `Scan Summary (${latestScan.pslEstimate}/8 · ${latestScan.tier})`,
      bullets: [
        `Strongest areas: ${latestScan.strengths.map((s) => s.area).join(', ')}.`,
        `Top focus area: ${topFocus?.area ?? 'General consistency'} — ${topFocus?.actions[0]?.label ?? 'stay consistent'}.`,
        `Lighting quality scored ${latestScan.lightingScore}/100 (${latestScan.faceShape} face shape detected).`,
        'Remember: PSL is a rough photo estimate, not science and not your worth.',
      ],
      moreDetail: `Sub-scores — Symmetry: ${latestScan.subScores.symmetry}, Proportions: ${latestScan.subScores.proportions}, Jaw/Neck: ${latestScan.subScores.jawNeck}, Eye Area: ${latestScan.subScores.eyeArea}, Skin: ${latestScan.subScores.skin}, Leanness: ${latestScan.subScores.leanness}.`,
      suggestedActions: topFocus?.actions
        .filter((a) => a.protocolId)
        .slice(0, 2)
        .map((a) => ({ label: a.label, protocolId: a.protocolId! })) ?? [],
      escalateNote: topFocus?.medicalNote,
    };
  }

  // 5. Haircut / Grooming
  if (q.includes('hair') || q.includes('cut') || q.includes('barber') || q.includes('brow')) {
    const shape = latestScan?.faceShape ?? ctx.profile.detectedFaceShape ?? 'oval';
    const guide = HAIRCUT_BY_FACE_SHAPE[shape];
    return {
      title: `Haircut Guidance (${shape.toUpperCase()} shape)`,
      bullets: [
        guide.summary,
        `Top pick: ${guide.cuts[0].name} — ${guide.cuts[0].whyItWorks}`,
        `Second option: ${guide.cuts[1].name} — ${guide.cuts[1].whyItWorks}`,
        'Refresh sides every 3–4 weeks and keep brow clean-up natural.',
      ],
      moreDetail: `Barber script: "${guide.cuts[0].barberScript}"`,
      suggestedActions: [
        { label: 'Add Barber Trim Schedule', protocolId: 'hair-barber-card' },
        { label: 'Add Natural Brow Clean-Up', protocolId: 'hair-brow-cleanup' },
      ],
    };
  }

  // 6. Analyze my month / consistency
  if (q.includes('month') || q.includes('week') || q.includes('progress') || q.includes('analyze') || q.includes('trend')) {
    const monthCutoff = addDays(today, -29);
    const monthCompletions = ctx.completions.filter((c) => c.date >= monthCutoff);
    const activeDays = new Set(monthCompletions.map((c) => c.date)).size;
    const monthWorkouts = ctx.workouts.filter((w) => w.date >= monthCutoff).length;

    const countsByTask = new Map<string, number>();
    monthCompletions.forEach((c) => countsByTask.set(c.taskId, (countsByTask.get(c.taskId) ?? 0) + 1));
    const enabled = ctx.tasks.filter((t) => t.enabled);
    const sorted = [...enabled].sort((a, b) => (countsByTask.get(b.id) ?? 0) - (countsByTask.get(a.id) ?? 0));

    return {
      title: '30-Day Consistency Breakdown',
      bullets: [
        `Active self-care days in last 30 days: ${activeDays}/30.`,
        `Workouts logged in last 30 days: ${monthWorkouts}.`,
        sorted[0] ? `Strongest habit: ${sorted[0].title} (${countsByTask.get(sorted[0].id) ?? 0} completions).` : 'No habit history yet.',
        sorted[sorted.length - 1]
          ? `Lowest completion: ${sorted[sorted.length - 1].title} (${countsByTask.get(sorted[sorted.length - 1].id) ?? 0} completions).`
          : 'Log tasks daily to spot weak links.',
      ],
      moreDetail:
        'If your lowest habit keeps getting skipped, either move it to an easier time block (morning/evening) or simplify it rather than forcing willpower.',
      suggestedActions: [{ label: 'Add Sunday Weekly Audit', protocolId: 'sleep-weekly-review' }],
    };
  }

  // Default helpful summary
  return {
    title: 'Offline Coach',
    bullets: [
      'I read strictly from your local ASCEND logs, skin diary, workouts, and PSL LAB scans.',
      'Ask me: "Why is my face puffy?", "What should I do today?", "Fix my skin", "Explain my scan", "What haircut suits me?", or "Analyze my month".',
      'All guidance stays private on this device with zero internet requests.',
    ],
    moreDetail: 'For persistent acne, hair loss, jaw pain, or extreme fatigue, always consult a licensed doctor or dermatologist.',
    suggestedActions: [{ label: 'Add Daily Water Target', protocolId: 'hydration-water-target' }],
  };
}

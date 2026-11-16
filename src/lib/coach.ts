import { HAIRCUT_BY_FACE_SHAPE } from '../data/care';
import { isAboutMeItemConfirmed, isUnder18OrGrowing } from '../db/database';
import { addDays, toLocalDateKey } from './date';
import { getPslTierMeta, PSL_HONEST_DISCLAIMER } from './faceMetricsConstants';
import { detectUserPatterns } from './patterns';
import type {
  ActiveProtocolTask,
  AppSettings,
  BodyMetricEntry,
  DailyLog,
  FaceScanResult,
  MealScanEntry,
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
  settings?: AppSettings;
  tasks: ActiveProtocolTask[];
  completions: TaskCompletion[];
  dailyLogs: DailyLog[];
  skinEntries: SkinEntry[];
  scans: FaceScanResult[];
  workouts: WorkoutSession[];
  mealScans?: MealScanEntry[];
  bodyMetrics?: BodyMetricEntry[];
}

export function answerCoachQuery(query: string, ctx: CoachContext): CoachResponse {
  const q = query.trim().toLowerCase();
  const today = toLocalDateKey();
  const todayLog = ctx.dailyLogs.find((l) => l.date === today);
  const recentLogs = ctx.dailyLogs.filter((l) => l.date >= addDays(today, -6));
  const latestScan = ctx.scans[0] ?? null;
  const recentSkin = ctx.skinEntries.slice(0, 7);
  const isTeenSafe = isUnder18OrGrowing(ctx.profile);
  const isRoughDay = Boolean(ctx.settings?.roughDayDates?.includes(today));
  const about = ctx.profile.aboutMe;
  const egyptConfirmed = isAboutMeItemConfirmed(about, 'location_foods');
  const campConfirmed = isAboutMeItemConfirmed(about, 'training_camp');

  const detectedPatterns = detectUserPatterns({
    todayKey: today,
    profile: ctx.profile,
    dailyLogs: ctx.dailyLogs,
    mealScans: ctx.mealScans ?? [],
    workouts: ctx.workouts,
    bodyMetrics: ctx.bodyMetrics ?? [],
    tasks: ctx.tasks,
    completions: ctx.completions,
    dismissedIds: ctx.settings?.dismissedPatternIds ?? [],
    maxCards: 2,
  });

  // 0A. Distress / Crisis care guardrail (never play doctor)
  if (
    /suicid|self.?harm|hurt myself|kill myself|hopeless|can't go on|cant go on|depress|hate myself|worthless|panic attack/.test(
      q
    )
  ) {
    return {
      title: 'Take a breath — you do not have to carry this alone',
      bullets: [
        'Please talk to someone you trust today: a parent, close friend, coach, or a licensed doctor or counselor.',
        'I am an app helper, not a therapist or doctor, so I cannot diagnose or treat heavy distress.',
        'If today feels overwhelming, drink one glass of water and step away from your screen for 10 minutes.',
      ],
      moreDetail:
        'If you ever feel unsafe or at risk of hurting yourself, reach out immediately to a trusted adult or your local emergency / crisis support line.',
      suggestedActions: [{ label: 'Add 3-Min Calm Breathing', protocolId: 'mind-breathing-3min' }],
      escalateNote:
        'Please speak directly with a trusted person or licensed mental-health professional.',
    };
  }

  // 0B. Fight-camp / unsafe weight cut & banned substance safety block
  if (
    /sauna|dehydrat|water.?cut|sweat.?suit|diuretic|laxative|starv|extreme fast|steroid|sarm|peptide|dosage|supplement dose|make weight fast|cut \d+\s*kg/.test(
      q
    )
  ) {
    return {
      title: 'Safe Fight-Camp Rule (No Dehydration Cuts)',
      bullets: [
        'I cannot advise dehydration, sauna cuts, diuretics, extreme fasting, supplement doses, or banned substances — those are dangerous.',
        isTeenSafe
          ? 'Because your age is under 18 or unset, calorie deficits and weight cuts stay locked.'
          : 'Any tournament weight-class plan must be set directly with your MMA coach and a licensed sports doctor.',
        'Focus on steady protein, whole Egyptian foods, hydration, and 8h+ sleep so your sparring performance stays sharp.',
      ],
      moreDetail:
        campConfirmed && about?.weightClassKg
          ? `Your confirmed weight class note (${about.weightClassKg} kg${about.tournamentDate ? `, tournament ${about.tournamentDate}` : ''}) is only a calendar tracker — let your coach and doctor guide weight decisions.`
          : 'Safe conditioning and consistent nutrition beat risky last-minute cuts every time.',
      suggestedActions: [{ label: 'Add Fixed Sleep Window', protocolId: 'body-sleep-fixed' }],
      escalateNote: 'Always clear fight-camp weight targets with your coach and a doctor.',
    };
  }

  // 0C. Rough day support
  if (q.includes('rough day') || q.includes('burnt out') || q.includes('exhausted') || q.includes('overwhelmed')) {
    return {
      title: 'Gentle Rough-Day Reset',
      bullets: [
        'Shrink today down to 2 gentle essentials: drink a glass of water and protect tonight’s sleep.',
        'Skip extra habits today without guilt — showing up lightly keeps the thread alive.',
        'One small step next: pick the easiest 2-minute check-in, then rest.',
      ],
      moreDetail:
        'You can tap the "Rough day" button on Plan → Now to slim Today’s stack down to 2 gentle tasks anytime.',
      suggestedActions: [{ label: 'Add 3-Min Calm Breathing', protocolId: 'mind-breathing-3min' }],
    };
  }

  // 1. Puffy face / bloat
  if (q.includes('puffy') || q.includes('bloat') || q.includes('swollen') || q.includes('water retention')) {
    const avgSleep =
      recentLogs.filter((l) => l.sleepHours > 0).reduce((s, l) => s + l.sleepHours, 0) /
      Math.max(1, recentLogs.filter((l) => l.sleepHours > 0).length);
    const lowWater = (todayLog?.waterMl ?? 0) < ctx.profile.waterTargetMl * 0.6;
    const bullets = [
      avgSleep > 0 && avgSleep < 7
        ? `Your logged sleep averaged ${avgSleep.toFixed(1)}h this week — sleep debt raises morning fluid retention. (Proven)`
        : 'Morning puffiness usually tracks late-night sodium, poor sleep, or low water. (Proven)',
      lowWater
        ? `Water logged today is ${todayLog?.waterMl ?? 0} ml vs your ${ctx.profile.waterTargetMl} ml target.`
        : 'Keep water steady earlier in the day and taper right before bed.',
      egyptConfirmed
        ? 'Swap salty evening street food (shawarma/sausage) for zabady yogurt, fruit, or grilled protein + salad.'
        : 'Pair potassium-rich whole foods (spinach, banana, potato) with a 10-minute morning walk.',
      'Next step: log tonight’s sleep hours and drink 500 ml water.',
    ];
    return {
      title: 'Managing Facial Puffiness',
      bullets,
      moreDetail:
        'Dehydrating yourself makes puffiness worse by triggering fluid-retention hormones. Steady hydration, lighter evening salt, and 7.5–8h sleep usually settle morning swelling in 48 hours.',
      suggestedActions: [
        { label: 'Add Daily Water Target', protocolId: 'face-debloat-water' },
        { label: 'Add 10m Daylight Walk', protocolId: 'body-10min-walk' },
      ],
      escalateNote: 'If swelling is sudden, painful, one-sided, or affects breathing/eyelids, seek medical care.',
    };
  }

  // 2. Egyptian meals / breakfast gap / nutrition swaps
  if (
    q.includes('food') ||
    q.includes('meal') ||
    q.includes('eat') ||
    q.includes('breakfast') ||
    q.includes('lunch') ||
    q.includes('ful') ||
    q.includes('koshari') ||
    q.includes('shawarma') ||
    q.includes('egypt')
  ) {
    const breakfastCard = detectedPatterns.cards.find((c) => c.id === 'breakfast-gap');
    const lunchCard = detectedPatterns.cards.find((c) => c.id === 'big-lunch');
    const bullets = [
      breakfastCard
        ? breakfastCard.headline
        : 'Morning protein (25–30g from eggs, ful + 2 eggs, or gebna areesh) helps steady afternoon appetite. (Likely works)',
      lunchCard
        ? lunchCard.suggestion
        : 'Plate method for lunch: protein first, half plate green salad, then rice/pasta/baladi bread.',
      isTeenSafe
        ? 'Since age is under 18 or unset, eat enough balanced meals — no calorie cutting.'
        : 'With street food (shawarma, hawawshi, koshari, pane), ask for less sauce/oil and add salad.',
      'Next step: log one protein-rich breakfast or balanced Egyptian lunch in Food.',
    ];
    return {
      title: 'Everyday Meal & Protein Plan',
      bullets,
      moreDetail:
        'Budget-friendly protein in Egypt: boiled eggs, gebna areesh, ful + lemon + eggs, plain zabady yogurt, chicken breast/pane (pan-seared), and grilled kofta with salad.',
      suggestedActions: [{ label: 'Add Protein Check', protocolId: 'body-protein-check' }],
    };
  }

  // 3. What should I do today?
  if (q.includes('today') || q.includes('what should') || q.includes('next') || q.includes('plan')) {
    const todayDoneIds = new Set(ctx.completions.filter((c) => c.date === today).map((c) => c.taskId));
    const pending = ctx.tasks.filter((t) => t.enabled && !todayDoneIds.has(t.id));
    const topPending = pending.slice(0, isRoughDay ? 2 : 3);
    const bullets = topPending.length
      ? [
          isRoughDay
            ? 'Rough-day mode is active — aim for just 2 light wins today.'
            : `You have ${pending.length} habits left today.`,
          ...topPending.map((t) => `${t.title} (${t.minutes}m): ${t.actionLine}`),
        ]
      : [
          'All daily habits for today are checked off.',
          `Water: ${todayLog?.waterMl ?? 0}/${ctx.profile.waterTargetMl} ml · Protein: ${todayLog?.proteinG ?? 0}/${ctx.profile.proteinTargetG} g.`,
          'Next step: wrap up your 2-min evening wind-down and get solid sleep.',
        ];

    if (detectedPatterns.cards[0]) {
      bullets.push(`Pattern noticed: ${detectedPatterns.cards[0].headline}`);
    }

    return {
      title: isRoughDay ? 'Today’s Gentle 2-Step Plan' : 'Today’s Priority Stack',
      bullets: bullets.slice(0, 4),
      moreDetail: `Sized for your ${ctx.profile.dailyTimeBudgetMin}-minute budget. Small daily bites beat trying to force everything at once.`,
      suggestedActions: [],
    };
  }

  // 4. Fix my skin
  if (q.includes('skin') || q.includes('acne') || q.includes('breakout') || q.includes('redness') || q.includes('dry')) {
    const highIrritation = recentSkin.some((s) => s.irritationLevel >= 2);
    const persistentBreakouts = recentSkin.filter((s) => s.breakoutsCount >= 3).length >= 3;
    const bullets = [
      highIrritation
        ? 'Your Skin Log shows moderate/high irritation — pause harsh acids/actives for 7 days. (Proven)'
        : `Skin type is ${ctx.profile.skinType}. Gentle cleanser, plain moisturizer, and SPF 30–50 cover 90% of results. (Proven)`,
      'Introduce only one new product at a time after a 48-hour patch test.',
      'Rinse sweat cleanly soon after gym or MMA sessions to prevent clogged pores.',
      'Next step: tick AM wash + SPF today.',
    ];
    return {
      title: 'Simple Skin Guidance',
      bullets,
      moreDetail:
        'A calm skin barrier breaks out less and recovers faster after training sweat. Avoid layering strong exfoliants daily.',
      suggestedActions: [
        { label: 'Add Daily SPF 30+', protocolId: 'face-spf-daily' },
        { label: 'Add AM Cleanse', protocolId: 'face-cleanse-am' },
      ],
      escalateNote: persistentBreakouts
        ? 'Repeated breakouts warrant a visit to a licensed dermatologist.'
        : 'See a dermatologist for cystic acne, scarring, or stubborn rashes.',
    };
  }

  // 5. Explain my scan / jawline / bones
  if (q.includes('scan') || q.includes('psl') || q.includes('score') || q.includes('face') || q.includes('jaw') || q.includes('result')) {
    if (!latestScan) {
      return {
        title: 'No PSL LAB Scan Logged Yet',
        bullets: [
          'Open Face → Scanner & Results to run an on-device scan.',
          'Stand facing soft window light with a relaxed neutral expression.',
          'Your photos stay 100% on your phone.',
        ],
        moreDetail: 'Rescan every 14+ days in matching light so comparisons are fair.',
        suggestedActions: [],
      };
    }

    const topFocus = latestScan.focusAreas[0];
    const tier = getPslTierMeta(latestScan.pslEstimate, true);
    return {
      title: `Scan Summary (${latestScan.pslEstimate}/8 · ${tier.displayLabel})`,
      bullets: [
        `Strongest areas: ${latestScan.strengths.map((s) => s.area).join(', ')}.`,
        `Top focus: ${topFocus?.area ?? 'General consistency'} — ${topFocus?.actions[0]?.label ?? 'stay steady'}.`,
        `Lighting score ${latestScan.lightingScore}/100 (${latestScan.faceShape} face shape).`,
        `${PSL_HONEST_DISCLAIMER} Jaw/bone changes from exercises are Not proven; body leanness & posture are Proven.`,
      ],
      moreDetail: `Sub-scores — Symmetry: ${latestScan.subScores.symmetry}, Proportions: ${latestScan.subScores.proportions}, Jaw/Neck: ${latestScan.subScores.jawNeck}, Eye Area: ${latestScan.subScores.eyeArea}, Skin: ${latestScan.subScores.skin}, Leanness: ${latestScan.subScores.leanness}.`,
      suggestedActions: topFocus?.actions
        .filter((a) => a.protocolId)
        .slice(0, 2)
        .map((a) => ({ label: a.label, protocolId: a.protocolId! })) ?? [],
      escalateNote: topFocus?.medicalNote,
    };
  }

  // 6. Haircut / Grooming
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
      suggestedActions: [{ label: 'Add Natural Brow Tidy', protocolId: 'face-brow-tidy' }],
    };
  }

  // 7. Analyze my month / consistency
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
        `Active days in last 30 days: ${activeDays}/30.`,
        `Training sessions logged in last 30 days: ${monthWorkouts}.`,
        sorted[0] ? `Strongest habit: ${sorted[0].title} (${countsByTask.get(sorted[0].id) ?? 0} times).` : 'No habit history yet.',
        detectedPatterns.cards[0]
          ? detectedPatterns.cards[0].headline
          : sorted[sorted.length - 1]
          ? `Lowest habit: ${sorted[sorted.length - 1].title}. Try shifting it to an easier time block.`
          : 'Log habits daily to spot patterns.',
      ],
      moreDetail:
        'If one habit keeps getting skipped, move it to your best time of day or shrink it rather than forcing willpower.',
      suggestedActions: [],
    };
  }

  // 8. Height & posture questions
  if (q.includes('height') || q.includes('grow') || q.includes('tall') || q.includes('posture')) {
    const heightStr = ctx.profile.heightCm > 0 ? `${ctx.profile.heightCm.toFixed(1)} cm` : 'not logged yet';
    const hasParents =
      Boolean(ctx.profile.fatherHeightCm && ctx.profile.fatherHeightCm > 100) &&
      Boolean(ctx.profile.motherHeightCm && ctx.profile.motherHeightCm > 100);
    return {
      title: 'Height & Posture Guidance',
      bullets: [
        `Saved height: ${heightStr} (morning is ~1 cm taller than evening). (Proven)`,
        hasParents
          ? 'Your mid-parental height range is in Grow.'
          : 'Add parents’ heights in Grow to see your mid-parental range.',
        'Real bone growth depends on age/growth plates, 8–10h sleep, protein, and vitamins. (Proven)',
        'Height pills, stretches, or collagen do NOT lengthen adult bones (Not proven); posture adds ~1–2 cm upright alignment.',
      ],
      moreDetail:
        'Growth plates fuse after puberty. A doctor checks bone age via an X-ray if needed — never use unprescribed hormones.',
      suggestedActions: [
        { label: 'Add Posture Reset', protocolId: 'body-posture-reset' },
        { label: 'Add Fixed Sleep Window', protocolId: 'body-sleep-fixed' },
      ],
      escalateNote: 'Ask a doctor for any medical growth concerns.',
    };
  }

  // Default personalized response
  return {
    title: 'Offline Coach',
    bullets: [
      detectedPatterns.cards[0]
        ? `From your logs: ${detectedPatterns.cards[0].headline}`
        : 'I read directly from your local ASCEND logs, meals, workouts, and PSL LAB scans.',
      'Ask about today’s plan, Egyptian meal swaps, puffy face, skin basics, scan results, height/posture, or rough days.',
      'All offline guidance runs privately on your phone with zero internet calls.',
    ],
    moreDetail: 'For severe acne, pain, injury, or medical cuts, always check with a licensed doctor.',
    suggestedActions: [{ label: 'Add 10m Daylight Walk', protocolId: 'body-10min-walk' }],
  };
}

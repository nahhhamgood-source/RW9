import type { GoalHorizon, MealType, ToneMode } from '../types';

export const en = {
  appName: 'ASCEND',
  tagline: 'Your daily health, looks, and habit tracker',
  nav: {
    plan: 'Plan',
    food: 'Food',
    face: 'Face',
    grow: 'Grow',
    health: 'Health',
    more: 'More',
    quickAdd: 'Quick add',
    askCoach: 'Ask',
  },
  planChips: {
    now: 'Now',
    today: 'Today',
    tomorrow: 'Tomorrow',
    goals: 'Goals',
  } as const,
  blocks: {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
  } as const,
  horizons: {
    this_week: 'This week',
    this_month: 'This month',
    three_months: '3 months',
    one_year: '1 year',
  } as Record<GoalHorizon, string>,
  meals: {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
  } as Record<MealType, string>,
  now: {
    doThisNow: 'Do this now',
    doneBtn: 'Done',
    laterBtn: 'Later',
    nextUp: 'Next up',
    allCaughtUpTitle: 'All daily tasks done.',
    allCaughtUpBody: 'Log water or meals, or check your Today list.',
    allCaughtUpAction: 'See Today list',
    streakTitle: 'Your streak',
    whatsThis: "What's this?",
    extraBadge: 'Extra',
    extraNote: "Good bonus, skip it if you're tired",
  },
  today: {
    title: "Today's plan",
    simpleCapNote: 'Simple mode shows up to 6 key habits.',
    showMore: 'Show more',
    showLess: 'Show fewer',
    addTask: '+ Add',
    moveTomorrow: 'Move to tomorrow',
    empty: 'No tasks for today yet.',
    emptyAction: 'Add your first habit',
  },
  tomorrow: {
    title: 'Tomorrow',
    subtitle: 'Set your plan early so morning feels easy.',
    useSuggested: 'Use suggested plan',
    addTask: '+ Add for tomorrow',
    reminderLabel: 'Reminder',
    empty: 'Nothing set for tomorrow yet.',
  },
  goals: {
    title: 'Goals',
    subtitle: 'Pick up to 3 main goals so you stay focused.',
    addGoal: '+ New goal',
    limitNote: 'Max 3 active goals keeps focus sharp.',
    emptyGoals: 'No main goals yet. Pick one small aim to start.',
    lifeListTitle: 'Life list',
    lifeListSubtitle: 'One-time and monthly checkups in time order.',
    addLifeItem: '+ Add item',
    addStarterList: 'Load helpful starter checks',
    emptyLifeList: 'Your life list is empty.',
  },
  quickAdd: {
    title: 'Quick add',
    water: 'Water',
    meal: 'Meal',
    weight: 'Weight',
    sleep: 'Sleep',
    mood: 'Mood',
    photo: 'Photo',
    height: 'Height',
    urge: 'I have an urge',
  },
  faceHub: {
    scanner: 'Scanner & Results',
    care: 'Looks Care',
    exercises: 'Face Exercises',
    learn: 'Learn',
  },
  growHub: {
    title: 'Grow & Posture',
    subtitle: 'Track height honestly, build upright posture, and protect your sleep.',
    noHeightYet: 'Not enough data yet. Log your first height reading.',
    logHeightBtn: '+ Log height',
  },
  healthHub: {
    meals: 'Meals & Water',
    bodySleep: 'Body, Sleep & Gym',
    trends: 'Trends',
    quit: 'Quit habits',
  },
  diet: {
    goalTitle: 'My goal',
    loseFat: 'Lose fat',
    staySame: 'Stay the same',
    buildMuscle: 'Build muscle',
    under18Lock: 'Set your age in Settings to unlock cut/deficit targets.',
    under18Maintain: 'Still growing or under 18: focus on steady nutrition, not calorie cutting.',
  },
  privacy: {
    localSummary: 'On-device storage · Face scans stay on your phone · Optional online AI tools require consent',
    consentTitle: 'Optional online AI features',
    consentBody:
      'Your face scans, body logs, and diary entries stay on your phone. Only when you enable AI Food Chat & Scan or Online AI Coach is your food text, voice note, meal photo, or brief coach summary sent to our server for Gemini processing. Neither audio nor photos are stored after processing.',
  },
  safety: {
    under18Headline: 'Still growing? Eat enough, sleep 8–10h, stay active.',
    under18Body:
      'Weight-loss targets and calorie cutting are hidden while you are under 18, still growing, or age is not set.',
    scoreFooter: 'Estimates from photos and logs, not medical advice, not your worth.',
  },
  offline: {
    banner: 'You are offline. Plans, face scanner, exercises, and tracking still work locally.',
  },
  shell: {
    openingPlan: 'Opening your plan...',
    storageErrorTitle: 'Storage Initialization Error',
    retryStartup: 'Retry Startup',
    lockedTitle: 'ASCEND Locked',
    unlockBtn: 'Unlock',
    askCoachLabel: 'Ask Coach',
    remindersLabel: 'Open reminders',
    menuLabel: 'Open navigation menu',
    footerNotice:
      'Local-first on-device storage · Optional AI food scan & coach when opted in.',
  },
  quit: {
    title: 'Quit habits (no guilt)',
    privacySummary: 'Private on this device · Hidden elsewhere · Generic reminders',
    notificationNote:
      'Counters stay hidden outside this tab and never appear on PNG share cards. Any phone notification uses generic "Daily Check-In" text — never your habit name.',
  },
  aboutAscend: {
    title: 'About ASCEND',
    version: 'Version 2.3',
    installTitle: 'Add to Home Screen',
    installBody:
      'Install ASCEND on your phone so it opens full screen and works fast offline.',
  },
  fightCamp: {
    title: 'Fight Camp',
    subtitle: 'Safe weight pace, training fuel, and calm camp tracking',
    under18Lock:
      'Weight for a fight is a coach + doctor call at your age. Ask your coach and a doctor.',
    passiveSafetyCard:
      'Why we don’t plan this: it hurts performance and can be dangerous. If a weight class needs it, that is a coach + doctor decision.',
    weighInTitle: 'Fight week basics (info only)',
  },
  connections: {
    title: 'Connections',
    subtitle: 'Bring in data manually or share photos into ASCEND',
    privacyLine: 'Stays on your phone unless you turn on the online coach.',
    webLimitLine:
      'The web version cannot read WhatsApp, TikTok, other fitness apps, or your phone health store by itself.',
    androidFlagLine: 'Needs the Android app. A website cannot read your other apps.',
  },
  weeklyReview: {
    title: 'Weekly Leader Review',
    subtitle: 'Your Sunday reset from real logs',
    notEnoughData: 'Not enough data yet',
  },
  streetFood: {
    estimateBadge: 'Estimate — edit to match your plate',
    fitsToday: 'Fits today',
    swapLabel: 'Lighter swap',
  },
  realLife: {
    outTodayBtn: "I'm out today",
    eventActiveLabel: 'Event day (estimated)',
    eventActiveSub: 'Have fun. Tell me roughly how it went later.',
    noCompensationNote: 'Tomorrow stays a normal day. Never cut calories to pay back an event.',
    skipDontTrack: "Skip, don't track",
    sameAsUsual: 'Same as usual',
    yesterdayGapsTitle: 'Yesterday has gaps. Fill in?',
    oneQuestionPrompt: 'Quick one: how was eating today?',
    honestAccuracy:
      'Photo and voice logging is an estimate (often within 15–30%). More detail gives better numbers.',
    privacyLeavesPhone:
      'Only sent when you use an online feature with Food AI turned on: food text, nutrition-label or meal photos (location/EXIF stripped first), barcode digits (to Open Food Facts), or menu text. Nothing is stored on a server.',
    shareHonestNote:
      'Reads only what is on this screenshot or shared text — ASCEND cannot see inside other apps.',
    adaptiveLabel: 'Estimate, improves with data',
  },
};

export function getMealTypeByHour(date: Date = new Date()): MealType {
  const mins = date.getHours() * 60 + date.getMinutes();
  if (mins < 11 * 60 + 30) return 'breakfast';
  if (mins < 16 * 60) return 'lunch';
  if (mins < 20 * 60 + 30) return 'dinner';
  return 'snack';
}

export function getToneText(
  tone: ToneMode | undefined,
  options: { normal?: string; chill: string; serious: string }
): string {
  const active = tone ?? 'normal';
  if (active === 'serious') return options.serious;
  if (active === 'chill') return options.chill;
  return options.normal ?? options.serious;
}

export function getPlanGreetingLine(
  greeting: string,
  name: string,
  dayNumber: number,
  nextTitle: string | null,
  tone: ToneMode = 'normal'
): string {
  const cleanName = name.trim();
  const lead = cleanName ? `${greeting}, ${cleanName}.` : `${greeting}.`;
  if (tone === 'chill') {
    return nextTitle
      ? `${lead} Day ${dayNumber}. Stay locked in — next: ${nextTitle}.`
      : `${lead} Day ${dayNumber}. Clean W today, all set.`;
  }
  if (tone === 'serious') {
    return nextTitle
      ? `${lead} Day ${dayNumber}. Priority: ${nextTitle}.`
      : `${lead} Day ${dayNumber}. Daily tasks complete.`;
  }
  return nextTitle
    ? `${lead} Day ${dayNumber}. Next: ${nextTitle}.`
    : `${lead} Day ${dayNumber}. Today's plan is complete.`;
}

export function getWinBannerCopy(kind: 'first_scan' | 'streak_7' | 'weight_milestone' | 'level_up' | 'journey_level', tone: ToneMode = 'normal'): { title: string; subtitle: string } {
  switch (kind) {
    case 'first_scan':
      return {
        title: getToneText(tone, {
          normal: 'First face scan saved',
          chill: 'First scan locked in — W baseline',
          serious: 'Baseline scan recorded',
        }),
        subtitle: 'Your Path below turns these numbers into simple daily steps.',
      };
    case 'streak_7':
      return {
        title: getToneText(tone, {
          normal: '7-day streak',
          chill: '7 days straight, no cap',
          serious: '7-day consistency milestone',
        }),
        subtitle: 'A full week of showing up — keep the pace relaxed and steady.',
      };
    case 'weight_milestone':
      return {
        title: getToneText(tone, {
          normal: 'Weight trend milestone',
          chill: 'Lowkey steady progress on weight',
          serious: 'Weight milestone reached',
        }),
        subtitle: 'Logged cleanly from your real weigh-ins.',
      };
    case 'level_up':
      return {
        title: getToneText(tone, {
          normal: 'New XP level unlocked',
          chill: 'Quiet grind paid off — level up',
          serious: 'Level up achieved',
        }),
        subtitle: 'Daily small reps beat extreme bursts every time.',
      };
    case 'journey_level':
      return {
        title: getToneText(tone, {
          normal: 'Journey stage cleared',
          chill: 'Stage cleared — clean W',
          serious: 'Journey stage completed',
        }),
        subtitle: 'Consistent weeks build real change.',
      };
  }
}


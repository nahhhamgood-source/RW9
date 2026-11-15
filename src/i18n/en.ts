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
      'Your face scans, body logs, and diary entries stay on your phone. Only when you tap AI Food Scan or enable Online AI Coach is a meal photo or short chat summary sent to our server for Gemini processing. The server does not store your data.',
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
    version: 'Version 2.2',
    installTitle: 'Add to Home Screen',
    installBody:
      'Install ASCEND on your phone so it opens full screen and works fast offline.',
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
      ? `${lead} Day ${dayNumber}. Next up: ${nextTitle}.`
      : `${lead} Day ${dayNumber}. All daily tasks done.`;
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

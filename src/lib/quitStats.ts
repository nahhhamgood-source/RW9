import { addDays, toLocalDateKey } from './date';
import type { EvidenceTag, QuitHabitCategory, QuitHabitItem, QuitSlipEntry } from '../types';

export interface QuitCategoryMeta {
  id: QuitHabitCategory;
  label: string;
  emoji: string;
  defaultTitle: string;
  isPrivateDefault?: boolean;
  isMedicalCaution?: boolean;
  suggestedTriggers: string[];
  suggestedSwaps: string[];
}

export const QUIT_CATEGORIES: QuitCategoryMeta[] = [
  {
    id: 'doomscroll',
    label: 'Doomscrolling',
    emoji: '📱',
    defaultTitle: 'Short-form / late scrolling',
    suggestedTriggers: ['Boredom', 'In bed', 'Avoiding a task', 'Stress'],
    suggestedSwaps: [
      'Put phone across the room and read 2 pages',
      'Walk for 5 minutes without phone',
      'Plug phone to charge outside the bedroom',
    ],
  },
  {
    id: 'sugar',
    label: 'Added sugar',
    emoji: '🍬',
    defaultTitle: 'Sweets & sugary snacks',
    suggestedTriggers: ['Afternoon slump', 'Late-night TV', 'After lunch', 'Low sleep'],
    suggestedSwaps: [
      'Drink a tall glass of cold water + fruit or yogurt',
      'Brush teeth right after dinner',
      'Eat a high-protein snack first, wait 15 min',
    ],
  },
  {
    id: 'junk_food',
    label: 'Junk / soda',
    emoji: '🍟',
    defaultTitle: 'Fast food & sugary drinks',
    suggestedTriggers: ['Ordering out', 'Rushed day', 'With friends', 'Tired'],
    suggestedSwaps: [
      'Sparkling water with lime instead of soda',
      'Pick a high-protein home staple from Food tab',
      'Never grocery shop hungry',
    ],
  },
  {
    id: 'nicotine',
    label: 'Nicotine / vape',
    emoji: '🚭',
    defaultTitle: 'Vaping or smoking',
    suggestedTriggers: ['Morning routine', 'Stress spike', 'Social breaks', 'Driving'],
    suggestedSwaps: [
      '10 slow deep breaths + cold water sip',
      'Sugar-free gum or toothpick during break',
      'Go for a brisk 5-minute walk outside',
    ],
  },
  {
    id: 'caffeine',
    label: 'Late caffeine',
    emoji: '☕',
    defaultTitle: 'Afternoon / excess caffeine',
    suggestedTriggers: ['Afternoon crash', 'Study session', 'Habitual sip'],
    suggestedSwaps: [
      'Switch to herbal tea or cold water after 2 PM',
      'Take a 10-minute sunlight + stretch break',
    ],
  },
  {
    id: 'late_night',
    label: 'Staying up late',
    emoji: '🌙',
    defaultTitle: 'Revenge bedtime procrastination',
    suggestedTriggers: ['Phone in bed', 'Feeling behind', 'Gaming / videos'],
    suggestedSwaps: [
      'Dim lights at wind-down alarm and plug phone away',
      'Write tomorrow’s 3 tasks on paper before bed',
    ],
  },
  {
    id: 'gaming',
    label: 'Excess gaming',
    emoji: '🎮',
    defaultTitle: 'Unplanned gaming marathons',
    suggestedTriggers: ['Boredom', 'Friends online', 'Escaping stress'],
    suggestedSwaps: [
      'Set a 45-min kitchen timer before launching',
      'Finish 1 Plan task or workout before playing',
    ],
  },
  {
    id: 'skin_picking',
    label: 'Skin picking',
    emoji: '🩹',
    defaultTitle: 'Picking blemishes or nails',
    suggestedTriggers: ['Bathroom mirror', 'Studying / anxious', 'Idle hands'],
    suggestedSwaps: [
      'Put a hydrocolloid patch over spots immediately',
      'Keep hands busy with a stress ball or pen',
    ],
  },
  {
    id: 'alcohol',
    label: 'Alcohol / substances',
    emoji: '🩺',
    defaultTitle: 'Alcohol / substance break',
    isMedicalCaution: true,
    suggestedTriggers: ['Weekends', 'Social pressure', 'Unwinding stress'],
    suggestedSwaps: [
      'Order a zero-proof drink right away at social spots',
      'Call a trusted friend or leave 30 min early if pressured',
    ],
  },
  {
    id: 'private',
    label: 'Private habit',
    emoji: '🔒',
    defaultTitle: 'Private focus',
    isPrivateDefault: true,
    suggestedTriggers: ['Alone at night', 'Stress', 'Boredom', 'Tiredness'],
    suggestedSwaps: [
      'Leave the room for 10 minutes with water',
      'Do 20 pushups or step outside for fresh air',
      'Run the 10-min urge timer without phone nearby',
    ],
  },
];

export const QUIT_CATEGORY_MAP: Record<QuitHabitCategory, QuitCategoryMeta> = QUIT_CATEGORIES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<QuitHabitCategory, QuitCategoryMeta>
);

export interface QuitFactCard {
  id: string;
  title: string;
  evidence: EvidenceTag;
  summary: string;
  limitNote: string;
}

export const QUIT_FACT_CARDS: QuitFactCard[] = [
  {
    id: 'urge-wave',
    title: 'Most urges peak and fade in 10–15 minutes',
    evidence: 'Proven',
    summary:
      'Cravings rise like a wave rather than growing forever. Delaying action with a 10-minute timer and slow breathing gives the brain time for the spike to settle.',
    limitNote: 'Strong physical dependencies (like heavy nicotine or alcohol) may also need medical support.',
  },
  {
    id: 'friction-cues',
    title: 'Removing cues works better than pure willpower',
    evidence: 'Proven',
    summary:
      'Charging your phone outside the bedroom, deleting triggering apps, or keeping snacks out of sight cuts slips far more reliably than trying to resist in the moment.',
    limitNote: 'Environment setup takes 5 minutes once and helps every evening after.',
  },
  {
    id: 'if-then-swap',
    title: '"If trigger, then swap" plans double follow-through',
    evidence: 'Likely works',
    summary:
      'Pre-deciding an exact physical replacement ("When I crave X, I drink water and step outside") keeps you from freezing when tired or stressed.',
    limitNote: 'One slip is data to adjust the swap, not failure.',
  },
  {
    id: 'sleep-cravings',
    title: 'Short sleep weakens impulse control the next day',
    evidence: 'Proven',
    summary:
      'Getting under 7 hours raises reward-seeking cravings and makes late-night willpower drop sharply.',
    limitNote: 'Protecting bedtime helps every habit on your list at once.',
  },
];

export interface QuitHabitStats {
  startDateKey: string;
  totalTrackedDays: number;
  daysInControl: number;
  slipsTotal: number;
  successRate30d: number;
  windowDays30d: number;
  slipsInLast30d: number;
  recentSlips: QuitSlipEntry[];
}

export function computeQuitHabitStats(
  item: QuitHabitItem,
  slips: QuitSlipEntry[],
  todayKey: string = toLocalDateKey()
): QuitHabitStats {
  const createdKey = toLocalDateKey(new Date(item.createdAt || Date.now()));
  const startDateKey = createdKey <= todayKey ? createdKey : todayKey;

  const habitSlips = slips
    .filter((s) => s.habitId === item.id)
    .sort((a, b) => b.createdAt - a.createdAt);

  const slipDateSet = new Set<string>();
  (item.slipDates ?? []).forEach((d) => {
    if (d && d <= todayKey) slipDateSet.add(d);
  });
  habitSlips.forEach((s) => {
    if (s.date && s.date <= todayKey) slipDateSet.add(s.date);
  });

  // Count calendar days in [startDateKey .. todayKey]
  const startMs = Date.parse(`${startDateKey}T00:00:00Z`);
  const endMs = Date.parse(`${todayKey}T00:00:00Z`);
  const totalTrackedDays = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);

  let slipsOnTrackedDays = 0;
  slipDateSet.forEach((d) => {
    if (d >= startDateKey && d <= todayKey) slipsOnTrackedDays++;
  });
  const daysInControl = Math.max(0, totalTrackedDays - slipsOnTrackedDays);

  // Rolling 30-day window (clamped to startDateKey so brand new habits aren't penalized or inflated weirdly)
  const thirtyStart = addDays(todayKey, -29);
  const windowStart = startDateKey > thirtyStart ? startDateKey : thirtyStart;
  const winStartMs = Date.parse(`${windowStart}T00:00:00Z`);
  const windowDays30d = Math.max(1, Math.min(30, Math.round((endMs - winStartMs) / 86400000) + 1));

  let slipsInLast30d = 0;
  slipDateSet.forEach((d) => {
    if (d >= windowStart && d <= todayKey) slipsInLast30d++;
  });

  const successRate30d = Math.max(
    0,
    Math.min(100, Math.round(((windowDays30d - slipsInLast30d) / windowDays30d) * 100))
  );

  return {
    startDateKey,
    totalTrackedDays,
    daysInControl,
    slipsTotal: Math.max(habitSlips.length, slipDateSet.size),
    successRate30d,
    windowDays30d,
    slipsInLast30d,
    recentSlips: habitSlips,
  };
}

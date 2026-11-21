import type { EventOutcomeLevel, EventType, MealType } from '../types';

export interface EventTypeMeta {
  id: EventType;
  label: string;
  icon: string;
  defaultOutcome: EventOutcomeLevel;
  shortHint: string;
}

export const EVENT_TYPE_META: EventTypeMeta[] = [
  {
    id: 'wedding',
    label: 'Wedding',
    icon: '🎉',
    defaultOutcome: 'heavy',
    shortHint: 'Buffet, meats, rice & sweets — usually a big meal.',
  },
  {
    id: 'birthday',
    label: 'Birthday',
    icon: '🎂',
    defaultOutcome: 'heavy',
    shortHint: 'Party food and cake slice.',
  },
  {
    id: 'family_lunch',
    label: 'Family lunch',
    icon: '🍲',
    defaultOutcome: 'heavy',
    shortHint: 'Friday / home table with shared dishes.',
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    icon: '🍽️',
    defaultOutcome: 'normal',
    shortHint: 'Main plate plus sides or bread.',
  },
  {
    id: 'street_food',
    label: 'Street food outing',
    icon: '🌯',
    defaultOutcome: 'normal',
    shortHint: 'Hawawshi, koshari, shawarma, or grill out.',
  },
  {
    id: 'travel',
    label: 'Travel day',
    icon: '🧳',
    defaultOutcome: 'normal',
    shortHint: 'Quiet mode until day ends; eat what is easy.',
  },
  {
    id: 'other',
    label: 'Other outing',
    icon: '✨',
    defaultOutcome: 'normal',
    shortHint: 'Out with friends or busy away from home.',
  },
];

export function getEventTypeMeta(type: EventType): EventTypeMeta {
  return EVENT_TYPE_META.find((t) => t.id === type) ?? EVENT_TYPE_META[EVENT_TYPE_META.length - 1];
}

export const EVENT_PLAN_AHEAD_TIPS: string[] = [
  'Do not skip meals before the event — arriving starving makes you feel rough.',
  'Keep protein normal earlier in the day (eggs, yogurt, cheese, or chicken).',
  'Drink water normally across the day — never restrict fluids.',
  'Eat slowly and start with protein and salad if available, then enjoy the rest.',
  'Enjoy the food and company. Tomorrow stays a normal day with zero payback cuts.',
];

export interface EventOutcomeOption {
  id: EventOutcomeLevel;
  label: string;
  kcalRangeLabel: string;
  estimatedKcal: number;
  estimatedProteinG: number;
  estimatedSodiumMg: number;
  kcalMin: number;
  kcalMax: number;
  description: string;
}

export const EVENT_OUTCOME_OPTIONS: EventOutcomeOption[] = [
  {
    id: 'light',
    label: 'Light',
    kcalRangeLabel: 'about 300–500 kcal',
    estimatedKcal: 400,
    estimatedProteinG: 18,
    estimatedSodiumMg: 520,
    kcalMin: 300,
    kcalMax: 500,
    description: 'Small plate, light bites, or mostly drinks & salad.',
  },
  {
    id: 'normal',
    label: 'Normal',
    kcalRangeLabel: 'about 600–900 kcal',
    estimatedKcal: 750,
    estimatedProteinG: 30,
    estimatedSodiumMg: 820,
    kcalMin: 600,
    kcalMax: 900,
    description: 'One regular plate or restaurant meal.',
  },
  {
    id: 'heavy',
    label: 'Heavy',
    kcalRangeLabel: 'about 1000–1400 kcal',
    estimatedKcal: 1200,
    estimatedProteinG: 38,
    estimatedSodiumMg: 1250,
    kcalMin: 1000,
    kcalMax: 1400,
    description: 'Full wedding buffet, big family table, or main + dessert.',
  },
  {
    id: 'very_heavy',
    label: 'Very heavy',
    kcalRangeLabel: '1500+ kcal',
    estimatedKcal: 1650,
    estimatedProteinG: 45,
    estimatedSodiumMg: 1550,
    kcalMin: 1500,
    kcalMax: 1950,
    description: 'Multiple plates, rich sauces, and sweets.',
  },
];

export function getEventOutcomeOption(level: EventOutcomeLevel): EventOutcomeOption {
  return EVENT_OUTCOME_OPTIONS.find((o) => o.id === level) ?? EVENT_OUTCOME_OPTIONS[1];
}

export interface EventPresetPlate {
  id: string;
  title: string;
  icon: string;
  defaultPortionLabel: string;
  kcalMin: number;
  kcalMax: number;
  kcalAvg: number;
  proteinMinG: number;
  proteinMaxG: number;
  proteinAvgG: number;
  sodiumMg: number;
  addedSugarG: number;
  estimateNote: string;
}

export const EVENT_PRESET_PLATES: EventPresetPlate[] = [
  {
    id: 'preset-wedding-buffet',
    title: 'Wedding buffet plate',
    icon: '🎉',
    defaultPortionLabel: '1 generous plate (rice, meat & sides)',
    kcalMin: 900,
    kcalMax: 1350,
    kcalAvg: 1120,
    proteinMinG: 32,
    proteinMaxG: 48,
    proteinAvgG: 40,
    sodiumMg: 1200,
    addedSugarG: 8,
    estimateNote: 'Estimate — edit portions to match your plate',
  },
  {
    id: 'preset-celebration-cake',
    title: 'Celebration cake slice',
    icon: '🎂',
    defaultPortionLabel: '1 party slice',
    kcalMin: 320,
    kcalMax: 520,
    kcalAvg: 420,
    proteinMinG: 3,
    proteinMaxG: 6,
    proteinAvgG: 4,
    sodiumMg: 180,
    addedSugarG: 34,
    estimateNote: 'Estimate — creamy/chocolate slices sit near top end',
  },
  {
    id: 'preset-family-friday-lunch',
    title: 'Family Friday lunch',
    icon: '🍲',
    defaultPortionLabel: 'Rice, cooked veg + chicken or meat',
    kcalMin: 750,
    kcalMax: 1150,
    kcalAvg: 940,
    proteinMinG: 34,
    proteinMaxG: 50,
    proteinAvgG: 42,
    sodiumMg: 950,
    addedSugarG: 4,
    estimateNote: 'Estimate — adjusts smoothly with portion slider',
  },
  {
    id: 'preset-mahshi-plate',
    title: 'Mahshi plate',
    icon: '🫑',
    defaultPortionLabel: '1 medium dinner plate (~8–10 pieces)',
    kcalMin: 580,
    kcalMax: 880,
    kcalAvg: 720,
    proteinMinG: 12,
    proteinMaxG: 22,
    proteinAvgG: 16,
    sodiumMg: 840,
    addedSugarG: 4,
    estimateNote: 'Estimate — varies by broth & oil used',
  },
  {
    id: 'preset-grilled-meat',
    title: 'Grilled meat / kofta plate',
    icon: '🍖',
    defaultPortionLabel: 'Kofta / kebab + tahini + 1 bread',
    kcalMin: 720,
    kcalMax: 1080,
    kcalAvg: 890,
    proteinMinG: 38,
    proteinMaxG: 56,
    proteinAvgG: 46,
    sodiumMg: 1020,
    addedSugarG: 2,
    estimateNote: 'Estimate — strong protein option out',
  },
  {
    id: 'preset-restaurant-main',
    title: 'Restaurant main + sides',
    icon: '🍽️',
    defaultPortionLabel: '1 restaurant entree + fries or rice',
    kcalMin: 750,
    kcalMax: 1200,
    kcalAvg: 960,
    proteinMinG: 28,
    proteinMaxG: 46,
    proteinAvgG: 36,
    sodiumMg: 1150,
    addedSugarG: 8,
    estimateNote: 'Estimate — restaurant sauces add hidden oil',
  },
  {
    id: 'preset-soft-drink',
    title: 'Soft drink / sweet juice',
    icon: '🥤',
    defaultPortionLabel: '1 can or large glass (330–400 ml)',
    kcalMin: 130,
    kcalMax: 210,
    kcalAvg: 160,
    proteinMinG: 0,
    proteinMaxG: 0,
    proteinAvgG: 0,
    sodiumMg: 35,
    addedSugarG: 36,
    estimateNote: 'Estimate — zero if diet/sparkling water',
  },
  {
    id: 'preset-oriental-dessert',
    title: 'Oriental dessert (basbousa / konafa)',
    icon: '🍯',
    defaultPortionLabel: '1–2 party pieces',
    kcalMin: 280,
    kcalMax: 520,
    kcalAvg: 390,
    proteinMinG: 3,
    proteinMaxG: 6,
    proteinAvgG: 4,
    sodiumMg: 120,
    addedSugarG: 30,
    estimateNote: 'Estimate — syrup sweets are calorie-dense',
  },
];

export interface RecallChipFood {
  id: string;
  label: string;
  icon: string;
  kcalPerMedium: number;
  proteinPerMedium: number;
  sodiumMgPerMedium: number;
  addedSugarPerMedium: number;
  portionWord: string;
}

export const RECALL_FOOD_CHIPS: RecallChipFood[] = [
  {
    id: 'recall-bread',
    label: 'Bread',
    icon: '🫓',
    kcalPerMedium: 240,
    proteinPerMedium: 7,
    sodiumMgPerMedium: 310,
    addedSugarPerMedium: 1,
    portionWord: '1 loaf / 2 slices',
  },
  {
    id: 'recall-rice',
    label: 'Rice / Pasta',
    icon: '🍚',
    kcalPerMedium: 260,
    proteinPerMedium: 5,
    sodiumMgPerMedium: 240,
    addedSugarPerMedium: 0,
    portionWord: '1 medium bowl',
  },
  {
    id: 'recall-chicken',
    label: 'Chicken',
    icon: '🍗',
    kcalPerMedium: 260,
    proteinPerMedium: 32,
    sodiumMgPerMedium: 360,
    addedSugarPerMedium: 0,
    portionWord: '1 palm / quarter',
  },
  {
    id: 'recall-meat',
    label: 'Meat / Kofta',
    icon: '🥩',
    kcalPerMedium: 340,
    proteinPerMedium: 28,
    sodiumMgPerMedium: 460,
    addedSugarPerMedium: 0,
    portionWord: '3–4 pieces',
  },
  {
    id: 'recall-eggs-cheese',
    label: 'Eggs / Cheese / Ful',
    icon: '🥚',
    kcalPerMedium: 230,
    proteinPerMedium: 15,
    sodiumMgPerMedium: 380,
    addedSugarPerMedium: 0,
    portionWord: 'standard serving',
  },
  {
    id: 'recall-veg',
    label: 'Salad / Veg',
    icon: '🥗',
    kcalPerMedium: 90,
    proteinPerMedium: 3,
    sodiumMgPerMedium: 140,
    addedSugarPerMedium: 2,
    portionWord: '1 bowl',
  },
  {
    id: 'recall-sweets',
    label: 'Sweets / Cake',
    icon: '🍰',
    kcalPerMedium: 350,
    proteinPerMedium: 4,
    sodiumMgPerMedium: 140,
    addedSugarPerMedium: 28,
    portionWord: '1 piece',
  },
  {
    id: 'recall-drinks',
    label: 'Drinks / Coffee+milk',
    icon: '☕',
    kcalPerMedium: 140,
    proteinPerMedium: 3,
    sodiumMgPerMedium: 40,
    addedSugarPerMedium: 18,
    portionWord: '1 cup / can',
  },
];

export const RECALL_PORTION_CHIPS: Array<{
  id: 'light' | 'medium' | 'large';
  label: string;
  multiplier: number;
}> = [
  { id: 'light', label: 'Small / Half', multiplier: 0.65 },
  { id: 'medium', label: 'Normal', multiplier: 1 },
  { id: 'large', label: 'Large / Double', multiplier: 1.5 },
];

export const DEFAULT_RECALL_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

import { FOOD_CATALOG, type FoodCatalogItem, type FollowUpKind } from '../data/foodCatalog';
import { getMealTypeByHour } from '../i18n/en';
import type {
  DraftFoodItem,
  FoodChatApiResponse,
  FollowUpChip,
  FollowUpQuestion,
} from '../components/food/foodChatTypes';
import type { CustomFoodEntry, MealFoodItem, MealType } from '../types';

export function roundKcal(n: number): number {
  const safe = Math.max(0, Number.isFinite(n) ? n : 0);
  if (safe === 0) return 0;
  if (safe < 100) return Math.round(safe / 5) * 5;
  return Math.round(safe / 10) * 10;
}

export function roundProtein(g: number): number {
  return Math.max(0, Math.round(Number.isFinite(g) ? g : 0));
}

export function formatKcalEstimate(item: Pick<DraftFoodItem, 'kcal' | 'kcalMin' | 'kcalMax'>): string {
  if (item.kcalMin && item.kcalMax && item.kcalMax > item.kcalMin) {
    return `about ${roundKcal(item.kcalMin)}–${roundKcal(item.kcalMax)} kcal`;
  }
  return `about ${roundKcal(item.kcal)} kcal`;
}

export function normalizeFoodSearchText(input: string): string {
  const arabicIndicMap: Record<string, string> = {
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
    '٫': '.',
  };
  return input
    .split('')
    .map((ch) => arabicIndicMap[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip Arabic harakat
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/['’`]/g, '')
    .replace(/[،]/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectMealTypeFromText(
  normalizedText: string,
  fallbackMealType?: MealType
): { mealType: MealType; strippedText: string } {
  const patterns: Array<{ regex: RegExp; slot: MealType }> = [
    { regex: /\b(breakfast|brunch|fetaar|fotar|fetar)\b|(الفطار|فطار|فطور)/i, slot: 'breakfast' },
    { regex: /\b(lunch|ghada|el ghada)\b|(الغدا|غدا|غداء)/i, slot: 'lunch' },
    { regex: /\b(dinner|supper|3asha|asha)\b|(العشا|عشا|عشاء)/i, slot: 'dinner' },
    { regex: /\b(snack|snacks|tasbira)\b|(سناك|تصابيره|تصبيرة)/i, slot: 'snack' },
  ];
  let detected = fallbackMealType ?? getMealTypeByHour();
  let stripped = normalizedText;
  for (const p of patterns) {
    if (p.regex.test(stripped)) {
      detected = p.slot;
      stripped = stripped.replace(p.regex, ' ').replace(/\s+/g, ' ').trim();
      break;
    }
  }
  return { mealType: detected, strippedText: stripped };
}

function buildFollowUpQuestionsForCatalog(
  item: FoodCatalogItem,
  opts: {
    hasExplicitQty: boolean;
    hasExplicitMilk: boolean;
    hasExplicitSugar: boolean;
    hasExplicitSize: boolean;
    wantsAverage: boolean;
  }
): FollowUpQuestion[] {
  if (opts.wantsAverage) return [];

  const questions: FollowUpQuestion[] = [];

  if (item.followUpKind === 'drink_size' || item.isDrink) {
    if (!opts.hasExplicitSize) {
      questions.push({
        step: 1,
        maxSteps: 2,
        text: `How big was the ${item.name.split('(')[0].trim()}?`,
        chips: [
          { id: 'cup', label: 'Small cup (~150 ml)', icon: '☕', value: 'small cup (~150 ml)', qtyMultiplier: 0.7 },
          { id: 'mug', label: 'Mug (~250 ml)', icon: '☕', value: 'mug (~250 ml)', qtyMultiplier: 1 },
          { id: 'bigmug', label: 'Big mug (~350 ml)', icon: '🥤', value: 'big mug (~350 ml)', qtyMultiplier: 1.4 },
          { id: 'glass', label: 'Glass (~250 ml)', icon: '🥛', value: 'glass (~250 ml)', qtyMultiplier: 1 },
          { id: 'avg', label: "I don't know / usual", value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      });
    }

    const isCoffeeOrTea =
      item.id.includes('nescafe') ||
      item.id.includes('tea') ||
      item.id.includes('coffee') ||
      item.id.includes('ahwa');
    if (isCoffeeOrTea && !opts.hasExplicitMilk) {
      questions.push({
        step: questions.length === 0 ? 1 : 2,
        maxSteps: 2,
        text: 'Milk or sugar?',
        chips: [
          {
            id: 'black',
            label: 'Black (no milk)',
            icon: '☕',
            value: 'black',
            qtyMultiplier: 1,
            extraKcal: 0,
            extraProteinG: 0,
            isDrinkAddonStep: true,
            addonNameSuffix: ' (black)',
            addonNameArSuffix: ' سادة',
          },
          {
            id: 'little-milk',
            label: 'A little milk',
            icon: '🥛',
            value: 'with a little milk',
            qtyMultiplier: 1,
            extraKcal: 25,
            extraProteinG: 1,
            isDrinkAddonStep: true,
            addonNameSuffix: ' with a little milk',
            addonNameArSuffix: ' بلبن خفيف',
          },
          {
            id: 'milk',
            label: 'With milk',
            icon: '🥛',
            value: 'with milk',
            qtyMultiplier: 1,
            extraKcal: item.id === 'cat-nescafe-milk' || item.id === 'cat-tea-milk' ? 0 : 50,
            extraProteinG: item.id === 'cat-nescafe-milk' || item.id === 'cat-tea-milk' ? 0 : 3,
            isDrinkAddonStep: true,
            addonNameSuffix: item.id.includes('milk') ? '' : ' with milk',
            addonNameArSuffix: item.id.includes('milk') ? '' : ' بلبن',
          },
          {
            id: 'milk-sugar1',
            label: 'Milk + 1 spoon sugar',
            icon: '🍯',
            value: 'with milk & 1 spoon sugar',
            qtyMultiplier: 1,
            extraKcal: item.id === 'cat-nescafe-milk' || item.id === 'cat-tea-milk' ? 20 : 70,
            extraProteinG: item.id === 'cat-nescafe-milk' || item.id === 'cat-tea-milk' ? 0 : 3,
            isDrinkAddonStep: true,
            addonNameSuffix: item.id.includes('milk') ? ' + sugar' : ' with milk & sugar',
            addonNameArSuffix: ' بلبن وسكر',
          },
          {
            id: 'sugar2',
            label: '2 spoons sugar (no milk)',
            icon: '🧂',
            value: '2 spoons sugar',
            qtyMultiplier: 1,
            extraKcal: 40,
            extraProteinG: 0,
            isDrinkAddonStep: true,
            addonNameSuffix: ' (2 spoons sugar)',
            addonNameArSuffix: ' بـ ٢ معلقة سكر',
          },
        ],
      });
    }
    return questions.slice(0, 2);
  }

  if (opts.hasExplicitQty) return [];

  if (item.followUpKind === 'baladi_loaf') {
    return [
      {
        step: 1,
        maxSteps: 1,
        text: 'How many baladi loaves? (about the size of a plate)',
        chips: [
          { id: 'b-half', label: '1/2 loaf', icon: '🫓', value: '1/2 baladi loaf', qtyMultiplier: 0.5 },
          { id: 'b-1', label: '1 baladi loaf', icon: '🫓', value: '1 baladi loaf', qtyMultiplier: 1 },
          { id: 'b-2', label: '2 baladi loaves', icon: '🫓', value: '2 baladi loaves', qtyMultiplier: 2 },
          { id: 'b-3', label: '3 baladi loaves', icon: '🫓', value: '3 baladi loaves', qtyMultiplier: 3 },
          { id: 'avg', label: 'Usual / average', value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      },
    ];
  }

  if (item.followUpKind === 'sandwich_size') {
    return [
      {
        step: 1,
        maxSteps: 1,
        text: `How big was the ${item.name.split('(')[0].trim()}?`,
        chips: [
          { id: 's-sm', label: 'Small', icon: '🥪', value: 'small sandwich', qtyMultiplier: 0.75 },
          { id: 's-reg', label: 'Regular', icon: '🌯', value: 'regular sandwich', qtyMultiplier: 1 },
          { id: 's-big', label: 'Big / extra meat', icon: '🥖', value: 'big sandwich', qtyMultiplier: 1.35 },
          { id: 's-2', label: '2 regular', icon: '🥖', value: '2 regular sandwiches', qtyMultiplier: 2 },
          { id: 'avg', label: "I don't know", value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      },
    ];
  }

  if (item.followUpKind === 'hand_plate') {
    return [
      {
        step: 1,
        maxSteps: 1,
        text: 'Portion size by hand or plate?',
        chips: [
          { id: 'h-small', label: 'Fist = small (quarter plate)', icon: '✊', value: 'small (1 fist / quarter plate)', qtyMultiplier: 0.65 },
          { id: 'h-med', label: '2 fists = normal (half plate)', icon: '🍽️', value: 'normal (2 fists / half plate)', qtyMultiplier: 1 },
          { id: 'h-big', label: '3 fists = big (full plate)', icon: '🍽️', value: 'big (3 fists / full plate)', qtyMultiplier: 1.45 },
          { id: 'avg', label: 'Usual / average', value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      },
    ];
  }

  if (item.followUpKind === 'pieces_palm') {
    return [
      {
        step: 1,
        maxSteps: 1,
        text: 'How many pieces or palm size?',
        chips: [
          { id: 'p-1sm', label: '1 small piece', icon: '✋', value: '1 small piece', qtyMultiplier: 0.7 },
          { id: 'p-1', label: '1 palm piece', icon: '✋', value: '1 palm piece', qtyMultiplier: 1 },
          { id: 'p-2', label: '2 pieces / palms', icon: '🙌', value: '2 pieces (about 2 palms)', qtyMultiplier: 1.85 },
          { id: 'p-3', label: '3 pieces', icon: '🍽️', value: '3 pieces', qtyMultiplier: 2.5 },
          { id: 'avg', label: 'Average portion', value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      },
    ];
  }

  if (item.followUpKind === 'spoons') {
    return [
      {
        step: 1,
        maxSteps: 1,
        text: 'About how many spoons?',
        chips: [
          { id: 'sp-1', label: '1 spoon', icon: '🥄', value: '1 spoon', qtyMultiplier: 1 / Math.max(1, item.defaultQuantity) },
          { id: 'sp-2', label: '2 spoons', icon: '🥄', value: '2 spoons', qtyMultiplier: 2 / Math.max(1, item.defaultQuantity) },
          { id: 'sp-3', label: '3 spoons', icon: '🥄', value: '3 spoons', qtyMultiplier: 3 / Math.max(1, item.defaultQuantity) },
          { id: 'avg', label: 'Usual', value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      },
    ];
  }

  if (item.followUpKind === 'count') {
    return [
      {
        step: 1,
        maxSteps: 1,
        text: `How many ${item.unit}s?`,
        chips: [
          { id: 'c-1', label: `1 ${item.unit}`, value: `1 ${item.unit}`, qtyMultiplier: 1 / Math.max(1, item.defaultQuantity) },
          { id: 'c-2', label: `2 ${item.unit}s`, value: `2 ${item.unit}s`, qtyMultiplier: 2 / Math.max(1, item.defaultQuantity) },
          { id: 'c-3', label: `3 ${item.unit}s`, value: `3 ${item.unit}s`, qtyMultiplier: 3 / Math.max(1, item.defaultQuantity) },
          { id: 'c-4', label: `4 ${item.unit}s`, value: `4 ${item.unit}s`, qtyMultiplier: 4 / Math.max(1, item.defaultQuantity) },
          { id: 'avg', label: 'Average portion', value: 'average portion', qtyMultiplier: 1, isUnknown: true },
        ],
      },
    ];
  }

  return [];
}

export function buildEditablePortionChips(item: DraftFoodItem): FollowUpChip[] {
  if (item.followUpKind === 'drink_size' || item.isDrink) {
    return [
      { id: 'cup', label: 'Small cup (~150 ml)', value: 'small cup (~150 ml)', qtyMultiplier: 0.7 },
      { id: 'mug', label: 'Mug (~250 ml)', value: 'mug (~250 ml)', qtyMultiplier: 1 },
      { id: 'bigmug', label: 'Big mug (~350 ml)', value: 'big mug (~350 ml)', qtyMultiplier: 1.4 },
      { id: 'avg', label: 'Average portion', value: 'average portion', qtyMultiplier: 1 },
    ];
  }
  if (item.followUpKind === 'baladi_loaf') {
    return [
      { id: 'b-half', label: '1/2 loaf', value: '1/2 baladi loaf', qtyMultiplier: 0.5 },
      { id: 'b-1', label: '1 loaf', value: '1 baladi loaf', qtyMultiplier: 1 },
      { id: 'b-2', label: '2 loaves', value: '2 baladi loaves', qtyMultiplier: 2 },
      { id: 'b-3', label: '3 loaves', value: '3 baladi loaves', qtyMultiplier: 3 },
    ];
  }
  if (item.followUpKind === 'sandwich_size') {
    return [
      { id: 's-half', label: 'Half sandwich', value: 'half sandwich', qtyMultiplier: 0.5 },
      { id: 's-sm', label: 'Small', value: 'small sandwich', qtyMultiplier: 0.75 },
      { id: 's-reg', label: 'Regular', value: 'regular sandwich', qtyMultiplier: 1 },
      { id: 's-big', label: 'Big', value: 'big sandwich', qtyMultiplier: 1.35 },
    ];
  }
  if (item.followUpKind === 'hand_plate') {
    return [
      { id: 'h-sm', label: 'Fist / quarter plate', value: '1 fist (small / quarter plate)', qtyMultiplier: 0.65 },
      { id: 'h-md', label: '2 fists / half plate', value: '2 fists (normal / half plate)', qtyMultiplier: 1 },
      { id: 'h-bg', label: '3 fists / full plate', value: '3 fists (big / full plate)', qtyMultiplier: 1.45 },
    ];
  }
  if (item.followUpKind === 'pieces_palm') {
    return [
      { id: 'p-1s', label: 'Small piece', value: 'small piece', qtyMultiplier: 0.7 },
      { id: 'p-1', label: '1 palm', value: '1 palm piece', qtyMultiplier: 1 },
      { id: 'p-2', label: '2 palms', value: '2 palm pieces', qtyMultiplier: 1.85 },
      { id: 'p-3', label: '3 pieces', value: '3 pieces', qtyMultiplier: 2.5 },
    ];
  }
  if (item.followUpKind === 'spoons') {
    return [
      { id: 'sp-1', label: '1 spoon', value: '1 spoon', qtyMultiplier: 0.5 },
      { id: 'sp-2', label: '2 spoons', value: '2 spoons', qtyMultiplier: 1 },
      { id: 'sp-3', label: '3 spoons', value: '3 spoons', qtyMultiplier: 1.5 },
    ];
  }
  return [
    { id: 'half', label: 'Half / smaller', value: 'small portion', qtyMultiplier: 0.65 },
    { id: 'norm', label: 'Normal', value: 'regular portion', qtyMultiplier: 1 },
    { id: 'big', label: 'Big / extra', value: 'big portion', qtyMultiplier: 1.45 },
  ];
}

export function applyFollowUpChip(item: DraftFoodItem, chip: FollowUpChip): DraftFoodItem {
  const remaining = item.questionsQueue.slice(1);
  if (chip.isDrinkAddonStep) {
    const nextExtraKcal = chip.extraKcal ?? 0;
    const nextExtraPro = chip.extraProteinG ?? 0;
    const scaledBaseKcal = item.kcal - item.extraKcal;
    const scaledBasePro = item.proteinG - item.extraProteinG;
    const totalKcal = roundKcal(scaledBaseKcal + nextExtraKcal);
    const totalPro = roundProtein(scaledBasePro + nextExtraPro);
    const cleanName = chip.addonNameSuffix && !item.name.toLowerCase().includes(chip.addonNameSuffix.trim().toLowerCase())
      ? `${item.name}${chip.addonNameSuffix}`
      : item.name;
    const cleanAr = chip.addonNameArSuffix && item.nameAr && !item.nameAr.includes(chip.addonNameArSuffix.trim())
      ? `${item.nameAr}${chip.addonNameArSuffix}`
      : item.nameAr;
    const nextPortion =
      item.portionLabel.includes('average') || !item.portionLabel
        ? chip.value
        : item.portionLabel.includes(chip.value)
        ? item.portionLabel
        : `${item.portionLabel}, ${chip.value}`;

    return {
      ...item,
      name: cleanName,
      nameAr: cleanAr,
      portionLabel: nextPortion,
      extraKcal: nextExtraKcal,
      extraProteinG: nextExtraPro,
      kcal: totalKcal,
      proteinG: totalPro,
      confidence: 'Medium',
      questionsQueue: remaining,
      needsQuestion: remaining.length > 0,
    };
  }

  const mult = chip.qtyMultiplier > 0 ? chip.qtyMultiplier : 1;
  const nextKcal = roundKcal(item.baseKcal * mult + item.extraKcal);
  const nextPro = roundProtein(item.baseProteinG * mult + item.extraProteinG);
  const nextSodium = Math.max(0, Math.round(item.baseSodiumMg * mult));
  const nextMin = item.isMixedOrStreet ? roundKcal(nextKcal * 0.82) : undefined;
  const nextMax = item.isMixedOrStreet ? roundKcal(nextKcal * 1.2) : undefined;

  return {
    ...item,
    portionLabel: chip.isUnknown ? 'average portion' : chip.value,
    quantity: Number((item.quantity * mult).toFixed(1)),
    kcal: nextKcal,
    kcalMin: nextMin,
    kcalMax: nextMax,
    proteinG: nextPro,
    sodiumMg: nextSodium,
    confidence: chip.isUnknown ? 'Low' : 'High',
    questionsQueue: remaining,
    needsQuestion: remaining.length > 0,
  };
}

export function applyDirectPortionEdit(item: DraftFoodItem, chip: FollowUpChip): DraftFoodItem {
  const mult = chip.qtyMultiplier > 0 ? chip.qtyMultiplier : 1;
  const nextKcal = roundKcal(item.baseKcal * mult + item.extraKcal);
  const nextPro = roundProtein(item.baseProteinG * mult + item.extraProteinG);
  const nextSodium = Math.max(0, Math.round(item.baseSodiumMg * mult));
  const nextMin = item.isMixedOrStreet ? roundKcal(nextKcal * 0.82) : undefined;
  const nextMax = item.isMixedOrStreet ? roundKcal(nextKcal * 1.2) : undefined;

  return {
    ...item,
    portionLabel: chip.value,
    kcal: nextKcal,
    kcalMin: nextMin,
    kcalMax: nextMax,
    proteinG: nextPro,
    sodiumMg: nextSodium,
    questionsQueue: [],
    needsQuestion: false,
  };
}

function parseLeadingQuantity(segment: string): {
  qty: number | null;
  hasExplicitSize: boolean;
  sizeMultiplier: number;
  sizeLabel?: string;
  wantsAverage: boolean;
  cleaned: string;
} {
  let working = segment.trim();
  const wantsAverage = /\b(usual|average|normal|i dont know|idk)\b|(عادي|زي العادة|مش عارف)/i.test(working);

  // Extract explicit half/quarter/number
  let qty: number | null = null;
  const fractionMatch = working.match(/(?:^|\s)(1\/2|½|1\/4|¼|3\/4)(?=\s|$)/);
  if (fractionMatch) {
    qty = fractionMatch[1] === '1/2' || fractionMatch[1] === '½' ? 0.5 : fractionMatch[1] === '1/4' || fractionMatch[1] === '¼' ? 0.25 : 0.75;
    working = working.replace(fractionMatch[0], ' ').trim();
  }

  if (qty === null) {
    const wordMap: Array<[RegExp, number]> = [
      [/\b(half|nos|noss)\b|نص|نصف/i, 0.5],
      [/\b(quarter|rob3|roba)\b|ربع/i, 0.25],
      [/\b(two|double)\b|اتنين/i, 2],
      [/\b(three)\b|تلاتة|ثلاثة/i, 3],
      [/\b(four)\b|اربعة|أربعة/i, 4],
      [/\b(one)\b|واحد|واحدة/i, 1],
    ];
    for (const [rx, val] of wordMap) {
      if (rx.test(working)) {
        qty = val;
        working = working.replace(rx, ' ').trim();
        break;
      }
    }
  }

  if (qty === null) {
    // Check Arabic dual words like بيضتين or رغيفين
    if (/بيضتين|رغيفين|ساندوتشين|تفاحتين|موزتين|تمرتين/.test(working)) {
      qty = 2;
    } else {
      const numMatch = working.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|[a-z\u0600-\u06FF]|$)/i);
      if (numMatch) {
        const parsed = Number(numMatch[1]);
        if (Number.isFinite(parsed) && parsed > 0 && parsed <= 20) {
          qty = parsed;
          working = working.replace(numMatch[0], ' ').trim();
        }
      }
    }
  }

  let hasExplicitSize = false;
  let sizeMultiplier = 1;
  let sizeLabel: string | undefined;

  if (/\b(big mug|large mug|tall glass|large|big|full plate)\b|(كبير|كبيرة|طبق كبير|مج كبير)/i.test(working)) {
    hasExplicitSize = true;
    sizeMultiplier = 1.4;
    sizeLabel = 'big';
  } else if (/\b(small cup|small|quarter plate|mini)\b|(صغير|صغيرة|فنجان|ربع طبق)/i.test(working)) {
    hasExplicitSize = true;
    sizeMultiplier = 0.7;
    sizeLabel = 'small';
  } else if (/\b(mug|regular|medium|half plate|plate|glass|cup)\b|(مج|وسط|متوسط|كوباية|نص طبق)/i.test(working)) {
    hasExplicitSize = true;
    sizeMultiplier = 1;
    sizeLabel = 'regular';
  }

  return {
    qty,
    hasExplicitSize,
    sizeMultiplier,
    sizeLabel,
    wantsAverage,
    cleaned: working.replace(/\s+/g, ' ').trim(),
  };
}

function splitMultiFoodSentence(cleanedInput: string): string[] {
  // Replace separators: +, comma, Arabic comma, Arabic "و" at word start, "and", Franco "w", Arabic "مع", "with" (except compound drinks/dishes!)
  let text = cleanedInput
    .replace(/\b(i ate|i had|i drank|had|ate|drank|akalt|sherebt|akal|shereb|اكلت|أكلت|شربت|خدت)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Keep compound phrases intact before splitting on "with" / "w" / "و" / "ب"
  const protectedPhrases: Array<[RegExp, string]> = [
    [/\bnescafe\s+(?:with\s+)?milk\b/gi, 'nescafe__milk'],
    [/\bnescafe\s+(?:b\s*laban|belaban|balaban)\b/gi, 'nescafe__milk'],
    [/نسكافيه\s*(?:بلبن|بحليب|مع\s*لبن)/g, 'nescafe__milk'],
    [/\btea\s+(?:with\s+)?milk\b/gi, 'tea__milk'],
    [/\bshai\s+(?:b\s*laban|belaban|balaban)\b/gi, 'tea__milk'],
    [/شاي\s*(?:بلبن|بحليب|مع\s*لبن)/g, 'tea__milk'],
    [/\bprotein\s+shake\s+with\s+milk\b/gi, 'proteinshake__milk'],
    [/بروتين\s+بلبن/g, 'proteinshake__milk'],
    [/\bfoul?\s+(?:and|w|with)\s+eggs?\b/gi, 'ful | eggs'],
    [/\boil\s+and\s+lemon\b/gi, ''],
  ];
  for (const [rx, rep] of protectedPhrases) {
    text = text.replace(rx, rep);
  }

  // Split on commas, +, " and ", " & ", Franco " w ", " then ", Arabic " مع ", Arabic " و" when space-separated
  const rawParts = text
    .split(/\s*(?:,|\+|&|\band\b|\bthen\b|\bw\b|\bwith\b|مع|\sو(?=\S)|و\s+)\s*/i)
    .map((s) => s.replace(/__/g, ' with ').trim())
    .filter((s) => s.length > 0);

  return rawParts.length > 0 ? rawParts : [cleanedInput];
}

function findBestCatalogMatch(
  segment: string,
  customFoods: CustomFoodEntry[] = []
): { item: FoodCatalogItem; score: number } | null {
  const norm = normalizeFoodSearchText(segment)
    .replace(/\b(loaf|loaves|ra3if|ragheef|piece|pieces|cup|mug|glass|bowl|plate|sandwich|of|a|an|the)\b/g, ' ')
    .replace(/(رغيف|كوباية|فنجان|طبق|ساندوتش|علبة|حتة|حتت)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!norm) return null;

  // Check custom foods first
  for (const cf of customFoods) {
    const cfNorm = normalizeFoodSearchText(cf.name);
    const cfArNorm = cf.nameAr ? normalizeFoodSearchText(cf.nameAr) : '';
    if (cfNorm === norm || norm.includes(cfNorm) || (cfArNorm && norm.includes(cfArNorm))) {
      return {
        score: 120,
        item: {
          id: cf.id,
          name: cf.name,
          nameAr: cf.nameAr || '',
          icon: cf.icon || '🍽️',
          category: cf.category,
          slots: ['breakfast', 'lunch', 'dinner', 'snack'],
          aliases: [cf.name],
          defaultPortionLabel: cf.portionLabel,
          defaultQuantity: 1,
          unit: 'serving',
          kcal: cf.kcal,
          kcalRange: cf.kcalRange,
          proteinG: cf.proteinG,
          carbsG: cf.carbsG ?? 0,
          fatsG: cf.fatsG ?? 0,
          sodiumMg: cf.sodiumMg ?? 250,
          addedSugarG: cf.addedSugarG ?? 0,
          followUpKind: 'hand_plate',
          estimateNote: 'estimate',
        },
      };
    }
  }

  let best: { item: FoodCatalogItem; score: number } | null = null;
  for (const item of FOOD_CATALOG) {
    let topItemScore = 0;
    const candidates = [item.name, item.nameAr, ...item.aliases];
    for (const rawAlias of candidates) {
      const alias = normalizeFoodSearchText(rawAlias);
      if (!alias) continue;
      if (norm === alias) {
        topItemScore = Math.max(topItemScore, 100 + alias.length);
      } else if (norm.includes(alias) && alias.length >= 3) {
        topItemScore = Math.max(topItemScore, 70 + alias.length);
      } else if (alias.includes(norm) && norm.length >= 3) {
        topItemScore = Math.max(topItemScore, 45 + norm.length);
      }
    }
    if (topItemScore > 0 && (!best || topItemScore > best.score)) {
      best = { item, score: topItemScore };
    }
  }
  return best;
}

export function catalogItemToDraft(
  item: FoodCatalogItem,
  options?: {
    qty?: number | null;
    hasExplicitSize?: boolean;
    sizeMultiplier?: number;
    hasExplicitMilk?: boolean;
    hasExplicitSugar?: boolean;
    wantsAverage?: boolean;
    segmentText?: string;
    source?: DraftFoodItem['source'];
  }
): DraftFoodItem {
  const hasExplicitQty = options?.qty !== null && options?.qty !== undefined;
  const qtyRatio = hasExplicitQty
    ? (options!.qty! / Math.max(1, item.defaultQuantity))
    : 1;
  const sizeMult = options?.sizeMultiplier ?? 1;
  const combinedMult = Number((qtyRatio * sizeMult).toFixed(3));

  const baseKcal = roundKcal(item.kcal / Math.max(1, 1));
  const scaledKcal = roundKcal(item.kcal * combinedMult);
  const scaledPro = roundProtein(item.proteinG * combinedMult);
  const scaledSodium = Math.max(0, Math.round(item.sodiumMg * combinedMult));

  let portionLabel = item.defaultPortionLabel;
  if (options?.wantsAverage) {
    portionLabel = 'average portion';
  } else if (hasExplicitQty) {
    const q = options!.qty!;
    const unitWord = q === 1 ? item.unit : `${item.unit}${item.unit.endsWith('f') ? '' : 's'}`;
    portionLabel = item.unit === 'baladi loaf' && q !== 1 ? `${q} baladi loaves` : `${q} ${unitWord}`;
  } else if (options?.hasExplicitSize && sizeMult !== 1) {
    portionLabel = sizeMult > 1 ? `big ${item.unit}` : `small ${item.unit}`;
  }

  // Handle sugar modifier in segment text e.g. "with 2 spoons sugar"
  let extraKcal = 0;
  const sugarMatch = options?.segmentText?.match(/(\d)\s*(?:spoons?|معلقة|معالق)?\s*(?:sugar|sokar|سكر)/i);
  if (sugarMatch) {
    extraKcal = Number(sugarMatch[1]) * 20;
    portionLabel = `${portionLabel}, ${sugarMatch[1]} spoon sugar`;
  }

  const questions = buildFollowUpQuestionsForCatalog(item, {
    hasExplicitQty,
    hasExplicitMilk: Boolean(options?.hasExplicitMilk || item.id === 'cat-nescafe-milk' || item.id === 'cat-tea-milk'),
    hasExplicitSugar: Boolean(options?.hasExplicitSugar || sugarMatch),
    hasExplicitSize: Boolean(options?.hasExplicitSize),
    wantsAverage: Boolean(options?.wantsAverage),
  });

  const finalKcal = roundKcal(scaledKcal + extraKcal);
  const kcalMin = item.isMixedOrStreet ? roundKcal(finalKcal * 0.82) : undefined;
  const kcalMax = item.isMixedOrStreet ? roundKcal(finalKcal * 1.2) : undefined;

  return {
    id: `draft-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    catalogId: item.id,
    name: item.name,
    nameAr: item.nameAr,
    icon: item.icon,
    category: item.category,
    portionLabel,
    quantity: hasExplicitQty ? options!.qty! : item.defaultQuantity,
    unit: item.unit,
    baseKcal,
    baseProteinG: item.proteinG,
    baseSodiumMg: item.sodiumMg,
    baseCarbsG: item.carbsG,
    baseFatsG: item.fatsG,
    baseAddedSugarG: item.addedSugarG,
    extraKcal,
    extraProteinG: 0,
    kcal: finalKcal,
    kcalMin,
    kcalMax,
    proteinG: scaledPro,
    sodiumMg: scaledSodium,
    confidence: hasExplicitQty ? 'High' : options?.wantsAverage ? 'Low' : 'Medium',
    isMixedOrStreet: item.isMixedOrStreet,
    isDrink: item.isDrink,
    followUpKind: item.followUpKind,
    questionsQueue: questions,
    needsQuestion: questions.length > 0,
    source: options?.source ?? 'local',
  };
}

export function parseFoodTextLocally(
  rawText: string,
  explicitMealType?: MealType,
  customFoods: CustomFoodEntry[] = []
): {
  transcript: string;
  mealType: MealType;
  items: DraftFoodItem[];
  unmatchedSegments: string[];
} {
  const norm = normalizeFoodSearchText(rawText);
  const { mealType, strippedText } = detectMealTypeFromText(norm, explicitMealType);
  const segments = splitMultiFoodSentence(strippedText);

  const items: DraftFoodItem[] = [];
  const unmatchedSegments: string[] = [];

  for (const seg of segments) {
    if (!seg || seg.length < 2) continue;
    const { qty, hasExplicitSize, sizeMultiplier, wantsAverage, cleaned } = parseLeadingQuantity(seg);
    const hasExplicitMilk = /with milk|belaban|b laban|milk|بلبن|بحليب|black|sada|سادة/i.test(seg);
    const hasExplicitSugar = /sugar|sokar|سكر|no sugar|سادة/i.test(seg);

    const match = findBestCatalogMatch(cleaned || seg, customFoods);
    if (match) {
      items.push(
        catalogItemToDraft(match.item, {
          qty,
          hasExplicitSize,
          sizeMultiplier,
          hasExplicitMilk,
          hasExplicitSugar,
          wantsAverage,
          segmentText: seg,
          source: 'local',
        })
      );
    } else {
      unmatchedSegments.push(seg);
    }
  }

  return {
    transcript: rawText.trim(),
    mealType,
    items,
    unmatchedSegments,
  };
}

export interface ParsedMealGroup {
  mealType: MealType;
  segmentText: string;
  items: DraftFoodItem[];
  unmatchedSegments: string[];
}

export function parseMultiMealTextLocally(
  rawText: string,
  defaultSlot: MealType,
  customFoods: CustomFoodEntry[] = []
): ParsedMealGroup[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // Look for explicit meal slot markers inside a multi-meal sentence
  // e.g. "Lunch was fiteer and tea, dinner was mahshi" or "breakfast: eggs; lunch: koshari"
  const slotPattern =
    /(?:^|[.,;\n]\s*|\s+and\s+)(?=(breakfast|fetaar|fetar|morning meal|فطار|lunch|ghada|غدا|غداء|dinner|asha|عشا|عشاء|snack|snacks|سناك)\b)/gi;

  const splitPoints: Array<{ index: number; slot: MealType }> = [];
  let match: RegExpExecArray | null;
  while ((match = slotPattern.exec(trimmed)) !== null) {
    const word = (match[1] || '').toLowerCase();
    let slot: MealType = defaultSlot;
    if (/breakfast|fetaar|fetar|morning|فطار/.test(word)) slot = 'breakfast';
    else if (/lunch|ghada|غدا/.test(word)) slot = 'lunch';
    else if (/dinner|asha|عشا/.test(word)) slot = 'dinner';
    else if (/snack|سناك/.test(word)) slot = 'snack';
    splitPoints.push({ index: match.index, slot });
  }

  if (splitPoints.length <= 1) {
    const single = parseFoodTextLocally(trimmed, splitPoints[0]?.slot ?? defaultSlot, customFoods);
    return [
      {
        mealType: single.mealType,
        segmentText: trimmed,
        items: single.items,
        unmatchedSegments: single.unmatchedSegments,
      },
    ];
  }

  const groups: ParsedMealGroup[] = [];
  for (let i = 0; i < splitPoints.length; i++) {
    const start = splitPoints[i].index;
    const end = i + 1 < splitPoints.length ? splitPoints[i + 1].index : trimmed.length;
    const chunk = trimmed
      .slice(start, end)
      .replace(/^[,;.\s]+/, '')
      .replace(/^and\s+/i, '')
      .trim();
    if (!chunk) continue;
    const parsed = parseFoodTextLocally(chunk, splitPoints[i].slot, customFoods);
    const existing = groups.find((g) => g.mealType === parsed.mealType);
    if (existing) {
      existing.segmentText = `${existing.segmentText}; ${chunk}`;
      existing.items.push(...parsed.items);
      existing.unmatchedSegments.push(...parsed.unmatchedSegments);
    } else {
      groups.push({
        mealType: parsed.mealType,
        segmentText: chunk,
        items: parsed.items,
        unmatchedSegments: parsed.unmatchedSegments,
      });
    }
  }

  return groups;
}

export function apiResponseToDraftItems(api: FoodChatApiResponse): DraftFoodItem[] {
  return api.items.map((it, idx) => {
    const kind: FollowUpKind =
      it.unit.includes('mug') || it.unit.includes('cup') || it.unit.includes('glass')
        ? 'drink_size'
        : it.unit.includes('loaf')
        ? 'baladi_loaf'
        : it.unit.includes('sandwich') || it.unit.includes('wrap')
        ? 'sandwich_size'
        : it.unit.includes('plate') || it.unit.includes('bowl') || it.unit.includes('fist')
        ? 'hand_plate'
        : it.unit.includes('palm')
        ? 'pieces_palm'
        : it.unit.includes('spoon')
        ? 'spoons'
        : 'count';

    const questionsQueue: FollowUpQuestion[] = [];
    if (it.needsQuestion && it.question && it.question.chips.length > 0) {
      questionsQueue.push({
        step: 1,
        maxSteps: 1,
        text: it.question.text,
        chips: it.question.chips.map((c, ci) => ({
          id: `ai-chip-${idx}-${ci}`,
          label: c.label,
          value: c.value,
          qtyMultiplier: c.qtyMultiplier || 1,
          extraKcal: c.extraKcal || 0,
          extraProteinG: c.extraProteinG || 0,
          isDrinkAddonStep: (c.extraKcal || 0) > 0 || (c.extraProteinG || 0) > 0,
        })),
      });
    }

    const kcal = roundKcal(it.kcal);
    const proteinG = roundProtein(it.proteinG);

    return {
      id: `ai-${Date.now()}-${idx}`,
      name: it.name,
      nameAr: it.nameAr || '',
      icon: it.icon || '🍽️',
      mealType: it.mealType,
      category: it.category || 'Egyptian home food',
      portionLabel: it.portionLabel || 'average portion',
      quantity: it.quantity || 1,
      unit: it.unit || 'serving',
      baseKcal: kcal,
      baseProteinG: proteinG,
      baseSodiumMg: it.sodiumMg ?? 320,
      baseCarbsG: 0,
      baseFatsG: 0,
      baseAddedSugarG: 0,
      extraKcal: 0,
      extraProteinG: 0,
      kcal,
      kcalMin: it.kcalMin ? roundKcal(it.kcalMin) : undefined,
      kcalMax: it.kcalMax ? roundKcal(it.kcalMax) : undefined,
      proteinG,
      sodiumMg: it.sodiumMg ?? 320,
      confidence: it.confidence,
      isMixedOrStreet: Boolean(it.kcalMin && it.kcalMax && it.kcalMax > it.kcalMin),
      isDrink: kind === 'drink_size',
      followUpKind: kind,
      questionsQueue,
      needsQuestion: questionsQueue.length > 0,
      source: 'ai',
    };
  });
}

export function draftItemToMealFoodItem(draft: DraftFoodItem): MealFoodItem {
  const approxGrams = Math.max(30, Math.round(draft.kcal * 0.65));
  return {
    id: draft.id,
    name: `${draft.name} (${draft.portionLabel})`,
    nameAr: draft.nameAr,
    icon: draft.icon,
    portionLabel: draft.portionLabel,
    kcalRange:
      draft.kcalMin && draft.kcalMax
        ? `about ${draft.kcalMin}–${draft.kcalMax} kcal`
        : undefined,
    confidence: draft.confidence,
    portionGrams: approxGrams,
    baseGrams: approxGrams,
    calories: roundKcal(draft.kcal),
    proteinG: roundProtein(draft.proteinG),
    carbsG: Math.round(draft.baseCarbsG),
    fatsG: Math.round(draft.baseFatsG),
    sodiumMg: Math.round(draft.sodiumMg),
    addedSugarG: Math.round(draft.baseAddedSugarG),
  };
}

export interface MissingProteinOption {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  kcal: number;
  proteinG: number;
  sodiumMg: number;
  slot: MealType;
}

export function getMissingProteinHelp(
  proteinLeftG: number,
  currentSlot: MealType
): {
  missingG: number;
  headline: string;
  options: MissingProteinOption[];
} {
  const missingG = Math.max(0, Math.round(proteinLeftG));
  if (missingG <= 5) {
    return {
      missingG: 0,
      headline: "You already reached today's protein target.",
      options: [
        {
          id: 'opt-zabady-dates',
          title: 'Zabady cup + 3 dates',
          subtitle: 'Light extra if hungry · ~160 kcal · 7g protein',
          icon: '🥣',
          kcal: 160,
          proteinG: 7,
          sodiumMg: 70,
          slot: 'snack',
        },
        {
          id: 'opt-eggs-light',
          title: '2 boiled eggs',
          subtitle: 'Simple whole protein · ~150 kcal · 13g protein',
          icon: '🥚',
          kcal: 150,
          proteinG: 13,
          sodiumMg: 130,
          slot: currentSlot,
        },
      ],
    };
  }

  if (missingG <= 18) {
    return {
      missingG,
      headline: `You need about ${missingG} g more protein today.`,
      options: [
        {
          id: 'opt-eggs-areesh',
          title: '2 boiled eggs + piece of jibna areesh',
          subtitle: 'Quick Egyptian combo · ~220 kcal · 23g protein',
          icon: '🥚',
          kcal: 220,
          proteinG: 23,
          sodiumMg: 300,
          slot: currentSlot,
        },
        {
          id: 'opt-zabady-dates',
          title: 'Greek yogurt (or 2 zabady) + 3 dates',
          subtitle: 'No cooking, light on stomach · ~200 kcal · 16g protein',
          icon: '🥣',
          kcal: 200,
          proteinG: 16,
          sodiumMg: 75,
          slot: 'snack',
        },
      ],
    };
  }

  return {
    missingG,
    headline: `You are about ${missingG} g short on protein today.`,
    options: [
      {
        id: 'opt-ful-eggs',
        title: 'Ful medames bowl + 2 boiled eggs',
        subtitle: 'Filling Egyptian staple · ~390 kcal · 26g protein',
        icon: '🫘',
        kcal: 390,
        proteinG: 26,
        sodiumMg: 480,
        slot: currentSlot === 'snack' ? 'dinner' : currentSlot,
      },
      {
        id: 'opt-tuna-sandwich',
        title: 'Tuna sandwich (1 baladi loaf) or grilled chicken palm',
        subtitle: 'Easy 30–40g boost · ~350 kcal · 35g protein',
        icon: '🐟',
        kcal: 350,
        proteinG: 35,
        sodiumMg: 520,
        slot: currentSlot === 'snack' ? 'dinner' : currentSlot,
      },
    ],
  };
}

export function estimateCustomFoodLocally(params: {
  name: string;
  portionText: string;
  sizePreset: 'light' | 'medium' | 'heavy';
  proteinLevel: 'low' | 'moderate' | 'high';
}): { kcal: number; kcalRange: string; proteinG: number; portionLabel: string } {
  const baseKcal = params.sizePreset === 'light' ? 180 : params.sizePreset === 'heavy' ? 620 : 380;
  const proteinG =
    params.proteinLevel === 'high'
      ? params.sizePreset === 'light'
        ? 18
        : params.sizePreset === 'heavy'
        ? 40
        : 28
      : params.proteinLevel === 'moderate'
      ? params.sizePreset === 'light'
        ? 9
        : params.sizePreset === 'heavy'
        ? 22
        : 14
      : 4;
  const kcal = roundKcal(baseKcal);
  return {
    kcal,
    kcalRange: `about ${roundKcal(kcal * 0.82)}–${roundKcal(kcal * 1.2)} kcal`,
    proteinG,
    portionLabel: params.portionText.trim() || `${params.sizePreset} portion`,
  };
}

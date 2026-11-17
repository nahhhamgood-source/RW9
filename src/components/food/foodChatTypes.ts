import type { FoodCatalogCategory, MealType } from '../../types';
import type { FollowUpKind } from '../../data/foodCatalog';

export interface FollowUpChip {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  value: string;
  qtyMultiplier: number;
  extraKcal?: number;
  extraProteinG?: number;
  isUnknown?: boolean;
  isDrinkAddonStep?: boolean;
  addonNameSuffix?: string;
  addonNameArSuffix?: string;
}

export interface FollowUpQuestion {
  step: 1 | 2;
  maxSteps: 1 | 2;
  text: string;
  chips: FollowUpChip[];
}

export interface DraftFoodItem {
  id: string;
  catalogId?: string;
  name: string;
  nameAr: string;
  icon: string;
  category: FoodCatalogCategory | string;
  portionLabel: string;
  quantity: number;
  unit: string;
  baseKcal: number;
  baseProteinG: number;
  baseSodiumMg: number;
  baseCarbsG: number;
  baseFatsG: number;
  baseAddedSugarG: number;
  extraKcal: number;
  extraProteinG: number;
  kcal: number;
  kcalMin?: number;
  kcalMax?: number;
  proteinG: number;
  sodiumMg: number;
  confidence: 'High' | 'Medium' | 'Low';
  isMixedOrStreet?: boolean;
  isDrink?: boolean;
  followUpKind: FollowUpKind;
  questionsQueue: FollowUpQuestion[];
  needsQuestion: boolean;
  source: 'ai' | 'local' | 'list' | 'photo' | 'custom';
}

export interface FoodChatApiResponseItem {
  name: string;
  nameAr?: string;
  icon?: string;
  category?: string;
  portionLabel: string;
  quantity: number;
  unit: string;
  kcal: number;
  kcalMin?: number;
  kcalMax?: number;
  proteinG: number;
  sodiumMg?: number;
  confidence: 'High' | 'Medium' | 'Low';
  needsQuestion: boolean;
  question?: {
    text: string;
    chips: Array<{
      label: string;
      value: string;
      qtyMultiplier: number;
      extraKcal: number;
      extraProteinG: number;
    }>;
  };
}

export interface FoodChatApiResponse {
  transcript: string;
  mealType: MealType;
  items: FoodChatApiResponseItem[];
}

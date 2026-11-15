/**
 * Approximate WHO 2007 Reference Data (5–19 Years, 60–228 months) — Height-for-Age LMS Tables
 * Stored in src/data/who2007.json and explicitly labeled as approximate unless verified against
 * official WHO CSV exports. Also implements finished-growth logic (F2).
 */
import type { UserProfile } from '../types';
import whoData from './who2007.json';

export interface LmsRow {
  months: number;
  L: number;
  M: number;
  S: number;
}

export const WHO_SOURCE_INFO = {
  label: whoData.sourceLabel,
  verifiedOfficialCsv: whoData.verifiedOfficialCsv,
  disclaimer:
    'Approximate WHO 2007 height-for-age curves (ages 5–19). For clinical growth assessment, compare against your local pediatric/WHO chart or replace src/data/who2007.json with official WHO CSV rows.',
};

export const WHO_LMS_BOYS: LmsRow[] = (whoData.boys as Array<[number, number, number, number]>).map(
  ([months, L, M, S]) => ({ months, L, M, S })
);

export const WHO_LMS_GIRLS: LmsRow[] = (whoData.girls as Array<[number, number, number, number]>).map(
  ([months, L, M, S]) => ({ months, L, M, S })
);

/** High-precision Abramowitz & Stegun normal CDF approximation */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

export function interpolateLms(
  ageYears: number,
  sex: 'male' | 'female'
): { L: number; M: number; S: number; isAdultBaseline: boolean; clampedMonths: number } {
  const rows = sex === 'female' ? WHO_LMS_GIRLS : WHO_LMS_BOYS;
  const rawMonths = ageYears * 12;
  const minMonths = rows[0].months;
  const maxMonths = rows[rows.length - 1].months;
  const isAdultBaseline = rawMonths > maxMonths;
  const clampedMonths = Math.max(minMonths, Math.min(maxMonths, rawMonths));

  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (clampedMonths >= a.months && clampedMonths <= b.months) {
      const ratio = (clampedMonths - a.months) / (b.months - a.months || 1);
      return {
        L: a.L + (b.L - a.L) * ratio,
        M: a.M + (b.M - a.M) * ratio,
        S: a.S + (b.S - a.S) * ratio,
        isAdultBaseline,
        clampedMonths,
      };
    }
  }

  const last = rows[rows.length - 1];
  return { L: last.L, M: last.M, S: last.S, isAdultBaseline, clampedMonths };
}

export function heightAtPercentileLms(
  ageYears: number,
  sex: 'male' | 'female',
  zScore: number
): number {
  const { L, M, S } = interpolateLms(ageYears, sex);
  if (Math.abs(L) < 1e-6) {
    return Number((M * Math.exp(S * zScore)).toFixed(1));
  }
  return Number((M * Math.pow(1 + L * S * zScore, 1 / L)).toFixed(1));
}

export const PERCENTILE_Z_CURVES: Array<{ label: string; pct: number; z: number }> = [
  { label: '97th', pct: 97, z: 1.88079 },
  { label: '75th', pct: 75, z: 0.67449 },
  { label: '50th', pct: 50, z: 0 },
  { label: '25th', pct: 25, z: -0.67449 },
  { label: '3rd', pct: 3, z: -1.88079 },
];

export interface PercentileEstimate {
  pct: number;
  zScore: number;
  basisNote: string;
  isAdultBaseline: boolean;
}

export function computeHeightPercentile(
  heightCm: number,
  ageYears: number,
  sex: 'male' | 'female' | 'other'
): PercentileEstimate | null {
  if (!Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250) return null;
  if (!Number.isFinite(ageYears) || ageYears < 5) return null;

  if (sex === 'other') {
    const male = computeHeightPercentile(heightCm, ageYears, 'male');
    const female = computeHeightPercentile(heightCm, ageYears, 'female');
    if (!male || !female) return null;
    const avgPct = Math.round((male.pct + female.pct) / 2);
    return {
      pct: avgPct,
      zScore: Number(((male.zScore + female.zScore) / 2).toFixed(2)),
      basisNote: male.isAdultBaseline
        ? `Approximate WHO 19y adult midpoint across male (${male.pct}%) & female (${female.pct}%) curves`
        : `Approximate WHO 2007 midpoint across male (${male.pct}%) & female (${female.pct}%) curves`,
      isAdultBaseline: male.isAdultBaseline,
    };
  }

  const { L, M, S, isAdultBaseline } = interpolateLms(ageYears, sex);
  const zScore =
    Math.abs(L) < 1e-6
      ? Math.log(heightCm / M) / S
      : (Math.pow(heightCm / M, L) - 1) / (L * S);
  const pctRaw = normalCdf(zScore) * 100;
  const pct = Math.max(1, Math.min(99, Math.round(pctRaw)));
  const groupLabel = sex === 'female' ? 'females' : 'males';
  const basisNote = isAdultBaseline
    ? `Approximate WHO 19y adult baseline for ${groupLabel} (median ${M.toFixed(1)} cm)`
    : `Approximate WHO 2007 age ${Math.round(ageYears * 10) / 10}y reference for ${groupLabel} (median ${M.toFixed(1)} cm)`;

  return {
    pct,
    zScore: Number(zScore.toFixed(2)),
    basisNote,
    isAdultBaseline,
  };
}

export interface MidParentalOutlook {
  midpointCm: number;
  minCm: number;
  maxCm: number;
  formulaText: string;
  rangeNote: string;
}

export function computeMidParentalOutlook(
  sex: 'male' | 'female' | 'other',
  fatherCm?: number | null,
  motherCm?: number | null
): MidParentalOutlook | null {
  if (!fatherCm || !motherCm || fatherCm < 110 || motherCm < 110) return null;

  let midpointCm: number;
  let spread = 8.5;
  let formulaText: string;

  if (sex === 'male') {
    midpointCm = (fatherCm + motherCm + 13) / 2;
    formulaText = `(Father ${fatherCm.toFixed(1)} + Mother ${motherCm.toFixed(1)} + 13 cm) / 2`;
  } else if (sex === 'female') {
    midpointCm = (fatherCm + motherCm - 13) / 2;
    formulaText = `(Father ${fatherCm.toFixed(1)} + Mother ${motherCm.toFixed(1)} − 13 cm) / 2`;
  } else {
    midpointCm = (fatherCm + motherCm) / 2;
    spread = 10.5;
    formulaText = `(Father ${fatherCm.toFixed(1)} + Mother ${motherCm.toFixed(1)}) / 2 (±13 cm sex offset omitted)`;
  }

  return {
    midpointCm: Number(midpointCm.toFixed(1)),
    minCm: Number((midpointCm - spread).toFixed(1)),
    maxCm: Number((midpointCm + spread).toFixed(1)),
    formulaText,
    rangeNote: `Standard Tanner mid-parental formula (±${spread} cm spread covers most siblings, not an exact ceiling).`,
  };
}

/** F2: Consistent finished-growth detector */
export function isProbablyFinishedGrowing(
  profile: Pick<UserProfile, 'age' | 'sex' | 'stillGrowing'>
): boolean {
  if (profile.stillGrowing === 'no') return true;
  if (profile.stillGrowing === 'yes') {
    return profile.age >= 21;
  }
  if (profile.sex === 'female' && profile.age >= 16) return true;
  if (profile.sex === 'male' && profile.age >= 18) return true;
  return profile.age >= 19;
}

/**
 * Computes consistent Growth Complete percentage for both still-growing and adult users.
 * When growth plates are likely closed, returns 99–100% rather than dividing current height
 * by mid-parental family outlook.
 */
export function computeGrowthCompletePct(
  profile: Pick<UserProfile, 'age' | 'sex' | 'stillGrowing'>,
  currentHeightCm: number | null,
  outlookMidpointCm: number | null
): number | null {
  if (isProbablyFinishedGrowing(profile)) {
    if (profile.stillGrowing === 'no' || profile.age >= 20) return 100;
    return 99;
  }
  if (!currentHeightCm || !outlookMidpointCm || outlookMidpointCm <= 0) return null;
  return Math.min(98, Math.max(1, Math.round((currentHeightCm / outlookMidpointCm) * 100)));
}

export const DREAM_HEIGHT_GROWING_SD_CM = 4.5;
export const DREAM_HEIGHT_FINISHED_SD_CM = 0.8;

export interface DreamHeightEstimate {
  dreamCm: number;
  gapCm: number;
  chancePct: number;
  tier: 'High' | 'Medium' | 'Low';
  explanation: string;
}

/**
 * Dream height probability model:
 * - While still growing: centered on mid-parental family outlook with SD ≈ 4.5 cm.
 * - When likely finished growing (F2 fix): centered on currentHeight + small expected posture/late remainder (0–0.5 cm) with SD ≈ 0.8 cm.
 */
export function computeDreamHeightEstimate(
  dreamCm: number,
  currentHeightCm: number | null,
  midpointCm: number | null,
  finishedGrowing = false
): DreamHeightEstimate | null {
  if (!Number.isFinite(dreamCm) || dreamCm < 100 || dreamCm > 245) return null;

  if (finishedGrowing && currentHeightCm && currentHeightCm > 80) {
    const remainingExpectedCm = 0;
    const expectedAdultCm = currentHeightCm + remainingExpectedCm;
    const z = (dreamCm - expectedAdultCm) / DREAM_HEIGHT_FINISHED_SD_CM;
    const prob = (1 - normalCdf(z)) * 100;
    const chancePct =
      dreamCm <= currentHeightCm
        ? 99
        : Math.max(1, Math.min(99, Math.round(prob)));
    const tier: 'High' | 'Medium' | 'Low' =
      chancePct >= 60 ? 'High' : chancePct >= 25 ? 'Medium' : 'Low';
    const gapCm = Number((dreamCm - currentHeightCm).toFixed(1));

    return {
      dreamCm: Number(dreamCm.toFixed(1)),
      gapCm,
      chancePct,
      tier,
      explanation:
        gapCm <= 0
          ? `You have already reached this height (${currentHeightCm.toFixed(1)} cm).`
          : `Based on your current adult height (${currentHeightCm.toFixed(1)} cm) with near-zero remaining bone growth (SD ≈ ${DREAM_HEIGHT_FINISHED_SD_CM} cm; morning posture decompresses ~1 cm).`,
    };
  }

  if (!midpointCm) return null;
  const z = (dreamCm - midpointCm) / DREAM_HEIGHT_GROWING_SD_CM;
  const prob = (1 - normalCdf(z)) * 100;
  const chancePct = Math.max(1, Math.min(99, Math.round(prob)));
  const tier: 'High' | 'Medium' | 'Low' =
    chancePct >= 60 ? 'High' : chancePct >= 25 ? 'Medium' : 'Low';
  const gapCm = currentHeightCm ? Number((dreamCm - currentHeightCm).toFixed(1)) : 0;

  return {
    dreamCm: Number(dreamCm.toFixed(1)),
    gapCm,
    chancePct,
    tier,
    explanation: `Rough estimate assuming normal family variation (SD ≈ ${DREAM_HEIGHT_GROWING_SD_CM} cm around ${midpointCm.toFixed(1)} cm outlook). Adult height varies.`,
  };
}

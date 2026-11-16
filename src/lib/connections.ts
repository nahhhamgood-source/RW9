import { db, getOrCreateDailyLog } from '../db/database';

export const HEALTH_CONNECT = false;

export type ImportedFieldKey = 'date' | 'weightKg' | 'sleepHours' | 'steps' | 'workoutName' | 'workoutMin';

export interface ParsedHealthFile {
  fileName: string;
  format: 'csv' | 'json';
  headers: string[];
  rows: Record<string, string>[];
  suggestedMapping: Partial<Record<ImportedFieldKey, string>>;
}

export interface NormalizedImportRow {
  date: string;
  weightKg: number | null;
  sleepHours: number | null;
  steps: number | null;
  workoutName: string | null;
  workoutMin: number | null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function suggestMapping(headers: string[]): Partial<Record<ImportedFieldKey, string>> {
  const lower = headers.map((h) => ({ raw: h, key: h.toLowerCase().trim() }));
  const findFirst = (patterns: RegExp[]): string | undefined => {
    for (const pat of patterns) {
      const hit = lower.find((h) => pat.test(h.key));
      if (hit) return hit.raw;
    }
    return undefined;
  };
  return {
    date: findFirst([/^date$/, /day/, /timestamp/, /time/, /start/]),
    weightKg: findFirst([/weight.*kg/, /^weight$/, /body.?mass/, /mass/]),
    sleepHours: findFirst([/sleep.*hour/, /^sleep$/, /duration.*hr/, /sleep_min/]),
    steps: findFirst([/^steps$/, /step.?count/, /walk.*steps/]),
    workoutName: findFirst([/workout/, /activity/, /exercise/, /sport/, /type/]),
    workoutMin: findFirst([/workout.*min/, /duration.*min/, /^minutes$/, /elapsed/]),
  };
}

export function parseHealthFileText(fileName: string, text: string): ParsedHealthFile {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Selected file is empty.');
  }

  // Try JSON first when extension or leading char looks like JSON
  if (fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown;
    const rawArr: Record<string, unknown>[] = Array.isArray(parsed)
      ? parsed.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === 'object'))
      : parsed && typeof parsed === 'object'
      ? (
          (parsed as Record<string, unknown>).records ||
          (parsed as Record<string, unknown>).data ||
          (parsed as Record<string, unknown>).entries ||
          (parsed as Record<string, unknown>).rows ||
          [parsed]
        ) as Record<string, unknown>[]
      : [];

    if (!Array.isArray(rawArr) || rawArr.length === 0) {
      throw new Error('Could not find health records array inside JSON file.');
    }

    const headerSet = new Set<string>();
    const rows: Record<string, string>[] = rawArr.slice(0, 500).map((item) => {
      const rec: Record<string, string> = {};
      for (const [k, v] of Object.entries(item)) {
        headerSet.add(k);
        rec[k] = v === null || v === undefined ? '' : String(v);
      }
      return rec;
    });
    const headers = Array.from(headerSet);
    return {
      fileName,
      format: 'json',
      headers,
      rows,
      suggestedMapping: suggestMapping(headers),
    };
  }

  // CSV parsing
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV needs a header row and at least one data row.');
  }
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const headers = splitCsvLine(lines[0], delimiter).filter(Boolean);
  if (headers.length === 0) {
    throw new Error('CSV header row is empty.');
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < Math.min(lines.length, 501); i++) {
    const cols = splitCsvLine(lines[i], delimiter);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = cols[idx] ?? '';
    });
    rows.push(rec);
  }

  return {
    fileName,
    format: 'csv',
    headers,
    rows,
    suggestedMapping: suggestMapping(headers),
  };
}

function parseDateValue(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(clean)) {
    return clean.slice(0, 10).replace(/\//g, '-');
  }
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = dmy[3];
    const [month, day] = a > 12 ? [b, a] : [a, b];
    return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

export function buildNormalizedImportPreview(
  rows: Record<string, string>[],
  mapping: Partial<Record<ImportedFieldKey, string>>
): NormalizedImportRow[] {
  const out: NormalizedImportRow[] = [];
  for (const row of rows) {
    const rawDate = mapping.date ? row[mapping.date] ?? '' : '';
    const date = parseDateValue(rawDate);
    if (!date) continue;

    const toNum = (col?: string): number | null => {
      if (!col) return null;
      const v = Number(String(row[col] ?? '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(v) && v > 0 ? v : null;
    };

    let weightKg = toNum(mapping.weightKg);
    if (weightKg !== null && (weightKg < 25 || weightKg > 250)) weightKg = null;

    let sleepHours = toNum(mapping.sleepHours);
    if (sleepHours !== null && sleepHours > 24 && sleepHours <= 1440) {
      sleepHours = Number((sleepHours / 60).toFixed(1));
    }
    if (sleepHours !== null && (sleepHours < 1 || sleepHours > 18)) sleepHours = null;

    const stepsRaw = toNum(mapping.steps);
    const steps = stepsRaw !== null && stepsRaw <= 100000 ? Math.round(stepsRaw) : null;

    const workoutName = mapping.workoutName ? String(row[mapping.workoutName] ?? '').trim() || null : null;
    const workoutMinRaw = toNum(mapping.workoutMin);
    const workoutMin = workoutMinRaw !== null && workoutMinRaw <= 600 ? Math.round(workoutMinRaw) : null;

    if (weightKg === null && sleepHours === null && steps === null && !workoutName) {
      continue;
    }

    out.push({ date, weightKg, sleepHours, steps, workoutName, workoutMin });
  }
  return out;
}

export async function importHealthRowsToDb(rows: NormalizedImportRow[]): Promise<{
  weightsAdded: number;
  dailyLogsUpdated: number;
  workoutsAdded: number;
}> {
  let weightsAdded = 0;
  let dailyLogsUpdated = 0;
  let workoutsAdded = 0;

  for (const r of rows) {
    if (r.weightKg !== null) {
      await db.bodyMetrics.add({
        date: r.date,
        weightKg: Number(r.weightKg.toFixed(1)),
        waistCm: null,
        neckCm: null,
        bodyFatPct: null,
        createdAt: Date.now(),
      });
      weightsAdded++;
    }

    if (r.sleepHours !== null || r.steps !== null) {
      const log = await getOrCreateDailyLog(r.date);
      await db.dailyLogs.update(r.date, {
        sleepHours: r.sleepHours !== null ? r.sleepHours : log.sleepHours,
        steps: r.steps !== null ? Math.max(log.steps || 0, r.steps) : log.steps,
        updatedAt: Date.now(),
      });
      dailyLogsUpdated++;
    }

    if (r.workoutName) {
      await db.workouts.add({
        date: r.date,
        name: r.workoutName,
        durationMin: r.workoutMin ?? 40,
        exercises: [],
        notes: 'Imported from health file',
        createdAt: Date.now(),
      });
      workoutsAdded++;
    }
  }

  return { weightsAdded, dailyLogsUpdated, workoutsAdded };
}

import React, { useMemo, useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  Link2,
  Share2,
  ShieldCheck,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import {
  HEALTH_CONNECT,
  buildNormalizedImportPreview,
  importHealthRowsToDb,
  parseHealthFileText,
  type ImportedFieldKey,
  type ParsedHealthFile,
} from '../../lib/connections';
import { en } from '../../i18n/en';
import { useToast } from '../ui/ToastProvider';

const FIELD_LABELS: Array<{ key: ImportedFieldKey; label: string }> = [
  { key: 'date', label: 'Date column (required)' },
  { key: 'weightKg', label: 'Weight (kg)' },
  { key: 'sleepHours', label: 'Sleep (hours or mins)' },
  { key: 'steps', label: 'Steps' },
  { key: 'workoutName', label: 'Workout name' },
  { key: 'workoutMin', label: 'Workout minutes' },
];

export const ConnectionsSection: React.FC = () => {
  const { showToast } = useToast();
  const [parsedFile, setParsedFile] = useState<ParsedHealthFile | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportedFieldKey, string>>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const previewRows = useMemo(() => {
    if (!parsedFile) return [];
    return buildNormalizedImportPreview(parsedFile.rows, mapping);
  }, [parsedFile, mapping]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError(null);
    try {
      const text = await file.text();
      const parsed = parseHealthFileText(file.name, text);
      setParsedFile(parsed);
      setMapping(parsed.suggestedMapping);
    } catch (err) {
      setParsedFile(null);
      setParseError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const handleConfirmImport = async () => {
    if (previewRows.length === 0) {
      showToast('Map a Date column and at least one metric before importing.', 'warning');
      return;
    }
    setImporting(true);
    try {
      const result = await importHealthRowsToDb(previewRows);
      setParsedFile(null);
      setMapping({});
      showToast(
        `Imported ${result.weightsAdded} weights, ${result.dailyLogsUpdated} day logs, ${result.workoutsAdded} workouts`
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'warning');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div id="connections-section" className="ascend-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[var(--accent)]" /> {en.connections.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {en.connections.subtitle}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold">
          100% honest scope
        </span>
      </div>

      {/* 1. CSV / JSON File Import */}
      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div>
              <p className="text-xs font-bold">Import CSV or JSON export</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Google Fit / Health Connect exports, Samsung Health, Strava, Garmin, or spreadsheets.
              </p>
            </div>
          </div>
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold cursor-pointer min-h-[44px]">
            <Upload className="w-3.5 h-3.5" /> Choose file
            <input
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>

        {parseError && (
          <p className="text-xs text-rose-500 bg-rose-500/10 border border-rose-500/25 rounded-xl p-2.5">
            {parseError}
          </p>
        )}

        {parsedFile && (
          <div className="p-3 rounded-xl bg-white dark:bg-[#0D131F] border border-slate-200 dark:border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold">
                  {parsedFile.fileName} ({parsedFile.format.toUpperCase()} · {parsedFile.rows.length} rows)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Map columns below, check the preview, then confirm. Nothing saves until you tap Import.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setParsedFile(null)}
                aria-label="Cancel file import"
                className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-white/5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {FIELD_LABELS.map((field) => (
                <div key={field.key}>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    {field.label}
                  </label>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((prev) => ({
                        ...prev,
                        [field.key]: e.target.value || undefined,
                      }))
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs min-h-[44px]"
                  >
                    <option value="">-- Skip --</option>
                    {parsedFile.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {previewRows.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-emerald-500">
                  Preview: {previewRows.length} valid row{previewRows.length === 1 ? '' : 's'} ready
                </p>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 text-[11px]">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-white/5 text-slate-500">
                      <tr>
                        <th className="py-1.5 px-2">Date</th>
                        <th className="py-1.5 px-2">Weight</th>
                        <th className="py-1.5 px-2">Sleep</th>
                        <th className="py-1.5 px-2">Steps</th>
                        <th className="py-1.5 px-2">Workout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-white/10 font-mono-num">
                      {previewRows.slice(0, 8).map((r, i) => (
                        <tr key={`${r.date}-${i}`}>
                          <td className="py-1.5 px-2">{r.date}</td>
                          <td className="py-1.5 px-2">{r.weightKg !== null ? `${r.weightKg}kg` : '—'}</td>
                          <td className="py-1.5 px-2">{r.sleepHours !== null ? `${r.sleepHours}h` : '—'}</td>
                          <td className="py-1.5 px-2">{r.steps !== null ? r.steps : '—'}</td>
                          <td className="py-1.5 px-2 truncate max-w-[120px]">{r.workoutName ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-amber-500">
                No valid rows matched yet — verify your Date column mapping above.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={importing || previewRows.length === 0}
                onClick={handleConfirmImport}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px] disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {importing ? 'Importing...' : `Import ${previewRows.length} confirmed rows`}
              </button>
              <button
                type="button"
                onClick={() => setParsedFile(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Web Share Target */}
      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-start gap-2.5 text-xs">
        <Share2 className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">Share into ASCEND (Web Share Target)</p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
            When installed on Android Chrome, tap Share on a meal photo, workout note, or scale screenshot and choose ASCEND to jump straight to Food logging.
          </p>
        </div>
      </div>

      {/* 3. Android APK / Health Connect Status */}
      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-start justify-between gap-2.5 text-xs">
        <div className="flex items-start gap-2.5">
          <Smartphone className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Health Connect (Android APK path)</p>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {HEALTH_CONNECT
                ? 'Ready in native APK: per-type permission for steps, sleep, weight, and workouts.'
                : en.connections.androidFlagLine}
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-white/10 text-[10px] font-bold shrink-0">
          {HEALTH_CONNECT ? 'APK READY' : 'WEB BUILD'}
        </span>
      </div>

      {/* 4. Honest Web Limits & Privacy Guarantee */}
      <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5 text-xs">
        <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-emerald-700 dark:text-emerald-300">
            {en.connections.privacyLine}
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            {en.connections.webLimitLine}
          </p>
        </div>
      </div>
    </div>
  );
};

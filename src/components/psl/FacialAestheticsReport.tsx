import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  Download,
  Dumbbell,
  Info,
  Plus,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { GLOSSARY_TERMS } from '../../data/academy';
import { HAIRCUT_BY_FACE_SHAPE } from '../../data/care';
import { addProtocolToPlan, db } from '../../db/database';
import {
  getPslTierMeta,
  PSL_HONEST_DISCLAIMER,
  PSL_SCALE_GUIDE,
  WHAT_MOVES_PSL,
} from '../../lib/faceMetricsConstants';
import type {
  AppSettings,
  ExtendedReportPillar,
  FaceScanResult,
  LandmarksOverlayGuides,
  UserProfile,
} from '../../types';
import { useToast } from '../ui/ToastProvider';
import { ThirdsCanvasOverlay } from './ThirdsCanvasOverlay';
import { TierLadderCard } from './TierLadderCard';

interface FacialAestheticsReportProps {
  activeScan: FaceScanResult;
  scans: FaceScanResult[];
  profile?: UserProfile;
  slangTierNames?: boolean;
  includeSkinScore?: boolean;
  onSelectScan: (scanId: number) => void;
  onStartNewScan: () => void;
  onAddSidePhotos?: (scan: FaceScanResult) => void;
  onOpenExercises?: () => void;
  onOpenDebloatFood?: () => void;
  onOpenCompare?: () => void;
}

export const FacialAestheticsReport: React.FC<FacialAestheticsReportProps> = ({
  activeScan,
  scans,
  profile,
  slangTierNames = true,
  includeSkinScore = true,
  onSelectScan,
  onStartNewScan,
  onAddSidePhotos,
  onOpenExercises,
  onOpenDebloatFood,
  onOpenCompare,
}) => {
  const { showToast } = useToast();
  const [previewAngle, setPreviewAngle] = useState<'front' | 'left' | 'right' | 'profile90'>('front');
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);
  const [planAdded, setPlanAdded] = useState(false);
  const [pathAddedIds, setPathAddedIds] = useState<string[]>([]);
  const [rescanSet, setRescanSet] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);

  const tierMeta = useMemo(
    () => getPslTierMeta(activeScan.pslEstimate, slangTierNames),
    [activeScan.pslEstimate, slangTierNames]
  );
  const haircutGuide = HAIRCUT_BY_FACE_SHAPE[activeScan.faceShape] ?? HAIRCUT_BY_FACE_SHAPE.oval;

  const hasLeft = activeScan.anglesCaptured.includes('left');
  const hasRight = activeScan.anglesCaptured.includes('right');
  const missingSides = !hasLeft || !hasRight;
  const angleCount = activeScan.anglesCaptured.filter((a) => a !== 'smile').length;
  const confidencePct = Math.round(
    (activeScan.scanConfidence ??
      Math.min(0.95, Math.max(0.35, activeScan.qualityScore / 100))) * 100
  );
  const hasExprNotice = (activeScan.expressionScore ?? 0) >= 0.15;
  const confidenceNote =
    angleCount >= 4
      ? 'Based on 4 angles (incl. 90°)'
      : angleCount >= 3
      ? 'Based on 3 angles'
      : angleCount === 2
      ? 'Based on 2 angles'
      : 'Front only';

  const previewSrc =
    previewAngle === 'left'
      ? activeScan.leftThumbnail || activeScan.frontThumbnail
      : previewAngle === 'right'
      ? activeScan.rightThumbnail || activeScan.frontThumbnail
      : previewAngle === 'profile90'
      ? activeScan.profile90Thumbnail || activeScan.frontThumbnail
      : activeScan.frontThumbnail;

  const rawPillars: ExtendedReportPillar[] = useMemo(() => {
    if (activeScan.extendedPillars && activeScan.extendedPillars.length > 0) {
      return activeScan.extendedPillars;
    }
    // Backward-compatible fallback for pre-fix scans stored in IndexedDB
    const mFind = (key: string) => activeScan.measurements.find((m) => m.key === key);
    const canthal = mFind('canthalTilt');
    const midface = mFind('midface');
    const gonial = mFind('gonialAngle');
    return [
      {
        key: 'symmetry',
        title: 'Facial Symmetry',
        score: activeScan.subScores.symmetry,
        displayScore: `${activeScan.subScores.symmetry}/100`,
        descriptor: activeScan.asymmetries[0]
          ? `Peak variance: ${activeScan.asymmetries[0].label} (${activeScan.asymmetries[0].diffPct}%)`
          : 'Bilateral facial balance across mirrored pairs',
        confidence: 'medium',
        evidence: 'Proven',
        why: 'Mild asymmetry is universal. Head roll and one-sided lighting affect readings significantly.',
      },
      {
        key: 'thirds',
        title: 'Facial Thirds & Proportions',
        score: activeScan.subScores.proportions,
        displayScore: `${activeScan.subScores.proportions}/100`,
        descriptor: midface ? `Midface ${midface.value}${midface.unit}` : 'Estimated upper / middle / lower balance',
        confidence: 'low',
        evidence: 'Likely works',
        why: 'Hairline is estimated above the forehead landmark; haircut framing shifts perceived thirds fast.',
      },
      {
        key: 'eyeArea',
        title: 'Eye Area & Canthal Tilt',
        score: activeScan.subScores.eyeArea,
        displayScore: `${activeScan.subScores.eyeArea}/100`,
        descriptor: canthal && canthal.value !== null ? `Avg tilt ${canthal.value}°` : 'Eye spacing and orbital framing',
        confidence: 'high',
        evidence: 'Likely works',
        why: 'Consistent 7.5–8h sleep, orbital SPF, and tidy brows maximize eye contrast.',
      },
      {
        key: 'jawProjection',
        title: 'Jawline & Chin',
        score: activeScan.anglesCaptured.includes('left') || activeScan.anglesCaptured.includes('right')
          ? activeScan.subScores.jawNeck
          : null,
        displayScore:
          activeScan.anglesCaptured.includes('left') || activeScan.anglesCaptured.includes('right')
            ? `${activeScan.subScores.jawNeck}/100`
            : 'Not measurable',
        descriptor: gonial && gonial.value !== null
          ? `Approx. gonial ${gonial.value}° (side angles)`
          : 'Capture side angles for jaw projection.',
        confidence: 'low',
        evidence: 'Proven',
        why: 'Body composition, evening sodium, and neck posture are the real levers for lower-third sharpness.',
      },
      {
        key: 'cheekbones',
        title: 'Cheekbones & Midface',
        score: activeScan.subScores.cheekbones ?? activeScan.subScores.proportions,
        displayScore: `${activeScan.subScores.cheekbones ?? activeScan.subScores.proportions}/100`,
        descriptor: 'Visible cheekbone-to-jaw contour taper',
        confidence: 'medium',
        evidence: 'Proven',
        why: 'Describes visible silhouette in photos, not bone density.',
      },
      {
        key: 'skin',
        title: 'Skin Texture & Tone',
        score: activeScan.subScores.skin,
        displayScore: `${activeScan.subScores.skin}/100`,
        descriptor: 'Cheek and forehead tone evenness estimate',
        confidence: 'medium',
        evidence: 'Proven',
        why: 'Gentle cleanser, moisturizer, daily SPF 30+, and sleep drive skin clarity.',
      },
    ];
  }, [activeScan]);

  const pillars: ExtendedReportPillar[] = useMemo(() => {
    const lowLight = (activeScan.lightingScore ?? 100) < 55;
    return rawPillars.map((p) => {
      if (p.key !== 'skin') return p;
      if (!includeSkinScore) {
        return {
          ...p,
          score: null,
          displayScore: 'Off in Settings',
          descriptor: 'Skin scoring is turned off in Settings -> Privacy & Scan preferences.',
          confidence: 'low',
          approximate: true,
        };
      }
      if (lowLight) {
        return {
          ...p,
          confidence: 'low',
          approximate: true,
          descriptor: `Low light — skin estimate has low confidence (${p.descriptor})`,
        };
      }
      return p;
    });
  }, [rawPillars, includeSkinScore, activeScan.lightingScore]);

  const featureChips = useMemo(() => {
    if (activeScan.featureChips) return activeScan.featureChips;
    const chips: string[] = [];
    if (activeScan.subScores.symmetry >= 75) chips.push('Symmetrical alignment');
    if (activeScan.subScores.skin >= 75) chips.push('Even skin tone');
    return chips;
  }, [activeScan]);

  const verdictText = useMemo(() => {
    if (activeScan.verdictText) return activeScan.verdictText;
    const s0 = activeScan.strengths[0]?.area ?? 'Symmetry';
    const f0 = activeScan.focusAreas[0]?.area ?? 'Daily consistency';
    return `Strongest measured pillar today: ${s0} (${confidenceNote}). Highest-leverage habits right now center on ${f0} via skincare, lean body composition, hairstyle fit, and posture. Adult bone structure does not remodel from chewing or exercises.`;
  }, [activeScan, confidenceNote]);

  const handleCommitHairline = async (nextOverlay: LandmarksOverlayGuides) => {
    if (!activeScan.id) return;
    const nextMeasurements = activeScan.measurements.map((m) =>
      m.key === 'thirds'
        ? {
            ...m,
            label: `Facial thirds (${Math.round(nextOverlay.upperPct)} / ${Math.round(nextOverlay.midPct)} / ${Math.round(nextOverlay.lowerPct)}%)`,
            value: Number(nextOverlay.lowerPct.toFixed(1)),
            explanation: 'Hairline adjusted by you on the preview.',
          }
        : m
    );
    const nextPillars = activeScan.extendedPillars?.map((p) =>
      p.key === 'thirds'
        ? {
            ...p,
            descriptor: `Upper ${Math.round(nextOverlay.upperPct)}% · Mid ${Math.round(nextOverlay.midPct)}% · Lower ${Math.round(nextOverlay.lowerPct)}%`,
            why: 'Hairline adjusted by you. Haircut framing shifts upper-third balance fast.',
          }
        : p
    );
    await db.scans.update(activeScan.id, {
      landmarksOverlay: nextOverlay,
      measurements: nextMeasurements,
      ...(nextPillars ? { extendedPillars: nextPillars } : {}),
    });
    showToast('Hairline guide updated & saved');
  };

  const handleAddAllFocusAreas = async () => {
    const addedLabels: string[] = [];
    for (const fa of activeScan.focusAreas) {
      for (const act of fa.actions) {
        if (act.protocolId) {
          await addProtocolToPlan(act.protocolId, fa.area);
          addedLabels.push(act.label);
        }
      }
    }
    setPlanAdded(true);
    showToast(
      addedLabels.length > 0
        ? `Added ${addedLabels.length} focus actions to your protocol`
        : 'Protocol updated with focus recommendations'
    );
  };

  const handleAddPathLever = async (protocolId: string, label: string) => {
    await addProtocolToPlan(protocolId, label);
    setPathAddedIds((prev) => (prev.includes(protocolId) ? prev : [...prev, protocolId]));
    showToast(`Added "${label}" to Today`);
  };

  const handleSchedule4WeekRescan = async () => {
    const currentSettings: AppSettings | undefined = await db.settings.get('app');
    if (currentSettings) {
      await db.settings.update('app', {
        reminders: {
          ...currentSettings.reminders,
          enabled: true,
          rescanDays: 28,
        },
      });
    }
    setRescanSet(true);
    showToast('4-week (28 day) rescan reminder saved');
  };

  const under18OrUnknown = !profile || !profile.ageExplicitlySet || profile.age < 18 || profile.stillGrowing === 'yes';

  const priorScan = useMemo(() => {
    const others = scans.filter((s) => s.id !== activeScan.id && !s.isImplausible);
    return others[0] ?? null;
  }, [scans, activeScan.id]);

  const realDeltaRows = useMemo(() => {
    if (!priorScan) return [];
    const rows: Array<{ label: string; prev: number; next: number; unit: string; delta: number }> = [];
    rows.push({
      label: 'Overall estimate',
      prev: priorScan.pslEstimate,
      next: activeScan.pslEstimate,
      unit: '/8',
      delta: Number((activeScan.pslEstimate - priorScan.pslEstimate).toFixed(1)),
    });
    rows.push({
      label: 'Symmetry score',
      prev: priorScan.subScores.symmetry,
      next: activeScan.subScores.symmetry,
      unit: '/100',
      delta: Math.round(activeScan.subScores.symmetry - priorScan.subScores.symmetry),
    });
    rows.push({
      label: 'Skin tone score',
      prev: priorScan.subScores.skin,
      next: activeScan.subScores.skin,
      unit: '/100',
      delta: Math.round(activeScan.subScores.skin - priorScan.subScores.skin),
    });
    for (const m of activeScan.measurements) {
      if (m.value === null) continue;
      const prevM = priorScan.measurements.find((pm) => pm.key === m.key && pm.value !== null);
      if (prevM && prevM.value !== null) {
        rows.push({
          label: m.label,
          prev: prevM.value,
          next: m.value,
          unit: m.unit,
          delta: Number((m.value - prevM.value).toFixed(1)),
        });
      }
    }
    return rows.slice(0, 6);
  }, [priorScan, activeScan]);

  const vocabTerms = useMemo(() => {
    const want = [
      'PSL',
      'Canthal tilt',
      'Gonial angle',
      'Mewing',
      'CCW rotation',
      'Temporalis training',
      'Hunter Eyes',
      'Mogging',
    ];
    return want
      .map((name) => GLOSSARY_TERMS.find((t) => t.term.toLowerCase() === name.toLowerCase()))
      .filter((x): x is (typeof GLOSSARY_TERMS)[number] => Boolean(x));
  }, []);

  const handleSaveReportAsImage = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#05080A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(32, 32, 1016, 1286);

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('ASCEND.OS · FACIAL AESTHETICS REPORT', 64, 92);

    ctx.fillStyle = '#9CA3AF';
    ctx.font = '18px sans-serif';
    ctx.fillText(
      `Analysis · Evaluation · Recommendations  |  Scan #${activeScan.id ?? 1} · ${activeScan.date}`,
      64,
      126
    );

    // Score card
    ctx.fillStyle = '#0B1310';
    ctx.fillRect(64, 165, 952, 195);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.strokeRect(64, 165, 952, 195);

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('OVERALL ESTIMATE (OUT OF 8)', 96, 210);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 74px monospace';
    ctx.fillText(`${activeScan.pslEstimate} / 8`, 96, 294);

    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(tierMeta.bracketLabel, 450, 260);
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '18px sans-serif';
    ctx.fillText(`${confidenceNote} · Confidence ${confidencePct}% · Face shape: ${activeScan.faceShape}`, 450, 298);

    // Sub-scores grid
    const list = pillars.slice(0, 8);
    list.forEach((p, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 64 + col * 488;
      const y = 395 + row * 126;
      ctx.fillStyle = '#0B1210';
      ctx.fillRect(x, y, 464, 108);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeRect(x, y, 464, 108);

      ctx.fillStyle = '#E5E7EB';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(p.title, x + 22, y + 40);

      ctx.fillStyle = p.score !== null ? '#34D399' : '#F59E0B';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(p.displayScore, x + 22, y + 78);
    });

    // Strengths & Focus summary
    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('KEY STRENGTHS', 64, 950);
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '18px sans-serif';
    activeScan.strengths.slice(0, 3).forEach((s, i) => {
      ctx.fillText(`• ${s.area}: ${s.detail.slice(0, 68)}`, 64, 984 + i * 32);
    });

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('TOP FOCUS AREAS', 64, 1105);
    ctx.fillStyle = '#D1D5DB';
    ctx.font = '18px sans-serif';
    activeScan.focusAreas.slice(0, 3).forEach((f, i) => {
      ctx.fillText(`• ${f.area} — ${f.actions[0]?.label ?? ''}`, 64, 1139 + i * 32);
    });

    ctx.fillStyle = '#6B7280';
    ctx.font = '16px sans-serif';
    ctx.fillText(PSL_HONEST_DISCLAIMER, 64, 1280);

    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `ascend-facial-report-${activeScan.date}.png`;
    link.click();
    showToast('Saved report card image offline');
  };

  return (
    <div className="space-y-4">
      {/* Report Header Sheet Banner */}
      <div className="ascend-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/35 flex items-center justify-center shrink-0">
            <Crown className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
              FACIAL AESTHETICS REPORT
            </p>
            <h2 className="font-display text-base sm:text-lg font-bold">
              Analysis · Evaluation · Recommendations
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Small improvements. Big difference. · Scan #{activeScan.id ?? 1} · {activeScan.date}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scans.length > 1 && (
            <select
              value={activeScan.id}
              onChange={(e) => onSelectScan(Number(e.target.value))}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#0B110E] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold min-h-[40px]"
            >
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id ?? ''} · {s.date} · {s.pslEstimate}/8
                </option>
              ))}
            </select>
          )}
          {!activeScan.isImplausible && (
            <button
              type="button"
              onClick={handleSaveReportAsImage}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold min-h-[40px] hover:border-[var(--accent)]/40 transition"
            >
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" /> Save report as image
            </button>
          )}
          <button
            type="button"
            onClick={onStartNewScan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[40px]"
          >
            <Camera className="w-3.5 h-3.5" /> New Scan
          </button>
        </div>
      </div>

      {/* Plausibility guard: replace report when multiple metrics fall outside human bounds */}
      {activeScan.isImplausible ? (
        <div className="ascend-card p-6 sm:p-8 border-amber-500/40 bg-amber-500/10 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="font-display text-lg font-bold text-amber-300">
              {activeScan.plausibilityWarning ||
                'This scan looks unusual — retake with a neutral face, camera at eye level'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Several facial measurements fell outside typical human proportions, which usually happens from extreme tilt, lens proximity, or a strong facial expression.
            </p>
            {activeScan.implausibleMetrics && activeScan.implausibleMetrics.length > 0 && (
              <p className="text-[11px] font-mono-num text-amber-400/90 pt-1">
                Flagged ratios: {activeScan.implausibleMetrics.join(' · ')}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onStartNewScan}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
          >
            <RotateCcw className="w-4 h-4" /> Retake Scan
          </button>
        </div>
      ) : (
        <>

      {/* Prompt to add missing side photos and recompute report */}
      {missingSides && (
        <div className="ascend-card p-4 border-amber-500/30 bg-amber-500/5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">
              {!hasLeft && !hasRight
                ? 'Side Photos Not Captured Yet'
                : !hasLeft
                ? 'Left Side Photo Missing'
                : 'Right Side Photo Missing'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {activeScan.savedFrontSnapshot
                ? 'Add side photos to measure gonial angle and jawline projection and update this report.'
                : 'Capture a multi-angle scan with side photos to unlock gonial angle and jawline projection.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (activeScan.savedFrontSnapshot && onAddSidePhotos) {
                onAddSidePhotos(activeScan);
              } else {
                onStartNewScan();
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold min-h-[40px] shrink-0"
          >
            <Camera className="w-3.5 h-3.5" /> Add side photos
          </button>
        </div>
      )}

      {/* Left: Front Photo with Real Thirds Guide Lines + Midline | Right: Overall Estimate Card */}
      <div className="ascend-card ascend-hero-glow p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* Left Photo & Real Landmark Thirds Overlay */}
          <div className="md:col-span-5 space-y-2.5">
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#060A08] border border-emerald-500/20 flex items-center justify-center">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt={`${previewAngle} facial analysis preview`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 space-y-1.5">
                  <ScanFace className="w-10 h-10 mx-auto text-[var(--accent)] opacity-80" />
                  <p className="text-xs font-semibold text-slate-200">Thumbnails Off</p>
                  <p className="text-[11px] text-slate-400">
                    Measurements saved locally without keeping photos
                  </p>
                </div>
              )}

              {/* Thin Draggable Canvas Thirds + Midline Overlay on Front View */}
              {previewAngle === 'front' && activeScan.landmarksOverlay && (
                <ThirdsCanvasOverlay
                  overlay={activeScan.landmarksOverlay}
                  onCommitHairline={handleCommitHairline}
                />
              )}

              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/75 border border-white/15 text-[10px] font-mono-num text-sky-300 capitalize">
                {activeScan.faceShape} shape
              </span>
            </div>

            {(activeScan.leftThumbnail || activeScan.rightThumbnail || activeScan.profile90Thumbnail) && (
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { id: 'front', label: 'Front', ok: Boolean(activeScan.frontThumbnail) },
                  { id: 'left', label: 'Left 45°', ok: Boolean(activeScan.leftThumbnail) },
                  { id: 'right', label: 'Right 45°', ok: Boolean(activeScan.rightThumbnail) },
                  { id: 'profile90', label: '90°', ok: Boolean(activeScan.profile90Thumbnail) },
                ] as const).map((ang) => (
                  <button
                    key={ang.id}
                    type="button"
                    disabled={!ang.ok}
                    onClick={() => setPreviewAngle(ang.id)}
                    className={`py-1.5 rounded-xl text-[11px] font-semibold transition border ${
                      previewAngle === ang.id
                        ? 'bg-[var(--accent-soft)] border-[var(--accent)]/40 text-[var(--accent)]'
                        : 'bg-slate-100 dark:bg-white/[0.04] border-transparent text-slate-500 dark:text-slate-400 disabled:opacity-35'
                    }`}
                  >
                    {ang.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Overall Estimate Card + Feature Chips + Quote */}
          <div className="md:col-span-7 space-y-3.5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                  Overall Estimate
                </p>
                <div className="flex flex-wrap items-baseline gap-2.5 mt-1">
                  <span className="font-mono-num text-5xl font-bold tracking-tight">
                    {activeScan.pslEstimate}
                  </span>
                  <span className="text-sm font-mono-num text-slate-500 dark:text-slate-400">
                    / 8.0
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-mono-num font-bold border ${
                      confidencePct >= 75
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                        : confidencePct >= 50
                        ? 'bg-amber-500/15 border-amber-500/35 text-amber-400'
                        : 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                    }`}
                  >
                    Confidence {confidencePct}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {confidenceNote} · Quality {activeScan.qualityScore}/100 · Light {activeScan.lightingScore}/100
                </p>
                {hasExprNotice && (
                  <p className="text-[11px] text-amber-400 font-medium mt-0.5">
                    Non-neutral expression detected — confidence lowered on mouth, jaw, and eye metrics.
                  </p>
                )}
              </div>

              <div className="px-3.5 py-2.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-right">
                <span className="text-[10px] font-mono-num uppercase tracking-widest text-slate-500 dark:text-slate-400 block">
                  {tierMeta.rangeLabel}
                </span>
                <span className="font-display text-sm font-bold text-[var(--accent)] block">
                  {tierMeta.bracketLabel}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--accent)]">
                {tierMeta.constructiveLine}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {tierMeta.explanation}
              </p>
            </div>

            {/* Conditional Feature Chips (ONLY favorable metrics with >= medium confidence) */}
            {featureChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {featureChips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold"
                  >
                    <CheckCircle2 className="w-3 h-3" /> {chip}
                  </span>
                ))}
              </div>
            )}

            <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-black/35 border border-slate-200/80 dark:border-white/10 text-[11.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent)] inline mr-1.5 -mt-0.5" />
              {PSL_HONEST_DISCLAIMER}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive 6-Rung PSL Tier Ladder */}
      <TierLadderCard score={activeScan.pslEstimate} slangTierNames={slangTierNames} />

      {/* YOUR PATH — Never a dead end after any scan */}
      <div className="ascend-card p-4 sm:p-5 space-y-3.5 border-[var(--accent)]/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">
              Your Path (Top 3 Real Levers)
            </p>
            <h3 className="font-display text-base sm:text-lg font-bold">
              What actually improves your look from here
            </h3>
          </div>
          <button
            type="button"
            onClick={handleSchedule4WeekRescan}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold min-h-[44px] border transition ${
              rescanSet
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-500'
                : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-[var(--accent)]" />
            {rescanSet ? '4-week reminder on' : 'Remind me to re-scan in 4 weeks'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {/* Lever 1: Leanness / jawline fat */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-2.5">
            <div className="space-y-1">
              <p className="font-bold text-sm text-[var(--accent)]">1. Leanness &amp; Jaw Clarity</p>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                {profile?.aboutMe?.targetWeightKg
                  ? `Ties straight to your ${profile.aboutMe.targetWeightKg} kg target & diet plan.`
                  : 'Getting leaner shows the lower jaw clearly — spot-fat-loss does not exist.'}{' '}
                Steady water + low evening salt reduce morning bloat without dehydration.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                handleAddPathLever(
                  under18OrUnknown ? 'body-10min-walk' : 'body-protein-check',
                  'Leanness & Protein'
                )
              }
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] ${
                pathAddedIds.includes(under18OrUnknown ? 'body-10min-walk' : 'body-protein-check')
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              }`}
            >
              {pathAddedIds.includes(under18OrUnknown ? 'body-10min-walk' : 'body-protein-check')
                ? 'Added to Today'
                : 'Add to Today'}
            </button>
          </div>

          {/* Lever 2: Neck & posture */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-2.5">
            <div className="space-y-1">
              <p className="font-bold text-sm text-[var(--accent)]">2. Neck &amp; Posture Stack</p>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Neck curls, chin tucks, tongue posture, and forehead press at 30–50% effort (stop on pain; no neck weights under 18). Trains muscle &amp; posture, never bone or hyoid.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                handleAddPathLever(
                  under18OrUnknown ? 'body-posture-reset' : 'body-neck-set',
                  'Neck & Posture'
                )
              }
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] ${
                pathAddedIds.includes(under18OrUnknown ? 'body-posture-reset' : 'body-neck-set')
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              }`}
            >
              {pathAddedIds.includes(under18OrUnknown ? 'body-posture-reset' : 'body-neck-set')
                ? 'Added to Today'
                : 'Add to Today'}
            </button>
          </div>

          {/* Lever 3: Skin / hair / grooming / sleep */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-2.5">
            <div className="space-y-1">
              <p className="font-bold text-sm text-[var(--accent)]">3. Skin, Hair &amp; Sleep</p>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Highest-evidence daily glow-up: gentle cleanser + moisturizer + SPF, {haircutGuide.cuts[0]?.name ?? 'clean haircut'} for your {activeScan.faceShape} shape, and 7.5–8h sleep.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleAddPathLever('face-spf-daily', 'Daily SPF & Skin')}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold min-h-[44px] ${
                pathAddedIds.includes('face-spf-daily')
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : 'bg-[var(--accent)] text-[var(--accent-contrast)]'
              }`}
            >
              {pathAddedIds.includes('face-spf-daily') ? 'Added to Today' : 'Add to Today'}
            </button>
          </div>
        </div>

        {/* Direct jumps to Face Exercises, Debloat Food, and See the change */}
        <div className="flex flex-wrap gap-2 pt-1">
          {onOpenExercises && (
            <button
              type="button"
              onClick={onOpenExercises}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
            >
              <Dumbbell className="w-3.5 h-3.5 text-[var(--accent)]" /> Open Face Exercises
            </button>
          )}
          {onOpenDebloatFood && (
            <button
              type="button"
              onClick={onOpenDebloatFood}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
            >
              <Utensils className="w-3.5 h-3.5 text-sky-400" /> Debloat &amp; Food Habits
            </button>
          )}
          {onOpenCompare && (
            <button
              type="button"
              onClick={onOpenCompare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-bold min-h-[44px]"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" /> See the change (Before / After)
            </button>
          )}
        </div>

        {/* Real measured changes vs previous scan */}
        {realDeltaRows.length > 0 && priorScan && (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/10 space-y-2 text-xs">
            <p className="font-bold">
              Measured changes vs {priorScan.date} (real numbers only — use identical daylight &amp; eye level):
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {realDeltaRows.map((row) => (
                <div key={row.label} className="p-2 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10">
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">{row.label}</p>
                  <p className="font-mono-num text-xs font-bold">
                    {row.prev} → {row.next}{row.unit}{' '}
                    <span className={row.delta >= 0 ? 'text-emerald-500' : 'text-amber-500'}>
                      ({row.delta > 0 ? `+${row.delta}` : row.delta})
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Metrics List (Core + Extended Pillars, /100 Estimate or "Not measurable" + Learn More) */}
      <div className="ascend-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold">Detailed Analysis</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All scores are photo-based estimates. Missing angles show &quot;Not measurable&quot;.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddAllFocusAreas}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold min-h-[40px] transition ${
              planAdded
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/35'
                : 'bg-[var(--accent)] text-[var(--accent-contrast)]'
            }`}
          >
            {planAdded ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {planAdded ? 'Focus areas added' : 'Add focus areas to my plan'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {pillars.map((pillar) => {
            const isOpen = expandedPillar === pillar.key;
            return (
              <div
                key={pillar.key}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-black/35 border border-slate-200/80 dark:border-emerald-500/15 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold">{pillar.title}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 text-[10px] uppercase tracking-wider font-mono-num text-slate-600 dark:text-slate-300">
                        {pillar.confidence} conf.
                      </span>
                      {(pillar.approximate || pillar.confidence === 'low') && pillar.score !== null && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-semibold text-amber-500">
                          Approximate
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                      {pillar.notMeasurableReason || pillar.descriptor}
                    </p>
                  </div>

                  <span
                    className={`font-mono-num text-sm font-bold shrink-0 ${
                      pillar.score === null ? 'text-amber-500 text-xs' : 'text-[var(--accent)]'
                    }`}
                  >
                    {pillar.displayScore}
                  </span>
                </div>

                {pillar.score !== null && (
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${pillar.score}%` }}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedPillar(isOpen ? null : pillar.key)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-[var(--accent)]"
                >
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Learn more
                </button>

                {isOpen && (
                  <div className="pt-2 border-t border-slate-200 dark:border-white/10 text-[11px] space-y-1">
                    <span className="inline-block px-2 py-0.5 rounded bg-[var(--accent-soft)] text-[var(--accent)] font-semibold">
                      Evidence: {pillar.evidence}
                    </span>
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{pillar.why}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Three Cards Side-by-Side (Desktop/Tablet) / Stacked (Mobile): Strengths · Focus Areas · Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Key Strengths */}
        <div className="ascend-card p-4 space-y-2.5">
          <h3 className="font-display text-base font-bold">Key Strengths</h3>
          {activeScan.strengths.map((st) => (
            <div key={st.area} className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
              <p className="font-bold text-emerald-700 dark:text-emerald-300">{st.area}</p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">{st.detail}</p>
            </div>
          ))}
        </div>

        {/* Card 2: Top 3 Focus Areas */}
        <div className="ascend-card p-4 space-y-2.5">
          <h3 className="font-display text-base font-bold">Focus Areas</h3>
          {activeScan.focusAreas.map((fa) => (
            <div
              key={fa.area}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-xs space-y-1.5"
            >
              <p className="font-bold">{fa.area}</p>
              <p className="text-slate-600 dark:text-slate-300">{fa.detail}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-white/10 pt-1">
                {fa.medicalNote}
              </p>
            </div>
          ))}
        </div>

        {/* Card 3: Actionable Recommendations Ranked by Real Impact */}
        <div className="ascend-card p-4 space-y-2.5">
          <h3 className="font-display text-base font-bold">Actionable Recommendations</h3>
          <div className="space-y-2 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="font-bold text-[var(--accent)]">1. Fitness &amp; Leanness (High Impact)</p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                Sustainable lean body composition, 8k+ steps, resistance training, and low evening sodium sharpen jaw &amp; cheek definition.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="font-bold text-[var(--accent)]">2. Skincare &amp; Brows (High Impact)</p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                Gentle cleanser, moisturizer, daily SPF 30–50, 7.5–8h sleep, and removing stray brow hairs without over-thinning.
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="font-bold text-[var(--accent)] capitalize">
                3. Haircut &amp; Grooming ({activeScan.faceShape} face shape)
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                {haircutGuide.summary} Try <strong>{haircutGuide.cuts[0]?.name}</strong>: {haircutGuide.cuts[0]?.whyItWorks}
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10">
              <p className="font-bold">4. Posture, Neck &amp; Photo Setup</p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                Chin tucks, screen at eye height, light safe neck/trap training, and arm&apos;s-length daylight window photos.
              </p>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
              Note: Adult bone structure does not change from chewing gadgets, mewing, or face exercises. For orthodontic or cosmetic options, talk to a licensed professional.
            </p>
          </div>
        </div>
      </div>

      {/* Final Verdict Card (Real Metrics Only, Zero Predictions) */}
      <div className="ascend-card p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h3 className="font-display text-base font-bold">Final Verdict</h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {verdictText}
        </p>
      </div>

      {/* Normalized Landmark Measurements Table */}
      <div className="ascend-card p-4 sm:p-5 overflow-x-auto">
        <h3 className="font-display text-base font-bold mb-3">Measured Ratios &amp; Angles</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
              <th className="py-2 pr-3">Metric</th>
              <th className="py-2 pr-3">Measured</th>
              <th className="py-2 pr-3">Typical Range</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Confidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/10">
            {activeScan.measurements.map((m) => (
              <tr key={m.key}>
                <td className="py-2.5 pr-3">
                  <span className="font-medium block">{m.label}</span>
                  {(m.notMeasurableReason || m.explanation) && (
                    <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      {m.notMeasurableReason || m.explanation}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 font-mono-num font-semibold whitespace-nowrap">
                  {m.value === null ? 'Not measurable' : `${m.value}${m.unit}`}
                </td>
                <td className="py-2.5 pr-3 font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {m.typicalRange}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  <span
                    className={`font-semibold capitalize ${
                      m.value === null
                        ? 'text-amber-500'
                        : m.status === 'balanced'
                        ? 'text-emerald-500'
                        : 'text-amber-500'
                    }`}
                  >
                    {m.value === null ? 'Not measurable' : m.measurementStatus ?? m.status}
                  </span>
                </td>
                <td className="py-2.5 capitalize text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  <span>{m.confidence ?? (m.approximate ? 'low' : 'medium')}</span>
                  {(m.approximate || m.confidence === 'low') && m.value !== null && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 text-[10px] font-semibold">
                      Approximate
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom: Scale Guide + Honest Photo Tips */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="ascend-card p-4 space-y-2.5">
          <h3 className="font-display text-sm font-bold flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[var(--accent)]" /> Scale guide (1–8)
          </h3>
          <div className="space-y-1.5">
            {PSL_SCALE_GUIDE.map((row) => (
              <div
                key={row.rangeLabel}
                className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-[11px]"
              >
                <div className="flex items-center justify-between font-semibold">
                  <span>{slangTierNames ? row.slangName : row.neutralName}</span>
                  <span className="font-mono-num text-[var(--accent)]">{row.rangeLabel}</span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 mt-0.5">{row.explanation}</p>
              </div>
            ))}
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 text-[11px] space-y-1.5">
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              What moves a score realistically:
            </p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              {WHAT_MOVES_PSL.realisticLevers.join(' · ')}
            </p>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed pt-1 border-t border-slate-200 dark:border-white/10">
              <strong>Does not move:</strong> {WHAT_MOVES_PSL.doesNotMove[0]}
            </p>
          </div>
        </div>

        <div className="ascend-card p-4 space-y-2.5 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="font-display text-sm font-bold">Honest Photo Tips (For Consistent Trends)</h3>
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
              <li>Camera at exact eye level — tilting up/down distorts jaw and brow angles.</li>
              <li>Hold phone at full arm&apos;s length (~60–80 cm) so wide-angle lenses don&apos;t enlarge your nose.</li>
              <li>Face soft window daylight evenly; avoid harsh overhead shadows or dim yellow indoor bulbs.</li>
              <li>No beauty filters, neutral relaxed mouth, hair pulled back off your forehead.</li>
            </ul>

            <div className="pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowGlossary((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[44px]"
              >
                <Info className="w-3.5 h-3.5 text-[var(--accent)]" />
                What&apos;s this? (PSL, CCW rotation, Mewing, Canthal Tilt)
                {showGlossary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showGlossary && (
                <div className="mt-2 space-y-1.5">
                  {vocabTerms.map((g) => (
                    <div
                      key={g.term}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 text-[11px]"
                    >
                      <p className="font-bold text-[var(--accent)]">{g.term}</p>
                      <p className="text-slate-600 dark:text-slate-300">{g.meaning}</p>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                        <strong>Honest take:</strong> {g.honestTake}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-3 border-t border-slate-200 dark:border-white/10">
            Scan #{activeScan.id ?? 1} · {activeScan.date} · {PSL_HONEST_DISCLAIMER}
          </p>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

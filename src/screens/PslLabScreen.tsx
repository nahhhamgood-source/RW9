import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Upload,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
  ScanFace,
  ShieldCheck,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { addProtocolToPlan, db, recalculateXpAndBadges } from '../db/database';
import {
  analyzeFrameWithLandmarker,
  computeFullScanResult,
  detectLandmarksFast,
  drawBlueWireframeMesh,
  evaluateLandmarksQuality,
  getPslTierInfo,
  getScannerState,
  initFaceLandmarker,
  PSL_TIERS,
  subscribeScannerStatus,
  type QualityCheckResult,
} from '../lib/faceAnalysis';
import { daysBetween, toLocalDateKey } from '../lib/date';
import { BeforeAfterSlider, SmoothAreaChart } from '../components/ui/Charts';
import { CircularRing } from '../components/ui/ProgressRings';
import type { AppSettings, FaceScanResult } from '../types';
import { useToast } from '../components/ui/ToastProvider';

interface PslLabScreenProps {
  scans: FaceScanResult[];
  settings: AppSettings;
  onBack?: () => void;
}

interface UploadedScanPreview {
  canvas: HTMLCanvasElement;
  quality: QualityCheckResult;
  previewUrl: string;
}

export const PslLabScreen: React.FC<PslLabScreenProps> = ({ scans, settings, onBack }) => {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'scan' | 'results' | 'journal'>(
    scans.length > 0 ? 'results' : 'scan'
  );
  const [engineStatus, setEngineStatus] = useState(getScannerState());
  const [selectedResultId, setSelectedResultId] = useState<number | null>(scans[0]?.id ?? null);
  const [previewAngle, setPreviewAngle] = useState<'front' | 'left' | 'right'>('front');

  // Camera & 3D mesh state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const latestLandmarksRef = useRef<NormalizedLandmark[] | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [uploadedPreview, setUploadedPreview] = useState<UploadedScanPreview | null>(null);

  // Scanning progress state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStepLabel, setScanStepLabel] = useState('Mapping 3D facial geometry...');
  const [scanError, setScanError] = useState<string | null>(null);
  const scanProgressRef = useRef<number | null>(null);
  scanProgressRef.current = isScanning ? scanProgress : null;

  // Journal comparison indices
  const [compareA, setCompareA] = useState(0);
  const [compareB, setCompareB] = useState(1);

  useEffect(() => {
    const unsub = subscribeScannerStatus(() => setEngineStatus(getScannerState()));
    initFaceLandmarker().catch(() => {});
    return () => {
      unsub();
    };
  }, []);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setFaceDetected(false);
    busyRef.current = false;
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    setCameraError(null);
    setScanError(null);
    setUploadedPreview(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API unavailable in this browser context.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = stream;
      setCameraActive(true);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera access blocked. Allow camera permission or upload a photo.'
          : 'Camera unavailable on this device. Upload a front photo to run your 3D scan.';
      setCameraError(msg);
      setCameraActive(false);
      return false;
    }
  }, []);

  // Auto-start live 3D scanner camera when entering the scan screen
  useEffect(() => {
    if (subTab !== 'scan') {
      stopCamera();
      return;
    }
    if (!cameraActive && !uploadedPreview && !cameraError) {
      startCamera().catch(() => {});
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  // Attach MediaStream to <video> element safely
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [cameraActive, subTab]);

  useEffect(() => {
    if (scans.length > 0 && !selectedResultId) {
      setSelectedResultId(scans[0].id ?? null);
    }
  }, [scans, selectedResultId]);

  // Live 3D Blue Wireframe Face Mesh Overlay Loop
  useEffect(() => {
    if (subTab !== 'scan' || !cameraActive || engineStatus.status !== 'ready') return;
    let cancelled = false;

    const runMeshLoop = async () => {
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 95));
        if (cancelled) break;
        if (busyRef.current) continue;

        const video = videoRef.current;
        if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) continue;

        busyRef.current = true;
        try {
          const tmp = document.createElement('canvas');
          tmp.width = 320;
          tmp.height = Math.round((video.videoHeight / Math.max(1, video.videoWidth)) * 320) || 420;
          const tctx = tmp.getContext('2d');
          if (!tctx) continue;
          tctx.drawImage(video, 0, 0, tmp.width, tmp.height);

          const lm = await detectLandmarksFast(tmp);
          if (cancelled) break;

          const ov = overlayCanvasRef.current;
          if (ov) {
            const renderW = 720;
            const renderH = Math.round((tmp.height / Math.max(1, tmp.width)) * renderW);
            if (ov.width !== renderW || ov.height !== renderH) {
              ov.width = renderW;
              ov.height = renderH;
            }
            const octx = ov.getContext('2d');
            if (octx) {
              octx.clearRect(0, 0, ov.width, ov.height);
              if (lm && lm.length >= 468) {
                latestLandmarksRef.current = lm;
                setFaceDetected(true);
                drawBlueWireframeMesh(octx, ov.width, ov.height, lm, scanProgressRef.current);
              } else {
                setFaceDetected(false);
              }
            }
          }
        } catch {
          // Graceful frame recovery so video stream never freezes
        } finally {
          busyRef.current = false;
        }
      }
    };

    runMeshLoop();

    return () => {
      cancelled = true;
      busyRef.current = false;
    };
  }, [subTab, cameraActive, engineStatus.status]);

  const handleOpenScanner = () => {
    setScanError(null);
    setCameraError(null);
    setUploadedPreview(null);
    setIsScanning(false);
    setScanProgress(0);
    latestLandmarksRef.current = null;
    setSubTab('scan');
  };

  const handleExitScanner = () => {
    stopCamera();
    setIsScanning(false);
    setScanProgress(0);
    setScanError(null);
    if (scans.length > 0) {
      setSubTab('results');
    } else if (onBack) {
      onBack();
    } else {
      setSubTab('results');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const maxDim = 960;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const quality = await analyzeFrameWithLandmarker(canvas, 'front');
          if (!quality.landmarks || quality.landmarks.length < 468) {
            setScanError('No face detected in photo. Choose a clear front-facing photo.');
            showToast('No face detected in photo', 'warning');
            return;
          }

          // Render blue 3D wireframe preview onto display image
          const meshCanvas = document.createElement('canvas');
          meshCanvas.width = canvas.width;
          meshCanvas.height = canvas.height;
          const mctx = meshCanvas.getContext('2d');
          if (mctx) {
            mctx.drawImage(canvas, 0, 0);
            drawBlueWireframeMesh(mctx, meshCanvas.width, meshCanvas.height, quality.landmarks);
          }

          stopCamera();
          setUploadedPreview({
            canvas,
            quality,
            previewUrl: meshCanvas.toDataURL('image/jpeg', 0.88),
          });
          setFaceDetected(true);
          showToast('3D wireframe mapped — tap Start Scan');
        } catch (err) {
          setScanError(err instanceof Error ? err.message : 'Unable to process uploaded image.');
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartScan = async () => {
    if (isScanning) return;
    setScanError(null);

    // If camera isn't running and no uploaded photo exists yet, start the camera first
    if (!cameraActive && !uploadedPreview) {
      await startCamera();
      return;
    }

    setIsScanning(true);
    setScanProgress(18);
    setScanStepLabel('Mapping 478 3D Facial Landmarks...');

    try {
      await initFaceLandmarker();

      let frontCanvas: HTMLCanvasElement;
      let frontQuality: QualityCheckResult;

      if (uploadedPreview) {
        frontCanvas = uploadedPreview.canvas;
        frontQuality = uploadedPreview.quality;
        await new Promise((r) => setTimeout(r, 320));
      } else {
        const video = videoRef.current;
        if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          throw new Error('Camera stream is still warming up. Hold steady for a second and tap Start Scan.');
        }

        frontCanvas = document.createElement('canvas');
        frontCanvas.width = video.videoWidth;
        frontCanvas.height = video.videoHeight;
        const ctx = frontCanvas.getContext('2d');
        if (!ctx) {
          throw new Error('Unable to capture frame from camera.');
        }
        ctx.drawImage(video, 0, 0, frontCanvas.width, frontCanvas.height);

        setScanProgress(44);
        setScanStepLabel('Locking 3D Biometric Mesh...');

        frontQuality = await analyzeFrameWithLandmarker(frontCanvas, 'front');
        if (!frontQuality.landmarks || frontQuality.landmarks.length < 468) {
          // Reuse live-tracked landmarks if instantaneous shutter frame blinked
          if (latestLandmarksRef.current && latestLandmarksRef.current.length >= 468) {
            frontQuality = evaluateLandmarksQuality(frontCanvas, latestLandmarksRef.current, 'front');
          }
        }

        if (!frontQuality.landmarks || frontQuality.landmarks.length < 468) {
          setIsScanning(false);
          setScanProgress(0);
          setScanError('No face detected. Align your face inside the camera or upload a photo.');
          return;
        }
      }

      setScanProgress(74);
      setScanStepLabel('Analyzing Symmetry, Jawline & Canthal Tilt...');
      await new Promise((r) => setTimeout(r, 280));

      setScanProgress(94);
      setScanStepLabel('Generating PSL Aesthetics Report...');
      await new Promise((r) => setTimeout(r, 180));

      const result = computeFullScanResult({
        frontCanvas,
        frontQuality,
        hasSmile: false,
        saveThumbnails: settings.saveThumbnails,
      });

      const id = await db.scans.add(result);
      await db.profile.update('me', { detectedFaceShape: result.faceShape, updatedAt: Date.now() });
      recalculateXpAndBadges().catch(() => {});

      setScanProgress(100);
      stopCamera();
      setUploadedPreview(null);
      setSelectedResultId(Number(id));
      setPreviewAngle('front');
      setIsScanning(false);
      setSubTab('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('3D Face Scan complete');
    } catch (err) {
      setIsScanning(false);
      setScanProgress(0);
      const msg = err instanceof Error ? err.message : 'Unable to complete face scan. Please try again.';
      setScanError(msg);
      showToast(msg, 'warning');
    }
  };

  const activeScan = scans.find((s) => s.id === selectedResultId) ?? scans[0] ?? null;
  const todayKey = toLocalDateKey();
  const scansToday = scans.filter((s) => s.date === todayKey).length;
  const daysSinceLastScan = scans[0] ? daysBetween(scans[0].date, todayKey) : null;
  const thumbnailScans = scans.filter((s) => Boolean(s.frontThumbnail));

  // FULL-VIEWPORT 3D FACE SCANNER UI (Portaled to document.body so parent transforms never clip it)
  if (subTab === 'scan') {
    const scannerOverlay = (
      <div className="fixed inset-0 z-50 bg-[#050709] text-white flex flex-col overflow-hidden">
        {/* Top Scanner Header */}
        <header className="h-14 shrink-0 bg-[#14171C]/95 backdrop-blur-xl border-b border-white/10 px-3 sm:px-5 grid grid-cols-3 items-center">
          <div className="flex items-center justify-start">
            <button
              type="button"
              onClick={handleExitScanner}
              aria-label="Back"
              className="w-11 h-11 rounded-full flex items-center justify-center text-[#0A84FF] hover:bg-white/5 active:scale-95 transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>

          <h1 className="text-base font-bold text-white text-center whitespace-nowrap tracking-tight">
            3D Face Scanner
          </h1>

          <div className="flex items-center justify-end">
            <label
              title="Upload photo from gallery"
              className="w-11 h-11 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer active:scale-95 transition"
            >
              <Upload className="w-4 h-4" />
              <input
                type="file"
                accept="image/*"
                disabled={isScanning}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </header>

        {/* Live Camera Stream + 3D Blue Wireframe Mesh + Frosted Bottom Sheet */}
        <div className="relative flex-1 w-full max-w-2xl mx-auto overflow-hidden bg-black sm:my-3 sm:rounded-[28px] sm:border sm:border-white/10">
          {cameraActive ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
              />
            </>
          ) : uploadedPreview ? (
            <img
              src={uploadedPreview.previewUrl}
              alt="Uploaded 3D face mesh preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 pb-52 text-center bg-gradient-to-b from-[#070B10] to-[#040608]">
              <div className="w-24 h-24 rounded-full bg-sky-500/10 border border-sky-400/30 flex items-center justify-center mb-4">
                <ScanFace className="w-11 h-11 text-[#0A84FF]" />
              </div>
              <p className="text-sm font-semibold text-white">
                {cameraError ? 'Camera Permission Required' : 'Initializing 3D Face Scanner...'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                {cameraError || 'Align your face in even lighting for a real-time 478-landmark 3D wireframe map.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={() => startCamera()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold min-h-[44px]"
                >
                  <Camera className="w-4 h-4 text-[#0A84FF]" />
                  Enable Camera
                </button>
                <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold cursor-pointer min-h-[44px]">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isScanning}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Engine Load Failure Fallback */}
          {engineStatus.status === 'error' && (
            <div className="absolute top-3 left-3 right-3 p-3 rounded-2xl bg-rose-950/90 border border-rose-500/40 flex items-center justify-between gap-2 text-xs">
              <span className="text-rose-200">3D Mesh engine failed to initialize.</span>
              <button
                type="button"
                onClick={() => initFaceLandmarker(true)}
                className="px-3 py-1.5 rounded-xl bg-rose-500 text-white font-semibold shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Subtle Face Lock Indicator when live camera is tracking */}
          {cameraActive && !isScanning && (
            <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none px-4">
              <div className="px-3 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-[11px] font-medium text-slate-200">
                {engineStatus.status === 'loading'
                  ? 'Loading 3D wireframe engine...'
                  : faceDetected
                  ? '3D face mesh locked'
                  : 'Position face inside frame'}
              </div>
            </div>
          )}

          {/* Frosted-Glass Bottom Sheet Card */}
          <div className="absolute bottom-4 left-3 right-3 sm:bottom-6 max-w-md mx-auto">
            <div className="bg-[#0C1410]/80 backdrop-blur-xl border border-emerald-500/20 rounded-[28px] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.75)]">
              <h2 className="text-lg font-bold text-white text-center tracking-tight">
                Align your face in the camera
              </h2>
              <p className="text-xs text-slate-300/80 text-center mt-1 leading-relaxed">
                A quick 3D map of your face is used to analyze your features.
              </p>

              {scanError && (
                <div className="mt-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-[11px] text-amber-200 text-center">
                  {scanError}
                </div>
              )}

              {isScanning ? (
                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-sky-300">
                    <span className="flex items-center gap-2 truncate">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span className="truncate">{scanStepLabel}</span>
                    </span>
                    <span className="font-mono-num shrink-0 ml-2">{scanProgress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0A84FF] to-[#22D3EE] transition-all duration-300"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={engineStatus.status === 'loading'}
                  className="w-full mt-4 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-[#0A84FF] via-[#0095FF] to-[#00B4FF] text-white text-sm font-bold min-h-[50px] shadow-[0_0_24px_rgba(14,165,233,0.45)] hover:brightness-110 active:scale-[0.98] transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  <span>
                    {engineStatus.status === 'loading' ? 'Preparing 3D Scanner...' : 'Start Scan'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );

    return (
      <>
        <div className="ascend-card p-6 text-center space-y-3">
          <ScanFace className="w-10 h-10 mx-auto text-[#0A84FF]" />
          <p className="text-sm font-semibold">3D Face Scanner Active</p>
          <button
            type="button"
            onClick={handleExitScanner}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/10 text-xs font-semibold min-h-[40px]"
          >
            Exit Scanner
          </button>
        </div>
        {typeof document !== 'undefined' ? createPortal(scannerOverlay, document.body) : scannerOverlay}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">PSL LAB</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            On-device 478-landmark 3D analysis · Zero cloud upload ·{' '}
            <span
              className={
                engineStatus.status === 'ready'
                  ? 'text-[var(--accent)] font-semibold'
                  : engineStatus.status === 'error'
                  ? 'text-rose-500 font-semibold'
                  : 'text-amber-500 font-semibold'
              }
            >
              {engineStatus.status === 'ready'
                ? 'Scanner ready'
                : engineStatus.status === 'loading'
                ? 'Loading local model...'
                : engineStatus.status === 'error'
                ? 'Scanner load error'
                : 'Idle'}
            </span>
          </p>
        </div>

        {engineStatus.status === 'error' && (
          <button
            type="button"
            onClick={() => initFaceLandmarker(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500 text-white text-xs font-semibold min-h-[40px]"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retry Scanner
          </button>
        )}
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-1.5 p-1 rounded-2xl bg-slate-200/70 dark:bg-white/5 w-fit max-w-full overflow-x-auto">
        {([
          { id: 'scan', label: '3D Scanner' },
          { id: 'results', label: `Results (${scans.length})` },
          { id: 'journal', label: 'Photo Journal' },
        ] as const).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              if (t.id === 'scan') handleOpenScanner();
              else setSubTab(t.id);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold min-h-[38px] whitespace-nowrap shrink-0 transition ${
              subTab === t.id
                ? 'bg-white dark:bg-[#0E1612] text-slate-900 dark:text-white shadow-sm border border-transparent dark:border-emerald-500/20'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scansToday >= 3 && (
        <div className="ascend-card p-3.5 bg-amber-500/10 border-amber-500/40 flex gap-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <span>
            You have run {scansToday} scans today. True facial changes track best across 14-day intervals.
          </span>
        </div>
      )}

      {/* RESULTS TAB */}
      {subTab === 'results' && (
        <div key="results-tab" className="ascend-panel-enter space-y-4">
          {!activeScan ? (
            <div className="ascend-card p-8 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No scans analyzed yet. Launch the 3D Face Scanner to generate your official PSL Facial Aesthetics Report.
              </p>
              <button
                type="button"
                onClick={handleOpenScanner}
                className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-bold min-h-[44px]"
              >
                Open 3D Face Scanner
              </button>
            </div>
          ) : (
            (() => {
              const tierInfo = getPslTierInfo(activeScan.pslEstimate);
              const findMetric = (key: string) => activeScan.measurements.find((m) => m.key === key);
              const midfaceMetric = findMetric('midface');
              const canthalMetric = findMetric('canthalTilt');
              const gonialMetric = findMetric('gonialAngle');
              const jawCheekMetric = findMetric('jawCheek');
              const topAsym = activeScan.asymmetries[0];

              const previewSrc =
                previewAngle === 'left'
                  ? activeScan.leftThumbnail || activeScan.frontThumbnail
                  : previewAngle === 'right'
                  ? activeScan.rightThumbnail || activeScan.frontThumbnail
                  : activeScan.frontThumbnail;

              const aestheticPillars = [
                {
                  title: 'Facial Symmetry',
                  score: activeScan.subScores.symmetry,
                  metric: topAsym ? `${topAsym.diffPct}% peak offset` : 'Balanced axis',
                  detail: 'Bilateral eye, cheekbone, jaw & lip alignment',
                },
                {
                  title: 'Jawline Projection',
                  score: activeScan.subScores.jawNeck,
                  metric: gonialMetric
                    ? `${gonialMetric.value}° gonial`
                    : jawCheekMetric
                    ? `${jawCheekMetric.value}x jaw/cheek`
                    : '3D mandibular framing',
                  detail: 'Gonial contour, mandibular width & cervical line',
                },
                {
                  title: 'Midface Ratio',
                  score: activeScan.subScores.proportions,
                  metric: midfaceMetric ? `${midfaceMetric.value}x IPD` : 'Vertical thirds',
                  detail: 'IPD-to-philtrum harmony & balanced facial thirds',
                },
                {
                  title: 'Eye Area / Canthal Tilt',
                  score: activeScan.subScores.eyeArea,
                  metric: canthalMetric
                    ? `${canthalMetric.value > 0 ? '+' : ''}${canthalMetric.value}° tilt`
                    : 'Orbital framing',
                  detail: 'Canthal angle, intercanthal spacing & eye aspect',
                },
                {
                  title: 'Skin Quality',
                  score: activeScan.subScores.skin,
                  metric: `${activeScan.subScores.skin}/100 clarity`,
                  detail: 'Cheek & forehead tone evenness and redness index',
                },
              ];

              return (
                <>
                  {/* Report Action Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <ShieldCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
                      <span>
                        Official Facial Aesthetics Report · {activeScan.date}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {scans.length > 1 && (
                        <select
                          value={activeScan.id}
                          onChange={(e) => setSelectedResultId(Number(e.target.value))}
                          className="px-3 py-2 rounded-xl bg-white dark:bg-[#0B110E] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold min-h-[38px]"
                        >
                          {scans.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.date} · {s.pslEstimate} ({getPslTierInfo(s.pslEstimate).id})
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={handleOpenScanner}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-bold min-h-[38px] hover:bg-[var(--accent)]/20 transition"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        New Scan
                      </button>
                    </div>
                  </div>

                  {/* Hero Card: Biometric Mesh Grid Preview + Prominent PSL Score & Official Tier */}
                  <div className="ascend-card ascend-hero-glow p-4 sm:p-5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                      {/* Left: Mesh & Biometric Grid Preview */}
                      <div className="md:col-span-5 space-y-2.5">
                        <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-[#060A08] border border-emerald-500/20 flex items-center justify-center">
                          {previewSrc ? (
                            <img
                              src={previewSrc}
                              alt={`${previewAngle} facial mesh preview`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-4 space-y-1.5">
                              <ScanFace className="w-10 h-10 mx-auto text-[var(--accent)] opacity-80" />
                              <p className="text-xs font-semibold text-slate-300">
                                Local Thumbnail Saving Disabled
                              </p>
                              <p className="text-[11px] text-slate-500">
                                478-landmark geometry stored without photo cache
                              </p>
                            </div>
                          )}

                          {/* Subtle Biometric Grid Overlay */}
                          <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute inset-x-0 top-[41%] h-px border-t border-dashed border-sky-400/35" />
                            <div className="absolute inset-y-0 left-1/2 w-px border-l border-dashed border-sky-400/35" />
                            <span className="absolute top-2 left-2 w-4 h-4 border-t border-l border-sky-400/65 rounded-tl" />
                            <span className="absolute top-2 right-2 w-4 h-4 border-t border-r border-sky-400/65 rounded-tr" />
                            <span className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-sky-400/65 rounded-bl" />
                            <span className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-sky-400/65 rounded-br" />
                            <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 border border-white/15 text-[10px] font-mono-num text-sky-300 capitalize">
                              {activeScan.faceShape}
                            </span>
                          </div>
                        </div>

                        {(activeScan.leftThumbnail || activeScan.rightThumbnail) && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {([
                              { id: 'front', label: 'Front', ok: Boolean(activeScan.frontThumbnail) },
                              { id: 'left', label: 'Left 45°', ok: Boolean(activeScan.leftThumbnail) },
                              { id: 'right', label: 'Right 45°', ok: Boolean(activeScan.rightThumbnail) },
                            ] as const).map((ang) => (
                              <button
                                key={ang.id}
                                type="button"
                                disabled={!ang.ok}
                                onClick={() => setPreviewAngle(ang.id)}
                                className={`py-1.5 rounded-xl text-[11px] font-semibold transition border ${
                                  previewAngle === ang.id
                                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/35 text-[var(--accent)]'
                                    : 'bg-slate-100 dark:bg-white/[0.04] border-transparent text-slate-500 dark:text-slate-400 disabled:opacity-40'
                                }`}
                              >
                                {ang.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right: Prominent PSL Rating Card & Official Tiers */}
                      <div className="md:col-span-7 space-y-4 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
                              Overall PSL Rating
                            </p>
                            <div className="flex items-baseline gap-2.5 mt-1">
                              <span className="font-mono-num text-5xl font-bold tracking-tight">
                                {activeScan.pslEstimate}
                              </span>
                              <span className="text-sm font-mono-num text-slate-500 dark:text-slate-400">
                                / 8.0+
                              </span>
                            </div>
                          </div>

                          <div className="px-3.5 py-2 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent)]/30 text-right">
                            <span className="text-[10px] font-mono-num uppercase tracking-widest text-slate-500 dark:text-slate-400 block">
                              {tierInfo.rangeLabel}
                            </span>
                            <span className="font-display text-sm font-bold text-[var(--accent)] block">
                              {tierInfo.title}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 dark:text-slate-200 font-medium">
                          {tierInfo.subtitle} ·{' '}
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            3D Landmark Mesh Verified
                          </span>
                        </p>

                        {/* Official PSL Tiers Scale Bar */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                          {PSL_TIERS.map((t) => {
                            const isCurrent = t.id === tierInfo.id;
                            return (
                              <div
                                key={t.id}
                                className={`p-2 rounded-xl border text-center transition ${
                                  isCurrent
                                    ? 'bg-[var(--accent-soft)] border-[var(--accent)]/45 text-[var(--accent)]'
                                    : 'bg-slate-100/70 dark:bg-white/[0.03] border-slate-200/70 dark:border-white/10 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                <span className="font-mono-num text-[10px] font-bold block">
                                  {t.rangeLabel}
                                </span>
                                <span className="text-[10px] font-semibold block truncate mt-0.5">
                                  {t.id}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-black/35 border border-slate-200/70 dark:border-white/10">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Face Shape</span>
                            <span className="text-xs font-bold capitalize block">{activeScan.faceShape}</span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-black/35 border border-slate-200/70 dark:border-white/10">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Lighting</span>
                            <span className="text-xs font-mono-num font-bold block">{activeScan.lightingScore}/100</span>
                          </div>
                          <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-black/35 border border-slate-200/70 dark:border-white/10">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Scan Quality</span>
                            <span className="text-xs font-mono-num font-bold block">{activeScan.qualityScore}/100</span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          Photo-based geometric estimate for consistent self-tracking under identical arm&apos;s-length window lighting.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Structured 5-Pillar Facial Aesthetics Breakdown Grid */}
                  <div className="ascend-card p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="font-display text-base font-bold">Core Facial Aesthetics Breakdown</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Primary structural &amp; dermal pillars from your 3D landmark mesh
                        </p>
                      </div>
                      <span className="text-[11px] font-mono-num text-[var(--accent)] font-semibold">
                        5 Core Pillars
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                      {aestheticPillars.map((pillar) => (
                        <div
                          key={pillar.title}
                          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-black/35 border border-slate-200/80 dark:border-emerald-500/15 flex flex-col justify-between gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-bold leading-snug">{pillar.title}</span>
                            <span className="font-mono-num text-base font-bold text-[var(--accent)] shrink-0">
                              {pillar.score}
                            </span>
                          </div>

                          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                              style={{ width: `${pillar.score}%` }}
                            />
                          </div>

                          <div>
                            <span className="text-[11px] font-mono-num font-semibold text-slate-800 dark:text-slate-200 block">
                              {pillar.metric}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                              {pillar.detail}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Secondary Skeletal & Contour Metrics */}
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-white/10">
                      {[
                        ...(typeof activeScan.subScores.browRidge === 'number'
                          ? [{ label: 'Brow Framing', val: activeScan.subScores.browRidge }]
                          : []),
                        ...(typeof activeScan.subScores.cheekbones === 'number'
                          ? [{ label: 'Cheekbone Taper', val: activeScan.subScores.cheekbones }]
                          : []),
                        { label: 'Facial Leanness', val: activeScan.subScores.leanness },
                      ].map((sec) => (
                        <div key={sec.label} className="flex items-center gap-2.5 min-w-0">
                          <CircularRing value={sec.val} size={46} strokeWidth={4.5} glow={false}>
                            <span className="font-mono-num text-[11px] font-bold">{sec.val}</span>
                          </CircularRing>
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 leading-tight truncate">
                            {sec.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actionable One-Line Fixes */}
                  {(() => {
                    const fixes =
                      activeScan.oneLineFixes && activeScan.oneLineFixes.length > 0
                        ? activeScan.oneLineFixes
                        : activeScan.focusAreas.map((fa) => ({
                            area: fa.area,
                            fix: fa.actions[0]?.label ?? 'Stay consistent on core daily protocol.',
                            protocolId: fa.actions[0]?.protocolId,
                          }));
                    return (
                      <div className="ascend-card p-4 space-y-2.5 border-[var(--accent)]/25">
                        <div className="flex items-center justify-between">
                          <h2 className="font-display text-base font-bold">One-Line Actionable Fixes</h2>
                          <span className="text-[11px] font-semibold text-[var(--accent)]">
                            Highest leverage
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          {fixes.map((item) => (
                            <div
                              key={item.area}
                              className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex flex-col justify-between gap-2.5 text-xs"
                            >
                              <div>
                                <p className="font-semibold text-[var(--accent)]">{item.area}</p>
                                <p className="text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
                                  {item.fix}
                                </p>
                              </div>
                              {item.protocolId && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await addProtocolToPlan(item.protocolId!, item.area);
                                    showToast(`Added "${item.area}" fix to plan`);
                                  }}
                                  className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-semibold min-h-[36px] active:scale-95 transition"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Add to plan
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Top 3 Strengths & Top 3 Focus Areas + Add to Plan */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-5 space-y-4">
                      <div className="ascend-card p-4 space-y-2.5">
                        <h2 className="font-display text-base font-bold">Top 3 Strengths</h2>
                        {activeScan.strengths.map((st) => (
                          <div key={st.area} className="p-3 rounded-xl bg-emerald-500/10 text-xs">
                            <p className="font-semibold text-emerald-700 dark:text-[#7FE0C4]">{st.area}</p>
                            <p className="text-slate-600 dark:text-slate-300 mt-0.5">{st.detail}</p>
                          </div>
                        ))}
                      </div>

                      <div className="ascend-card p-4 space-y-2.5">
                        <h2 className="font-display text-base font-bold">Biggest Measured Asymmetries</h2>
                        <div className="space-y-2">
                          {activeScan.asymmetries.map((a) => (
                            <div key={a.label} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200 dark:border-white/10 last:border-0">
                              <span>{a.label}</span>
                              <span className="font-mono-num font-semibold">{a.diffPct}% variance</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 ascend-card p-4 space-y-3">
                      <h2 className="font-display text-base font-bold">Top 3 Focus Areas &amp; Real-Impact Actions</h2>
                      <div className="space-y-3">
                        {activeScan.focusAreas.map((fa) => (
                          <div key={fa.area} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 space-y-2">
                            <h3 className="font-display text-sm font-bold">{fa.area}</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{fa.detail}</p>
                            <div className="space-y-1.5 pt-1">
                              {fa.actions.map((act) => (
                                <div key={act.label} className="flex items-center justify-between gap-2 text-xs">
                                  <span>
                                    <strong>{act.impact} impact:</strong> {act.label}
                                  </span>
                                  {act.protocolId && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await addProtocolToPlan(act.protocolId!, fa.area);
                                        showToast(`Added "${act.label}" to plan`);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] text-[11px] font-semibold shrink-0"
                                    >
                                      <Plus className="w-3 h-3" /> Add to plan
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-slate-200 dark:border-white/10">
                              {fa.medicalNote}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Normalized Measurements Table */}
                  <div className="ascend-card p-4 overflow-x-auto">
                    <h2 className="font-display text-base font-bold mb-3">Normalized Landmark Measurements</h2>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                          <th className="py-2 pr-3">Metric</th>
                          <th className="py-2 pr-3">Measured</th>
                          <th className="py-2 pr-3">Typical Range</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                        {activeScan.measurements.map((m) => (
                          <tr key={m.key}>
                            <td className="py-2.5 pr-3 font-medium">{m.label}</td>
                            <td className="py-2.5 pr-3 font-mono-num font-semibold">
                              {m.value}
                              {m.unit}
                            </td>
                            <td className="py-2.5 pr-3 font-mono-num text-slate-500 dark:text-slate-400">
                              {m.typicalRange}
                            </td>
                            <td className="py-2.5">
                              <span
                                className={`font-semibold capitalize ${
                                  m.status === 'balanced'
                                    ? 'text-emerald-500'
                                    : m.status === 'watch'
                                    ? 'text-amber-500'
                                    : 'text-[var(--accent)]'
                                }`}
                              >
                                {m.status === 'focus' ? 'Focus area' : m.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* PHOTO JOURNAL TAB */}
      {subTab === 'journal' && (
        <div key="journal-tab" className="ascend-panel-enter space-y-4">
          <div className="ascend-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              <p className="font-semibold text-sm">
                14-Day Rescan Cadence{' '}
                {daysSinceLastScan !== null
                  ? daysSinceLastScan >= 14
                    ? '— Ready for next check-in'
                    : `— ${14 - daysSinceLastScan} days until next recommended scan`
                  : '— Log your baseline scan'}
              </p>
              <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                Only measurements and optional small thumbnails are saved locally.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                db.settings.update('app', { saveThumbnails: !settings.saveThumbnails })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold min-h-[40px]"
            >
              {settings.saveThumbnails ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Thumbnails: {settings.saveThumbnails ? 'On' : 'Off'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold">PSL LAB Trend</h2>
              <SmoothAreaChart
                points={[...scans].reverse().map((s) => ({ label: s.date.slice(5), value: s.pslEstimate }))}
                unit="/8"
                minVal={2.5}
                maxVal={7.5}
                emptyLabel="Complete 2+ scans (14 days apart) to track your personal trend."
              />
            </div>

            <div className="lg:col-span-6 ascend-card p-4 space-y-3">
              <h2 className="font-display text-base font-bold flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[var(--accent)]" />
                Comparison Slider
              </h2>
              {thumbnailScans.length < 2 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  Save at least 2 scans with thumbnails enabled to compare side-by-side.
                </p>
              ) : (
                <>
                  <div className="flex gap-2 text-xs">
                    <select
                      value={compareA}
                      onChange={(e) => setCompareA(Number(e.target.value))}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5"
                    >
                      {thumbnailScans.map((s, idx) => (
                        <option key={s.id} value={idx}>{s.date} ({s.pslEstimate}/8)</option>
                      ))}
                    </select>
                    <select
                      value={compareB}
                      onChange={(e) => setCompareB(Number(e.target.value))}
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5"
                    >
                      {thumbnailScans.map((s, idx) => (
                        <option key={s.id} value={idx}>{s.date} ({s.pslEstimate}/8)</option>
                      ))}
                    </select>
                  </div>
                  <BeforeAfterSlider
                    beforeSrc={thumbnailScans[compareA]?.frontThumbnail || thumbnailScans[0].frontThumbnail!}
                    afterSrc={thumbnailScans[compareB]?.frontThumbnail || thumbnailScans[1].frontThumbnail!}
                    beforeLabel={thumbnailScans[compareA]?.date || 'Earlier'}
                    afterLabel={thumbnailScans[compareB]?.date || 'Later'}
                  />
                </>
              )}
            </div>
          </div>

          {/* Scan History List */}
          <div className="ascend-card p-4 space-y-3">
            <h2 className="font-display text-base font-bold">Scan History ({scans.length})</h2>
            {scans.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                No saved scans yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-white/10">
                {scans.map((s) => (
                  <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {s.frontThumbnail ? (
                        <img
                          src={s.frontThumbnail}
                          alt={`Scan ${s.date}`}
                          className="w-12 h-12 rounded-xl object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center font-mono-num text-xs font-bold shrink-0">
                          {s.pslEstimate}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {s.date} · <span className="font-mono-num">{s.pslEstimate}/8+</span> ({getPslTierInfo(s.pslEstimate).title})
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          Quality {s.qualityScore}/100 · Light {s.lightingScore}/100 · Angles: {s.anglesCaptured.join(', ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedResultId(s.id!);
                          setSubTab('results');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-xs font-semibold"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => db.scans.delete(s.id!)}
                        aria-label="Delete scan"
                        className="p-2 text-slate-400 hover:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

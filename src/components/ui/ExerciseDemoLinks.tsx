import React, { useState } from 'react';
import { ExternalLink, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/usePWAInstall';

interface ExerciseDemoLinksProps {
  title: string;
  slug?: string;
  searchQuery?: string;
  doseLabel?: string;
  compact?: boolean;
}

/**
 * Renders optional local WebP exercise image if `/exercises/{slug}.webp` exists,
 * plus safe real YouTube and TikTok proper-form search buttons (or clear Needs internet when offline).
 */
export const ExerciseDemoLinks: React.FC<ExerciseDemoLinksProps> = ({
  title,
  slug,
  searchQuery,
  doseLabel,
  compact = false,
}) => {
  const isOnline = useOnlineStatus();
  const [imgAvailable, setImgAvailable] = useState(Boolean(slug));

  const query = encodeURIComponent(searchQuery || `${title} proper form`);
  const ytHref = `https://www.youtube.com/results?search_query=${query}`;
  const ttHref = `https://www.tiktok.com/search?q=${query}`;

  return (
    <div className="space-y-2">
      {slug && imgAvailable && (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03]">
          <img
            src={`/exercises/${slug}.webp`}
            alt={`${title} form illustration`}
            onError={() => setImgAvailable(false)}
            className="w-full max-h-44 object-contain"
          />
        </div>
      )}

      {doseLabel && (
        <p className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
          Dose: {doseLabel}
        </p>
      )}

      {isOnline ? (
        <div className={`flex flex-wrap gap-2 ${compact ? '' : 'pt-0.5'}`}>
          <a
            href={ytHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-300 border border-rose-500/25 text-xs font-semibold min-h-[40px] hover:bg-rose-500/20 transition"
          >
            Watch on YouTube <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <a
            href={ttHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/10 dark:bg-white/10 text-slate-800 dark:text-slate-100 border border-slate-300/60 dark:border-white/15 text-xs font-semibold min-h-[40px] hover:bg-slate-900/15 dark:hover:bg-white/15 transition"
          >
            Watch on TikTok <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-500 dark:text-slate-400 min-h-[40px]">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Watch video demos · Needs internet</span>
        </div>
      )}
    </div>
  );
};

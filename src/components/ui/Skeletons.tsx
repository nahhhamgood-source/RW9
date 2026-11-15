import React from 'react';

export const ScreenSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse" aria-label="Loading screen">
    <div className="h-7 w-40 rounded-xl bg-slate-200/80 dark:bg-white/10" />
    <div className="ascend-card p-5 space-y-3">
      <div className="h-4 w-28 rounded-lg bg-slate-200/80 dark:bg-white/10" />
      <div className="h-6 w-3/4 rounded-lg bg-slate-200/80 dark:bg-white/10" />
      <div className="h-11 w-full rounded-2xl bg-slate-200/80 dark:bg-white/10" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="ascend-card p-5 h-28 bg-slate-100/60 dark:bg-white/[0.04]" />
      <div className="ascend-card p-5 h-28 bg-slate-100/60 dark:bg-white/[0.04]" />
    </div>
  </div>
);

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}) => (
  <div className="ascend-card p-6 text-center space-y-3 border-dashed">
    {icon && (
      <div className="w-11 h-11 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mx-auto">
        {icon}
      </div>
    )}
    {title && <h3 className="font-display text-base font-bold">{title}</h3>}
    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
      {message}
    </p>
    {actionLabel && onAction && (
      <button
        type="button"
        onClick={onAction}
        className="inline-flex items-center justify-center px-5 py-2.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold min-h-[44px]"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

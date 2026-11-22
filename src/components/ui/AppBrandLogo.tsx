import React from 'react';
import type { AppIconId, IconStyle } from '../../types';

interface AppBrandLogoProps {
  iconId?: AppIconId;
  iconStyle?: IconStyle;
  className?: string;
}

export const AppBrandLogo: React.FC<AppBrandLogoProps> = ({
  iconId = 'peak',
  iconStyle = 'line',
  className = 'w-4 h-4',
}) => {
  const isFilled = iconStyle === 'filled';

  switch (iconId) {
    case 'monolith':
      return (
        <svg viewBox="0 0 24 24" className={className} fill={isFilled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.1">
          <rect x="6" y="3" width="4.5" height="18" rx="1" />
          <rect x="13.5" y="7" width="4.5" height="14" rx="1" />
        </svg>
      );
    case 'orbit':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1">
          <circle cx="12" cy="12" r="8" strokeDasharray={isFilled ? undefined : '18 6'} />
          <circle cx="12" cy="12" r={isFilled ? 3.5 : 2.5} fill="currentColor" />
        </svg>
      );
    case 'prism':
      return (
        <svg viewBox="0 0 24 24" className={className} fill={isFilled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.1">
          <polygon points="12,3 20,12 12,21 4,12" strokeLinejoin="round" />
          {!isFilled && <line x1="12" y1="3" x2="12" y2="21" strokeWidth="1.6" />}
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 24 24" className={className} fill={isFilled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.1">
          <path d="M12 3l7 3v5c0 4.8-3 8.6-7 10-4-1.4-7-5.2-7-10V6l7-3z" strokeLinejoin="round" />
        </svg>
      );
    case 'pulse':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.3">
          <polyline
            points="3,13 7,13 9.5,6 13.5,18 16.5,10 18.5,13 21,13"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'peak':
    default:
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill={isFilled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2.3"
        >
          <path d="M12 3L4 19h4l4-8 4 8h4L12 3z" strokeLinejoin="round" />
        </svg>
      );
  }
};

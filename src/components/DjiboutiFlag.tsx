import React from 'react';

interface DjiboutiFlagProps {
  className?: string;
}

export const DjiboutiFlag: React.FC<DjiboutiFlagProps> = ({ className = 'w-9 h-6' }) => (
  <svg
    className={`rounded-[2px] border border-[var(--bd)] shrink-0 ${className}`}
    viewBox="0 0 36 24"
    role="img"
    aria-label="Drapeau de la République de Djibouti"
  >
    <rect width="36" height="12" fill="#6ab2e7" />
    <rect y="12" width="36" height="12" fill="#12ad2b" />
    <path d="M0 0L20.8 12L0 24Z" fill="#ffffff" />
    <polygon
      points="7,7.8 7.94,10.71 10.99,10.7 8.52,12.49 9.47,15.4 7,13.6 4.53,15.4 5.48,12.49 3.01,10.7 6.06,10.71"
      fill="#d7141a"
    />
  </svg>
);

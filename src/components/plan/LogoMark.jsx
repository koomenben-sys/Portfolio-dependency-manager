import React from 'react';

// Brand mark (owner, 2026-10-21): the "K" with a compass-needle cut, redrawn as SVG from the supplied logo.
// Fixed petrol in every skin; the word "Kwartaalplan" next to it stays text.
export default function LogoMark({ size = 24, className = '' }) {
  return (
    <svg viewBox="0 0 480 456" width={size} height={Math.round(size * 456 / 480)} className={className} aria-hidden="true" focusable="false">
      <rect width="480" height="456" rx="62" fill="#0B5A55" />
      <path fill="#fff" d="M81 86h90v290H81zM404 64 280 197l-92 25 63-89zM170 243h109l126 133H297z" />
    </svg>
  );
}

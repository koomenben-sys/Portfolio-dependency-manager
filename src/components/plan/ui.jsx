import React, { useEffect, useRef, useState } from 'react';
import { COMMITMENT_META, RESPONSE_META, BAND_META, CONFIDENCE_META } from '../../domain/model';

// Status pill: icon + text + colour, never colour alone (D8 / AC B8). Minimum 12px type (review: UX).
export function Pill({ meta, size = 'sm', title, children }) {
  const pad = size === 'xs' ? 'px-1.5 py-0 text-xs' : 'px-2 py-0.5 text-xs';
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${pad} ${meta.cls}`}>
      <span aria-hidden="true">{meta.icon}</span>
      <span>{children ?? meta.label}</span>
    </span>
  );
}
export const CommitmentPill = ({ value, size }) => <Pill meta={COMMITMENT_META[value]} size={size} />;
export const ResponsePill = ({ value, size, children }) => <Pill meta={RESPONSE_META[value]} size={size}>{children}</Pill>;
export const ConfidenceMark = ({ value }) => value ? (
  <span className={`inline-flex items-center gap-1 text-xs ${CONFIDENCE_META[value].cls}`}><span aria-hidden="true">{CONFIDENCE_META[value].icon}</span>{CONFIDENCE_META[value].label}</span>
) : null;

// Rank badge; top-10 solid, the rest outlined (contrast-safe).
export const RankBadge = ({ rank, size = 'md' }) => {
  const dim = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-7 h-7 text-xs';
  const cls = rank == null ? 'bg-gray-200 text-gray-600' : rank <= 10 ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-800 border border-indigo-400';
  return <span className={`shrink-0 rounded font-bold flex items-center justify-center ${dim} ${cls}`} title={rank == null ? 'Unranked' : `Strategic rank ${rank}`}>{rank ?? '–'}</span>;
};

// Capacity bar with percentage printed and band label (AC B3). Range = low–high effort estimate.
export function CapacityBar({ load, compact = false }) {
  const band = BAND_META[load.band];
  const widthHigh = Math.min(100, load.pct);
  const widthLow = Math.min(100, load.pctLow);
  const text = load.band === 'none' ? band.label : `${band.label}: ${load.pctLow}–${load.pct}%`;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className={`font-semibold ${band.text}`}><span aria-hidden="true">{band.icon}</span> {text}</span>
        {!compact && <span className="text-gray-600 whitespace-nowrap">{load.totalLow}–{load.totalHigh} of {load.available} pw</span>}
      </div>
      <div className="h-2 w-full rounded bg-gray-200 overflow-hidden relative" role="img" aria-label={`Load ${load.pctLow} to ${load.pct} percent of capacity, ${band.label}`}>
        <div className={`h-2 ${band.bar} opacity-50 absolute left-0 top-0`} style={{ width: `${widthHigh}%` }} />
        <div className={`h-2 ${band.bar} absolute left-0 top-0`} style={{ width: `${widthLow}%` }} />
      </div>
      {!compact && load.pendingCount > 0 && <div className="text-xs text-amber-800 mt-0.5">+{load.pendingHigh} pw if all {load.pendingCount} open ask{load.pendingCount > 1 ? 's' : ''} accepted ({load.pctIfAllAccepted}%)</div>}
    </div>
  );
}

export const CapacityLegend = () => (
  <p className="text-xs text-gray-600">
    Load range = low–high effort of own work plus accepted asks from other teams, against available capacity (headcount × weeks × focus factor − absence, minus reserve).
    Bands: <span className="text-emerald-700 font-medium">OK ≤ 80%</span>, <span className="text-amber-700 font-medium">Tight ≤ 100%</span>, <span className="text-red-700 font-medium">Over capacity &gt; 100%</span>. Over capacity warns, it never blocks.
  </p>
);

export function Panel({ title, right, children, className = '' }) {
  return (
    <section className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between px-4 py-2 border-b border-gray-100 gap-2">
          <h3 className="font-semibold text-sm text-gray-800">{title}</h3>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tone = 'neutral', onClick }) {
  const tones = { neutral: ['text-gray-900', ''], good: ['text-emerald-700', '✓'], warn: ['text-amber-700', '!'], bad: ['text-red-700', '▲'] };
  const [cls, icon] = tones[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-left ${onClick ? 'hover:border-indigo-400' : ''}`}>
      <div className="text-xs text-gray-600 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${cls}`}>{icon && <span aria-hidden="true" className="text-base mr-1">{icon}</span>}{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </Tag>
  );
}

export const btn = {
  primary: 'bg-indigo-600 text-white text-sm px-3 py-1.5 rounded hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed',
  secondary: 'bg-white border border-gray-300 text-sm px-3 py-1.5 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed',
  ghost: 'text-sm text-indigo-700 hover:underline disabled:opacity-40',
  danger: 'text-sm text-red-700 hover:underline',
};
export const input = 'border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full';
export const label = 'block text-xs font-medium text-gray-700 mb-1';

export function Field({ l, children }) { return <label className="block"><span className={label}>{l}</span>{children}</label>; }

export function ErrorNote({ error }) { return error ? <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-2">{error}</p> : null; }

// Accessible modal: role=dialog, Escape closes, focus moves in and returns, simple focus trap.
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const first = ref.current?.querySelector('input, textarea, select, button');
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('input, textarea, select, button, a[href]')].filter((el) => !el.disabled);
        if (!f.length) return;
        const [a, z] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} className={`bg-white rounded-lg shadow-xl ${wide ? 'w-[760px]' : 'w-[480px]'} max-w-[95vw] max-h-[90vh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">{title}</h3>
          <button className="text-gray-500 hover:text-gray-800 text-xl leading-none" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// Asks for a reason, then calls onSubmit(reason). Used for rank, locked edits, declines, rewinds.
export function ReasonPrompt({ title, hint, onSubmit, onClose, submitLabel = 'Save' }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Modal title={title} onClose={onClose}>
      {hint && <p className="text-sm text-gray-700 mb-2">{hint}</p>}
      <textarea className={input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" aria-label="Reason" />
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>Cancel</button>
        <button className={btn.primary} onClick={async () => { const r = await onSubmit(reason); if (r && !r.ok) setErr(r.error); else onClose(); }}>{submitLabel}</button>
      </div>
    </Modal>
  );
}

export const Empty = ({ children }) => <p className="text-sm text-gray-600 italic">{children}</p>;
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('nl-NL') : '–');

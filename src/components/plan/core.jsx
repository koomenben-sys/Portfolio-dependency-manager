import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, X, Clock, CircleDot, CircleHelp, ArrowRight, ChevronDown, Flag } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ASK_META, COMMITMENT_META } from '../../domain/model';
import { SIMPLE_META, fmtMonth } from '../../domain/value';
import { useT } from '../../i18n';

// Calm primitives for the three core screens (docs/design.md section 19). Tokens come from src/index.css;
// one accent, 1px borders, no resting shadows, every control >= 24px, focus ring from :focus-visible.

export const cls = {
  primary: 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-control bg-accent text-accent-fg text-label font-medium hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-base whitespace-nowrap',
  secondary: 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-control bg-surface border border-border-strong text-label font-medium text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-base whitespace-nowrap',
  ghost: 'inline-flex items-center gap-1 h-8 px-2 rounded-control text-label font-medium text-accent hover:bg-accent-50 disabled:opacity-40 disabled:cursor-not-allowed transition-base whitespace-nowrap',
  quiet: 'inline-flex items-center gap-1 h-7 px-1.5 rounded-control text-caption text-muted hover:text-ink hover:bg-surface-2 transition-base whitespace-nowrap',
  icon: 'inline-flex items-center justify-center w-7 h-7 rounded-control text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-40 transition-base',
  input: 'h-8 px-2 rounded-control border border-border-strong bg-surface text-body text-ink placeholder:text-faint focus:border-accent w-full disabled:bg-surface-2 disabled:text-muted',
  textarea: 'px-2 py-1.5 rounded-control border border-border-strong bg-surface text-body text-ink placeholder:text-faint focus:border-accent w-full',
  card: 'bg-surface border border-border rounded-panel',
  label: 'block text-caption font-medium text-muted mb-1',
};

// Tint only: chips carry icon + text + colour, no 1px border (visual polish). Buttons that use a tone
// (matrix cells, segmented control) add their own border via toneBorder.
const TONE = {
  neutral: 'bg-neutral-bg text-neutral-fg',
  ok: 'bg-ok-bg text-ok-fg',
  warn: 'bg-warn-bg text-warn-fg',
  danger: 'bg-danger-bg text-danger-fg',
  info: 'bg-info-bg text-info-fg',
};
const TONE_BORDER = { neutral: 'border-neutral-border', ok: 'border-ok-border', warn: 'border-warn-border', danger: 'border-danger-border', info: 'border-info-border' };
export const toneClass = (tone) => TONE[tone] || TONE.neutral;
export const toneBorder = (tone) => TONE_BORDER[tone] || TONE_BORDER.neutral;

const ASK_ICON = { proposed: Clock, accepted: Check, partial: CircleDot, deferred: ArrowRight, needs_priority_call: CircleHelp, declined: X };
export const AskIcon = ({ response, size = 14, className = '' }) => { const I = ASK_ICON[response] || Clock; return <I size={size} strokeWidth={2.25} className={className} aria-hidden="true" />; };

// Status = icon + short label + pastel colour; never colour alone.
export function StatusChip({ response, compact = false, className = '' }) {
  const t = useT();
  const m = ASK_META[response] || ASK_META.proposed;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 text-caption font-medium whitespace-nowrap ${toneClass(m.tone)} ${className}`}>
      <AskIcon response={response} size={12} />{!compact && <span>{t(m.label)}</span>}
    </span>
  );
}

const COMMIT_TONE = { draft: 'neutral', discuss: 'warn', committed: 'ok', at_risk: 'warn', not_committed: 'danger' };
export function CommitmentChip({ value }) {
  const t = useT();
  const m = COMMITMENT_META[value]; if (!m) return null;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 text-caption font-medium whitespace-nowrap ${toneClass(COMMIT_TONE[value])}`}><span aria-hidden="true">{m.icon}</span>{t(m.label)}</span>;
}

// Release A (D41): "Moet · mrt 2027" — a must-do epic (own regulatory deadline or inherited from a Moet programme).
export function MustChip({ must, className = '' }) {
  const t = useT();
  if (!must) return null;
  const when = must.deadline ? fmtMonth(must.deadline, t.lang) : '';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 h-5 text-micro font-semibold whitespace-nowrap ${toneClass('warn')} ${className}`} title={must.inherited ? t('Must (from programme)') : t('Must')}>
      <Flag size={10} strokeWidth={2.5} aria-hidden="true" />{t('Must')}{when && <span className="font-medium tnum"> · {when}</span>}
    </span>
  );
}

// Release A (D43): the value cell — H / M / L letter for the simple model, the number for WSJF / RICE, "–" when empty.
export function ValueChip({ model, score }) {
  const t = useT();
  if (score == null) return <span className="text-faint text-caption">–</span>;
  if (model === 'simple') {
    const m = SIMPLE_META[score];
    return <span className="inline-flex items-center w-6 h-6 text-caption font-semibold text-ink-2" aria-label={t(m.label)} title={t(m.label)}>{m.letter}</span>;
  }
  return <span className="tnum text-label font-medium text-ink-2">{String(score).replace('.', t.lang === 'nl' ? ',' : '.')}</span>;
}

// Strategic rank as a quiet tabular number; one neutral style for every rank (iteration 1, item 4).
export function RankNo({ rank, size = 'md' }) {
  const t = useT();
  const dim = size === 'sm' ? 'w-6 h-6 text-caption' : 'w-7 h-7 text-label';
  const look = rank == null ? 'bg-surface-2 text-faint' : 'bg-surface-2 text-ink-2';
  return <span className={`shrink-0 rounded-control font-medium tnum inline-flex items-center justify-center ${dim} ${look}`} aria-label={rank == null ? t('Unranked') : t('Strategic rank {rank}', { rank })}>{rank ?? '–'}</span>;
}

// Four core states; older partial/deferred data folds into the nearest one (D31).
export const normAsk = (r) => (r === 'partial' ? 'accepted' : r === 'deferred' ? 'needs_priority_call' : r);
export const ASK_SEVERITY = { declined: 3, needs_priority_call: 2, proposed: 1, accepted: 0 };
export const worstAsk = (deps) => (deps.length ? deps.map((d) => normAsk(d.response)).sort((a, b) => ASK_SEVERITY[b] - ASK_SEVERITY[a])[0] : null);
const WORST_TEXT = { declined: 'text-danger-fg', needs_priority_call: 'text-warn-fg', proposed: 'text-ink-2', accepted: 'text-ok-fg' };

// One readable "worst issue" per epic (iteration 1, item 2): "✕ Kan niet · Platform & Security", "? Bespreken · Team",
// "◷ 1 open", "✓ 2 toegezegd", "–". Several asks: the worst plus "+n"; the tooltip lists them all.
export function WorstIssue({ deps, teams }) {
  const t = useT();
  if (!deps.length) return <span className="text-faint text-caption">–</span>;
  const worst = worstAsk(deps);
  const all = deps.map((d) => `${teams.get(d.providerTeamId)?.name || '?'}: ${d.ask} — ${t(ASK_META[normAsk(d.response)].label)}`).join('\n');
  const first = deps.find((d) => normAsk(d.response) === worst);
  const n = deps.filter((d) => normAsk(d.response) === worst).length;
  const text = worst === 'declined' || worst === 'needs_priority_call'
    ? <>{t(ASK_META[worst].label)} <span className="text-muted">· {teams.get(first.providerTeamId)?.name}</span></>
    : <>{n} {t(ASK_META[worst].label).toLowerCase()}</>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-label font-medium min-w-0 ${WORST_TEXT[worst]}`} title={all} aria-label={all}>
      <AskIcon response={worst} size={13} className="shrink-0" /><span className="truncate">{text}</span>
    </span>
  );
}

// Tabs (role=tablist) with counts; arrow keys move between tabs.
export function Tabs({ items, value, onChange, ariaLabel }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[n].id); refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-border">
      {items.map((it, i) => {
        const active = it.id === value;
        return (
          <button key={it.id} role="tab" aria-selected={active} tabIndex={active ? 0 : -1} ref={(el) => { refs.current[i] = el; }} onKeyDown={(e) => onKey(e, i)} onClick={() => onChange(it.id)}
            className={`relative -mb-px inline-flex items-center gap-1.5 h-9 px-3 text-label font-medium border-b-2 transition-base ${active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {it.label}{it.count != null && <span className={`tnum rounded-full px-1.5 h-5 min-w-5 inline-flex items-center justify-center text-micro font-semibold ${active ? 'bg-accent-50 text-accent-700' : 'bg-surface-2 text-muted'}`}>{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// One line + one action, nothing more.
export function EmptyLine({ children, action }) {
  return <div className="flex items-center justify-between gap-3 px-4 py-8 text-body text-muted">{children}{action}</div>;
}

export function ErrorLine({ error }) { const t = useT(); return error ? <p role="alert" className="text-caption text-danger-fg mt-1">{t(error)}</p> : null; }

// Inline reason row: "Waarom? (optioneel)" + Opslaan. Enter saves, Escape cancels. No modal (D28/D29).
export function InlineReason({ label, placeholder, required = false, autoFocus = true, saveLabel, onSave, onCancel, error, defaultValue = '' }) {
  const t = useT();
  const [v, setV] = useState(defaultValue);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const save = async () => { if (busy) return; if (required && !v.trim()) return; setBusy(true); try { await onSave(v.trim()); } finally { setBusy(false); } };
  return (
    <div className="flex flex-col gap-1 anim-fade-in">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-caption text-muted whitespace-nowrap">{label ?? (required ? t('Why?') : t('Why? (optional)'))}</label>
        <input id={id} autoFocus={autoFocus} className={`${cls.input} max-w-md`} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} aria-required={required}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); } }} />
        <button type="button" className={cls.primary} disabled={busy || (required && !v.trim())} onClick={save}>{saveLabel ?? t('Save')}</button>
        {onCancel && <button type="button" className={cls.secondary} onClick={onCancel}>{t('Cancel')}</button>}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

// Segmented answer control: Toezeggen · Bespreken · Kan niet (role=radiogroup, active state filled).
const SEG_ACTIVE = { accepted: 'bg-ok-bg text-ok-fg border-ok-border', needs_priority_call: 'bg-warn-bg text-warn-fg border-warn-border', declined: 'bg-danger-bg text-danger-fg border-danger-border' };
export function AnswerControl({ value, onPick, disabled = false, labelledBy }) {
  const t = useT();
  const opts = [['accepted', t('Commit')], ['needs_priority_call', t('Discuss')], ['declined', t("Can't")]];
  const shown = value === 'partial' ? 'accepted' : value === 'deferred' ? 'needs_priority_call' : value;
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="inline-flex rounded-control border border-border-strong overflow-hidden bg-surface">
      {opts.map(([k, label], i) => {
        const active = shown === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => onPick(k)}
            className={`inline-flex items-center gap-1 h-8 px-2.5 text-label font-medium transition-base focus-ring-inset disabled:cursor-not-allowed ${i > 0 ? 'border-l border-border-strong' : ''} ${active ? SEG_ACTIVE[k] : 'text-ink-2 hover:bg-surface-2 disabled:opacity-50'}`}>
            <AskIcon response={k} size={13} />{label}
          </button>
        );
      })}
    </div>
  );
}

// Section header inside a view: title left, actions right. Titles stay short; no paragraphs below.
export function ViewHeader({ title, meta, right }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5 min-h-8">
      <div className="flex items-baseline gap-3 min-w-0"><h1 className="text-title text-ink truncate">{title}</h1>{meta && <span className="text-label text-muted whitespace-nowrap">{meta}</span>}</div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

// Popover menu: click outside / Escape closes, focus returns to the trigger, arrow keys move between items.
export function Menu({ button, children, align = 'right', ariaLabel, width = 'w-64' }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trig = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); trig.current?.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(wrap.current?.querySelectorAll('[role="menuitem"], [role="menuitemradio"], select') || [])].filter((el) => !el.disabled);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    const first = wrap.current?.querySelector('[role="menuitem"], [role="menuitemradio"]'); first?.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={wrap} className="relative">
      {button({ ref: trig, open, toggle: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && (
        <div role="menu" aria-label={ariaLabel} className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 ${width} bg-surface border border-border rounded-panel shadow-md p-1 z-50 anim-pop`} onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}
export const menuItem = 'w-full flex items-center gap-2 h-8 px-2 rounded-control text-label text-ink hover:bg-surface-2 text-left focus-ring-inset disabled:opacity-40';
export const MenuLabel = ({ children }) => <div className="px-2 pt-2 pb-1 text-micro font-semibold uppercase tracking-wide text-faint">{children}</div>;
export const MenuSep = () => <div className="my-1 border-t border-border" />;

// Collapsible group with a count, used for "Nog niet geprioriteerd (n)" and "Historie".
export function Disclosure({ summary, children, defaultOpen = false, className = '' }) {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary className="list-none cursor-pointer select-none inline-flex items-center gap-1 h-8 px-1 -mx-1 rounded-control text-label font-medium text-muted hover:text-ink focus-ring">
        <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />{summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

export const fmtDate = (iso, lang = 'nl') => (iso ? new Date(iso).toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB') : '–');

// Small dialog for creating things (role=dialog, focus trap, Escape closes, focus returns). Reasons never use it.
export function Dialog({ title, onClose, children, width = 'w-[440px]' }) {
  const t = useT();
  const ref = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input, textarea, select, button')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
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
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-modal flex items-start justify-center pt-[12vh] bg-black/20 anim-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={`${width} max-w-[95vw] bg-surface rounded-modal shadow-lg border border-border anim-pop`}>
        <header className="flex items-center justify-between px-4 h-12 border-b border-border"><h2 className="text-subtitle font-semibold">{title}</h2><button className={cls.icon} onClick={onClose} aria-label={t('Close')}><X size={16} /></button></header>
        <div className="p-4">{children}</div>
      </div>
    </div>, document.body);
}

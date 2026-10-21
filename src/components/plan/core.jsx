import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, X, Clock, CircleDot, CircleHelp, ArrowRight, ChevronDown, Flag, TriangleAlert, OctagonX, Pencil, Star } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ASK_META, COMMITMENT_META, isLockedPhase } from '../../domain/model';
import { SIMPLE_META, fmtMonth } from '../../domain/value';
import { SIZES, SIGNALS, SIGNAL_META, BOTTLENECK_META, signalOf, worstSignal, fmtEffort, isPostLock, sizeMapOf } from '../../domain/rhythm';
import { useT } from '../../i18n';

// Calm primitives for the three core screens (docs/design.md section 19). Tokens come from src/index.css and differ
// per skin (Zakelijk: flat, 1px borders, no resting shadows; Speels: floating panels, pills). Every control >= 24px,
// focus ring from :focus-visible.

export const cls = {
  primary: 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-control bg-accent text-accent-fg text-label font-medium hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed transition-base whitespace-nowrap',
  secondary: 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-control bg-surface border border-border-strong text-label font-medium text-ink hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-base whitespace-nowrap',
  ghost: 'inline-flex items-center gap-1 h-8 px-2 rounded-control text-label font-medium text-accent hover:bg-accent-50 disabled:opacity-40 disabled:cursor-not-allowed transition-base whitespace-nowrap',
  quiet: 'inline-flex items-center gap-1 h-7 px-1.5 rounded-control text-caption text-muted hover:text-ink hover:bg-surface-2 transition-base whitespace-nowrap',
  icon: 'inline-flex items-center justify-center w-7 h-7 rounded-control text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-40 transition-base',
  input: 'h-8 px-2 rounded-control border border-border-strong bg-surface text-body text-ink placeholder:text-faint focus:border-accent w-full disabled:bg-surface-2 disabled:text-muted',
  textarea: 'px-2 py-1.5 rounded-control border border-border-strong bg-surface text-body text-ink placeholder:text-faint focus:border-accent w-full',
  card: 'panel',
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
// Section 26 (D86): 28px high with a 13px label so the answer reads from a distance (team pages, Afstemmen, Voortgang).
export function StatusChip({ response, compact = false, className = '' }) {
  const t = useT();
  const m = ASK_META[response] || ASK_META.proposed;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-label font-semibold whitespace-nowrap ${toneClass(m.tone)} ${className}`}>
      <AskIcon response={response} size={13} />{!compact && <span>{t(m.label)}</span>}
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
// `hash`: the team-page variant "#8" (section 26, D86), 28px high, titled "Prioriteit van de epic".
export function RankNo({ rank, size = 'md', hash = false }) {
  const t = useT();
  const dim = hash ? 'h-7 min-w-[34px] px-1 text-label' : size === 'sm' ? 'w-6 h-6 text-caption' : 'w-7 h-7 text-label';
  const look = rank == null ? 'bg-surface-2 text-faint rounded-rank' : 'rank-no';
  const label = rank == null ? t('Unranked') : hash ? `${t('Priority of the epic')}: ${rank}` : t('Strategic rank {rank}', { rank });
  return <span className={`shrink-0 tnum inline-flex items-center justify-center ${dim} ${look}`} aria-label={label} title={hash ? t('Priority of the epic') : undefined}>{rank == null ? '–' : hash ? `#${rank}` : rank}</span>;
}

// Four core states; older partial/deferred data folds into the nearest one (D31).
export const normAsk = (r) => (r === 'partial' ? 'accepted' : r === 'deferred' ? 'needs_priority_call' : r);
export const ASK_SEVERITY = { declined: 3, needs_priority_call: 2, proposed: 1, accepted: 0 };
export const worstAsk = (deps) => (deps.length ? deps.map((d) => normAsk(d.response)).sort((a, b) => ASK_SEVERITY[b] - ASK_SEVERITY[a])[0] : null);
const WORST_TEXT = { declined: 'text-danger-fg', needs_priority_call: 'text-warn-fg', proposed: 'text-ink-2', accepted: 'text-ok-fg' };

// The Afhankelijkheden cell (owner feedback 2026-10-21, item F; D82): "4/5 toegezegd" coloured by the worst state,
// followed by the worst signal or answer when there is one: "4/5 toegezegd · Deadline in gevaar · Platform & Security",
// "2/3 toegezegd · Kan niet · Claims", "1/3 toegezegd · 2 open". The tooltip lists every ask.
// Release B (L8): a signal worse than Op koers on a committed ask wins over an open ask.
export function WorstIssue({ deps, teams }) {
  const t = useT();
  if (!deps.length) return <span className="text-faint text-caption">–</span>;
  const worst = worstAsk(deps);
  const sig = worst === 'accepted' || worst === 'proposed' ? worstSignal(deps) : null;
  const all = deps.map((d) => `${teams.get(d.providerTeamId)?.name || '?'}: ${d.ask} — ${t(ASK_META[normAsk(d.response)].label)}${signalOf(d) !== 'on_track' ? ` · ${t(SIGNAL_META[signalOf(d)].label)}${d.signalNote ? ` (${d.signalNote})` : ''}` : ''}`).join('\n');
  const yes = deps.filter((d) => normAsk(d.response) === 'accepted').length;
  const count = `${yes}/${deps.length} ${t(ASK_META.accepted.label).toLowerCase()}`;
  let icon; let tone; let tail = null;
  if (sig) {
    const m = SIGNAL_META[signalOf(sig)];
    icon = <SignalIcon signal={signalOf(sig)} size={13} className="shrink-0" />;
    tone = m.tone === 'danger' ? 'text-danger-fg' : 'text-warn-fg';
    tail = <>{t(m.label)} <span className="text-muted">· {teams.get(sig.providerTeamId)?.name}</span></>;
  } else {
    icon = <AskIcon response={worst} size={13} className="shrink-0" />;
    tone = WORST_TEXT[worst];
    if (worst === 'declined' || worst === 'needs_priority_call') {
      const first = deps.find((d) => normAsk(d.response) === worst);
      tail = <>{t(ASK_META[worst].label)} <span className="text-muted">· {teams.get(first.providerTeamId)?.name}</span></>;
    } else if (worst === 'proposed') {
      tail = <span className="text-muted">{deps.filter((d) => normAsk(d.response) === 'proposed').length} {t(ASK_META.proposed.label).toLowerCase()}</span>;
    }
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-label font-medium min-w-0 tnum ${tone}`} title={all} aria-label={all}>
      {icon}<span className="truncate">{count}{tail && <> <span className="text-muted">·</span> {tail}</>}</span>
    </span>
  );
}

// ── Release B primitives (docs/design.md section 22) ─────────────────────────
// Segmented size picker S · M · L · XL (role=radiogroup); clicking the active size clears it (numbers stay).
export function SizePicker({ value, onPick, disabled = false, ariaLabel, size = 'md' }) {
  const t = useT();
  const h = size === 'sm' ? 'h-7 px-2 text-caption' : 'h-8 px-2.5 text-label';
  return (
    <div role="radiogroup" aria-label={ariaLabel || t('Size')} className="inline-flex rounded-control border border-border-strong overflow-hidden bg-surface">
      {SIZES.map((k, i) => {
        const active = value === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => onPick(active ? null : k)}
            className={`inline-flex items-center justify-center min-w-8 font-medium tnum transition-base focus-ring-inset disabled:cursor-not-allowed ${h} ${i > 0 ? 'border-l border-border-strong' : ''} ${active ? 'bg-accent-50 text-accent-700' : 'text-ink-2 hover:bg-surface-2 disabled:opacity-50'}`}>{k}</button>
        );
      })}
    </div>
  );
}
// "L · 4–8 pw" or "6–8 pw"; "–" when nothing is estimated.
export function SizeText({ size, low, high, className = '' }) {
  if (!size && !(high > 0)) return <span className={`text-faint ${className}`}>–</span>;
  return <span className={`tnum whitespace-nowrap ${className}`}>{size && <span className="font-medium">{size} · </span>}{fmtEffort(low || 0, high || 0)} pw</span>;
}

// Size column, variant C (section 26, D87): a bar scaled to the upper estimate (against the organisation's largest
// size), the letter and the pw range in three fixed-width cells, so bars, letters and numbers line up across rows.
// Numbers without a size: bar + "–"; nothing estimated: an empty cell of the same width.
export const SIZE_CELL_W = 'w-[148px]';
export function SizeCell({ size, low, high, settings, className = '' }) {
  const t = useT();
  const map = sizeMapOf(settings);
  const max = Math.max(...Object.values(map).map((r) => Number(r[1]) || 0), 1);
  const hi = Number(high) || 0;
  const has = !!size || hi > 0;
  const pct = has ? Math.max(4, Math.min(100, Math.round((hi / max) * 100))) : 0;
  const label = has ? `${t('Size')} ${size || '–'} · ${fmtEffort(low || 0, hi)} pw` : t('No size');
  return (
    <span className={`${SIZE_CELL_W} shrink-0 grid grid-cols-[52px_20px_1fr] items-center gap-2 tnum ${className}`} title={has ? label : undefined} aria-label={label} role="img">
      <span aria-hidden="true" className="h-2 rounded-control bg-surface-2 overflow-hidden">{has && <span className="block h-full rounded-control bg-accent" style={{ width: `${pct}%` }} />}</span>
      <span className="text-label font-semibold text-ink text-center">{has ? size || '–' : ''}</span>
      <span className="text-caption text-muted whitespace-nowrap">{has ? `${fmtEffort(low || 0, hi)} pw` : ''}</span>
    </span>
  );
}

const SIGNAL_ICON = { on_track: Check, at_risk: TriangleAlert, wont_make: OctagonX };
export const SignalIcon = ({ signal, size = 12, className = '' }) => { const I = SIGNAL_ICON[signal] || Check; return <I size={size} strokeWidth={2.25} className={className} aria-hidden="true" />; };
// Read-only signal: icon + label (+ note), nothing when on track (L7: Op koers shows nothing).
export function SignalChip({ dep, className = '', withNote = true }) {
  const t = useT();
  const sig = signalOf(dep);
  if (sig === 'on_track') return null;
  const m = SIGNAL_META[sig];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 h-6 text-caption font-medium whitespace-nowrap ${toneClass(m.tone)} ${className}`} title={dep.signalNote || undefined}>
      <SignalIcon signal={sig} />{t(m.label)}{withNote && dep.signalNote && <span className="font-normal truncate max-w-[220px]"> · {dep.signalNote}</span>}
    </span>
  );
}
// Provider control: Op koers · Deadline in gevaar · Gaat niet halen (role=radiogroup); the caller opens the note input.
const SIG_ACTIVE = { on_track: 'bg-surface-2 text-ink-2 border-border-strong', at_risk: 'bg-warn-bg text-warn-fg border-warn-border', wont_make: 'bg-danger-bg text-danger-fg border-danger-border' };
export function SignalControl({ value, onPick, disabled = false, labelledBy }) {
  const t = useT();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : t('Signal')} className="inline-flex rounded-control border border-border-strong overflow-hidden bg-surface">
      {SIGNALS.map((k, i) => {
        const active = value === k;
        return (
          <button key={k} type="button" role="radio" aria-checked={active} disabled={disabled} onClick={() => onPick(k)}
            className={`inline-flex items-center gap-1 h-7 px-2 text-caption font-medium transition-base focus-ring-inset disabled:cursor-not-allowed ${i > 0 ? 'border-l border-border-strong' : ''} ${active ? SIG_ACTIVE[k] : 'text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50'}`}>
            <SignalIcon signal={k} size={12} />{t(SIGNAL_META[k].label)}
          </button>
        );
      })}
    </div>
  );
}
// One reason chip per ask / pair (D53): Boven capaciteit · Grote job · Lage zekerheid.
export function BottleneckChip({ kind, className = '' }) {
  const t = useT();
  if (!kind) return null;
  const m = BOTTLENECK_META[kind];
  return <span className={`inline-flex items-center rounded-full px-2 h-5 text-micro font-semibold whitespace-nowrap ${toneClass(m.tone)} ${className}`}>{t(m.label)}</span>;
}
const BAND_TEXT = { ok: 'text-muted', warn: 'text-warn-fg', over: 'text-danger-fg', none: 'text-muted' };
const BAND_LABEL = { ok: 'room', warn: 'tight', over: 'over capacity' };
const fmtPw1 = (n, lang) => (Math.round(n * 10) / 10).toString().replace('.', lang === 'nl' ? ',' : '.');
// The capacity line (L3): "Beschikbaar 31 pw · run 20% · 1,5 vacant (+8 pw als gevuld)   Gevraagd 26 pw · 84% · krap".
// Without capacity: "Capaciteit invullen" (planner / admin, `onEdit`) or "–".
export function CapacityLine({ cap, onEdit, compact = false, className = '' }) {
  const t = useT();
  if (!cap.cap) {
    return (
      <span className={`inline-flex items-center gap-2 text-label text-muted ${className}`}>
        <span>{t('Capacity')}</span>
        {onEdit ? <button type="button" className={cls.ghost} onClick={onEdit}>{t('Fill in capacity')}</button> : <span className="text-faint">–</span>}
      </span>
    );
  }
  const dot = <span className="text-faint" aria-hidden="true">·</span>;
  return (
    <span className={`inline-flex items-center gap-x-2 gap-y-1 flex-wrap text-label tnum ${className}`}>
      <span className="text-ink-2"><span className="text-muted">{t('Available')}</span> <span className="font-medium text-ink">{fmtPw1(cap.available, t.lang)} pw</span></span>
      {dot}<span className="text-muted">{t('run')} {cap.reservePct}%</span>
      {cap.fteVacant > 0 && <>{dot}<span className="text-muted">{fmtPw1(cap.fteVacant, t.lang)} {t('vacant')} <span className="text-faint">(+{fmtPw1(cap.vacant, t.lang)} pw {t('if filled')})</span></span></>}
      <span className={`inline-flex items-center gap-2 ${compact ? '' : 'ml-2'} ${BAND_TEXT[cap.band]}`}>
        <span><span className={cap.band === 'over' ? '' : 'text-muted'}>{t('Requested')}</span> <span className="font-medium">{fmtPw1(cap.requested, t.lang)} pw</span></span>
        {dot}<span className="font-medium">{cap.pct}%</span>
        {cap.band !== 'none' && <>{dot}<span className="font-medium">{t(BAND_LABEL[cap.band])}</span></>}
      </span>
      {onEdit && <button type="button" className={cls.icon} onClick={onEdit} aria-label={t('Edit capacity')} title={t('Edit capacity')}><Pencil size={13} /></button>}
    </span>
  );
}
// ── Section 23 primitives (Volgen, M8; "na vastzetten", M3) ───────────────────
// Small filled star after a followed epic's title in lists; nothing when not followed.
export function FollowStar({ on, className = '' }) {
  const t = useT();
  if (!on) return null;
  return <Star size={11} fill="currentColor" strokeWidth={0} className={`text-accent shrink-0 ${className}`} aria-label={t('Followed')} role="img" />;
}
// Header toggle "Volgen" / "Gevolgd" in the epic panel (aria-pressed).
export function FollowButton({ on, onToggle, disabled = false }) {
  const t = useT();
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onToggle} title={on ? t('Unfollow') : t('Follow')}
      className={`inline-flex items-center gap-1 h-7 px-1.5 rounded-control text-caption font-medium transition-base focus-ring disabled:opacity-40 ${on ? 'text-accent-700 bg-accent-50' : 'text-muted hover:text-ink hover:bg-surface-2'}`}>
      <Star size={13} fill={on ? 'currentColor' : 'none'} strokeWidth={on ? 0 : 2} aria-hidden="true" />{on ? t('Followed') : t('Follow')}
    </button>
  );
}
// "Alleen gevolgd" filter toggle (Afgestemd, Voortgang); `count` is the number of followed epics in the quarter.
export function FollowOnlyToggle({ on, onChange, count, className = '' }) {
  const t = useT();
  if (!on && count === 0) return null; // nothing followed yet: no toggle (iteration 1)
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={`inline-flex items-center gap-1 h-7 px-2 rounded-full text-caption font-medium tnum transition-base focus-ring ${on ? 'bg-accent-50 text-accent-700' : 'bg-surface-2 text-muted hover:text-ink'} ${className}`}>
      <Star size={11} fill={on ? 'currentColor' : 'none'} strokeWidth={on ? 0 : 2} aria-hidden="true" />{t('Followed only')}{count != null && <span>({count})</span>}
    </button>
  );
}
// Muted "na vastzetten" after an ask created after the quarter was locked (M3).
export { isPostLock };
export function PostLockMark({ dep, quarter, className = '' }) {
  const t = useT();
  if (!isPostLock(dep, quarter)) return null;
  return <span className={`inline-flex items-center rounded-full px-1.5 h-5 text-micro font-semibold whitespace-nowrap bg-surface-2 text-muted ${className}`}>{t('after lock')}</span>;
}

// Confirm dialog with an optional one-line reason (Plan vastzetten, Kwartaal afsluiten).
export function ConfirmDialog({ title, line, confirmLabel, onConfirm, onClose, withReason = true, error }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => { e.preventDefault(); if (busy) return; setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } };
  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={go} className="space-y-3">
        {line && <p className="text-body text-ink-2">{line}</p>}
        {withReason && <label className="block"><span className={cls.label}>{t('Why? (optional)')}</span><input className={cls.input} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        <ErrorLine error={error} />
        <div className="flex justify-end gap-2 pt-1"><button type="button" className={cls.secondary} onClick={onClose}>{t('Cancel')}</button><button type="submit" className={cls.primary} disabled={busy}>{confirmLabel}</button></div>
      </form>
    </Dialog>
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

// Page title row (section 26, D85): one large h1 in the display font with a quiet context line next to it
// ("2026 Q4 · vastgezet op 2 okt"), actions on the right. Same position and size on every step of every phase.
export function ViewHeader({ title, meta, right }) {
  return (
    <div className="flex items-center gap-x-6 gap-y-3 flex-wrap mb-6 min-h-10">
      <div className="flex items-baseline gap-x-3 gap-y-1 min-w-0 flex-wrap">
        <h1 className="text-display text-ink leading-none tracking-[-0.02em]">{title}</h1>
        {meta && <span className="text-body text-muted">{meta}</span>}
      </div>
      {right && <div className="ml-auto flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}
// "2 okt" / "2 Oct" for the context line.
export const fmtDay = (iso, lang = 'nl') => (iso ? new Date(iso).toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB', { day: 'numeric', month: 'short' }).replace('.', '') : '');
// Context line next to the page title: the quarter, plus "vastgezet op <datum>" once locked or "afgesloten" when closed.
export function quarterMeta(quarter, t) {
  if (!quarter) return '';
  const label = `${quarter.year} Q${quarter.q}`;
  if (quarter.phase === 'closed') return `${label} · ${t('closed')}`;
  if (isLockedPhase(quarter.phase) && quarter.lockedAt) return `${label} · ${t('locked on {d}', { d: fmtDay(quarter.lockedAt, t.lang) })}`;
  return label;
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
        const items = [...(wrap.current?.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], select') || [])].filter((el) => !el.disabled);
        if (!items.length) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    const first = wrap.current?.querySelector('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'); first?.focus();
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={wrap} className="relative">
      {button({ ref: trig, open, toggle: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      {open && (
        <div role="menu" aria-label={ariaLabel} className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 ${width} bg-surface border border-border rounded-card shadow-md p-1 z-50 anim-pop`} onClick={(e) => { if (e.target.closest('[data-close]')) setOpen(false); }}>
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

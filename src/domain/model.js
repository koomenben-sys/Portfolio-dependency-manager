// Domain constants for the quarterly planning tool (see docs/design.md section 5)

export const PHASES = [
  { id: 'prep',      label: 'Prep',      hint: 'Epics, themes and capacity are prepared (async)' },
  { id: 'draft',     label: 'Draft',     hint: 'Teams draft their quarter plan' },
  { id: 'negotiate', label: 'Negotiate', hint: 'Dependency asks are answered' },
  { id: 'review',    label: 'Review',    hint: 'Capacity, risks and the cut line are reviewed' },
  { id: 'vote',      label: 'Vote',      hint: 'Every team gives a confidence vote' },
  { id: 'locked',    label: 'Locked',    hint: 'Baseline stored; changes need a reason' },
  { id: 'active',    label: 'Active',    hint: 'In-quarter: check-ins and impediments' },
  { id: 'closed',    label: 'Closed',    hint: 'Quarter finished' },
];
export const PHASE_INDEX = Object.fromEntries(PHASES.map((p, i) => [p.id, i]));
export const isLockedPhase = (phase) => PHASE_INDEX[phase] >= PHASE_INDEX.locked;

export const COMMITMENTS = ['draft', 'discuss', 'committed', 'at_risk', 'not_committed'];
export const RESPONSES = ['proposed', 'accepted', 'partial', 'deferred', 'declined', 'needs_priority_call'];
export const ROAM = ['resolved', 'owned', 'accepted', 'mitigated'];
export const CONFIDENCE = ['low', 'medium', 'high'];

export const NO_RESPONSE_DAYS = 5;
export const IMPEDIMENT_AGING_DAYS = 7;
export const STALE_TEAM_DAYS = 14;

// Status presentation: icon glyph + text label + colour classes. Colour is never the only carrier (D8).
export const COMMITMENT_META = {
  draft:         { label: 'Draft',          icon: '○', cls: 'bg-gray-100 text-gray-700 border-gray-300' },
  discuss:       { label: 'Needs discussion', icon: '?', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  committed:     { label: 'Committed',      icon: '✓', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  at_risk:       { label: 'At risk',        icon: '!', cls: 'bg-orange-50 text-orange-800 border-orange-300' },
  not_committed: { label: 'Not committed',  icon: '×', cls: 'bg-red-50 text-red-800 border-red-300' },
};

export const RESPONSE_META = {
  proposed:            { label: 'Proposed',            icon: '…', cls: 'bg-gray-100 text-gray-700 border-gray-300', severity: 2 },
  accepted:            { label: 'Accepted',            icon: '✓', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300', severity: 0 },
  partial:             { label: 'Partial',             icon: '◐', cls: 'bg-lime-50 text-lime-800 border-lime-300', severity: 1 },
  deferred:            { label: 'Deferred',            icon: '→', cls: 'bg-amber-50 text-amber-800 border-amber-300', severity: 3 },
  needs_priority_call: { label: 'Needs priority call', icon: '?', cls: 'bg-amber-50 text-amber-800 border-amber-300', severity: 4 },
  declined:            { label: 'Declined',            icon: '×', cls: 'bg-red-50 text-red-800 border-red-300', severity: 5 },
};

export const BAND_META = {
  ok:   { label: 'OK',   bar: 'bg-emerald-500', text: 'text-emerald-700', icon: '✓' },
  warn: { label: 'Tight', bar: 'bg-amber-500',  text: 'text-amber-700',   icon: '!' },
  over: { label: 'Over capacity', bar: 'bg-red-500', text: 'text-red-700', icon: '▲' },
  none: { label: 'No capacity set', bar: 'bg-gray-300', text: 'text-gray-500', icon: '–' },
};

export const CONFIDENCE_META = {
  low:    { label: 'Low',    icon: '▼', cls: 'text-red-700' },
  medium: { label: 'Medium', icon: '■', cls: 'text-amber-700' },
  high:   { label: 'High',   icon: '▲', cls: 'text-emerald-700' },
};

// Core vocabulary (docs/design.md section 19, D31): the product shows four answer states. Older data with
// `partial` / `deferred` is displayed read-only; those answers are no longer offered in the core screens.
export const ASK_STATES = ['proposed', 'accepted', 'needs_priority_call', 'declined'];
export const ASK_META = {
  proposed:            { label: 'Open',                tone: 'neutral', glyph: '○', order: 0 },
  accepted:            { label: 'Committed',           tone: 'ok',      glyph: '✓', order: 1 },
  partial:             { label: 'Committed (partial)', tone: 'info',    glyph: '◐', order: 1 },
  deferred:            { label: 'Deferred',            tone: 'warn',    glyph: '→', order: 2 },
  needs_priority_call: { label: 'Discuss',             tone: 'warn',    glyph: '?', order: 2 },
  declined:            { label: "Can't",               tone: 'danger',  glyph: '✕', order: 3 },
};
// Answers that need a reason (D29): a "no" and a postponement; "discuss" may carry one.
export const REASON_REQUIRED = new Set(['declined', 'deferred']);
export const needsTalk = (response) => response === 'declined' || response === 'needs_priority_call';

// Release A (D46): the four-step cycle shown next to the quarter selector, mapped onto the eight phases.
// Section 23 (D63, M1): three cycle phases read from the eight stored ones. Event folds into Planning (the quarter
// session is a moment; "Plan vastzetten" ends it). The steps in the nav follow this word (App.jsx, D64).
export const CYCLE = { prep: 'Planning', draft: 'Planning', negotiate: 'Planning', review: 'Planning', vote: 'Planning', locked: 'Execution', active: 'Execution', closed: 'Closed' };
export const cyclePhase = (phase) => CYCLE[phase] || 'Planning';
// Header chip per cycle phase (owner feedback 2026-10-21, item B): label key + tone. Execution reads "In uitvoering".
export const PHASE_CHIP = { Planning: { label: 'Planning', tone: 'neutral' }, Execution: { label: 'In execution', tone: 'ok' }, Closed: { label: 'Closed', tone: 'neutral' } };
// Step ids per cycle phase (M2). Step 1 keeps its name; 2 and 3 change meaning with the phase.
export const STEPS = {
  Planning: ['prioriteren', 'afhankelijkheden', 'afstemmen'],
  Execution: ['prioriteren', 'afgestemd', 'voortgang'],
  Closed: ['prioriteren', 'afgestemd', 'resultaat'],
};
export const STEP_LABEL = { prioriteren: 'Prioritise', afhankelijkheden: 'Dependencies', afgestemd: 'Agreed', afstemmen: 'Align', voortgang: 'Progress', resultaat: 'Result' };
const STEP_NO = { prioriteren: 0, afhankelijkheden: 1, afgestemd: 1, afstemmen: 2, voortgang: 2, resultaat: 2, afsluiten: 2 };
// A step hash that does not belong to the quarter's phase opens that phase's step with the same number (M2, M6).
export function stepForPhase(viewId, phase) {
  const n = STEP_NO[viewId];
  if (n == null) return viewId;
  return STEPS[cyclePhase(phase)][n];
}

export const quarterLabel = (q) => (q ? `${q.year} Q${q.q}` : '');

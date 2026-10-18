// Release A — goals, value models, OnePager and the quarter result (docs/design.md section 21, D40-D45).
// Pure functions shared by both adapters and every screen.
import { byId } from './plan';

// ── Goals and programmes (the `themes` table, D40) ───────────────────────────
export const THEME_TYPES = ['goal', 'program'];
export const THEME_TYPE_LABEL = { goal: 'Strategic goal', program: 'Programme' };
export const activeThemes = (themes) => themes.filter((t) => !t.archived);
// A month picker gives 'YYYY-MM'; the database stores a date, so keep the first of the month.
export const monthToDate = (m) => (m ? `${String(m).slice(0, 7)}-01` : null);
export const dateToMonth = (d) => (d ? String(d).slice(0, 7) : '');
export const fmtMonth = (d, lang = 'nl') => (d ? new Date(`${String(d).slice(0, 7)}-01T00:00:00`).toLocaleDateString(lang === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', year: 'numeric' }) : '');

// Shared validation for upsertTheme (same texts in both adapters).
export function checkTheme(theme, existing, Err = Error) {
  const t = { ...existing, ...theme };
  if ((!existing || theme.name !== undefined) && !String(t.name || '').trim()) throw new Err('Name is required');
  if (t.type != null && !THEME_TYPES.includes(t.type)) throw new Err('Unknown goal type');
  if (theme.mustDeadline && !t.must) throw new Err('A deadline needs Moet');
  if (!t.must) t.mustDeadline = null;   // switching Moet off drops the deadline
  return t;
}

// "Moet" chip: the epic's own regulatory deadline wins; otherwise a Moet programme lends its deadline (D41).
export function effectiveMust(epic, theme) {
  if (!epic) return null;
  if (epic.regulatory) return { deadline: epic.regulatoryDeadline || null, inherited: false };
  if (theme?.must) return { deadline: theme.mustDeadline || null, inherited: true };
  return null;
}

// ── Value (D43) ──────────────────────────────────────────────────────────────
export const VALUE_MODELS = ['none', 'simple', 'wsjf', 'rice'];
export const VALUE_MODEL_LABEL = { none: 'None', simple: 'Simple (High / Medium / Low)', wsjf: 'WSJF', rice: 'RICE' };
export const SIMPLE_LEVELS = ['high', 'medium', 'low'];
export const SIMPLE_META = { high: { letter: 'H', label: 'High' }, medium: { letter: 'M', label: 'Medium' }, low: { letter: 'L', label: 'Low' } };
export const FIB = [1, 2, 3, 5, 8, 13, 20];
export const RICE_IMPACT = [0.25, 0.5, 1, 2, 3];
export const WSJF_FIELDS = [['bv', 'Business value'], ['tc', 'Time criticality'], ['rr', 'Risk reduction / opportunity']];

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const round1 = (n) => Math.round(n * 10) / 10;

// Numeric score (WSJF / RICE), the level (simple) or null when nothing is filled. Never stored.
export function valueScore(model, value, plan) {
  const v = value || {};
  if (model === 'simple') return SIMPLE_LEVELS.includes(v.level) ? v.level : null;
  if (model === 'wsjf') {
    const parts = [num(v.bv), num(v.tc), num(v.rr)];
    if (parts.every((x) => x == null)) return null;
    const size = num(v.jobSize) ?? (plan?.effortHigh > 0 ? plan.effortHigh : null);
    if (!size) return null;
    return round1(parts.reduce((s, x) => s + (x || 0), 0) / size);
  }
  if (model === 'rice') {
    const reach = num(v.reach); const impact = num(v.impact); const conf = num(v.confidence);
    if (reach == null && impact == null && conf == null) return null;
    const effort = num(v.effort) ?? (plan?.effortHigh > 0 ? plan.effortHigh : null);
    if (!effort) return null;
    return round1(((reach || 0) * (impact || 0) * ((conf ?? 100) / 100)) / effort);
  }
  return null;
}
// Sortable number for sums and the quarter result (simple: 3/2/1).
export const valueNumber = (model, value, plan) => {
  const s = valueScore(model, value, plan);
  if (s == null) return 0;
  return model === 'simple' ? { high: 3, medium: 2, low: 1 }[s] : s;
};

// ── OnePager (D44) ───────────────────────────────────────────────────────────
export const ONE_PAGER_FIELDS = [
  ['problem', 'Problem and consequence', 'What goes wrong if we do not do this, and for whom?'],
  ['outcome', 'Desired outcome', 'What is demonstrably different at the end of the quarter?'],
  ['outOfScope', 'Out of scope / risk', 'What do we explicitly not do, or what could make this fail?'],
];
export const hasOnePager = (epic) => !!(epic?.onePagerUrl || ONE_PAGER_FIELDS.some(([k]) => String(epic?.onePager?.[k] || '').trim()));
export const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

// ── Strategy line and quarter result (D42, D45) ──────────────────────────────
const normAsk = (r) => (r === 'partial' ? 'accepted' : r === 'deferred' ? 'needs_priority_call' : r);
const SEVERITY = { declined: 3, needs_priority_call: 2, proposed: 1, accepted: 0 };

// Counts of the top-N ranked epics per active goal, in theme order; `none` = top-N epics without a goal.
export function strategyCounts(state, quarterId, topN = 10) {
  const epics = byId(state.epics);
  const top = state.plans.filter((p) => p.quarterId === quarterId && p.rank != null).sort((a, b) => a.rank - b.rank).slice(0, topN);
  const counts = new Map(activeThemes(state.themes).map((t) => [t.id, 0]));
  let none = 0;
  for (const p of top) { const th = epics.get(p.epicId)?.themeId; if (th && counts.has(th)) counts.set(th, counts.get(th) + 1); else none += 1; }
  return { top: top.length, rows: activeThemes(state.themes).map((t) => ({ theme: t, n: counts.get(t.id) })), none };
}

// Commitment of one planned epic from its asks: committed (all accepted or none), at_risk (a Kan niet / Bespreken), open.
export function epicStanding(state, epicId, quarterId) {
  const deps = state.dependencies.filter((d) => d.epicId === epicId && d.quarterId === quarterId);
  if (deps.every((d) => normAsk(d.response) === 'accepted')) return { status: 'committed', blocking: null };
  const worst = [...deps].sort((a, b) => SEVERITY[normAsk(b.response)] - SEVERITY[normAsk(a.response)])[0];
  const w = normAsk(worst.response);
  return { status: w === 'proposed' ? 'open' : 'at_risk', blocking: w === 'proposed' ? null : worst.providerTeamId, worst: w };
}

// One row per goal / programme for Kwartaalresultaat; Moet programmes first, "without goal" last.
export function quarterResult(state, quarterId, model = 'none', maxTitles = 5) {
  const epics = byId(state.epics); const teams = byId(state.teams);
  const plans = state.plans.filter((p) => p.quarterId === quarterId).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const rowFor = (theme) => {
    const ps = plans.filter((p) => (theme ? epics.get(p.epicId)?.themeId === theme.id : !state.themes.some((t) => t.id === epics.get(p.epicId)?.themeId)));
    const standings = ps.map((p) => ({ plan: p, epic: epics.get(p.epicId), ...epicStanding(state, p.epicId, quarterId) }));
    const committed = standings.filter((s) => s.status === 'committed');
    const notCommitted = standings.filter((s) => s.status !== 'committed');
    const value = model === 'none' ? ps.length : round1(ps.reduce((s, p) => s + valueNumber(model, epics.get(p.epicId)?.value, p), 0));
    return {
      theme, planned: ps.length, committed: committed.length, atRisk: standings.filter((s) => s.status === 'at_risk').length, value,
      notCommitted: notCommitted.slice(0, maxTitles).map((s) => ({ epicId: s.epic?.id, title: s.epic?.title, rank: s.plan.rank, status: s.status, team: s.blocking ? teams.get(s.blocking)?.name : null })),
      more: Math.max(0, notCommitted.length - maxTitles),
    };
  };
  const ordered = [...state.themes].sort((a, b) => ((b.type === 'program' && b.must) - (a.type === 'program' && a.must)) || (a.position ?? 0) - (b.position ?? 0));
  const rows = ordered.map(rowFor).filter((r) => r.planned > 0 || !r.theme.archived);
  rows.push(rowFor(null));
  const top = plans.filter((p) => p.rank != null).slice(0, 10).map((p) => epicStanding(state, p.epicId, quarterId));
  return { rows, top: top.length, topCommitted: top.filter((s) => s.status === 'committed').length, topAtRisk: top.filter((s) => s.status === 'at_risk').length };
}

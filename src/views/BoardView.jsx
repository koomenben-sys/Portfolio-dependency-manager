import React, { useMemo, useState } from 'react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam } from '../data/repository';
import { teamLoad, rankedLoad } from '../domain/capacity';
import { teamPlans, teamCutEpicId, belowCutSet, epicDeps, worstResponse, incomingForTeam, changedSinceBaseline, latestCheckIn, daysUntil } from '../domain/plan';
import { COMMITMENTS, COMMITMENT_META, RESPONSE_META, CONFIDENCE_META, quarterLabel } from '../domain/model';
import { useT } from '../i18n';
import { CommitmentPill, CapacityBar, CapacityLegend, Pill, RankBadge, btn, input, Modal, Field, ErrorNote, Empty, fmtDate } from '../components/plan/ui';
import { NoQuarter } from '../components/plan/NoQuarter';
import { EpicPanel } from '../components/plan/EpicPanel';

// Quarter board: team lanes, epics by strategic rank, capacity bar + cut line (AC B1-B8).
export function BoardView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [filters, setFilters] = useState({ label: '', theme: '', commitment: '', regulatory: false, unaligned: false, teams: '' });
  const [dense, setDense] = useState(false);
  const [openEpic, setOpenEpic] = useState(null);
  const [addFor, setAddFor] = useState(null);
  const [showAssumptions, setShowAssumptions] = useState(null);
  const [showLegend, setShowLegend] = useState(false);
  const labels = useMemo(() => [...new Set(state.epics.map((e) => e.label).filter(Boolean))].sort(), [state.epics]);
  const epicsById = useMemo(() => new Map(state.epics.map((e) => [e.id, e])), [state.epics]);
  if (!quarter) return <NoQuarter />;

  const passes = (e) => (!filters.label || e.label === filters.label) && (!filters.theme || e.themeId === filters.theme)
    && (!filters.regulatory || e.regulatory) && (!filters.unaligned || !e.themeId);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-xl font-bold mr-2">{t('Quarter board')} · {quarterLabel(quarter)}</h2>
        <select aria-label={t('Filter teams')} className={`${input} !w-auto`} value={filters.teams} onChange={(e) => setFilters({ ...filters, teams: e.target.value })}>
          <option value="">{t('All teams')}</option>
          {actor.teamId && <option value="mine">{t('My team + teams we ask / that ask us')}</option>}
          {state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select aria-label={t('Filter by label')} className={`${input} !w-auto`} value={filters.label} onChange={(e) => setFilters({ ...filters, label: e.target.value })}>
          <option value="">{t('All labels')}</option>{labels.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select aria-label={t('Filter by strategic theme')} className={`${input} !w-auto`} value={filters.theme} onChange={(e) => setFilters({ ...filters, theme: e.target.value })}>
          <option value="">{t('All themes')}</option>{state.themes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select aria-label={t('Filter by commitment')} className={`${input} !w-auto`} value={filters.commitment} onChange={(e) => setFilters({ ...filters, commitment: e.target.value })}>
          <option value="">{t('All commitments')}</option>{COMMITMENTS.map((c) => <option key={c} value={c}>{t(COMMITMENT_META[c].label)}</option>)}
        </select>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={filters.regulatory} onChange={(e) => setFilters({ ...filters, regulatory: e.target.checked })} /> {t('Regulatory only')}</label>
        <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={filters.unaligned} onChange={(e) => setFilters({ ...filters, unaligned: e.target.checked })} /> {t('Unaligned only')}</label>
        <button className={btn.secondary} onClick={() => setDense(!dense)}>{dense ? t('Comfortable') : t('Compact')}</button>
        <button className={btn.ghost} onClick={() => setShowLegend(!showLegend)}>{showLegend ? t('Hide legend') : t('How to read this board')}</button>
      </div>
      {showLegend && (
        <div className="bg-surface border rounded-lg p-3 mb-4 text-sm space-y-1">
          <p>{t('Each column is a team. Epics are ordered by')} <b>{t('strategic rank')}</b> {t('(set top-down; 1 = most important). The')} <b>{t('cut line')}</b> {t("marks where the team's cumulative high estimate (own work plus accepted asks, in rank order) exceeds its available capacity: everything below it does not fit.")}</p>
          <CapacityLegend />
          <p className="text-xs text-muted">{t("Card pills: commitment (the team's promise), asks (what this epic needs from other teams, coloured by the worst answer), § regulatory with days to deadline. Click a card for details, asks, check-ins and history.")}</p>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {state.teams.filter((team) => {
          if (!filters.teams) return true;
          if (filters.teams === 'mine') return team.id === actor.teamId || state.dependencies.some((d) => d.quarterId === quarter.id && ((d.requesterTeamId === actor.teamId && d.providerTeamId === team.id) || (d.providerTeamId === actor.teamId && d.requesterTeamId === team.id)));
          return team.id === filters.teams;
        }).map((team) => {
          const load = teamLoad(state, team.id, quarter.id);
          const plans = teamPlans(state, team.id, quarter.id).filter((p) => passes(epicsById.get(p.epicId)) && (!filters.commitment || p.commitment === filters.commitment));
          const cutEpicId = teamCutEpicId(state, team.id, quarter.id);
          const below = belowCutSet(state, team.id, quarter.id);
          const incoming = incomingForTeam(state, team.id, quarter.id);
          const mayEdit = canWriteTeam(actor, team.id) && quarter.phase !== 'closed';
          const unanswered = incoming.filter((d) => d.response === 'proposed').length;
          return (
            <div key={team.id} className="w-[270px] shrink-0 bg-surface-2 rounded-lg border border-border">
              <div className="p-3 border-b border-border bg-surface rounded-t-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{team.name}</h3>
                  <button className="text-xs text-accent-700 hover:underline" onClick={() => setShowAssumptions(team)}>{t('Capacity assumptions')}</button>
                </div>
                <div className="mt-2"><CapacityBar load={load} /></div>
                <div className="text-xs text-muted mt-1">{t('Own work {ol}–{oh} pw · asks from others {il}–{ih} pw', { ol: load.ownLow, oh: load.ownHigh, il: load.incLow, ih: load.incHigh })}{unanswered > 0 && <span className="text-amber-800"> · {t('{n} unanswered', { n: unanswered })}</span>}</div>
              </div>
              <div className="p-2 space-y-2">
                {plans.length === 0 && <Empty>{Object.values(filters).some(Boolean) ? t('No epics match.') : t('No epics.')}</Empty>}
                {plans.map((p) => {
                  const e = epicsById.get(p.epicId);
                  const deps = epicDeps(state, e.id, quarter.id);
                  const worst = worstResponse(deps);
                  const theme = state.themes.find((x) => x.id === e.themeId);
                  const openDisc = state.discussions.some((d) => d.epicId === e.id && d.status === 'open' && d.quarterId === quarter.id);
                  const changed = quarter.baseline && changedSinceBaseline(state, e.id, quarter.id);
                  const ci = quarter.phase === 'active' ? latestCheckIn(state, e.id) : null;
                  return (
                    <React.Fragment key={p.id}>
                      {cutEpicId === e.id && (
                        <div className="flex items-center gap-2 text-xs text-red-700 font-semibold" role="separator" aria-label={t('Cut line: epics below exceed capacity')}>
                          <span className="flex-1 border-t-2 border-dashed border-red-500" /> {t('cut line · below = over capacity')} <span className="flex-1 border-t-2 border-dashed border-red-500" />
                        </div>
                      )}
                      <button onClick={() => setOpenEpic(e.id)} aria-label={`${e.refCode} ${e.title}, ${p.rank != null ? t('rank {rank}', { rank: p.rank }) : t('unranked')}, ${t(COMMITMENT_META[p.commitment]?.label || p.commitment)}`}
                        className={`w-full text-left bg-surface rounded border shadow-sm hover:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent ${below.has(e.id) ? 'border-red-200' : 'border-border'} ${dense ? 'p-1.5' : 'p-2'}`}>
                        <div className="flex items-start gap-2">
                          <RankBadge rank={p.rank} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium leading-tight ${dense ? 'text-xs' : 'text-sm'} ${p.commitment === 'not_committed' ? 'line-through text-muted' : ''}`}>{e.title}</div>
                            <div className="text-xs text-muted">{e.refCode}{e.externalSource && ' · ADO'} · {p.effortLow}–{p.effortHigh} pw{theme ? ` · ${theme.name}` : ` · ${t('unaligned')}`}</div>
                          </div>
                        </div>
                        {!dense && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <CommitmentPill value={p.commitment} size="xs" />
                            {deps.length > 0 && <Pill meta={RESPONSE_META[worst]} size="xs" title={t('Worst answer: {answer}', { answer: t(RESPONSE_META[worst].label) })}>{worst === 'accepted' ? (deps.length > 1 ? t('{n} asks accepted', { n: deps.length }) : t('1 ask accepted')) : `${t(RESPONSE_META[worst].label)}: ${deps.length > 1 ? t('{n} of {total} asks', { n: deps.filter((d) => d.response === worst).length, total: deps.length }) : t('{n} of 1 ask', { n: deps.filter((d) => d.response === worst).length })}`}</Pill>}
                            {e.regulatory && <span className={`text-xs px-1.5 rounded border ${below.has(e.id) ? 'bg-red-50 text-red-800 border-red-300 font-semibold' : 'bg-purple-50 text-purple-800 border-purple-200'}`} title={`${e.regulation || t('Regulatory')} · ${t('deadline {date}', { date: fmtDate(e.regulatoryDeadline) })}`}>§ {e.regulation ? e.regulation.split(' ')[0] : t('reg.')} {daysUntil(e.regulatoryDeadline)}d{below.has(e.id) ? ` · ${t('below cut line')}` : ''}</span>}
                            {openDisc && <span className="text-xs px-1.5 rounded bg-amber-100 text-amber-900 border border-amber-300">? {t('on discussion queue')}</span>}
                            {changed && <span className="text-xs px-1.5 rounded bg-amber-50 text-amber-900 border border-amber-200">{t('changed since lock')}</span>}
                            {ci && <span className="text-xs text-muted">· {t('check-in')} {t(CONFIDENCE_META[ci.confidence]?.label || ci.confidence).toLowerCase()}</span>}
                          </div>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
                {mayEdit && <button className="w-full text-xs text-accent-700 hover:underline py-1" onClick={() => setAddFor(team)}>{t('+ Add epic')}</button>}
              </div>
            </div>
          );
        })}
      </div>

      {openEpic && <EpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {addFor && <AddEpicModal team={addFor} onClose={() => setAddFor(null)} onCreated={(id) => { setAddFor(null); setOpenEpic(id); }} />}
      {showAssumptions && <AssumptionsModal team={showAssumptions} onClose={() => setShowAssumptions(null)} />}
    </div>
  );
}

function AddEpicModal({ team, onClose, onCreated }) {
  const { state, quarter, run, actor } = usePlan();
  const t = useT();
  const [title, setTitle] = useState('');
  const [themeId, setThemeId] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const locked = !!quarter.baseline;
  const submit = async () => {
    if (locked && !reason.trim()) return setErr(t('The quarter is locked: give a reason for adding an epic'));
    const r = await run('createEpic', { teamId: team.id, title, themeId: themeId || null, ownerName: actor.name });
    if (!r.ok) return setErr(r.error);
    const created = r.result;
    const r2 = await run('upsertPlan', { epicId: created.id, quarterId: quarter.id, commitment: 'draft', effortLow: 0, effortHigh: 0 }, reason);
    if (!r2.ok) return setErr(r2.error);
    onCreated(created.id);
  };
  return (
    <Modal title={t('New epic for {team}', { team: team.name })} onClose={onClose}>
      <Field l={t('Title')}><input className={input} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
      <div className="mt-2"><Field l={t('Strategic theme')}><select className={input} value={themeId} onChange={(e) => setThemeId(e.target.value)}><option value="">{t('— unaligned —')}</option>{state.themes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field></div>
      {locked && <div className="mt-2"><Field l={t('Reason (quarter is locked)')}><input className={input} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>}
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3"><button className={btn.secondary} onClick={onClose}>{t('Cancel')}</button><button className={btn.primary} onClick={submit}>{t('Create')}</button></div>
    </Modal>
  );
}

function AssumptionsModal({ team, onClose }) {
  const { state, quarter, run, actor } = usePlan();
  const t = useT();
  const load = teamLoad(state, team.id, quarter.id);
  const cap = load.cap || { teamId: team.id, quarterId: quarter.id, headcount: 0, weeks: 13, focusFactor: 0.65, absenceWeeks: 0, reservePct: 20 };
  const [form, setForm] = useState(cap);
  const [err, setErr] = useState(null);
  const mayEdit = canWriteTeam(actor, team.id);
  const set = (k) => (e) => setForm({ ...form, [k]: Number(e.target.value) });
  const plans = teamPlans(state, team.id, quarter.id).filter((p) => p.commitment !== 'not_committed');
  return (
    <Modal title={`${team.name} · ${t('capacity')} ${quarterLabel(quarter)}`} onClose={onClose}>
      <p className="text-xs text-muted mb-3">{t('available = (headcount × weeks − absence weeks) × focus factor × (1 − reserve%). Reserve covers run / on-call / support (KTLO). Absences are team totals, never per person. Load counts the high estimate; the bar also shows the low end.')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field l={t('Headcount')}><input type="number" step="0.5" className={input} value={form.headcount} disabled={!mayEdit} onChange={set('headcount')} /></Field>
        <Field l={t('Weeks in quarter')}><input type="number" className={input} value={form.weeks} disabled={!mayEdit} onChange={set('weeks')} /></Field>
        <Field l={t('Focus factor')}><input type="number" step="0.05" min="0.1" max="1" className={input} value={form.focusFactor} disabled={!mayEdit} onChange={set('focusFactor')} /></Field>
        <Field l={t('Absence weeks (team total)')}><input type="number" step="0.5" className={input} value={form.absenceWeeks} disabled={!mayEdit} onChange={set('absenceWeeks')} /></Field>
        <Field l={t('Reserve % (run / on-call / support)')}><input type="number" className={input} value={form.reservePct} disabled={!mayEdit} onChange={set('reservePct')} /></Field>
        {quarter.baseline && <Field l={t('Reason (quarter is locked)')}><input className={input} value={form.reason || ''} disabled={!mayEdit} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>}
      </div>
      <div className="mt-3 text-sm">{t('Available:')} <b>{load.available} pw</b> · {t('Load:')} <b>{load.totalLow}–{load.totalHigh} pw</b> ({load.pctLow}–{load.pct}%)</div>
      <h4 className="font-semibold text-sm mt-3 mb-1">{t('Contributing epics')}</h4>
      <ul className="text-xs space-y-0.5 max-h-48 overflow-auto">
        {rankedLoad(state, team.id, quarter.id).items.map((it) => { const e = state.epics.find((x) => x.id === it.epicId); return <li key={it.id} className={it.fits ? '' : 'text-red-700'}>#{it.rank ?? '–'} {it.kind === 'ask' ? `${t('ask for')} ` : ''}{e?.title} — {it.low}–{it.high} pw · {t('cum.')} {it.cum}{it.fits ? '' : ` · ${t('below cut line')}`}</li>; })}
      </ul>
      <ErrorNote error={err} />
      <div className="flex justify-end gap-2 mt-3">
        <button className={btn.secondary} onClick={onClose}>{t('Close')}</button>
        {mayEdit && <button className={btn.primary} onClick={async () => { const r = await run('upsertCapacity', { ...form, teamId: team.id, quarterId: quarter.id }); if (r.ok) onClose(); else setErr(r.error); }}>{t('Save')}</button>}
      </div>
    </Modal>
  );
}

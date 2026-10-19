import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ArrowRight, Check, FileBarChart, Lock } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canWriteTeam, isAdmin } from '../data/repository';
import { ASK_META, REASON_REQUIRED, needsTalk, isLockedPhase } from '../domain/model';
import { planFor, phaseAllows, byId } from '../domain/plan';
import { bottleneckFor, hasSignal, inExecution } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, StatusChip, AskIcon, RankNo, AnswerControl, InlineReason, toneClass, toneBorder, EmptyLine, ViewHeader, ErrorLine, Disclosure, normAsk, ASK_SEVERITY, worstAsk, BottleneckChip, SignalChip } from '../components/plan/core';
import { LockPlanDialog } from '../components/plan/CycleActions';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTourNudge } from '../components/plan/TourPanel';

// Screen 3 — Afstemmen (docs/design.md section 19, D26; iteration 1 items 12-16): four counts by urgency, a
// "Top 5" line, the team pairs to discuss sorted by the highest-ranked epic involved (problem pairs first,
// open-only pairs after), inline answers for those allowed, a session-local "Besproken" check, matrix at the end.
// Release B (section 22): derived bottleneck chips on pairs and asks (L5), "Plan vastzetten" for admins before
// lock (L6), and during Uitvoeren the top line counts signals as well (L8).
const STATES = ['declined', 'needs_priority_call', 'proposed', 'accepted'];
const LOUD = new Set(['declined', 'needs_priority_call']);
const LOUD_ICON = { declined: 'text-danger', needs_priority_call: 'text-warn' };
const TOP_N = 5;
const discussedKey = (quarterId) => `kp.discussed.${quarterId}`;
const readDiscussed = (quarterId) => { try { return new Set(JSON.parse(localStorage.getItem(discussedKey(quarterId)) || '[]')); } catch { return new Set(); } };

export function AlignView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [filter, setFilter] = useState(null); // null = to discuss
  const [pairFocus, setPairFocus] = useState(null); // { req, prov } from the matrix
  const [showMatrix, setShowMatrix] = useState(false);
  const [openEpic, setOpenEpic] = useState(null);
  const [err, setErr] = useState(null);
  const [discussed, setDiscussed] = useState(() => readDiscussed(quarter?.id));
  const [locking, setLocking] = useState(false);
  const detailRefs = useRef(new Map());
  useEffect(() => { setDiscussed(readDiscussed(quarter?.id)); }, [quarter?.id]);
  useTourNudge(useCallback((d) => { if (d.matrix != null) setShowMatrix(!!d.matrix); }, []));
  const epics = useMemo(() => byId(state.epics), [state.epics]);
  const teams = useMemo(() => byId(state.teams), [state.teams]);
  if (!quarter) return <NoQuarter />;

  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const counts = Object.fromEntries(STATES.map((s) => [s, deps.filter((d) => normAsk(d.response) === s).length]));
  const rankOf = (d) => planFor(state, d.epicId, quarter.id)?.rank ?? 1e9;
  const talk = (d) => needsTalk(d.response) || d.response === 'deferred';
  // Release B (D53): one derived reason chip per ask; a committed ask with a bottleneck belongs in "Te bespreken".
  const loads = new Map();
  const bottleneck = new Map(deps.map((d) => [d.id, bottleneckFor(state, d, loads)]));
  const inScope = (d) => (pairFocus ? d.requesterTeamId === pairFocus.req && d.providerTeamId === pairFocus.prov : filter ? normAsk(d.response) === filter : normAsk(d.response) !== 'accepted' || !!bottleneck.get(d.id));
  const executing = inExecution(quarter.phase);
  const mayLock = isAdmin(actor) && !isLockedPhase(quarter.phase);

  const pairs = [];
  for (const d of deps.filter(inScope)) {
    const key = `${d.requesterTeamId}|${d.providerTeamId}`;
    let p = pairs.find((x) => x.key === key);
    if (!p) { p = { key, req: d.requesterTeamId, prov: d.providerTeamId, deps: [] }; pairs.push(p); }
    p.deps.push(d);
  }
  pairs.forEach((p) => { p.deps.sort((a, b) => rankOf(a) - rankOf(b)); p.top = rankOf(p.deps[0]); p.problem = p.deps.some(talk); p.worst = worstAsk(p.deps); p.bottleneck = p.deps.map((d) => bottleneck.get(d.id)).find(Boolean) || null; });
  // Kan niet / Bespreken pairs first, then pairs with a bottleneck, then the rest; within a group by highest rank (L5).
  pairs.sort((a, b) => (b.problem - a.problem) || (!!b.bottleneck - !!a.bottleneck) || a.top - b.top || b.deps.length - a.deps.length);
  // D61: in the default list, pairs that are only there for a bottleneck (every ask committed) fold into one
  // collapsed "Knelpunten" group under the list, so "Te bespreken" stays the short list it was.
  const grouped = !filter && !pairFocus;
  const mainPairs = grouped ? pairs.filter((p) => p.deps.some((d) => normAsk(d.response) !== 'accepted')) : pairs;
  const quietPairs = grouped ? pairs.filter((p) => !mainPairs.includes(p)) : [];
  const listTitle = pairFocus ? `${teams.get(pairFocus.req)?.name} → ${teams.get(pairFocus.prov)?.name}` : filter ? t(ASK_META[filter].label) : t('To discuss');

  // "Top 5: 2 in gevaar (rang 2, 6)" — the highest-ranked epics with a Kan niet / Bespreken ask (item 13).
  const topPlans = state.plans.filter((p) => p.quarterId === quarter.id && p.rank != null).sort((a, b) => a.rank - b.rank).slice(0, TOP_N);
  // During Uitvoeren a committed ask with In gevaar / Gaat niet halen counts too (L8).
  const atRisk = topPlans.filter((p) => deps.some((d) => d.epicId === p.epicId && (talk(d) || (executing && hasSignal(d)))));
  // Plain render function: one team pair row (summary + its asks).
  const renderPair = (p, i) => {
              const done = discussed.has(p.key);
              const quiet = !p.problem || done;
              const worstN = p.deps.filter((d) => normAsk(d.response) === p.worst).length;
              return (
                <li key={p.key}>
                  <details ref={(el) => { if (el) detailRefs.current.set(p.key, el); else detailRefs.current.delete(p.key); }} className="group" open={(i === 0 && p.problem) || !!pairFocus}>
                    <summary className="list-none cursor-pointer select-none flex items-center gap-3 px-3 h-11 hover:bg-surface-2 focus-ring-inset">
                      <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180 shrink-0" aria-hidden="true" />
                      <RankNo rank={p.top === 1e9 ? null : p.top} size="sm" />
                      <span className={`text-body flex items-center gap-1.5 min-w-0 ${quiet ? 'text-ink-2' : 'font-medium text-ink'}`}><span className="truncate">{teams.get(p.req)?.name}</span><ArrowRight size={13} className="text-muted shrink-0" aria-hidden="true" /><span className="truncate">{teams.get(p.prov)?.name}</span></span>
                      <span className="ml-auto flex items-center gap-2">
                        <BottleneckChip kind={p.bottleneck} />
                        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 h-5 text-micro font-semibold tnum ${quiet && !LOUD.has(p.worst) ? 'bg-surface-2 text-muted' : toneClass(ASK_META[p.worst].tone)}`} aria-label={`${worstN} ${t(ASK_META[p.worst].label)}`}>{worstN}<AskIcon response={p.worst} size={10} /></span>
                        <button type="button" role="checkbox" aria-checked={done} aria-label={`${t('Discussed')}: ${teams.get(p.req)?.name} → ${teams.get(p.prov)?.name}`}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleDiscussed(p.key); }}
                          className={`inline-flex items-center gap-1 h-7 px-1.5 rounded-control text-caption font-medium transition-base focus-ring ${done ? 'text-ok-fg bg-ok-bg' : 'text-muted hover:text-ink hover:bg-surface-2'}`}>
                          <span className={`inline-flex items-center justify-center w-4 h-4 rounded border ${done ? 'bg-ok-fg border-ok-fg text-surface' : 'border-border-strong bg-surface'}`} aria-hidden="true">{done && <Check size={11} strokeWidth={3} />}</span>{t('Discussed')}
                        </button>
                      </span>
                    </summary>
                    <ul className="border-t border-border divide-y divide-border bg-canvas anim-fade-in">
                      {p.deps.map((d) => <PairAsk key={d.id} dep={d} epic={epics.get(d.epicId)} rank={planFor(state, d.epicId, quarter.id)?.rank} bottleneck={bottleneck.get(d.id)} mayAnswer={mayAnswerDep(d)} act={act} onOpen={() => setOpenEpic(d.epicId)} />)}
                    </ul>
                  </details>
                </li>
              );
  };
  const revealEpic = (epicId) => {
    setFilter(null); setPairFocus(null);
    const keys = [...new Set(deps.filter((d) => d.epicId === epicId && talk(d)).map((d) => `${d.requesterTeamId}|${d.providerTeamId}`))];
    requestAnimationFrame(() => {
      keys.forEach((k) => { const el = detailRefs.current.get(k); if (el) el.open = true; });
      const el = detailRefs.current.get(keys[0]);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.querySelector('summary')?.focus();
    });
  };
  const toggleDiscussed = (key) => {
    const next = new Set(discussed); if (next.has(key)) next.delete(key); else next.add(key);
    setDiscussed(next);
    try { localStorage.setItem(discussedKey(quarter.id), JSON.stringify([...next])); } catch { /* per-browser convenience only */ }
  };
  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const mayAnswerDep = (d) => canWriteTeam(actor, d.providerTeamId) && phaseAllows(quarter.phase, 'answer');

  return (
    <div data-tour="align">
      <ViewHeader title={t('Align')} right={
        <>
          {mayLock && <button className={cls.primary} onClick={() => setLocking(true)} data-tour="lock-plan"><Lock size={14} aria-hidden="true" />{t('Lock plan')}</button>}
          <a className={cls.secondary} href="#kwartaalresultaat" data-tour="quarter-result-link"><FileBarChart size={14} aria-hidden="true" />{t('Quarter result')}</a>
        </>
      } />
      {locking && <LockPlanDialog quarter={quarter} onClose={() => setLocking(false)} />}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-tour="tiles">
        {STATES.map((s) => {
          const m = ASK_META[s]; const active = filter === s && !pairFocus; const loud = LOUD.has(s) && counts[s] > 0;
          return (
            <button key={s} aria-pressed={active} onClick={() => { setPairFocus(null); setFilter(active ? null : s); }}
              className={`${cls.card} text-left p-4 transition-base hover:border-border-strong focus-ring ${active ? 'border-accent ring-1 ring-accent' : ''}`}>
              <div className={`flex items-center gap-1.5 text-label ${loud ? 'text-ink-2' : 'text-muted'}`}><AskIcon response={s} size={14} className={loud ? LOUD_ICON[s] : 'text-faint'} />{t(m.label)}</div>
              <div className={`tnum mt-2 leading-none ${loud ? 'text-display font-semibold text-ink' : 'text-hero font-medium text-muted'}`}>{counts[s]}</div>
            </button>
          );
        })}
      </div>

      {topPlans.length > 0 && (
        <p className={`mb-4 text-label tnum ${atRisk.length ? 'text-ink' : 'text-muted'}`}>
          <span className="font-medium">{t('Top {n}', { n: topPlans.length })}:</span> {t('{n} at risk', { n: atRisk.length })}
          {atRisk.length > 0 && <> (<span className="text-muted">{t('rank')}</span> {atRisk.map((p, i) => <React.Fragment key={p.id}>{i > 0 && ', '}<button className="text-accent font-medium hover:underline focus-ring rounded-control px-0.5 min-h-6" onClick={() => revealEpic(p.epicId)} aria-label={t('Show rank {rank} in the list', { rank: p.rank })}>{p.rank}</button></React.Fragment>)})</>}
        </p>
      )}
      <ErrorLine error={err} />

      <section aria-label={listTitle} data-tour="pairs">
        <div className="flex items-center gap-3 mb-2 min-h-8">
          <h2 className="text-subtitle font-semibold">{listTitle} <span className="text-muted font-normal tnum">({mainPairs.length})</span></h2>
          {(filter || pairFocus) && <button className={cls.quiet} onClick={() => { setFilter(null); setPairFocus(null); }}>{t('Show all to discuss')}</button>}
        </div>
        {mainPairs.length === 0 ? <div className={cls.card}><EmptyLine>{filter || pairFocus ? t('Nothing here.') : t('Nothing to discuss. Nice.')}</EmptyLine></div> : (
          <ul className={`${cls.card} divide-y divide-border overflow-hidden`}>
            {mainPairs.map(renderPair)}
          </ul>
        )}
        {quietPairs.length > 0 && (
          <div className="mt-3">
            <Disclosure summary={<>{t('Bottlenecks')} <span className="tnum">({quietPairs.length})</span></>}>
              <ul className={`${cls.card} divide-y divide-border overflow-hidden`}>{quietPairs.map((p) => renderPair(p, -1))}</ul>
            </Disclosure>
          </div>
        )}
      </section>

      <div className="mt-8 flex items-center gap-3">
        <button className="inline-flex items-center h-7 px-1.5 rounded-control text-caption font-medium text-accent hover:underline focus-ring" aria-expanded={showMatrix} aria-controls="align-matrix" onClick={() => setShowMatrix((v) => !v)}>{showMatrix ? t('Hide matrix') : t('Show matrix')}</button>
      </div>
      {showMatrix && (
        <section id="align-matrix" className={`${cls.card} mt-2 p-3 overflow-x-auto anim-slide-in-up`} aria-label={t('Team matrix')} data-tour="matrix">
          <table className="text-caption tnum">
            <thead><tr><th className="p-1.5 text-left font-medium text-muted whitespace-nowrap" scope="col">{t('asks ↓ provides →')}</th>{state.teams.map((x) => <th key={x.id} className="p-1.5 font-medium text-ink-2 whitespace-nowrap" scope="col">{x.name}</th>)}</tr></thead>
            <tbody>
              {state.teams.map((r) => (
                <tr key={r.id}>
                  <th className="p-1.5 text-left font-medium text-ink-2 whitespace-nowrap" scope="row">{r.name}</th>
                  {state.teams.map((c) => {
                    if (r.id === c.id) return <td key={c.id} className="p-1.5"><span className="block w-10 h-7 rounded-control bg-surface-2" aria-hidden="true" /></td>;
                    const ds = deps.filter((d) => d.requesterTeamId === r.id && d.providerTeamId === c.id);
                    if (!ds.length) return <td key={c.id} className="p-1.5 text-center text-faint" aria-label={t('{requester} asks nothing of {provider}', { requester: r.name, provider: c.name })}>·</td>;
                    const worst = ds.map((d) => normAsk(d.response)).sort((a, b) => ASK_SEVERITY[b] - ASK_SEVERITY[a])[0];
                    const focused = pairFocus?.req === r.id && pairFocus?.prov === c.id;
                    return (
                      <td key={c.id} className="p-1.5 text-center">
                        <button onClick={() => { setPairFocus(focused ? null : { req: r.id, prov: c.id }); setFilter(null); document.querySelector('[data-tour="pairs"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} aria-pressed={focused}
                          aria-label={t('{requester} asks {provider}: {n}, worst answer {answer}', { requester: r.name, provider: c.name, n: ds.length, answer: t(ASK_META[worst].label) })}
                          className={`inline-flex items-center justify-center gap-1 w-10 h-7 rounded-control border font-semibold transition-base focus-ring ${toneClass(ASK_META[worst].tone)} ${toneBorder(ASK_META[worst].tone)} ${focused ? 'ring-2 ring-accent' : ''}`}>
                          {ds.length}<AskIcon response={worst} size={11} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
    </div>
  );
}

// One ask inside a pair: rank · epic · what · reason, with the segmented answer control for the provider's
// planner or an admin (item 15) so the meeting records its outcome here; others see the status chip.
function PairAsk({ dep, epic, rank, bottleneck, mayAnswer, act, onOpen }) {
  const t = useT();
  const [reasonFor, setReasonFor] = useState(null);
  const pick = async (response) => {
    if (response === dep.response) return;
    if (REASON_REQUIRED.has(response)) { setReasonFor(response); return; }
    setReasonFor(null);
    await act('answerDependency', dep.id, { response, reason: '' });
  };
  const labelId = `pair-ask-${dep.id}`;
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
        <RankNo rank={rank} size="sm" />
        <div className="flex-1 min-w-[200px]">
          <div id={labelId} className="text-body"><button className="font-medium hover:underline text-left focus-ring rounded-control" onClick={onOpen}>{epic?.title}</button><span className="text-muted"> · {dep.ask}</span>{(dep.size || dep.effortHigh > 0) && <span className="text-caption text-faint tnum"> · {dep.size ? `${dep.size} · ` : ''}{dep.effortLow === dep.effortHigh ? dep.effortHigh : `${dep.effortLow}–${dep.effortHigh}`} pw</span>}</div>
          {dep.responseReason && reasonFor == null && <p className="text-label text-muted mt-0.5">{dep.responseReason}</p>}
        </div>
        <BottleneckChip kind={bottleneck} />
        <SignalChip dep={dep} />
        {mayAnswer ? <AnswerControl value={dep.response} onPick={pick} labelledBy={labelId} /> : <StatusChip response={dep.response} />}
      </div>
      {reasonFor && (
        <div className="pl-9 pt-1">
          <InlineReason required defaultValue={dep.responseReason || ''} placeholder={t('What stands in the way?')}
            onSave={async (reason) => { const r = await act('answerDependency', dep.id, { response: reasonFor, reason }); if (r.ok) setReasonFor(null); }} onCancel={() => setReasonFor(null)} />
        </div>
      )}
    </li>
  );
}

import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Table2, ArrowRight } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { ASK_META, needsTalk } from '../domain/model';
import { planFor, byId } from '../domain/plan';
import { useT } from '../i18n';
import { cls, StatusChip, AskIcon, RankNo, toneClass, EmptyLine, ViewHeader } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';
import { useTourNudge } from '../components/plan/TourPanel';

// Screen 3 — Afstemmen (docs/design.md section 19, D26): four counts, the "Te bespreken" pairs sorted by the
// highest-ranked epic involved (the agenda of the alignment meeting) and an optional team x team matrix.
const STATES = ['proposed', 'accepted', 'needs_priority_call', 'declined'];
const norm = (r) => (r === 'partial' ? 'accepted' : r === 'deferred' ? 'needs_priority_call' : r);
const SEVERITY = { declined: 3, needs_priority_call: 2, proposed: 1, accepted: 0 };

export function AlignView() {
  const { state, quarter } = usePlan();
  const t = useT();
  const [filter, setFilter] = useState(null); // null = Bespreken + Kan niet
  const [pairFocus, setPairFocus] = useState(null); // { req, prov } from the matrix
  const [showMatrix, setShowMatrix] = useState(false);
  const [openEpic, setOpenEpic] = useState(null);
  useTourNudge(useCallback((d) => { if (d.matrix != null) setShowMatrix(!!d.matrix); }, []));
  const epics = useMemo(() => byId(state.epics), [state.epics]);
  const teams = useMemo(() => byId(state.teams), [state.teams]);
  if (!quarter) return <NoQuarter />;

  const deps = state.dependencies.filter((d) => d.quarterId === quarter.id);
  const counts = Object.fromEntries(STATES.map((s) => [s, deps.filter((d) => norm(d.response) === s).length]));
  const rankOf = (d) => planFor(state, d.epicId, quarter.id)?.rank ?? 1e9;
  const inScope = (d) => (pairFocus ? d.requesterTeamId === pairFocus.req && d.providerTeamId === pairFocus.prov : filter ? norm(d.response) === filter : needsTalk(d.response) || d.response === 'deferred');

  const pairs = [];
  for (const d of deps.filter(inScope)) {
    const key = `${d.requesterTeamId}|${d.providerTeamId}`;
    let p = pairs.find((x) => x.key === key);
    if (!p) { p = { key, req: d.requesterTeamId, prov: d.providerTeamId, deps: [] }; pairs.push(p); }
    p.deps.push(d);
  }
  pairs.forEach((p) => { p.deps.sort((a, b) => rankOf(a) - rankOf(b)); p.top = rankOf(p.deps[0]); });
  pairs.sort((a, b) => a.top - b.top || b.deps.length - a.deps.length);
  const listTitle = pairFocus ? `${teams.get(pairFocus.req)?.name} → ${teams.get(pairFocus.prov)?.name}` : filter ? t(ASK_META[filter].label) : t('To discuss');

  return (
    <div data-tour="align">
      <ViewHeader title={t('Align')} right={<button className={`${cls.secondary} ${showMatrix ? 'bg-surface-2' : ''}`} aria-pressed={showMatrix} onClick={() => setShowMatrix((v) => !v)}><Table2 size={14} aria-hidden="true" />{t('Matrix')}</button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-tour="tiles">
        {STATES.map((s) => {
          const m = ASK_META[s]; const active = filter === s && !pairFocus;
          return (
            <button key={s} aria-pressed={active} onClick={() => { setPairFocus(null); setFilter(active ? null : s); }}
              className={`${cls.card} text-left px-4 py-3 transition-base hover:border-border-strong focus-ring ${active ? 'border-accent ring-1 ring-accent' : ''}`}>
              <div className="flex items-center justify-between"><span className="text-label text-muted">{t(m.label)}</span><span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border ${toneClass(m.tone)}`}><AskIcon response={s} size={12} /></span></div>
              <div className="text-hero font-semibold tnum mt-1">{counts[s]}</div>
            </button>
          );
        })}
      </div>

      <section aria-label={listTitle} data-tour="pairs">
        <div className="flex items-center gap-3 mb-2 min-h-8">
          <h2 className="text-subtitle font-semibold">{listTitle} <span className="text-muted font-normal tnum">({pairs.length})</span></h2>
          {(filter || pairFocus) && <button className={cls.quiet} onClick={() => { setFilter(null); setPairFocus(null); }}>{t('Show all to discuss')}</button>}
        </div>
        {pairs.length === 0 ? <div className={cls.card}><EmptyLine>{filter || pairFocus ? t('Nothing here.') : t('Nothing to discuss. Nice.')}</EmptyLine></div> : (
          <ul className="space-y-2">
            {pairs.map((p, i) => (
              <li key={p.key}>
                <details className={`group ${cls.card} overflow-hidden`} open={i === 0 || !!pairFocus}>
                  <summary className="list-none cursor-pointer select-none flex items-center gap-3 px-3 h-11 hover:bg-surface-2 focus-ring-inset">
                    <ChevronDown size={14} className="text-muted transition-transform group-open:rotate-180 shrink-0" aria-hidden="true" />
                    <RankNo rank={p.top === 1e9 ? null : p.top} size="sm" />
                    <span className="text-body font-medium flex items-center gap-1.5 min-w-0"><span className="truncate">{teams.get(p.req)?.name}</span><ArrowRight size={13} className="text-muted shrink-0" aria-hidden="true" /><span className="truncate">{teams.get(p.prov)?.name}</span></span>
                    <span className="ml-auto flex items-center gap-1">
                      {STATES.filter((s) => p.deps.some((d) => norm(d.response) === s)).sort((a, b) => SEVERITY[b] - SEVERITY[a]).slice(0, 2).map((s) => (
                        <span key={s} className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 h-5 text-micro font-semibold tnum ${toneClass(ASK_META[s].tone)}`} aria-label={`${p.deps.filter((d) => norm(d.response) === s).length} ${t(ASK_META[s].label)}`}>{p.deps.filter((d) => norm(d.response) === s).length}<AskIcon response={s} size={10} /></span>
                      ))}
                    </span>
                  </summary>
                  <ul className="border-t border-border divide-y divide-border">
                    {p.deps.map((d) => { const e = epics.get(d.epicId); const r = planFor(state, d.epicId, quarter.id)?.rank; return (
                      <li key={d.id} className="px-3 py-2 flex items-start gap-3">
                        <RankNo rank={r} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-body"><button className="font-medium hover:underline text-left focus-ring rounded-control" onClick={() => setOpenEpic(d.epicId)}>{e?.title}</button><span className="text-muted"> · {d.ask}</span></div>
                          {d.responseReason && <p className="text-caption text-muted mt-0.5">{d.responseReason}</p>}
                        </div>
                        <StatusChip response={d.response} />
                      </li>); })}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showMatrix && (
        <section className={`${cls.card} mt-6 p-3 overflow-x-auto anim-slide-in-up`} aria-label={t('Team matrix')} data-tour="matrix">
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
                    const worst = ds.map((d) => norm(d.response)).sort((a, b) => SEVERITY[b] - SEVERITY[a])[0];
                    const focused = pairFocus?.req === r.id && pairFocus?.prov === c.id;
                    return (
                      <td key={c.id} className="p-1.5 text-center">
                        <button onClick={() => { setPairFocus(focused ? null : { req: r.id, prov: c.id }); setFilter(null); document.querySelector('[data-tour="pairs"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} aria-pressed={focused}
                          aria-label={t('{requester} asks {provider}: {n}, worst answer {answer}', { requester: r.name, provider: c.name, n: ds.length, answer: t(ASK_META[worst].label) })}
                          className={`inline-flex items-center justify-center gap-1 w-10 h-7 rounded-control border font-semibold transition-base focus-ring ${toneClass(ASK_META[worst].tone)} ${focused ? 'ring-2 ring-accent' : ''}`}>
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

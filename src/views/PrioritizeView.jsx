import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, ArrowUp, ArrowDown, Plus, Search, ListOrdered, Check, Columns3 } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canRank, isPlanner, isAdmin } from '../data/repository';
import { isLockedPhase, cyclePhase } from '../domain/model';
import { followsOf } from '../domain/follows';
import { epicDeps, byId } from '../domain/plan';
import { strategyCounts, activeThemes, effectiveMust, valueScore } from '../domain/value';
import { teamCapacity } from '../domain/capacity';
import { committedEpicIds } from '../domain/rhythm';
import { useT } from '../i18n';
import { cls, RankNo, WorstIssue, InlineReason, EmptyLine, Disclosure, ViewHeader, quarterMeta, Dialog, ErrorLine, MustChip, ValueChip, CapacityLine, FollowStar, Menu, MenuLabel, menuItem } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Screen 1 — Prioriteren (docs/design.md section 19, D26/D28; Release A section 21, D42/D43). One ranked table; drag
// or use the arrow buttons to reorder; the moved row shows an inline optional reason; unranked epics sit in a collapsed
// "Backlog (n)" group (item I). Above the table one strategy line (top-10 per goal) that filters; one filter select for teams and goals.
// Release B (section 22): a compact capacity line when filtered to one team (L3) and the worst signal in the
// dependency cell (L8, inside WorstIssue). Section 23: read-only once the quarter is Afgesloten (M4); "Gevolgd (n)"
// at the top of the filter and a small star after followed titles (M8).
const TOP_N = 10;
// Kolomkeuze (section 24, D78): optional columns, per user per device. Title and rank always show.
const COLS = [
  { id: 'team', label: 'Team', on: true },
  { id: 'owner', label: 'Owner', on: true },
  { id: 'value', label: 'Value', on: true, needsModel: true },
  { id: 'deps', label: 'Dependencies', on: true },
  { id: 'goal', label: 'Strategic goal', on: false },
];
const COLS_KEY = 'kp.prioCols';
const defaultCols = () => Object.fromEntries(COLS.map((c) => [c.id, c.on]));
// Stored choices for columns that no longer exist (Aantal merged into Afhankelijkheden, item F) are dropped.
const readCols = () => { try { const saved = JSON.parse(localStorage.getItem(COLS_KEY) || '{}'); return { ...defaultCols(), ...Object.fromEntries(Object.entries(saved).filter(([k]) => COLS.some((c) => c.id === k))) }; } catch { return defaultCols(); } };
const writeCols = (v) => { try { localStorage.setItem(COLS_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
export function PrioritizeView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(''); // '' | team:<id> | goal:<id> | goal:none (D42)
  const [pending, setPending] = useState(null); // { order: planId[], movedId } — a draft until "Opslaan"
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const [cols, setCols] = useState(readCols);
  const toggleCol = (id) => setCols((c) => { const n = { ...c, [id]: !c[id] }; writeCols(n); return n; });
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const runRef = useRef(run); runRef.current = run;
  const quarterRef = useRef(quarter); quarterRef.current = quarter;
  // Leaving the screen with an unsaved draft order: save it without a reason rather than lose the move.
  useEffect(() => () => { const p = pendingRef.current; if (p && quarterRef.current) runRef.current('reorderPlans', quarterRef.current.id, p.order, ''); }, []);
  useEffect(() => { if (!flashId) return undefined; const id = setTimeout(() => setFlashId(null), 1300); return () => clearTimeout(id); }, [flashId]);

  const epics = useMemo(() => byId(state.epics), [state.epics]);
  const teams = useMemo(() => byId(state.teams), [state.teams]);
  const themes = useMemo(() => byId(state.themes), [state.themes]);
  const model = state.settings.valueModel || 'none';
  const show = (id) => !!cols[id] && (id !== 'value' || model !== 'none');
  const nCols = 4 + COLS.filter((c) => show(c.id)).length; // drag, rank, title, reorder + optional
  const tbodyRef = useRef(null);
  const rectsRef = useRef(new Map());
  // FLIP: rows that changed vertical position since the last paint glide there instead of snapping.
  useLayoutEffect(() => {
    const rows = [...(tbodyRef.current?.querySelectorAll('tr[data-plan]') || [])];
    const prev = rectsRef.current; const next = new Map();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const el of rows) {
      const top = el.getBoundingClientRect().top; next.set(el.dataset.plan, top);
      const was = prev.get(el.dataset.plan);
      if (reduce || was == null || Math.abs(was - top) < 1) continue;
      el.style.transition = 'none'; el.style.transform = `translateY(${was - top}px)`;
      requestAnimationFrame(() => { el.style.transition = 'transform 260ms var(--ease-out)'; el.style.transform = ''; });
    }
    rectsRef.current = next;
  });
  if (!quarter) return <NoQuarter />;

  const plansQ = state.plans.filter((p) => p.quarterId === quarter.id);
  const rankedBase = plansQ.filter((p) => p.rank != null).sort((a, b) => a.rank - b.rank);
  const order = pending ? pending.order.map((id) => plansQ.find((p) => p.id === id)).filter(Boolean) : rankedBase;
  const orderIds = new Set(order.map((p) => p.id));
  const unranked = plansQ.filter((p) => !orderIds.has(p.id));
  const planning = cyclePhase(quarter.phase) === 'Planning';
  const closed = quarter.phase === 'closed'; // Afgesloten: no drag, no arrows (M4)
  const mayRank = canRank(actor) && !closed;
  const mayAdd = isPlanner(actor) && planning; // "+ Epic" only while planning (item G)
  const followed = followsOf(state, actor.id);
  const followedN = plansQ.filter((p) => followed.has(p.epicId)).length;
  // Searching or filtering (team or goal) hides rows, so the visible order is no longer 1..n: reordering pauses.
  const searching = query.trim().length > 0 || filter !== '';
  const canDrag = mayRank && !searching;
  const [fKind, fId] = filter.split(':');
  const match = (p) => {
    const e = epics.get(p.epicId);
    if (fKind === 'followed' && !followed.has(p.epicId)) return false;
    if (fKind === 'team' && e?.teamId !== fId) return false;
    if (fKind === 'goal' && (fId === 'none' ? !!e?.themeId && themes.has(e.themeId) : e?.themeId !== fId)) return false;
    return !query.trim() || `${e?.refCode} ${e?.title} ${teams.get(e?.teamId)?.name} ${themes.get(e?.themeId)?.name || ''}`.toLowerCase().includes(query.trim().toLowerCase());
  };
  const strategy = strategyCounts(state, quarter.id, TOP_N);
  const goals = activeThemes(state.themes);
  const teamCap = fKind === 'team' && teams.has(fId) ? teamCapacity(state, fId, quarter.id) : null;

  const applyOrder = (ids, movedId) => { setPending({ order: ids, movedId }); setErr(null); };
  const moveTo = (planId, toIndex) => {
    const ids = order.map((p) => p.id).filter((id) => id !== planId);
    ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, planId);
    applyOrder(ids, planId);
  };
  const nudge = (planId, delta) => { const i = order.findIndex((p) => p.id === planId); if (i < 0) return; moveTo(planId, i + delta); };
  const addToList = (planId) => applyOrder([...order.map((p) => p.id), planId], planId);
  const commit = async (reason) => {
    const r = await run('reorderPlans', quarter.id, pending.order, reason);
    if (!r.ok) { setErr(r.error); return; }
    setFlashId(pending.movedId); setPending(null); setErr(null);
    requestAnimationFrame(() => document.getElementById(`row-${pending.movedId}`)?.focus());
  };
  const cancel = () => { setPending(null); setErr(null); };

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const to = order.findIndex((p) => p.id === targetId);
    moveTo(dragId, to);
    setDragId(null); setOverId(null);
  };

  // Plain render function (not a component) so the inline reason input keeps focus across re-renders.
  const renderRow = (p, index, inList, muted = false) => {
    const e = epics.get(p.epicId); if (!e) return null;
    const deps = epicDeps(state, e.id, quarter.id);
    const isMoved = pending?.movedId === p.id;
    const dragging = dragId === p.id;
    return (
      <React.Fragment key={p.id}>
        <tr id={`row-${p.id}`} data-plan={p.id} tabIndex={0} draggable={canDrag && inList} aria-selected={openEpic === e.id || undefined}
          onDragStart={(ev) => { setDragId(p.id); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', p.id); }}
          onDragOver={(ev) => { if (canDrag && inList && dragId) { ev.preventDefault(); if (overId !== p.id) setOverId(p.id); } }}
          onDragLeave={() => { if (overId === p.id) setOverId(null); }}
          onDrop={(ev) => { ev.preventDefault(); onDrop(p.id); }} onDragEnd={() => { setDragId(null); setOverId(null); }}
          onClick={(ev) => { if (!ev.target.closest('button, input, a')) setOpenEpic(e.id); }}
          onKeyDown={(ev) => {
            if (ev.target !== ev.currentTarget) return;
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpenEpic(e.id); }
            if (canDrag && inList && ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); nudge(p.id, ev.key === 'ArrowUp' ? -1 : 1); }
          }}
          className={`group relative h-row cursor-pointer transition-base focus-ring-inset ${dragging ? 'opacity-40' : ''} ${overId === p.id && dragId !== p.id ? 'shadow-[inset_0_2px_0_0_var(--color-accent-500)]' : ''} ${flashId === p.id ? 'anim-flash' : isMoved ? 'bg-accent-50' : 'hover:bg-surface-2'}`}>
          <td className="w-7 pl-2">
            {canDrag && inList ? <span title={t('Drag, or Alt+↑/↓')}><GripVertical size={14} className="text-muted group-hover:text-ink" aria-hidden="true" /></span> : null}
          </td>
          <td className="w-10 pr-2"><RankNo rank={inList ? index + 1 : null} size="sm" /></td>
          <td className="pr-3 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`text-body truncate ${muted ? 'text-muted' : 'text-ink'}`}>{e.title}</span>
              <FollowStar on={followed.has(e.id)} />
              <MustChip must={effectiveMust(e, themes.get(e.themeId))} className="shrink-0" />
            </div>
          </td>
          {show('team') && <td className="w-44 pr-3 text-label text-muted truncate">{teams.get(e.teamId)?.name}</td>}
          {show('owner') && <td className="w-36 pr-3 text-label text-muted truncate">{e.ownerName}</td>}
          {show('value') && <td className="w-14 pr-2"><ValueChip model={model} score={valueScore(model, e.value, p)} /></td>}
          {show('deps') && <td className="w-72 pr-3"><WorstIssue deps={deps} teams={teams} /></td>}
          {show('goal') && <td className="w-44 pr-3 text-label text-muted truncate">{themes.get(e.themeId)?.name}</td>}
          <td className="w-20 pr-2">
            {mayRank && (inList ? (
              <span className={`inline-flex gap-0.5 transition-base ${searching ? 'invisible' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
                <button className={cls.icon} aria-label={t('Move up')} disabled={index === 0} onClick={() => nudge(p.id, -1)}><ArrowUp size={14} /></button>
                <button className={cls.icon} aria-label={t('Move down')} disabled={index === order.length - 1} onClick={() => nudge(p.id, 1)}><ArrowDown size={14} /></button>
              </span>
            ) : <button className={`${cls.quiet} opacity-0 group-hover:opacity-100 group-focus-within:opacity-100`} onClick={() => addToList(p.id)}><ListOrdered size={13} aria-hidden="true" />{t('Rank')}</button>)}
          </td>
        </tr>
        {isMoved && (
          <tr className="bg-accent-50"><td colSpan={nCols} className="pl-[76px] pr-4 pb-3 pt-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-label text-accent-700 whitespace-nowrap tnum">{t('Moved to #{n}', { n: index + 1 })}</span>
              <InlineReason required={isLockedPhase(quarter.phase)} onSave={commit} onCancel={cancel} error={err} />
            </div>
          </td></tr>
        )}
      </React.Fragment>
    );
  };

  const visible = order.filter(match);
  const visibleUnranked = unranked.filter(match);
  // Uitvoering / Afgesloten (item D, D80): the ranked list splits into "Toegezegd dit kwartaal" and a muted
  // "Niet toegezegd" group; rank numbers stay. Planning shows one list.
  const committed = planning ? null : committedEpicIds(state, quarter.id);
  const groups = committed ? [
    { key: 'yes', label: 'Committed this quarter', rows: visible.filter((p) => committed.has(p.epicId)), muted: false },
    { key: 'no', label: 'Not committed', rows: visible.filter((p) => !committed.has(p.epicId)), muted: true },
  ].filter((g) => g.rows.length > 0) : null;
  const groupRow = (g) => (
    <tr key={`g-${g.key}`} className="bg-surface-2"><th colSpan={nCols} scope="rowgroup" className={`h-8 px-3 text-left text-caption font-medium tnum ${g.muted ? 'text-faint' : 'text-muted'}`}>{t(g.label)} ({g.rows.length})</th></tr>
  );

  return (
    <div className="pr-0" data-tour="prioritize">
      <ViewHeader title={t(planning ? 'Prioritise' : 'Priorities')} meta={`${quarterMeta(quarter, t)} · ${t('{n} epics', { n: plansQ.length })}`} right={
        <>
          <label className="sr-only" htmlFor="prio-filter">{t('Filter')}</label>
          <select id="prio-filter" className={`${cls.input} !w-auto max-w-[220px]`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">{t('All')}</option>
            <option value="followed:me">{t('Followed ({n})', { n: followedN })}</option>
            <optgroup label={t('Teams')}>{state.teams.map((x) => <option key={x.id} value={`team:${x.id}`}>{x.name}</option>)}</optgroup>
            {goals.length > 0 && <optgroup label={t('Goals')}>{goals.map((x) => <option key={x.id} value={`goal:${x.id}`}>{x.name}</option>)}<option value="goal:none">{t('Without goal')}</option></optgroup>}
          </select>
          <Menu ariaLabel={t('Columns')} width="w-56" button={({ ref, toggle, open, ...a }) => (
            <button ref={ref} onClick={toggle} {...a} className={cls.secondary} data-tour="columns"><Columns3 size={14} aria-hidden="true" />{t('Columns')}</button>)}>
            <MenuLabel>{t('Columns')}</MenuLabel>
            {COLS.filter((c) => !c.needsModel || model !== 'none').map((c) => (
              <button key={c.id} role="menuitemcheckbox" aria-checked={!!cols[c.id]} className={menuItem} onClick={() => toggleCol(c.id)}>
                <span className="w-4 inline-flex justify-center">{cols[c.id] && <Check size={14} aria-hidden="true" />}</span>{t(c.label)}
              </button>
            ))}
          </Menu>
          <label className="relative"><Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" /><input type="search" className={`${cls.input} !w-52 !pl-7`} placeholder={t('Search')} aria-label={t('Search epics')} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          {mayAdd && <button className={cls.primary} onClick={() => setAdding(true)} data-tour="add-epic"><Plus size={14} aria-hidden="true" />{t('Epic')}</button>}
        </>
      } />

      {goals.length > 0 && strategy.top > 0 && planning && (() => {
        // Iteration 1 (item 1): goals with epics in the top N first ("Klantcontact 5"), empty goals muted at the end.
        const goalBtn = (id, label, n, muted) => {
          const active = filter === `goal:${id}`;
          return (
            <button key={id} type="button" aria-pressed={active} onClick={() => setFilter(active ? '' : `goal:${id}`)}
              className={`inline-flex items-center gap-1 h-6 px-1.5 rounded-control transition-base focus-ring ${active ? 'bg-accent-50 text-accent-700 font-medium' : muted ? 'text-faint hover:text-muted hover:bg-surface-2' : 'text-ink-2 hover:bg-surface-2'}`}>
              {label}{n != null && <span className="font-semibold">{n}</span>}
            </button>
          );
        };
        const used = strategy.rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
        const empty = strategy.rows.filter((r) => r.n === 0);
        const dot = (k) => <span key={k} className="text-faint" aria-hidden="true">·</span>;
        const parts = used.map((r) => goalBtn(r.theme.id, r.theme.name, r.n, false));
        if (strategy.none > 0) parts.push(goalBtn('none', t('without goal'), strategy.none, false));
        return (
          <p className="mb-3 text-label tnum flex items-center gap-x-1 flex-wrap" data-tour="strategy">
            <span className="font-medium text-ink mr-1">{t('Top {n} per goal', { n: strategy.top })}:</span>
            {parts.flatMap((x, i) => (i ? [dot(`d${i}`), x] : [x]))}
            {empty.length > 0 && <><span className="text-faint ml-2">{t('none')}:</span>{empty.flatMap((r, i) => { const b = goalBtn(r.theme.id, r.theme.name, null, true); return i ? [<span key={`e${i}`} className="text-faint" aria-hidden="true">,</span>, b] : [b]; })}</>}
          </p>
        );
      })()}

      {teamCap && <p className="mb-3 flex items-center gap-2 min-h-7" data-tour="team-capacity"><span className="text-label font-medium text-ink">{teams.get(fId)?.name}</span><CapacityLine cap={teamCap} compact /></p>}

      {plansQ.length === 0 ? (
        <div className={cls.card}><EmptyLine action={mayAdd && <button className={cls.primary} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />{t('Epic')}</button>}>{t('No epics in this quarter yet.')}</EmptyLine></div>
      ) : (
        <div className={`${cls.card} panel-table overflow-hidden`}>
          <table className="w-full text-body" aria-label={t('Ranked epics')}>
            <thead>
              <tr className="text-caption text-muted text-left border-b border-border">
                <th className="h-9 w-7" scope="col"><span className="sr-only">{t('Drag')}</span></th>
                <th className="w-10 pr-2 font-medium" scope="col"><span className="inline-flex w-6 justify-center">#</span></th>
                <th className="font-medium" scope="col">{t('Epic')}</th>
                {show('team') && <th className="w-44 font-medium" scope="col">{t('Team')}</th>}
                {show('owner') && <th className="w-36 font-medium" scope="col">{t('Owner')}</th>}
                {show('value') && <th className="w-14 font-medium" scope="col">{t('Value')}</th>}
                {show('deps') && <th className="w-72 font-medium" scope="col">{t('Dependencies')}</th>}
                {show('goal') && <th className="w-44 font-medium" scope="col">{t('Strategic goal')}</th>}
                <th className="w-20" scope="col"><span className="sr-only">{t('Reorder')}</span></th>
              </tr>
            </thead>
            <tbody ref={tbodyRef} className="divide-y divide-border">
              {groups ? groups.map((g) => [groupRow(g), ...g.rows.map((p) => renderRow(p, order.indexOf(p), true, g.muted))]) : visible.map((p) => renderRow(p, order.indexOf(p), true))}
              {visible.length === 0 && <tr><td colSpan={nCols}><EmptyLine>{searching ? t('No match.') : t('Nothing ranked yet.')}</EmptyLine></td></tr>}
            </tbody>
          </table>
          {unranked.length > 0 && (
            <div className="border-t border-border px-3 py-2 bg-surface-2">
              <Disclosure summary={<>{t('Backlog')} <span className="tnum">({unranked.length})</span></>}>
                <table className="w-full text-body" aria-label={t('Backlog')}>
                  <tbody className="divide-y divide-border">{visibleUnranked.map((p, i) => renderRow(p, i, false))}</tbody>
                </table>
              </Disclosure>
            </div>
          )}
        </div>
      )}

      {openEpic && <SimpleEpicPanel epicId={openEpic} onClose={() => setOpenEpic(null)} />}
      {adding && <NewEpicDialog onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setOpenEpic(id); }} />}
    </div>
  );
}

// "+ Epic": title + team, planned as draft in the selected quarter. Admins pick the team; planners get their own.
function NewEpicDialog({ onClose, onCreated }) {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const teams = isAdmin(actor) ? state.teams : state.teams.filter((x) => x.id === actor.teamId);
  const [title, setTitle] = useState('');
  const [teamId, setTeamId] = useState(teams[0]?.id || '');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const locked = isLockedPhase(quarter.phase);
  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Title is required');
    const r = await run('createEpic', { teamId, title: title.trim(), ownerName: actor.name });
    if (!r.ok) return setErr(r.error);
    const r2 = await run('upsertPlan', { epicId: r.result.id, quarterId: quarter.id, commitment: 'draft', effortLow: 0, effortHigh: 0 }, reason);
    if (!r2.ok) return setErr(r2.error);
    return onCreated(r.result.id);
  };
  return (
    <Dialog title={t('New epic')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block"><span className={cls.label}>{t('Title')}</span><input className={cls.input} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        {teams.length > 1 && <label className="block"><span className={cls.label}>{t('Team')}</span><select className={cls.input} value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {locked && <label className="block"><span className={cls.label}>{t('Why? (quarter is locked)')}</span><input className={cls.input} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        <ErrorLine error={err} />
        <div className="flex justify-end gap-2 pt-1"><button type="button" className={cls.secondary} onClick={onClose}>{t('Cancel')}</button><button type="submit" className={cls.primary}>{t('Create')}</button></div>
      </form>
    </Dialog>
  );
}

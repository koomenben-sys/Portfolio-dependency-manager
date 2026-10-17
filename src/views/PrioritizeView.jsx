import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, ArrowUp, ArrowDown, Plus, Search, ListOrdered } from 'lucide-react';
import { usePlan } from '../context/PlanContext';
import { canRank, isPlanner, isAdmin } from '../data/repository';
import { isLockedPhase, needsTalk } from '../domain/model';
import { epicDeps, byId } from '../domain/plan';
import { useT } from '../i18n';
import { cls, RankNo, DepSummary, CommitmentChip, InlineReason, EmptyLine, Disclosure, ViewHeader, Dialog, ErrorLine } from '../components/plan/core';
import { NoQuarter } from '../components/plan/NoQuarter';
import { SimpleEpicPanel } from '../components/plan/SimpleEpicPanel';

// Screen 1 — Prioriteren (docs/design.md section 19, D26/D28). One ranked table; drag or use the arrow
// buttons to reorder; the moved row shows an inline optional reason; unranked epics sit in a collapsed group.
export function PrioritizeView() {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const [openEpic, setOpenEpic] = useState(null);
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null); // { order: planId[], movedId } — a draft until "Opslaan"
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const [err, setErr] = useState(null);
  const [adding, setAdding] = useState(false);
  const pendingRef = useRef(pending); pendingRef.current = pending;
  const runRef = useRef(run); runRef.current = run;
  const quarterRef = useRef(quarter); quarterRef.current = quarter;
  // Leaving the screen with an unsaved draft order: save it without a reason rather than lose the move.
  useEffect(() => () => { const p = pendingRef.current; if (p && quarterRef.current) runRef.current('reorderPlans', quarterRef.current.id, p.order, ''); }, []);
  useEffect(() => { if (!flashId) return undefined; const id = setTimeout(() => setFlashId(null), 1300); return () => clearTimeout(id); }, [flashId]);

  const epics = useMemo(() => byId(state.epics), [state.epics]);
  const teams = useMemo(() => byId(state.teams), [state.teams]);
  if (!quarter) return <NoQuarter />;

  const plansQ = state.plans.filter((p) => p.quarterId === quarter.id);
  const rankedBase = plansQ.filter((p) => p.rank != null).sort((a, b) => a.rank - b.rank);
  const order = pending ? pending.order.map((id) => plansQ.find((p) => p.id === id)).filter(Boolean) : rankedBase;
  const orderIds = new Set(order.map((p) => p.id));
  const unranked = plansQ.filter((p) => !orderIds.has(p.id));
  const mayRank = canRank(actor) && quarter.phase !== 'closed';
  const mayAdd = isPlanner(actor) && quarter.phase !== 'closed';
  const searching = query.trim().length > 0;
  const canDrag = mayRank && !searching;
  const match = (p) => { const e = epics.get(p.epicId); return !searching || `${e?.refCode} ${e?.title} ${teams.get(e?.teamId)?.name}`.toLowerCase().includes(query.trim().toLowerCase()); };

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
  const renderRow = (p, index, inList) => {
    const e = epics.get(p.epicId); if (!e) return null;
    const deps = epicDeps(state, e.id, quarter.id);
    const talk = deps.some((d) => needsTalk(d.response));
    const worst = deps.some((d) => d.response === 'declined') ? 'bg-danger' : talk ? 'bg-warn' : null;
    const isMoved = pending?.movedId === p.id;
    const dragging = dragId === p.id;
    return (
      <React.Fragment key={p.id}>
        <tr id={`row-${p.id}`} tabIndex={0} draggable={canDrag && inList} aria-selected={openEpic === e.id || undefined}
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
          <td className="w-7 pl-2 relative">
            {worst && <span className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-full ${worst}`} aria-hidden="true" />}
            {canDrag && inList ? <GripVertical size={14} className="text-faint group-hover:text-muted" aria-hidden="true" /> : null}
          </td>
          <td className="w-10 pr-2"><RankNo rank={inList ? index + 1 : null} size="sm" /></td>
          <td className="pr-3 min-w-0">
            <div className="flex items-baseline gap-2 min-w-0"><span className="text-body font-medium text-ink truncate">{e.title}</span><span className="text-caption text-faint mono shrink-0">{e.refCode}</span></div>
          </td>
          <td className="w-44 pr-3 text-label text-ink-2 truncate">{teams.get(e.teamId)?.name}</td>
          <td className="w-36 pr-3"><DepSummary deps={deps} /></td>
          <td className="w-36 pr-3 hidden md:table-cell"><CommitmentChip value={p.commitment} /></td>
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
          <tr className="bg-accent-50"><td colSpan={7} className="px-10 pb-3 pt-1">
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

  return (
    <div className="pr-0" data-tour="prioritize">
      <ViewHeader title={t('Prioritise')} meta={t('{n} epics', { n: plansQ.length })} right={
        <>
          <label className="relative"><Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" /><input type="search" className={`${cls.input} !w-52 !pl-7`} placeholder={t('Search')} aria-label={t('Search epics')} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          {mayAdd && <button className={cls.primary} onClick={() => setAdding(true)} data-tour="add-epic"><Plus size={14} aria-hidden="true" />{t('Epic')}</button>}
        </>
      } />

      {plansQ.length === 0 ? (
        <div className={cls.card}><EmptyLine action={mayAdd && <button className={cls.primary} onClick={() => setAdding(true)}><Plus size={14} aria-hidden="true" />{t('Epic')}</button>}>{t('No epics in this quarter yet.')}</EmptyLine></div>
      ) : (
        <div className={`${cls.card} overflow-hidden`}>
          <table className="w-full text-body" aria-label={t('Ranked epics')}>
            <thead>
              <tr className="text-caption text-muted text-left border-b border-border">
                <th className="h-9 w-7" scope="col"><span className="sr-only">{t('Drag')}</span></th>
                <th className="w-10 font-medium" scope="col">#</th>
                <th className="font-medium" scope="col">{t('Epic')}</th>
                <th className="w-44 font-medium" scope="col">{t('Team')}</th>
                <th className="w-36 font-medium" scope="col">{t('Dependencies')}</th>
                <th className="w-36 font-medium hidden md:table-cell" scope="col">{t('Status')}</th>
                <th className="w-20" scope="col"><span className="sr-only">{t('Reorder')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((p) => renderRow(p, order.indexOf(p), true))}
              {visible.length === 0 && <tr><td colSpan={7}><EmptyLine>{searching ? t('No match.') : t('Nothing ranked yet.')}</EmptyLine></td></tr>}
            </tbody>
          </table>
          {unranked.length > 0 && (
            <div className="border-t border-border px-3 py-2 bg-canvas/60">
              <Disclosure summary={<>{t('Not prioritised yet')} <span className="tnum">({unranked.length})</span></>}>
                <table className="w-full text-body" aria-label={t('Not prioritised yet')}>
                  <tbody className="divide-y divide-border">{visibleUnranked.map((p, i) => renderRow(p, i, false))}</tbody>
                </table>
              </Disclosure>
            </div>
          )}
        </div>
      )}
      {mayRank && plansQ.length > 1 && <p className="mt-2 text-caption text-faint">{t('Drag, or Alt+↑/↓ on a row.')}</p>}

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

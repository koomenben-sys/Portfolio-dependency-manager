import React, { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Printer, Plus } from 'lucide-react';
import { usePlan } from '../../context/PlanContext';
import { canWriteTeam, canRank } from '../../data/repository';
import { quarterLabel, isLockedPhase, ASK_META } from '../../domain/model';
import { planFor, epicDeps } from '../../domain/plan';
import { followsOf } from '../../domain/follows';
import { activeThemes, effectiveMust, valueScore, SIMPLE_LEVELS, SIMPLE_META, FIB, RICE_IMPACT, WSJF_FIELDS, ONE_PAGER_FIELDS, THEME_TYPE_LABEL, fmtMonth } from '../../domain/value';
import { useT } from '../../i18n';
import { cls, StatusChip, InlineReason, Disclosure, ErrorLine, fmtDate, Tabs, MustChip, ValueChip, normAsk, SizePicker, SizeText, SignalChip, FollowButton } from './core';
import { PrintSheet } from './PrintSheet';
import { describeEvent } from './EpicPanel';

// Simplified epic panel (docs/design.md section 19; Release A section 21): two tabs, Epic and OnePager.
// Epic: title, team, quarter, rank, goal, Moet, value (when a model is on), effort, asks, "Meer", "Historie".
// OnePager (D44): link to the organisation's document + a collapsed three-field template, facts, print.
// Docked right, slides in, Escape closes, focus returns to the row that opened it.
export function SimpleEpicPanel({ epicId, onClose }) {
  const { state, actor, quarter, run } = usePlan();
  const t = useT();
  const ref = useRef(null);
  const closeBtn = useRef(null);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const [err, setErr] = useState(null);
  const [rankDraft, setRankDraft] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [tab, setTab] = useState('epic');
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const prev = document.activeElement;
    closeBtn.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onCloseRef.current(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [epicId]);

  const epic = state.epics.find((e) => e.id === epicId);
  if (!epic || !quarter) return null;
  const plan = planFor(state, epic.id, quarter.id);
  const team = state.teams.find((x) => x.id === epic.teamId);
  const theme = state.themes.find((x) => x.id === epic.themeId) || null;
  const must = effectiveMust(epic, theme);
  const model = state.settings.valueModel || 'none';
  const score = valueScore(model, epic.value, plan);
  const mayEdit = canWriteTeam(actor, epic.teamId) && quarter.phase !== 'closed';
  const mayRank = canRank(actor) && quarter.phase !== 'closed' && !!plan;
  const locked = isLockedPhase(quarter.phase);
  const deps = epicDeps(state, epic.id, quarter.id);
  const history = state.events.filter((e) => e.entityId === plan?.id || e.entityId === epic.id || deps.some((d) => d.id === e.entityId)).sort((a, b) => b.at.localeCompare(a.at));
  const ranked = state.plans.filter((p) => p.quarterId === quarter.id && p.rank != null).sort((a, b) => a.rank - b.rank);
  const goals = activeThemes(state.themes);

  const act = async (m, ...a) => { const r = await run(m, ...a); setErr(r.ok ? null : r.error); return r; };
  const saveEpic = (patch) => act('upsertEpic', { id: epic.id, ...patch });
  const savePlan = (patch, reason = '') => act('upsertPlan', { id: plan?.id, epicId: epic.id, quarterId: quarter.id, ...patch }, reason);
  // Rank changes go through reorderPlans so the list stays 1..n (D28); the reason is optional unless locked.
  const applyRank = async (reason) => {
    const target = Math.max(1, Math.min(ranked.length + (plan.rank == null ? 1 : 0), rankDraft));
    const ids = ranked.map((p) => p.id).filter((id) => id !== plan.id);
    ids.splice(target - 1, 0, plan.id);
    const r = await act('reorderPlans', quarter.id, ids, reason);
    if (r.ok) setRankDraft(null);
  };
  const goalName = (th) => (th ? `${th.name}${th.archived ? ` (${t('archived')})` : ''}` : '–');
  const following = followsOf(state, actor.id).has(epic.id); // Volgen (M8): personal, every role
  const facts = { plan, theme, must, model, score, deps, history, team, quarter, ranked };

  return (
    <aside ref={ref} role="dialog" aria-modal="false" aria-label={`${epic.refCode} ${epic.title}`} className="fixed right-0 top-14 bottom-0 w-[420px] max-w-[95vw] bg-surface border-l border-border z-panel overflow-y-auto scrollbar-thin anim-slide-in-right shadow-md">
      <header className="sticky top-0 bg-surface px-4 pt-3 flex flex-col gap-2 z-10">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-caption text-muted mono flex items-center gap-2 flex-wrap">{epic.refCode} · {team?.name}
              {epic.externalUrl && <a className="inline-flex items-center gap-0.5 text-accent hover:underline" href={epic.externalUrl} target="_blank" rel="noreferrer">{epic.externalSource === 'azure_devops' ? 'Azure DevOps' : t('Link')}<ExternalLink size={11} aria-hidden="true" /></a>}
              <MustChip must={must} />
            </div>
            {mayEdit && !epic.externalSource
              ? <input className="mt-0.5 w-full text-subtitle font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none" defaultValue={epic.title} aria-label={t('Title')} onBlur={(e) => e.target.value.trim() && e.target.value !== epic.title && saveEpic({ title: e.target.value.trim() })} />
              : <h2 className="mt-0.5 text-subtitle font-semibold leading-6">{epic.title}</h2>}
          </div>
          <FollowButton on={following} onToggle={() => act(following ? 'unfollowEpic' : 'followEpic', epic.id)} />
          <button ref={closeBtn} className={cls.icon} onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
        </div>
        <div className="-mx-4 px-4"><Tabs ariaLabel={t('Panel')} value={tab} onChange={setTab} items={[{ id: 'epic', label: t('Epic') }, { id: 'onepager', label: 'OnePager' }]} /></div>
      </header>

      {tab === 'onepager' ? (
        <OnePagerTab epic={epic} facts={facts} mayEdit={mayEdit} saveEpic={saveEpic} err={err} onPrint={() => setPrinting(true)} />
      ) : (
        <div className="p-4 space-y-5">
          <ErrorLine error={err} />
          <dl className="grid grid-cols-[96px_1fr] gap-y-2 gap-x-3 text-body items-center">
            <dt className="text-muted text-label">{t('Quarter')}</dt><dd>{quarterLabel(quarter)}{!plan && <span className="text-muted"> · {t('not planned')}</span>}</dd>
            <dt className="text-muted text-label">{t('Rank')}</dt>
            <dd className="flex items-center gap-2">
              {mayRank ? (
                <input type="number" min="1" max={ranked.length + 1} className={`${cls.input} !w-20 tnum`} value={rankDraft ?? plan.rank ?? ''} aria-label={t('Strategic rank')} placeholder="–"
                  onChange={(e) => setRankDraft(e.target.value === '' ? null : Number(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter' && rankDraft != null && rankDraft !== plan.rank) applyRank(''); }} />
              ) : <span className="tnum">{plan?.rank ?? '–'}</span>}
            </dd>
            {rankDraft != null && rankDraft !== plan.rank && (
              <dd className="col-span-2"><InlineReason required={locked} autoFocus={false} onSave={applyRank} onCancel={() => setRankDraft(null)} /></dd>
            )}
            <dt className="text-muted text-label">{t('Goal')}</dt>
            <dd>
              {mayEdit ? (
                <select className={cls.input} value={epic.themeId || ''} aria-label={t('Goal')} onChange={(e) => saveEpic({ themeId: e.target.value || null })}>
                  <option value="">– {t('none')} –</option>
                  {goals.map((x) => <option key={x.id} value={x.id}>{x.name}{x.type === 'program' ? ` · ${t(THEME_TYPE_LABEL.program)}` : ''}</option>)}
                  {theme?.archived && <option value={theme.id}>{goalName(theme)}</option>}
                </select>
              ) : <span>{goalName(theme)}</span>}
            </dd>
            {/* Eigenaar (item E): project manager / product owner, free text; editable by whoever may edit the epic. */}
            <dt className="text-muted text-label">{t('Owner')}</dt>
            <dd>
              {mayEdit
                ? <input className={cls.input} defaultValue={epic.ownerName || ''} aria-label={t('Owner')} placeholder={t('Name')} onBlur={(e) => e.target.value.trim() !== (epic.ownerName || '') && saveEpic({ ownerName: e.target.value.trim() })} />
                : <span>{epic.ownerName || '–'}</span>}
            </dd>
            {model !== 'none' && (
              <>
                <dt className="text-muted text-label">{t('Value')}</dt>
                <dd><ValueField model={model} epic={epic} plan={plan} score={score} mayEdit={mayEdit} saveEpic={saveEpic} /></dd>
              </>
            )}
            {/* Release B (L1): size picker writes the mapped range; without a size the numbers stay editable. */}
            <dt className="text-muted text-label">{t('Size')}</dt>
            <dd className="flex items-center gap-2 flex-wrap tnum">
              {plan && mayEdit ? (
                <>
                  <SizePicker value={plan.size || null} onPick={(size) => savePlan({ size })} />
                  {plan.size ? <span className="text-label text-muted">{plan.effortLow}–{plan.effortHigh} pw</span> : (
                    <span className="inline-flex items-center gap-1">
                      <input type="number" min="0" step="0.5" className={`${cls.input} !w-16`} defaultValue={plan.effortLow || ''} placeholder="0" aria-label={t('Effort low')} onBlur={(e) => Number(e.target.value) !== plan.effortLow && savePlan({ effortLow: Number(e.target.value) })} />
                      <span className="text-muted">–</span>
                      <input type="number" min="0" step="0.5" className={`${cls.input} !w-16`} defaultValue={plan.effortHigh || ''} placeholder="0" aria-label={t('Effort high')} onBlur={(e) => Number(e.target.value) !== plan.effortHigh && savePlan({ effortHigh: Number(e.target.value) })} />
                      <span className="text-caption text-muted">pw</span>
                    </span>
                  )}
                </>
              ) : plan ? <SizeText size={plan.size} low={plan.effortLow} high={plan.effortHigh} /> : <span className="text-muted">–</span>}
            </dd>
            {!plan && mayEdit && <dd className="col-span-2"><button className={cls.secondary} onClick={() => savePlan({ commitment: 'draft', effortLow: 0, effortHigh: 0 })}>{t('Add to this quarter')}</button></dd>}
          </dl>

          <section>
            <h3 className="text-label font-semibold text-ink mb-2">{t('Asks')} <span className="text-muted font-normal tnum">({deps.length})</span></h3>
            {deps.length === 0 ? <p className="text-body text-muted">{t('No asks yet.')}</p> : (
              <ul className="divide-y divide-border border border-border rounded-card">
                {deps.map((d) => (
                  <li key={d.id} className="px-3 py-2 text-body">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><span className="text-muted">{state.teams.find((x) => x.id === d.providerTeamId)?.name}</span> · {d.ask}{(d.size || d.effortHigh > 0) && <span className="text-caption text-faint"> · <SizeText size={d.size} low={d.effortLow} high={d.effortHigh} /></span>}</div>
                      <span className="flex items-center gap-1 shrink-0"><SignalChip dep={d} /><StatusChip response={d.response} /></span>
                    </div>
                    {d.responseReason && <p className="text-caption text-muted mt-0.5">{d.responseReason}</p>}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-muted mt-2"><a className="text-accent hover:underline" href="#afhankelijkheden">{t('Manage asks in Dependencies')}</a></p>
          </section>

          <Disclosure summary={t('More')}>
            <div className="space-y-3">
              {mayEdit ? (
                <>
                  <label className="block"><span className={cls.label}>{t('Description')}</span><textarea className={cls.textarea} rows={3} defaultValue={epic.description || ''} onBlur={(e) => e.target.value !== (epic.description || '') && saveEpic({ description: e.target.value })} /></label>
                  <label className="block"><span className={cls.label}>{t('Label')}</span><input className={cls.input} defaultValue={epic.label || ''} onBlur={(e) => e.target.value !== (epic.label || '') && saveEpic({ label: e.target.value })} /></label>
                  {!epic.externalSource && <label className="block"><span className={cls.label}>{t('Link')}</span><input type="url" className={cls.input} placeholder="https://" defaultValue={epic.externalUrl || ''} onBlur={(e) => e.target.value.trim() !== (epic.externalUrl || '') && saveEpic({ externalUrl: e.target.value.trim() || null })} /></label>}
                </>
              ) : (
                <dl className="grid grid-cols-[96px_1fr] gap-y-2 gap-x-3 text-body">
                  <dt className="text-muted text-label">{t('Description')}</dt><dd className="whitespace-pre-wrap">{epic.description || '–'}</dd>
                  <dt className="text-muted text-label">{t('Label')}</dt><dd>{epic.label || '–'}</dd>
                </dl>
              )}
              {mayEdit && <label className="block"><span className={cls.label}>{t('Team')}</span><select className={cls.input} value={epic.teamId} onChange={(e) => saveEpic({ teamId: e.target.value })}>{state.teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
              {plan && mayEdit && !removing && <button className={`${cls.quiet} text-danger-fg`} onClick={() => (locked ? setRemoving(true) : act('removePlan', plan.id).then((r) => r.ok && onClose()))}>{t('Remove from this quarter')}</button>}
              {removing && <InlineReason required saveLabel={t('Remove')} onSave={async (reason) => { const r = await act('removePlan', plan.id, reason); if (r.ok) onClose(); }} onCancel={() => setRemoving(false)} />}
            </div>
          </Disclosure>

          <Disclosure summary={<>{t('History')} <span className="tnum text-faint">({history.length})</span></>}>
            {history.length === 0 ? <p className="text-caption text-muted">{t('No changes recorded.')}</p> : (
              <ul className="space-y-1 text-caption text-ink-2">
                {history.slice(0, 15).map((e) => <li key={e.id}><span className="text-muted tnum">{fmtDate(e.at, t.lang)}</span> · {e.actorName || t('system')} — {describeEvent(e, t)}{e.reason && <span className="italic text-muted"> — “{e.reason}”</span>}</li>)}
              </ul>
            )}
          </Disclosure>
        </div>
      )}
      {printing && <PrintSheet onDone={() => setPrinting(false)}><OnePagerSheet epic={epic} facts={facts} t={t} teams={state.teams} /></PrintSheet>}
    </aside>
  );
}

// "Waarde" row (D43): simple = three buttons; WSJF / RICE = the score with the inputs one click deeper.
function ValueField({ model, epic, plan, score, mayEdit, saveEpic }) {
  const t = useT();
  const v = epic.value || {};
  const set = (patch) => saveEpic({ value: { ...v, ...patch } });
  const note = (
    mayEdit
      ? <input className={`${cls.input} mt-1`} placeholder={t('Note (optional)')} aria-label={t('Value note')} defaultValue={epic.valueNote || ''} onBlur={(e) => e.target.value !== (epic.valueNote || '') && saveEpic({ valueNote: e.target.value })} />
      : epic.valueNote ? <p className="text-caption text-muted mt-0.5">{epic.valueNote}</p> : null
  );
  if (model === 'simple') {
    return (
      <div>
        {mayEdit ? (
          <div role="radiogroup" aria-label={t('Value')} className="inline-flex rounded-control border border-border-strong overflow-hidden bg-surface">
            {SIMPLE_LEVELS.map((lvl, i) => {
              const active = v.level === lvl;
              return <button key={lvl} type="button" role="radio" aria-checked={active} onClick={() => set({ level: active ? undefined : lvl })} className={`inline-flex items-center h-8 px-2.5 text-label font-medium transition-base focus-ring-inset ${i > 0 ? 'border-l border-border-strong' : ''} ${active ? 'bg-accent-50 text-accent-700' : 'text-ink-2 hover:bg-surface-2'}`}>{t(SIMPLE_META[lvl].label)}</button>;
            })}
          </div>
        ) : <span>{score ? t(SIMPLE_META[score].label) : '–'}</span>}
        {note}
      </div>
    );
  }
  const fields = model === 'wsjf'
    ? [...WSJF_FIELDS.map(([k, label]) => [k, label, FIB]), ['jobSize', 'Job size', FIB]]
    : [['reach', 'Reach', null], ['impact', 'Impact', RICE_IMPACT], ['confidence', 'Confidence %', null], ['effort', 'Effort (pw)', null]];
  const fallback = plan?.effortHigh > 0 ? plan.effortHigh : '';
  return (
    <div>
      <div className="flex items-center gap-2"><ValueChip model={model} score={score} /><span className="text-caption text-muted">{model.toUpperCase()}</span></div>
      {note}
      <Disclosure className="mt-1" summary={t('Inputs')}>
        <div className="grid grid-cols-2 gap-2">
          {fields.map(([k, label, opts]) => (
            <label key={k} className="block"><span className={cls.label}>{t(label)}</span>
              {mayEdit ? (opts
                ? <select className={cls.input} value={v[k] ?? ''} onChange={(e) => set({ [k]: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">{k === 'jobSize' && fallback ? `– (${fallback} pw)` : '–'}</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : <input type="number" min="0" step="any" className={`${cls.input} tnum`} defaultValue={v[k] ?? ''} placeholder={k === 'effort' || k === 'jobSize' ? String(fallback) : ''} onBlur={(e) => Number(e.target.value || NaN) !== v[k] && set({ [k]: e.target.value === '' ? undefined : Number(e.target.value) })} />)
                : <span className="text-body tnum">{v[k] ?? ((k === 'effort' || k === 'jobSize') && fallback ? `${fallback} (pw)` : '–')}</span>}
            </label>
          ))}
        </div>
      </Disclosure>
    </div>
  );
}

// OnePager tab (D44): link + collapsed template + auto-filled facts + print.
function OnePagerTab({ epic, facts, mayEdit, saveEpic, err, onPrint }) {
  const t = useT();
  const { state } = usePlan();
  const op = epic.onePager || {};
  const filled = ONE_PAGER_FIELDS.some(([k]) => String(op[k] || '').trim());
  const [showTemplate, setShowTemplate] = useState(false);
  const setField = (k, val) => saveEpic({ onePager: { ...op, [k]: val } });
  return (
    <div className="p-4 space-y-5">
      <ErrorLine error={err} />
      <div className="space-y-1.5">
        <span className={cls.label}>{t('Link to document')}</span>
        {mayEdit && <input type="url" className={cls.input} placeholder="https://" aria-label={t('Link to document')} defaultValue={epic.onePagerUrl || ''} onBlur={(e) => e.target.value.trim() !== (epic.onePagerUrl || '') && saveEpic({ onePagerUrl: e.target.value.trim() || null })} />}
        {epic.onePagerUrl && <a className="inline-flex items-center gap-1 text-label text-accent hover:underline break-all" href={epic.onePagerUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} aria-hidden="true" />{epic.onePagerUrl}</a>}
        {!epic.onePagerUrl && !mayEdit && <p className="text-body text-muted">–</p>}
      </div>

      {/* Iteration 1 (item 4): filled template shows directly; empty shows one quiet link. */}
      {filled || showTemplate ? (
        <div className="space-y-3">
          {ONE_PAGER_FIELDS.map(([k, label, placeholder]) => (
            <label key={k} className="block"><span className={cls.label}>{t(label)}</span>
              {mayEdit
                ? <textarea className={cls.textarea} rows={3} placeholder={t(placeholder)} defaultValue={op[k] || ''} onBlur={(e) => e.target.value !== (op[k] || '') && setField(k, e.target.value)} />
                : <p className="text-body whitespace-pre-wrap">{op[k] || <span className="text-muted">–</span>}</p>}
            </label>
          ))}
        </div>
      ) : mayEdit && <button type="button" className={`${cls.quiet} -ml-2`} onClick={() => setShowTemplate(true)}><Plus size={13} aria-hidden="true" />{t('Fill in template')}</button>}

      <section>
        <h3 className="text-label font-semibold text-ink mb-2">{t('Facts')}</h3>
        <Facts epic={epic} facts={facts} teams={state.teams} t={t} />
      </section>
      <button className={cls.secondary} onClick={onPrint}><Printer size={14} aria-hidden="true" />{t('Print')}</button>
    </div>
  );
}

// Auto-assembled facts, shared by the tab and the printed sheet.
function Facts({ epic, facts, teams, t, print = false }) {
  const { plan, theme, must, model, score, deps, history } = facts;
  const teamName = (id) => teams.find((x) => x.id === id)?.name || '?';
  const dl = print ? 'grid grid-cols-[140px_1fr] gap-y-1 gap-x-3' : 'grid grid-cols-[112px_1fr] gap-y-1.5 gap-x-3 text-body';
  const dt = print ? 'text-muted' : 'text-muted text-label';
  return (
    <dl className={dl}>
      <dt className={dt}>{t('Rank')}</dt><dd className="tnum">{plan?.rank ?? '–'}</dd>
      <dt className={dt}>{t('Goal')}</dt><dd>{theme ? `${theme.name}${theme.type === 'program' ? ` (${t(THEME_TYPE_LABEL.program)})` : ''}` : '–'}</dd>
      {(print || must) && <><dt className={dt}>{t('Must')}</dt><dd>{must ? `${t('Yes')}${must.deadline ? ` · ${fmtMonth(must.deadline, t.lang)}` : ''}` : t('No')}</dd></>}
      {print && model !== 'none' && <><dt className={dt}>{t('Value')}</dt><dd className="flex items-center gap-2">{score == null ? '–' : model === 'simple' ? t(SIMPLE_META[score].label) : <span className="tnum">{score}</span>}{epic.valueNote && <span className="text-muted">· {epic.valueNote}</span>}</dd></>}
      {print && <><dt className={dt}>{t('Effort (pw)')}</dt><dd className="tnum">{plan ? `${plan.effortLow}–${plan.effortHigh}` : '–'}</dd></>}
      <dt className={dt}>{t('Asks')}</dt>
      <dd>{deps.length === 0 ? '–' : <ul className="space-y-0.5">{deps.map((d) => <li key={d.id}>{teamName(d.providerTeamId)}{print && ` · ${d.ask}`} <span className="text-muted">— {t(ASK_META[normAsk(d.response)]?.label || d.response)}</span></li>)}</ul>}</dd>
      {(print || history.length > 0) && <><dt className={dt}>{t('Last changes')}</dt>
      <dd>{history.length === 0 ? '–' : <ul className="space-y-0.5">{history.slice(0, 3).map((e) => <li key={e.id}><span className="text-muted tnum">{fmtDate(e.at, t.lang)}</span> · {describeEvent(e, t)}</li>)}</ul>}</dd></>}
    </dl>
  );
}

// The printed A4 sheet (D44): header, three fields, facts. Same layout for every epic.
function OnePagerSheet({ epic, facts, t, teams }) {
  const op = epic.onePager || {};
  return (
    <article className="text-[11px] leading-[15px] text-black">
      <header className="border-b border-black pb-2 mb-3">
        <div className="text-[10px] uppercase tracking-wide">OnePager · {facts.team?.name} · {quarterLabel(facts.quarter)} · {t('Rank')} {facts.plan?.rank ?? '–'}</div>
        <h1 className="text-[18px] leading-6 font-semibold mt-1">{epic.title}</h1>
        {epic.onePagerUrl && <div className="mt-0.5">{epic.onePagerUrl}</div>}
      </header>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {ONE_PAGER_FIELDS.map(([k, label]) => <section key={k}><h2 className="text-[11px] font-semibold mb-1">{t(label)}</h2><p className="whitespace-pre-wrap">{op[k] || '–'}</p></section>)}
      </div>
      <Facts epic={epic} facts={facts} teams={teams} t={t} print />
    </article>
  );
}

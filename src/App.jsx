import React, { useEffect, useState } from 'react';
import LogoMark from './components/plan/LogoMark';
import { Settings, ChevronDown, LogOut, Check, Compass, Languages, LayoutGrid, Presentation, Pause, Play, Square, Lock } from 'lucide-react';
import { PlanProvider, usePlan } from './context/PlanContext';
import { useAuth } from './context/AuthContext';
import { DATA_SOURCE, isAdmin } from './data/repository';
import { quarterLabel, PHASES, cyclePhase, STEPS, STEP_LABEL, stepForPhase, stepLabel, PHASE_CHIP } from './domain/model';
import { LoginView } from './views/LoginView';
import { PrioritizeView } from './views/PrioritizeView';
import { DependenciesView } from './views/DependenciesView';
import { AlignView } from './views/AlignView';
import { SettingsView } from './views/SettingsView';
import { QuarterResultView } from './views/QuarterResultView';
import { ProgressView } from './views/ProgressView';
import { ResultView } from './views/ResultView';
import { CloseQuarterDialog } from './components/plan/CycleActions';
import { inExecution } from './domain/rhythm';
import { OverviewView } from './views/OverviewView';
import { BoardView } from './views/BoardView';
import { DependenciesViewLegacy } from './views/DependenciesView.legacy';
import { SessionView } from './views/SessionView';
import { InQuarterView } from './views/InQuarterView';
import { AttentionView } from './views/AttentionView';
import { ErrorBoundary } from './components/plan/ErrorBoundary';
import { OnboardingWizard } from './components/plan/OnboardingWizard';
import { TourPanel } from './components/plan/TourPanel';
import { SCENARIOS } from './components/plan/tourScenarios';
import { Menu, MenuLabel, MenuSep, menuItem, cls, toneClass, toneBorder } from './components/plan/core';
import { LiveIndicator } from './components/plan/LiveIndicator';
import { useT, LANGUAGES } from './i18n';

// The product is three numbered steps (docs/design.md section 19, D26). What step 2 and 3 are depends on the
// cycle phase of the selected quarter (section 23, D64): Planning = Prioriteren · Afhankelijkheden · Afstemmen,
// Uitvoering = Prioriteren · Afgestemd · Voortgang, Afgesloten = Prioriteren · Afgestemd · Resultaat.
// Everything else sits behind settings.modules ("Uitgebreid (beta)", D27) or in the account menu.
const CORE = [
  { id: 'prioriteren', label: STEP_LABEL.prioriteren, View: PrioritizeView },
  { id: 'afhankelijkheden', label: STEP_LABEL.afhankelijkheden, View: DependenciesView },
  { id: 'afgestemd', label: STEP_LABEL.afgestemd, View: DependenciesView },
  { id: 'afstemmen', label: STEP_LABEL.afstemmen, View: AlignView },
  { id: 'voortgang', label: STEP_LABEL.voortgang, View: ProgressView },
  { id: 'resultaat', label: STEP_LABEL.resultaat, View: ResultView },
];
const EXTENDED = [
  { id: 'overzicht', label: 'Overview', View: OverviewView },
  { id: 'bord', label: 'Board', View: BoardView },
  { id: 'intake', label: 'Intake & capacity', View: DependenciesViewLegacy },
  { id: 'sessie', label: 'Session', View: SessionView },
  { id: 'kwartaal', label: 'In-quarter', View: InQuarterView },
  { id: 'aandacht', label: 'My attention', View: AttentionView },
];
const SETTINGS = { id: 'instellingen', label: 'Settings', View: SettingsView };
// Reachable by URL or a button, never listed in the nav (Release A, D45): the tussenstand during Planning.
const HIDDEN = [{ id: 'kwartaalresultaat', label: 'Quarter result', View: QuarterResultView }];
const ALL = [...CORE, ...EXTENDED, SETTINGS, ...HIDDEN];
const VIEW_IDS = new Set([...ALL.map((v) => v.id), 'afsluiten']);
const viewFromHash = () => { const h = window.location.hash.replace('#', ''); return VIEW_IDS.has(h) ? h : 'prioriteren'; };
// Old routes (M6): #afsluiten and #kwartaalresultaat redirect to the phase's step 3 unless the quarter is still
// in Planning, where #kwartaalresultaat stays the tussenstand opened from Afstemmen.
function resolveView(id, quarter) {
  if (!quarter) return id === 'afsluiten' ? 'resultaat' : id;
  if (id === 'kwartaalresultaat') return cyclePhase(quarter.phase) === 'Planning' ? id : stepForPhase('resultaat', quarter.phase);
  return stepForPhase(id, quarter.phase);
}

// Mock mode: no login, persona switcher. Supabase mode: existing auth flow, membership becomes the actor.
export default function App() {
  return <ErrorBoundary>{DATA_SOURCE === 'supabase' ? <SupabaseGate /> : <PlanProvider><Shell /></PlanProvider>}</ErrorBoundary>;
}

function SupabaseGate() {
  const { user, role, loading, signOut, membership, membershipLoading } = useAuth();
  if (loading || (user && membershipLoading)) return <Loading />;
  if (!user) return <LoginView />;
  const actor = membership || { id: user.id, name: user.email, role: role || 'viewer', teamId: null, canRank: false };
  return <PlanProvider authUser={actor}><Shell onSignOut={signOut} /></PlanProvider>;
}

const Loading = () => <div className="min-h-screen flex items-center justify-center text-muted">…</div>;
// Phase chip icon (D98): Planning pauses, In uitvoering plays, Afgesloten stops. Same size as the 12px caption text.
const PHASE_ICON = { Planning: Pause, Execution: Play, Closed: Square };
const PhaseIcon = ({ phase }) => { const I = PHASE_ICON[phase] || Pause; return <I size={12} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />; };

// Presentatiemodus (section 24, D76): larger type for the beamer. Personal and per device (localStorage), never an
// organisation setting; src/index.css scales the page under html[data-present].
const PRESENT_KEY = 'kp.present';
const readPresent = () => { try { return localStorage.getItem(PRESENT_KEY) === '1'; } catch { return false; } };
const writePresent = (on) => { try { localStorage.setItem(PRESENT_KEY, on ? '1' : '0'); } catch { /* private mode */ } };

function Shell({ onSignOut }) {
  const ctx = usePlan();
  if (!ctx) return <Loading />;
  return <ShellInner ctx={ctx} onSignOut={onSignOut} />;
}

function ShellInner({ ctx, onSignOut }) {
  const { state, actor, chooseActor, personas, quarter, quarterId, setQuarterId, error, dataSource, run } = ctx;
  const t = useT();
  const [tour, setTour] = useState(null);
  const [skipWizard, setSkipWizard] = useState(false);
  const [closing, setClosing] = useState(false); // "Kwartaal afsluiten" lives in the account menu (section 28, D105)
  const [view, setViewState] = useState(viewFromHash);
  const setView = (id) => { if (!VIEW_IDS.has(id)) return; setViewState(id); window.location.hash = id; };
  useEffect(() => { const on = () => setViewState(viewFromHash()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  // Keep the URL honest: a step hash that does not belong to the quarter's phase is replaced by the step shown (M2).
  useEffect(() => { if (!quarter) return; const r = resolveView(view, quarter); if (r !== view) { window.history.replaceState(null, '', `#${r}`); setViewState(r); } }, [view, quarter?.id, quarter?.phase]);
  useEffect(() => { document.documentElement.lang = state?.settings?.language || 'nl'; }, [state?.settings?.language]);
  // Skin (Zakelijk | Speels) is an organisation setting; the tokens live in src/index.css under html[data-skin].
  useEffect(() => { document.documentElement.dataset.skin = state?.settings?.skin || 'zakelijk'; }, [state?.settings?.skin]);
  const [present, setPresent] = useState(readPresent);
  useEffect(() => { if (present) document.documentElement.dataset.present = '1'; else delete document.documentElement.dataset.present; }, [present]);
  const togglePresent = () => setPresent((p) => { writePresent(!p); return !p; });
  if (error) return <div className="p-8 text-danger-fg">{t('Could not load data')}: {error}</div>;
  if (!state) return <Loading />;
  const modules = !!state.settings.modules;
  const needsSetup = !state.settings.setupComplete && isAdmin(actor) && !skipWizard;
  const phase = quarter ? cyclePhase(quarter.phase) : 'Planning';
  const steps = STEPS[phase];
  const resolved = resolveView(view, quarter);
  const current = ALL.find((v) => v.id === resolved) || CORE[0];
  const reachable = current === SETTINGS || CORE.includes(current) || HIDDEN.includes(current) || modules;
  const Current = reachable ? current.View : CORE[0].View;
  const initials = (actor.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="skip-link sr-only-focusable">{t('Skip to content')}</a>
      <header className="bg-surface border-b border-border sticky top-0 z-header" data-print="hide">
        <div className="min-h-14 md:h-14 px-4 md:px-6 py-2 md:py-0 max-w-[1440px] mx-auto flex flex-wrap md:flex-nowrap md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 justify-self-start min-w-0">
            <button className="flex items-center gap-2 h-8 px-1 -ml-1 rounded-control focus-ring" onClick={() => setView('prioriteren')} aria-label="Kwartaalplan">
              <LogoMark size={26} />
              <span className="font-display font-[var(--font-display-weight)] text-body hidden sm:inline">Kwartaalplan</span>
            </button>
            {/* Demo badge sits with the logo (owner feedback 2026-10-21, item A), not between phase and quarter. */}
            {dataSource === 'mock' && <span className="hidden md:inline-flex items-center h-6 px-2 rounded-full bg-surface-2 text-micro font-semibold uppercase tracking-wide text-muted" title={t('Fictional data, stored in this browser')}>Demo</span>}
          </div>
          <nav aria-label={t('Main')} className="order-last w-full md:order-none md:w-auto flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none" data-tour="nav">
            {steps.map((id, i) => {
              const v = CORE.find((x) => x.id === id);
              const active = resolved === v.id;
              return (
                <button key={v.id} aria-current={active ? 'page' : undefined} onClick={() => setView(v.id)} data-tour={`nav-${v.id}`}
                  className={`nav-step inline-flex shrink-0 whitespace-nowrap items-center gap-2 h-8 px-2.5 rounded-control text-label focus-ring ${active ? 'font-medium' : 'text-muted hover:text-ink hover:bg-surface-2'}`}>
                  <span className={`tnum w-5 h-5 rounded-full text-micro font-semibold inline-flex items-center justify-center ${active ? 'bg-[var(--nav-badge-bg)] text-[var(--nav-badge-fg)]' : 'bg-surface-2 text-muted'}`} aria-hidden="true">{i + 1}</span>{t(stepLabel(v.id, quarter?.phase))}
                </button>
              );
            })}
            {modules && (
              <Menu align="left" ariaLabel={t('Extended (beta)')} width="w-56" button={({ ref, toggle, open, ...a }) => (
                <button ref={ref} onClick={toggle} {...a} className={`ml-1 inline-flex items-center gap-1 h-8 px-2.5 rounded-control text-label text-muted hover:bg-surface-2 focus-ring ${EXTENDED.some((v) => v.id === view) ? 'bg-surface-2 text-ink' : ''}`}>
                  <LayoutGrid size={14} aria-hidden="true" />{t('Extended')} <span className="text-micro uppercase tracking-wide text-faint">beta</span><ChevronDown size={12} aria-hidden="true" />
                </button>)}>
                {EXTENDED.map((v) => <button key={v.id} role="menuitem" data-close className={`${menuItem} ${view === v.id ? 'text-accent-700' : ''}`} onClick={() => setView(v.id)}>{t(v.label)}</button>)}
              </Menu>
            )}
          </nav>

          <div className="ml-auto md:ml-0 md:justify-self-end min-w-0 flex items-center gap-2">
            {quarter && <span className={`hidden md:inline-flex items-center gap-1 h-6 px-2 rounded-full border text-caption font-medium whitespace-nowrap ${toneClass(PHASE_CHIP[phase].tone)} ${toneBorder(PHASE_CHIP[phase].tone)}`} title={t('Cycle phase')} data-tour="cycle"><PhaseIcon phase={phase} />{t(PHASE_CHIP[phase].label)}</span>}
            {dataSource !== 'mock' && <LiveIndicator />}
            <label className="flex items-center gap-1.5 text-label text-muted">
              <span className="sr-only">{t('Quarter')}</span>
              <select className={`${cls.input} !w-auto !h-8 text-ink font-medium`} value={quarterId || ''} onChange={(e) => setQuarterId(e.target.value)} data-tour="quarter">
                {state.quarters.length === 0 && <option value="">{t('No quarter yet')}</option>}
                {state.quarters.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}{modules ? ` · ${t(PHASES.find((p) => p.id === q.phase)?.label || q.phase)}` : ''}</option>)}
              </select>
            </label>
            <button className={`${cls.icon} w-8 h-8 ${present ? 'bg-accent-50 text-accent-700' : ''}`} aria-label={t('Presentation mode')} title={t('Presentation mode')} aria-pressed={present} onClick={togglePresent}><Presentation size={16} /></button>
            <button className={`${cls.icon} w-8 h-8 ${view === 'instellingen' ? 'bg-surface-2 text-ink' : ''}`} aria-label={t('Settings')} title={t('Settings')} aria-current={view === 'instellingen' ? 'page' : undefined} onClick={() => setView('instellingen')}><Settings size={16} /></button>
            <Menu ariaLabel={t('Account')} width="w-72" button={({ ref, toggle, open, ...a }) => (
              <button ref={ref} onClick={toggle} {...a} className="inline-flex items-center gap-2 h-8 pl-1 pr-2 rounded-control hover:bg-surface-2 focus-ring" data-tour="account">
                <span className="w-6 h-6 rounded-rank bg-rank-bg text-rank-fg text-micro font-semibold inline-flex items-center justify-center" aria-hidden="true">{initials}</span>
                <span className="hidden lg:inline text-label text-ink max-w-[160px] truncate">{actor.name}</span>
                <ChevronDown size={12} className="text-muted" aria-hidden="true" />
              </button>)}>
              {({ close }) => (
                <>
                  <div className="px-2 pt-2 pb-1"><div className="text-label font-medium text-ink truncate">{actor.name}</div><div className="text-caption text-muted">{t(actor.role)}{actor.canRank ? ` · ${t('can rank')}` : ''}{actor.teamId ? ` · ${state.teams.find((x) => x.id === actor.teamId)?.name || ''}` : ''}</div></div>
                  {dataSource === 'mock' && (
                    <>
                      <MenuSep /><MenuLabel>{t('Viewing as')}</MenuLabel>
                      <div className="max-h-56 overflow-auto scrollbar-thin">
                        {personas.map((p) => (
                          <button key={p.id} role="menuitemradio" aria-checked={p.id === actor.id} className={menuItem} onClick={() => { chooseActor(p.id); close(); }}>
                            <span className="w-4 inline-flex justify-center">{p.id === actor.id && <Check size={14} aria-hidden="true" />}</span>
                            <span className="truncate">{p.name}</span><span className="ml-auto text-caption text-muted truncate max-w-[120px]">{p.title}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <MenuSep /><MenuLabel><span className="inline-flex items-center gap-1"><Languages size={12} aria-hidden="true" />{t('Language')}</span></MenuLabel>
                  {LANGUAGES.map(([v, l]) => (
                    <button key={v} role="menuitemradio" aria-checked={(state.settings.language || 'nl') === v} className={menuItem} onClick={() => { run('updateSettings', { language: v }); close(); }}>
                      <span className="w-4 inline-flex justify-center">{(state.settings.language || 'nl') === v && <Check size={14} aria-hidden="true" />}</span>{l}
                    </button>
                  ))}
                  {dataSource === 'mock' && state.settings.setupComplete && (
                    <>
                      <MenuSep /><MenuLabel><span className="inline-flex items-center gap-1"><Compass size={12} aria-hidden="true" />{t('Tour')}</span></MenuLabel>
                      {SCENARIOS.map((sc) => <button key={sc.id} role="menuitem" className={menuItem} onClick={() => { close(); setSkipWizard(true); setTour(sc.id); }}><span className="truncate">{sc.title[t.lang] || sc.title.nl}</span><span className="ml-auto text-caption text-muted tnum">{sc.steps.length}</span></button>)}
                    </>
                  )}
                  {quarter && isAdmin(actor) && inExecution(quarter.phase) && (<><MenuSep /><button role="menuitem" className={menuItem} data-tour="close-quarter" onClick={() => { close(); setClosing(true); }}><Lock size={14} aria-hidden="true" />{t('Close quarter')}<span className="ml-auto text-caption text-muted">{quarterLabel(quarter)}</span></button></>)}
                  {onSignOut && (<><MenuSep /><button role="menuitem" className={menuItem} onClick={onSignOut}><LogOut size={14} aria-hidden="true" />{t('Sign out')}</button></>)}
                </>
              )}
            </Menu>
            {closing && quarter && <CloseQuarterDialog quarter={quarter} onClose={() => setClosing(false)} onDone={() => setView('resultaat')} />}
          </div>
        </div>
      </header>
      <main id="main" className="px-6 py-6 max-w-[1440px] mx-auto">
        {needsSetup ? <OnboardingWizard onDone={(target) => { setSkipWizard(true); setView(target || 'prioriteren'); }} /> : <Current key={`${resolved}-${quarterId}`} />}
      </main>
      {tour && <TourPanel scenarioId={tour} onClose={() => setTour(null)} setView={setView} />}
    </div>
  );
}

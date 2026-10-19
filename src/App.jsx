import React, { useEffect, useState } from 'react';
import { Settings, ChevronDown, LogOut, Check, Compass, Languages, LayoutGrid } from 'lucide-react';
import { PlanProvider, usePlan } from './context/PlanContext';
import { useAuth } from './context/AuthContext';
import { DATA_SOURCE, isAdmin } from './data/repository';
import { quarterLabel, PHASES } from './domain/model';
import { LoginView } from './views/LoginView';
import { PrioritizeView } from './views/PrioritizeView';
import { DependenciesView } from './views/DependenciesView';
import { AlignView } from './views/AlignView';
import { SettingsView } from './views/SettingsView';
import { QuarterResultView } from './views/QuarterResultView';
import { CloseView } from './views/CloseView';
import { CyclePhaseWord } from './components/plan/CycleActions';
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
import { Menu, MenuLabel, MenuSep, menuItem, cls } from './components/plan/core';
import { LiveIndicator } from './components/plan/LiveIndicator';
import { useT, LANGUAGES } from './i18n';

// The product is three numbered screens (docs/design.md section 19, D26). Everything else sits behind
// settings.modules ("Uitgebreid (beta)", D27) or in the account menu.
const CORE = [
  { id: 'prioriteren', label: 'Prioritise', View: PrioritizeView },
  { id: 'afhankelijkheden', label: 'Dependencies', View: DependenciesView },
  { id: 'afstemmen', label: 'Align', View: AlignView },
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
// Reachable by URL or a button, never listed in the nav (Release A, D45; Release B, D56).
const HIDDEN = [{ id: 'kwartaalresultaat', label: 'Quarter result', View: QuarterResultView }, { id: 'afsluiten', label: 'Closing', View: CloseView }];
const ALL = [...CORE, ...EXTENDED, SETTINGS, ...HIDDEN];
const VIEW_IDS = new Set(ALL.map((v) => v.id));
const viewFromHash = () => { const h = window.location.hash.replace('#', ''); return VIEW_IDS.has(h) ? h : 'prioriteren'; };

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
  const [view, setViewState] = useState(viewFromHash);
  const setView = (id) => { if (!VIEW_IDS.has(id)) return; setViewState(id); window.location.hash = id; };
  useEffect(() => { const on = () => setViewState(viewFromHash()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  useEffect(() => { document.documentElement.lang = state?.settings?.language || 'nl'; }, [state?.settings?.language]);
  if (error) return <div className="p-8 text-danger-fg">{t('Could not load data')}: {error}</div>;
  if (!state) return <Loading />;
  const modules = !!state.settings.modules;
  const needsSetup = !state.settings.setupComplete && isAdmin(actor) && !skipWizard;
  const current = ALL.find((v) => v.id === view) || CORE[0];
  const reachable = current === SETTINGS || CORE.includes(current) || HIDDEN.includes(current) || modules;
  const Current = reachable ? current.View : CORE[0].View;
  const initials = (actor.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="skip-link sr-only-focusable">{t('Skip to content')}</a>
      <header className="bg-surface border-b border-border sticky top-0 z-header" data-print="hide">
        <div className="h-14 px-4 flex items-center gap-4">
          <button className="flex items-center gap-2 h-8 px-1 -ml-1 rounded-control focus-ring" onClick={() => setView('prioriteren')} aria-label="Kwartaalplan">
            <span className="w-6 h-6 rounded-control bg-accent text-accent-fg font-semibold text-caption flex items-center justify-center" aria-hidden="true">K</span>
            <span className="font-semibold text-body hidden sm:inline">Kwartaalplan</span>
          </button>
          <nav aria-label={t('Main')} className="flex items-center gap-1" data-tour="nav">
            {CORE.map((v, i) => {
              const active = view === v.id;
              return (
                <button key={v.id} aria-current={active ? 'page' : undefined} onClick={() => setView(v.id)} data-tour={`nav-${v.id}`}
                  className={`inline-flex items-center gap-2 h-8 px-2.5 rounded-control text-label transition-base focus-ring ${active ? 'text-ink font-medium' : 'text-muted hover:text-ink hover:bg-surface-2'}`}>
                  <span className={`tnum w-5 h-5 rounded-full text-micro font-semibold inline-flex items-center justify-center transition-base ${active ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}`} aria-hidden="true">{i + 1}</span>{t(v.label)}
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

          <div className="ml-auto flex items-center gap-2">
            <CyclePhaseWord quarter={quarter} setView={setView} />
            {dataSource === 'mock' && <span className="hidden md:inline-flex items-center h-6 px-2 rounded-full bg-surface-2 text-micro font-semibold uppercase tracking-wide text-muted" title={t('Fictional data, stored in this browser')}>Demo</span>}
            {dataSource !== 'mock' && <LiveIndicator />}
            <label className="flex items-center gap-1.5 text-label text-muted">
              <span className="sr-only">{t('Quarter')}</span>
              <select className={`${cls.input} !w-auto !h-8 text-ink font-medium`} value={quarterId || ''} onChange={(e) => setQuarterId(e.target.value)} data-tour="quarter">
                {state.quarters.length === 0 && <option value="">{t('No quarter yet')}</option>}
                {state.quarters.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)}{modules ? ` · ${t(PHASES.find((p) => p.id === q.phase)?.label || q.phase)}` : ''}</option>)}
              </select>
            </label>
            <button className={`${cls.icon} w-8 h-8 ${view === 'instellingen' ? 'bg-surface-2 text-ink' : ''}`} aria-label={t('Settings')} title={t('Settings')} aria-current={view === 'instellingen' ? 'page' : undefined} onClick={() => setView('instellingen')}><Settings size={16} /></button>
            <Menu ariaLabel={t('Account')} width="w-72" button={({ ref, toggle, open, ...a }) => (
              <button ref={ref} onClick={toggle} {...a} className="inline-flex items-center gap-2 h-8 pl-1 pr-2 rounded-control hover:bg-surface-2 focus-ring" data-tour="account">
                <span className="w-6 h-6 rounded-full bg-accent-100 text-accent-700 text-micro font-semibold inline-flex items-center justify-center" aria-hidden="true">{initials}</span>
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
                  {onSignOut && (<><MenuSep /><button role="menuitem" className={menuItem} onClick={onSignOut}><LogOut size={14} aria-hidden="true" />{t('Sign out')}</button></>)}
                </>
              )}
            </Menu>
          </div>
        </div>
      </header>
      <main id="main" className="px-6 py-6 max-w-[1200px] mx-auto">
        {needsSetup ? <OnboardingWizard onDone={(target) => { setSkipWizard(true); setView(target || 'prioriteren'); }} /> : <Current key={view} />}
      </main>
      {tour && <TourPanel scenarioId={tour} onClose={() => setTour(null)} setView={setView} />}
    </div>
  );
}

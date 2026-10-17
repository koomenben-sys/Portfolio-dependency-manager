import React, { useEffect, useState } from 'react';
import { PlanProvider, usePlan } from './context/PlanContext';
import { useAuth } from './context/AuthContext';
import { DATA_SOURCE } from './data/repository';
import { quarterLabel, PHASES } from './domain/model';
import { attention } from './domain/plan';
import { LoginView } from './views/LoginView';
import { OverviewView } from './views/OverviewView';
import { BoardView } from './views/BoardView';
import { DependenciesView } from './views/DependenciesView';
import { SessionView } from './views/SessionView';
import { InQuarterView } from './views/InQuarterView';
import { AttentionView } from './views/AttentionView';
import { SettingsView } from './views/SettingsView';
import { input } from './components/plan/ui';
import { ErrorBoundary } from './components/plan/ErrorBoundary';

const NAV = [
  ['overview', 'Overview'], ['board', 'Board'], ['dependencies', 'Dependencies'], ['session', 'Session'],
  ['inquarter', 'In-quarter'], ['attention', 'My attention'], ['settings', 'Settings'],
];

// Mock mode: no login, persona switcher. Supabase mode: existing auth flow, membership becomes the actor.
export default function App() {
  return <ErrorBoundary>{DATA_SOURCE === 'supabase' ? <SupabaseGate /> : <PlanProvider><Shell /></PlanProvider>}</ErrorBoundary>;
}

// Screen lives in the URL hash (#board, #session, ...) so a facilitator can share a link to a screen.
const VIEW_IDS = new Set(NAV.map(([id]) => id));
const viewFromHash = () => { const h = window.location.hash.replace('#', ''); return VIEW_IDS.has(h) ? h : 'board'; };

function SupabaseGate() {
  const { user, role, loading, signOut, membership } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  if (!user) return <LoginView />;
  const actor = membership || { id: user.id, name: user.email, role: role || 'viewer', teamId: null, canRank: false };
  return <PlanProvider authUser={actor}><Shell onSignOut={signOut} /></PlanProvider>;
}

function Shell({ onSignOut }) {
  const ctx = usePlan();
  if (!ctx) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  return <ShellInner ctx={ctx} onSignOut={onSignOut} />;
}

function ShellInner({ ctx, onSignOut }) {
  const { state, actor, chooseActor, personas, quarter, quarterId, setQuarterId, error, dataSource } = ctx;
  const [view, setViewState] = useState(viewFromHash);
  const setView = (id) => { setViewState(id); window.location.hash = id; };
  useEffect(() => { const on = () => setViewState(viewFromHash()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  if (error) return <div className="p-8 text-red-700">Could not load data: {error}</div>;
  if (!state || !quarter) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading…</div>;
  const attentionCount = attention(state, actor, quarterId).length;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 mr-2">
            <span className="w-7 h-7 rounded bg-indigo-600 text-white font-bold flex items-center justify-center text-sm" aria-hidden="true">K</span>
            <span className="font-semibold">Kwartaalplan</span>{state.settings.orgName && <span className="text-sm text-gray-600 hidden md:inline">· {state.settings.orgName}</span>}
          </div>
          <nav className="flex flex-wrap gap-1">
            {NAV.map(([id, label]) => (
              <button key={id} onClick={() => setView(id)} className={`px-3 py-1.5 rounded text-sm ${view === id ? 'bg-indigo-600 text-white' : 'hover:bg-gray-100'}`}>
                {label}{id === 'attention' && attentionCount > 0 && <span className={`ml-1 text-[11px] px-1.5 rounded-full ${view === id ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'}`}>{attentionCount}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1">Quarter
              <select className={`${input} !w-auto`} value={quarterId} onChange={(e) => setQuarterId(e.target.value)}>
                {state.quarters.map((q) => <option key={q.id} value={q.id}>{quarterLabel(q)} · {PHASES.find((p) => p.id === q.phase)?.label}</option>)}
              </select>
            </label>
            {dataSource === 'mock' ? (
              <label className="flex items-center gap-1" title="Demo mode: switch persona to see role-based editing">Viewing as
                <select className={`${input} !w-auto`} value={actor.id} onChange={(e) => chooseActor(e.target.value)}>
                  {personas.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.title}</option>)}
                </select>
              </label>
            ) : (
              <span className="text-gray-600">{actor.name} · {actor.role}{actor.canRank ? ' · can rank' : ''} <button className="text-indigo-700 hover:underline ml-2" onClick={onSignOut}>Sign out</button></span>
            )}
          </div>
        </div>
        {dataSource === 'mock' && <div className="bg-amber-50 border-t border-amber-200 text-amber-900 text-xs px-4 py-1">Demo mode — fictional data for "Oranje Verzekeringen", stored in this browser only. Switch "Viewing as" to try the roles.</div>}
      </header>
      <main className="p-6">
        {view === 'overview' && <OverviewView />}
        {view === 'board' && <BoardView />}
        {view === 'dependencies' && <DependenciesView />}
        {view === 'session' && <SessionView />}
        {view === 'inquarter' && <InQuarterView />}
        {view === 'attention' && <AttentionView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}

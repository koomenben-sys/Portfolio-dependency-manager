import React, { useState } from 'react';
import { Header } from './components/Layout/Header';
import { Navigation } from './components/Layout/Navigation';
import { SettingsModal } from './components/Layout/SettingsModal';
import { PortfoliosView } from './views/PortfoliosView';
import { DependenciesView } from './views/DependenciesView';
import { PrioritizationView } from './views/PrioritizationView';
import { AlignmentView } from './views/AlignmentView';
import { PortfolioOverviewView } from './views/PortfolioOverviewView';
import { LoginView } from './views/LoginView';
import { usePortfolios } from './hooks/usePortfolios';
import { useInitiatives } from './hooks/useInitiatives';
import { useDependencies } from './hooks/useDependencies';
import { useTeams } from './hooks/useTeams';
import { useAuth } from './context/AuthContext';
import { supabase } from './lib/supabase';
import { generateRefCode } from './utils/referenceCodeGenerator';

function App() {
  const { user, role, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  return <AuthenticatedApp user={user} role={role} signOut={signOut} />;
}

function AuthenticatedApp({ user, role, signOut }) {
  const [currentView, setCurrentView] = useState('portfolios');
  const [showSettings, setShowSettings] = useState(false);

  const {
    portfolios,
    setPortfolios,
    addPortfolio,
    updatePortfolio,
    deletePortfolio,
  } = usePortfolios();

  const {
    initiatives,
    setInitiatives,
    addInitiative,
    updateInitiative,
    deleteInitiative,
    toggleQuarter,
    reorderInitiatives,
  } = useInitiatives();

  const {
    dependencies,
    setDependencies,
    addDependency,
    updateDependency,
    deleteDependency,
    toggleDependencyQuarter,
    updateDependencyStatus,
    deleteDependenciesForInitiative,
  } = useDependencies();

  const { teams, setTeams, addTeam, updateTeam, deleteTeam } = useTeams();

  // ── Import: full ETL from localStorage-format JSON into Supabase ──────────
  const handleImport = async ({ portfolios: pData, initiatives: iData, dependencies: dData, teams: tData }) => {
    // 1. Clear all existing data (reverse dependency order)
    await supabase.from('dependencies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('initiatives').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('portfolios').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('teams').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Insert teams → build name→UUID map
    const teamUUIDByName = {};
    if (tData?.length) {
      const newTeams = await setTeams(tData);
      newTeams.forEach(t => { teamUUIDByName[t.name] = t.id; });
    }

    // 3. Insert portfolios → build old-id→new-UUID map
    const portfolioUUIDByOldId = {};
    if (pData?.length) {
      const newPortfolios = await setPortfolios(pData);
      pData.forEach((p, i) => {
        if (newPortfolios[i]) portfolioUUIDByOldId[p.id] = newPortfolios[i].id;
      });
    }

    // 4. Insert initiatives (with mapped team + portfolio UUIDs) → build old-id→new-UUID map
    const initiativeUUIDByOldId = {};
    if (iData?.length) {
      // Determine max counter value from ref codes so sequences stay correct
      const maxInitCounter = iData.reduce((max, i) => {
        const num = parseInt(i.refCode?.replace(/\D/g, '') ?? '0', 10);
        return Math.max(max, num);
      }, 0);

      const dbInitiatives = iData.map((init, idx) => ({
        ref_code:     init.refCode,
        name:         init.name        ?? '',
        team_id:      teamUUIDByName[init.team] ?? null,
        quarters:     init.quarters    ?? [],
        portfolio_id: portfolioUUIDByOldId[init.portfolio] ?? null,
        effort:       init.effort      ?? 'M',
        value_type:   init.valueType   ?? 'EUR',
        value_amount: init.valueAmount || null,
        priority:     init.priority    ?? idx + 1,
      }));

      const newInitiatives = await setInitiatives(dbInitiatives);
      iData.forEach((init, i) => {
        if (newInitiatives[i]) initiativeUUIDByOldId[init.id] = newInitiatives[i].id;
      });

      // Sync the initiative counter
      await supabase.from('counters').update({ value: maxInitCounter }).eq('entity', 'initiative');
    }

    // 5. Insert dependencies (with mapped initiative + team UUIDs)
    if (dData?.length) {
      const maxDepCounter = dData.reduce((max, d) => {
        const num = parseInt(d.refCode?.replace(/\D/g, '') ?? '0', 10);
        return Math.max(max, num);
      }, 0);

      const dbDependencies = dData.map(dep => ({
        ref_code:           dep.refCode,
        initiative_id:      initiativeUUIDByOldId[dep.initiativeId] ?? null,
        depends_on_team_id: teamUUIDByName[dep.dependsOnTeam] ?? null,
        description:        dep.description ?? '',
        quarters:           dep.quarters    ?? [],
        effort:             dep.effort      ?? 'TBD',
        status:             dep.status      ?? 'Pending',
      })).filter(d => d.initiative_id !== null); // skip orphaned deps

      await setDependencies(dbDependencies);
      await supabase.from('counters').update({ value: maxDepCounter }).eq('entity', 'dependency');
    }

    // 6. Sync portfolio counter
    if (pData?.length) {
      const maxPfCounter = pData.reduce((max, p) => {
        const num = parseInt(p.refCode?.replace(/\D/g, '') ?? '0', 10);
        return Math.max(max, num);
      }, 0);
      await supabase.from('counters').update({ value: maxPfCounter }).eq('entity', 'portfolio');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header user={user} role={role} onSignOut={signOut} />
      <Navigation
        currentView={currentView}
        onViewChange={setCurrentView}
        onSettingsClick={() => setShowSettings(true)}
        role={role}
      />

      <div className="p-6">
        {currentView === 'portfolios' && (
          <PortfoliosView
            portfolios={portfolios}
            addPortfolio={addPortfolio}
            updatePortfolio={updatePortfolio}
            deletePortfolio={deletePortfolio}
            role={role}
          />
        )}

        {currentView.startsWith('dependencies') && (
          <DependenciesView
            initiatives={initiatives}
            dependencies={dependencies}
            portfolios={portfolios}
            teams={teams}
            addInitiative={addInitiative}
            updateInitiative={updateInitiative}
            deleteInitiative={deleteInitiative}
            toggleQuarter={toggleQuarter}
            addDependency={addDependency}
            updateDependency={updateDependency}
            deleteDependency={deleteDependency}
            toggleDependencyQuarter={toggleDependencyQuarter}
            updateDependencyStatus={updateDependencyStatus}
            deleteDependenciesForInitiative={deleteDependenciesForInitiative}
            role={role}
          />
        )}

        {currentView === 'prioritization' && (
          <PrioritizationView
            initiatives={initiatives}
            portfolios={portfolios}
            dependencies={dependencies}
            reorderInitiatives={reorderInitiatives}
            role={role}
          />
        )}

        {currentView === 'overview' && (
          <AlignmentView
            portfolios={portfolios}
            initiatives={initiatives}
            dependencies={dependencies}
            teams={teams}
          />
        )}

        {currentView === 'portfolio-overview' && (
          <PortfolioOverviewView
            portfolios={portfolios}
            initiatives={initiatives}
            dependencies={dependencies}
          />
        )}
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        portfolios={portfolios}
        initiatives={initiatives}
        dependencies={dependencies}
        onImport={handleImport}
        teams={teams}
        addTeam={addTeam}
        updateTeam={updateTeam}
        deleteTeam={deleteTeam}
        role={role}
      />
    </div>
  );
}

export default App;

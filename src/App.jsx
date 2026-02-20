import React, { useState } from 'react';
import { Header } from './components/Layout/Header';
import { Navigation } from './components/Layout/Navigation';
import { SettingsModal } from './components/Layout/SettingsModal';
import { PortfoliosView } from './views/PortfoliosView';
import { DependenciesView } from './views/DependenciesView';
import { PrioritizationView } from './views/PrioritizationView';
import { AlignmentView } from './views/AlignmentView';
import { PortfolioOverviewView } from './views/PortfolioOverviewView';
import { usePortfolios } from './hooks/usePortfolios';
import { useInitiatives } from './hooks/useInitiatives';
import { useDependencies } from './hooks/useDependencies';
import { useTeams } from './hooks/useTeams';

function App() {
  const [currentView, setCurrentView] = useState('portfolios');
  const [showSettings, setShowSettings] = useState(false);

  const {
    portfolios,
    addPortfolio,
    updatePortfolio,
    deletePortfolio,
    counters,
    setCounters
  } = usePortfolios();

  const {
    initiatives,
    addInitiative,
    updateInitiative,
    deleteInitiative,
    toggleQuarter,
    reorderInitiatives
  } = useInitiatives(counters, setCounters);

  const {
    dependencies,
    addDependency,
    updateDependency,
    deleteDependency,
    toggleDependencyQuarter,
    updateDependencyStatus,
    deleteDependenciesForInitiative
  } = useDependencies(counters, setCounters, initiatives);

  const { teams, addTeam, updateTeam, deleteTeam } = useTeams();

  // For import functionality
  const [setPortfolios] = useState(() => (data) => {});
  const [setInitiatives] = useState(() => (data) => {});
  const [setDependencies] = useState(() => (data) => {});

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Navigation
        currentView={currentView}
        onViewChange={setCurrentView}
        onSettingsClick={() => setShowSettings(true)}
      />

      <div className="p-6">
        {currentView === 'portfolios' && (
          <PortfoliosView
            portfolios={portfolios}
            addPortfolio={addPortfolio}
            updatePortfolio={updatePortfolio}
            deletePortfolio={deletePortfolio}
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
          />
        )}

        {currentView === 'prioritization' && (
          <PrioritizationView
            initiatives={initiatives}
            portfolios={portfolios}
            dependencies={dependencies}
            reorderInitiatives={reorderInitiatives}
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
        setPortfolios={setPortfolios}
        setInitiatives={setInitiatives}
        setDependencies={setDependencies}
        teams={teams}
        addTeam={addTeam}
        updateTeam={updateTeam}
        deleteTeam={deleteTeam}
      />
    </div>
  );
}

export default App;

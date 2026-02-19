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

function App() {
  const [currentView, setCurrentView] = useState('portfolios');
  const [showSettings, setShowSettings] = useState(false);

  // Custom hooks for data management
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

  // For import functionality
  const [setPortfolios] = useState(() => (data) => {
    // This would need to be connected to the portfolios state
    // For now, it's a placeholder
  });
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
      />
    </div>
  );
}

export default App;

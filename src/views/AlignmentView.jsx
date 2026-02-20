import React from 'react';
import { DependencyMatrix } from '../components/Dependency/DependencyMatrix';
export function AlignmentView({ portfolios, initiatives, dependencies, teams }) {
  // Portfolio Health
  const portfolioHealth = portfolios.map(portfolio => {
    const portfolioInitiatives = initiatives.filter(i => i.portfolio == portfolio.id);
    const atRisk = portfolioInitiatives.filter(i =>
      dependencies.some(d => d.initiativeId === i.id && d.status === "Can't Commit")
    );
    return { portfolio, initiatives: portfolioInitiatives, atRisk };
  });

  // Teams Requiring Alignment
  const alignmentMap = new Map();
  dependencies.forEach(dep => {
    if (dep.status === 'Under Discussion' || dep.status === "Can't Commit") {
      const initiative = initiatives.find(i => i.id === dep.initiativeId);
      if (initiative && dep.dependsOnTeam) {
        const key = [initiative.team, dep.dependsOnTeam].sort().join('-');
        if (!alignmentMap.has(key)) {
          alignmentMap.set(key, {
            team1: initiative.team,
            team2: dep.dependsOnTeam,
            discussion: 0,
            blocked: 0
          });
        }
        const pair = alignmentMap.get(key);
        if (dep.status === 'Under Discussion') pair.discussion++;
        if (dep.status === "Can't Commit") pair.blocked++;
      }
    }
  });

  const alignmentNeeds = Array.from(alignmentMap.values());

  // Status counts
  const statusCounts = [
    { status: 'Pending', color: 'gray', count: dependencies.filter(d => d.status === 'Pending').length },
    { status: 'Committed', color: 'green', count: dependencies.filter(d => d.status === 'Committed').length },
    { status: 'Under Discussion', color: 'yellow', count: dependencies.filter(d => d.status === 'Under Discussion').length },
    { status: "Can't Commit", color: 'red', count: dependencies.filter(d => d.status === "Can't Commit").length },
  ];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Alignment</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* Portfolio Health */}
        <div className="bg-white p-6 rounded shadow">
          <h3 className="font-bold mb-4">Portfolio Health</h3>
          {portfolioHealth.map(({ portfolio, initiatives: inits, atRisk }) => (
            <div key={portfolio.id} className="border-l-4 border-blue-600 pl-4 mb-3">
              <div className="font-semibold">{portfolio.name}</div>
              <div className="text-sm">
                {inits.length} initiative{inits.length !== 1 ? 's' : ''}
                {atRisk.length > 0 && (
                  <span className="text-red-600 ml-2">({atRisk.length} at risk)</span>
                )}
              </div>
            </div>
          ))}
          {portfolios.length === 0 && (
            <p className="text-gray-500 text-sm">No portfolios defined</p>
          )}
        </div>

        {/* Teams Requiring Alignment */}
        <div className="bg-white p-6 rounded shadow">
          <h3 className="font-bold mb-4">Teams Requiring Alignment</h3>
          {alignmentNeeds.map((pair, idx) => (
            <div key={idx} className="border rounded p-3 bg-yellow-50 mb-2">
              <div className="font-semibold">{pair.team1} & {pair.team2}</div>
              <div className="text-sm">
                {pair.discussion} discussion, {pair.blocked} blocked
              </div>
            </div>
          ))}
          {alignmentNeeds.length === 0 && (
            <p className="text-gray-500 text-sm">No alignment issues</p>
          )}
        </div>

        {/* Status Overview */}
        <div className="bg-white p-6 rounded shadow col-span-2">
          <h3 className="font-bold mb-4">Status</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            {statusCounts.map(({ status, color, count }) => (
              <div key={status} className={`p-4 bg-${color}-50 rounded`}>
                <div className={`text-3xl font-bold text-${color}-800`}>{count}</div>
                <div className={`text-sm text-${color}-600`}>{status}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dependency Matrix */}
        <DependencyMatrix initiatives={initiatives} dependencies={dependencies} teams={teams} />
      </div>
    </div>
  );
}

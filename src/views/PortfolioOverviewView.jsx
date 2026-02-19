import React from 'react';

export function PortfolioOverviewView({ portfolios, initiatives, dependencies }) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Portfolio Overview</h2>

      {portfolios.map(portfolio => {
        const portfolioInitiatives = initiatives.filter(i => i.portfolio == portfolio.id);
        
        const totalValue = portfolioInitiatives.reduce((sum, init) => {
          if (init.valueType === 'EUR' && init.valueAmount) {
            return sum + parseFloat(init.valueAmount.replace(/[^0-9.-]+/g, '') || 0);
          }
          return sum;
        }, 0);

        const regulatoryCount = portfolioInitiatives.filter(i => i.valueType === 'Regulatory').length;
        const riskReductionCount = portfolioInitiatives.filter(i => i.valueType === 'Risk Reduction').length;

        const atRisk = portfolioInitiatives.filter(i =>
          dependencies.some(d => d.initiativeId === i.id && d.status === "Can't Commit")
        );

        const underDiscussion = portfolioInitiatives.filter(i =>
          dependencies.some(d => d.initiativeId === i.id && d.status === 'Under Discussion')
        );

        const committed = portfolioInitiatives.filter(i => {
          const deps = dependencies.filter(d => d.initiativeId === i.id);
          return deps.length === 0 || deps.every(d => d.status === 'Committed');
        });

        return (
          <div key={portfolio.id} className="bg-white p-6 rounded shadow mb-6">
            <div className="mb-4">
              <h3 className="text-xl font-bold">{portfolio.name}</h3>
              <p className="text-sm text-gray-600">
                Owner: {portfolio.owner} | Year: {portfolio.year}
              </p>
              {portfolio.description && (
                <p className="text-sm mt-2">{portfolio.description}</p>
              )}
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded">
                <div className="text-2xl font-bold">{portfolioInitiatives.length}</div>
                <div className="text-sm">Total</div>
              </div>
              <div className="bg-green-50 p-4 rounded">
                <div className="text-2xl font-bold text-green-800">{committed.length}</div>
                <div className="text-sm text-green-600">Committed</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded">
                <div className="text-2xl font-bold text-yellow-800">{underDiscussion.length}</div>
                <div className="text-sm text-yellow-600">Discussion</div>
              </div>
              <div className="bg-red-50 p-4 rounded">
                <div className="text-2xl font-bold text-red-800">{atRisk.length}</div>
                <div className="text-sm text-red-600">At Risk</div>
              </div>
            </div>

            {(totalValue > 0 || regulatoryCount > 0 || riskReductionCount > 0) && (
              <div className="grid grid-cols-3 gap-4 mt-4">
                {totalValue > 0 && (
                  <div className="border-l-4 border-green-500 pl-4">
                    <div className="text-lg font-bold">€{totalValue.toLocaleString()}</div>
                    <div className="text-sm">Value</div>
                  </div>
                )}
                {regulatoryCount > 0 && (
                  <div className="border-l-4 border-blue-500 pl-4">
                    <div className="text-lg font-bold">{regulatoryCount}</div>
                    <div className="text-sm">Regulatory</div>
                  </div>
                )}
                {riskReductionCount > 0 && (
                  <div className="border-l-4 border-orange-500 pl-4">
                    <div className="text-lg font-bold">{riskReductionCount}</div>
                    <div className="text-sm">Risk Reduction</div>
                  </div>
                )}
              </div>
            )}

            {portfolioInitiatives.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Initiatives:</h4>
                {portfolioInitiatives.map(initiative => {
                  const deps = dependencies.filter(d => d.initiativeId === initiative.id);
                  const blocked = deps.some(d => d.status === "Can't Commit");
                  const discussion = deps.some(d => d.status === 'Under Discussion');

                  return (
                    <div
                      key={initiative.id}
                      className="flex justify-between text-sm p-2 bg-gray-50 rounded mb-1"
                    >
                      <div>
                        <span className="font-medium">{initiative.name}</span>{' '}
                        <span className="text-gray-500">({initiative.team})</span>{' '}
                        <span className="text-gray-400">- {initiative.quarters.join(', ')}</span>
                      </div>
                      <div>
                        {blocked && (
                          <span className="text-red-600 text-xs">🚫 Blocked</span>
                        )}
                        {!blocked && discussion && (
                          <span className="text-yellow-600 text-xs">💬 Discussion</span>
                        )}
                        {!blocked && !discussion && deps.length > 0 && (
                          <span className="text-green-600 text-xs">✓ Committed</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {portfolios.length === 0 && (
        <div className="bg-white p-12 rounded shadow text-center text-gray-500">
          No portfolios yet. Create portfolios in the Portfolios tab.
        </div>
      )}
    </div>
  );
}

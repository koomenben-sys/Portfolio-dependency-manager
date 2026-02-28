import React from 'react';
import { Plus } from '../components/common/Icons';
import { PortfolioCard } from '../components/Portfolio/PortfolioCard';

export function PortfoliosView({ portfolios, addPortfolio, updatePortfolio, deletePortfolio, role }) {
  return (
    <div>
      <div className="flex justify-between mb-6">
        <h2 className="text-2xl font-bold">Portfolios</h2>
        {role === 'admin' && (
          <button
            onClick={addPortfolio}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            <Plus size={18} />
            Add
          </button>
        )}
      </div>

      {portfolios.map(portfolio => (
        <PortfolioCard
          key={portfolio.id}
          portfolio={portfolio}
          onUpdate={updatePortfolio}
          onDelete={deletePortfolio}
          role={role}
        />
      ))}

      {portfolios.length === 0 && (
        <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-200 text-center text-gray-500">
          No portfolios yet.{role === 'admin' ? ' Click "Add" to create your first portfolio.' : ''}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Target, GitBranch, Users, Calendar, Eye, Settings } from '../common/Icons';

export function Navigation({ currentView, onViewChange, onSettingsClick }) {
  const tabs = [
    { id: 'portfolios', label: '1. Portfolios', icon: Target },
    { id: 'dependencies', label: '2. Dependencies', icon: GitBranch },
    { id: 'prioritization', label: '3. Prioritization', icon: Users },
    { id: 'overview', label: '4. Alignment', icon: Calendar },
    { id: 'portfolio-overview', label: '5. Portfolio Overview', icon: Eye },
  ];

  return (
    <div className="bg-white border-b">
      <div className="flex flex-wrap gap-1 p-2 justify-between">
        <div className="flex flex-wrap gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onViewChange(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded ${
                  currentView === tab.id || currentView.startsWith(tab.id)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <button
            onClick={onSettingsClick}
            className="p-2 rounded bg-gray-100 hover:bg-gray-200"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

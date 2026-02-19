import React, { useState } from 'react';
import { Plus, Calendar } from '../components/common/Icons';
import { InitiativeCard } from '../components/Initiative/InitiativeCard';
import { DependencyItem } from '../components/Dependency/DependencyItem';
import { TEAMS, EFFORT_SIZES } from '../constants';

export function DependenciesView({
  initiatives,
  dependencies,
  portfolios,
  addInitiative,
  updateInitiative,
  deleteInitiative,
  toggleQuarter,
  addDependency,
  updateDependency,
  deleteDependency,
  toggleDependencyQuarter,
  updateDependencyStatus,
  deleteDependenciesForInitiative
}) {
  const [currentTeam, setCurrentTeam] = useState(TEAMS[0]);
  const [subView, setSubView] = useState('outgoing');

  const teamInitiatives = initiatives.filter(i => i.team === currentTeam);
  
  const outgoingDeps = dependencies.filter(d => {
    const init = initiatives.find(i => i.id === d.initiativeId);
    return init && init.team === currentTeam;
  });

  const incomingDeps = dependencies.filter(d => d.dependsOnTeam === currentTeam);

  const handleDeleteInitiative = (id) => {
    deleteDependenciesForInitiative(id);
    deleteInitiative(id);
  };

  return (
    <div>
      <div className="mb-6">
        <select
          value={currentTeam}
          onChange={(e) => setCurrentTeam(e.target.value)}
          className="border rounded px-4 py-2"
        >
          {TEAMS.map(team => (
            <option key={team}>{team}</option>
          ))}
        </select>
      </div>

      <div className="mb-6 border-b flex">
        <button
          onClick={() => setSubView('outgoing')}
          className={`px-4 py-2 flex items-center gap-2 ${
            subView === 'outgoing'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : ''
          }`}
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
            {outgoingDeps.length}
          </span>
          Outgoing
        </button>
        <button
          onClick={() => setSubView('incoming')}
          className={`px-4 py-2 flex items-center gap-2 ${
            subView === 'incoming'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : ''
          }`}
        >
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
            {incomingDeps.length}
          </span>
          Incoming
        </button>
      </div>

      {subView === 'outgoing' && (
        <div>
          <div className="flex justify-between mb-4">
            <h3 className="text-xl font-bold">Initiatives</h3>
            <button
              onClick={() => addInitiative(currentTeam)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              <Plus size={18} />
              Add
            </button>
          </div>

          {teamInitiatives.map(initiative => {
            const initDeps = outgoingDeps.filter(d => d.initiativeId === initiative.id);

            return (
              <div key={initiative.id}>
                <InitiativeCard
                  initiative={initiative}
                  portfolios={portfolios}
                  dependencies={dependencies}
                  onUpdate={updateInitiative}
                  onDelete={handleDeleteInitiative}
                  onToggleQuarter={toggleQuarter}
                  onAddDependency={addDependency}
                />

                {initDeps.map(dep => (
                  <div key={dep.id} className="ml-8 mb-4">
                    <DependencyItem
                      dependency={dep}
                      currentTeam={currentTeam}
                      onUpdate={updateDependency}
                      onDelete={deleteDependency}
                      onToggleQuarter={toggleDependencyQuarter}
                    />
                  </div>
                ))}
              </div>
            );
          })}

          {teamInitiatives.length === 0 && (
            <div className="bg-white p-12 rounded shadow text-center text-gray-500">
              No initiatives for {currentTeam}. Click "Add" to create one.
            </div>
          )}
        </div>
      )}

      {subView === 'incoming' && (
        <div>
          <h3 className="text-xl font-bold mb-4">Incoming for {currentTeam}</h3>

          {incomingDeps.map(dep => {
            const initiative = initiatives.find(i => i.id === dep.initiativeId);
            if (!initiative) return null;

            return (
              <div key={dep.id} className="bg-white p-6 rounded mb-4 shadow">
                <div className="flex justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg">
                      {initiative.team} needs: {dep.description}
                    </h4>
                    <p className="text-sm text-gray-600">For: {initiative.name}</p>
                    {dep.quarters && dep.quarters.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        <span className="text-sm">Needed:</span>
                        {dep.quarters.map(q => (
                          <span
                            key={q}
                            className="px-2 py-1 text-sm rounded bg-blue-600 text-white"
                          >
                            {q}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs">Effort</label>
                    <select
                      value={dep.effort || 'TBD'}
                      onChange={(e) => updateDependency(dep.id, 'effort', e.target.value)}
                      className="border rounded px-3 py-1"
                    >
                      {EFFORT_SIZES.map(size => (
                        <option key={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => updateDependencyStatus(dep.id, 'Committed')}
                    className={`px-4 py-2 rounded ${
                      dep.status === 'Committed'
                        ? 'bg-green-600 text-white'
                        : 'bg-green-100 hover:bg-green-200'
                    }`}
                  >
                    Commit
                  </button>
                  <button
                    onClick={() => updateDependencyStatus(dep.id, "Can't Commit")}
                    className={`px-4 py-2 rounded ${
                      dep.status === "Can't Commit"
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 hover:bg-red-200'
                    }`}
                  >
                    Can't
                  </button>
                  <button
                    onClick={() => updateDependencyStatus(dep.id, 'Under Discussion')}
                    className={`px-4 py-2 rounded ${
                      dep.status === 'Under Discussion'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-yellow-100 hover:bg-yellow-200'
                    }`}
                  >
                    Discussion
                  </button>
                </div>
              </div>
            );
          })}

          {incomingDeps.length === 0 && (
            <div className="bg-white p-12 rounded shadow text-center text-gray-500">
              No incoming dependencies for {currentTeam}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

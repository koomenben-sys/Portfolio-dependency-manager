import React from 'react';
import { status as statusColors } from '../../constants/design';
export function DependencyMatrix({ initiatives, dependencies, teams }) {
  const TEAMS = teams || [];
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 border-l-4 border-l-indigo-500 col-span-2">
      <h3 className="font-bold mb-4">Dependency Matrix</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-50 text-sm font-semibold text-left min-w-[200px]">
                ↓ Requesting / Required →
              </th>
              {TEAMS.map(team => (
                <th key={team} className="border p-2 bg-gray-50 text-xs min-w-[120px]">
                  {team.replace('Team ', '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {initiatives.map(init => {
              const deps = dependencies.filter(dep => dep.initiativeId === init.id);
              if (deps.length === 0) return null;

              return (
                <tr key={init.id}>
                  <td className="border p-2 bg-gray-50 font-semibold text-xs">
                    <div className="font-medium">{init.name || 'Unnamed'}</div>
                    <div className="text-gray-500">({init.team})</div>
                  </td>
                  {TEAMS.map(team => {
                    const dep = deps.find(d => d.dependsOnTeam === team);
                    if (!dep) {
                      return <td key={team} className="border bg-white"></td>;
                    }

                    const s = statusColors[dep.status];

                    return (
                      <td key={team} className={`border p-2 ${s?.bgMedium}`}>
                        <div className="text-xs font-semibold text-center">
                          {s?.icon}{' '}
                          {dep.status}
                        </div>
                        {(dep.effort && dep.effort !== 'TBD' || dep.quarters?.length > 0) && (
                          <div className="flex gap-2 justify-center mt-1">
                            {dep.effort && dep.effort !== 'TBD' && (
                              <span className="text-xs text-gray-600">{dep.effort}</span>
                            )}
                            {dep.quarters && dep.quarters.length > 0 && (
                              <span className="text-xs text-gray-600">{dep.quarters.join(', ')}</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {initiatives.filter(init => 
              dependencies.filter(dep => dep.initiativeId === init.id).length > 0
            ).length === 0 && (
              <tr>
                <td colSpan={TEAMS.length + 1} className="border p-4 text-center text-gray-500">
                  No dependencies defined yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

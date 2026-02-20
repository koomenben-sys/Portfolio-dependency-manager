import React from 'react';
export function DependencyMatrix({ initiatives, dependencies, teams }) {
  const TEAMS = teams || [];
  return (
    <div className="bg-white p-6 rounded shadow col-span-2">
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
                      return <td key={team} className="border bg-gray-100"></td>;
                    }

                    let bg = 
                      dep.status === "Can't Commit" ? 'bg-red-200' :
                      dep.status === 'Under Discussion' ? 'bg-yellow-200' :
                      dep.status === 'Pending' ? 'bg-blue-100' :
                      'bg-green-200';

                    return (
                      <td key={team} className={`border p-2 ${bg}`}>
                        {dep.effort && dep.effort !== 'TBD' && (
                          <div className="text-xs text-gray-700">Effort: {dep.effort}</div>
                        )}
                        {dep.quarters && dep.quarters.length > 0 && (
                          <div className="text-xs text-gray-700">
                            {dep.quarters.join(',')}
                          </div>
                        )}
                        <div className="text-xs mt-1 font-semibold">
                          {dep.status === 'Committed' ? '✓' :
                           dep.status === 'Pending' ? '⏳' :
                           dep.status === 'Under Discussion' ? '💬' :
                           '🚫'}{' '}
                          {dep.status}
                        </div>
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

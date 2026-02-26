import React from 'react';

const ROLE_BADGE = {
  admin:  'bg-red-100 text-red-800',
  editor: 'bg-yellow-100 text-yellow-800',
  viewer: 'bg-gray-100 text-gray-700',
};

export function Header({ user, role, onSignOut }) {
  return (
    <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
      <h1 className="text-2xl font-bold">Portfolio Dependency Manager</h1>

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-90">{user.email}</span>
          {role && (
            <span className={`text-xs px-2 py-1 rounded font-semibold ${ROLE_BADGE[role] ?? ROLE_BADGE.viewer}`}>
              {role}
            </span>
          )}
          <button
            onClick={onSignOut}
            className="text-sm px-3 py-1 bg-white text-blue-600 rounded hover:bg-blue-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DATA_SOURCE } from '../data/repository';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState(null);
  const [checkedFor, setCheckedFor] = useState(null); // user id whose invitations + membership were loaded

  // Mock mode never touches Supabase (AC A1).
  if (DATA_SOURCE !== 'supabase') {
    return (
      <AuthContext.Provider value={{ user: null, role: null, loading: false, signOut: async () => {}, membership: null, membershipLoading: false }}>
        {children}
      </AuthContext.Provider>
    );
  }

  // Membership row (db/migrations/002, 006) drives role, team, rank permission and the display name.
  async function loadMembership(u) {
    const { data } = await supabase.from('memberships').select('*').eq('user_id', u.id).limit(1).maybeSingle();
    if (!data) return null;
    return { id: u.id, name: data.display_name || u.email, role: data.role, teamId: data.team_id, canRank: data.can_rank, orgId: data.org_id };
  }

  useEffect(() => {
    let alive = true;
    // Safety net: if no auth event arrives within 5 s, show the login screen instead of "Loading…".
    const timeout = setTimeout(() => { if (alive) setLoading(false); }, 5000);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return; // nothing to reload
      // Never await Supabase calls inside this callback: supabase-js holds its auth lock while the
      // callback runs, and a nested query waits for that same lock (live test 2026-10-17: every
      // request after the first token refresh hung). Defer the work to the next tick instead.
      setTimeout(() => {
        if (!alive) return;
        clearTimeout(timeout);
        if (session?.user) {
          // Only keep the user here; invitations and membership load in the effect below.
          setUser((prev) => (prev?.id === session.user.id ? prev : session.user));
          setLoading(false);
        } else {
          setUser(null); setRole(null); setMembership(null); setLoading(false);
        }
      }, 0);
    });
    return () => { alive = false; clearTimeout(timeout); subscription.unsubscribe(); };
  }, []);

  // After sign-in (outside onAuthStateChange, see above): accept open invitations for this e-mail address
  // (007 accept_invitations; ignored when 007 is not run), then read the membership.
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    Promise.resolve(supabase.rpc('accept_invitations'))
      .then(({ error }) => { if (error) console.warn(`accept_invitations: ${error.message}`); })
      .catch(() => {})
      .then(() => loadMembership(user))
      .then((m) => { if (alive) { setMembership(m); setRole(m?.role ?? 'viewer'); } })
      .catch(() => { if (alive) setRole('viewer'); })
      .finally(() => { if (alive) setCheckedFor(user.id); });
    return () => { alive = false; };
  }, [user?.id]);
  // True from sign-in until the membership is known, so the plan does not load before invitations are accepted.
  const membershipLoading = !!user && checkedFor !== user.id;

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // signOut may fail if the session is already invalid; clear local state anyway
    }
    setUser(null);
    setRole(null);
    setMembership(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut, membership, membershipLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

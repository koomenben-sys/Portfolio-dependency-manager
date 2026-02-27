import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadRole(userId) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      if (error) {
        // JWT expired/invalid — stored session is stale. Sign out so
        // onAuthStateChange fires with null and the user sees the login screen.
        if (error.code === 'PGRST301' || error.code === 'PGRST302') {
          supabase.auth.signOut();
        }
        return 'viewer';
      }
      return data?.role ?? 'viewer';
    } catch (err) {
      // Likely an AbortError from the 8s fetch timeout. Schedule one retry so
      // the role updates to the correct value once the connection recovers.
      setTimeout(() => {
        loadRole(userId).then(r => setRole(r)).catch(() => {});
      }, 6000);
      throw err; // re-throw so the caller's .catch(() => 'viewer') fires immediately
    }
  }

  useEffect(() => {
    // Detect page reloads (F5 / Ctrl+R) using sessionStorage, which survives
    // reloads within the same tab but is cleared when the tab is closed.
    // On reload, sign out immediately so the user gets a clean login instead of
    // a broken state (empty data, null role, broken sign-out button).
    const isReload = sessionStorage.getItem('app_initialized') === '1';
    sessionStorage.setItem('app_initialized', '1');
    if (isReload) {
      setUser(null);
      setRole(null);
      setLoading(false);
      supabase.auth.signOut(); // clears localStorage; don't await — login screen shows already
    }

    let settled = false;

    // Safety net: if onAuthStateChange doesn't fire within 5s (e.g. expired
    // token causes a silent network hang), unblock the UI so the user sees
    // the login screen instead of a stuck "Loading…".
    const timeout = setTimeout(() => {
      if (!settled) {
        setUser(null);
        setRole(null);
        setLoading(false);
      }
    }, 5000);

    // On reload, block ALL events until our signOut() confirms with SIGNED_OUT.
    // Only then do we allow SIGNED_IN (the user's explicit re-login) through.
    // Supabase fires SIGNED_IN on session restoration, so we can't use it as
    // a safe "allow" event — we must wait for the signOut gate to open first.
    let reloadSignoutConfirmed = !isReload;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!reloadSignoutConfirmed) {
          if (event === 'SIGNED_OUT') {
            reloadSignoutConfirmed = true;
          }
          // Don't process any event until signOut is confirmed — state is
          // already null/false from the isReload block above.
          return;
        }

        settled = true;
        clearTimeout(timeout);
        if (session?.user) {
          setUser(session.user);
          setLoading(false); // unblock UI immediately; role loads in background
          setRole(await loadRole(session.user.id).catch(() => 'viewer'));
        } else {
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // signOut may fail if the session is already invalid; clear local state anyway
    }
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

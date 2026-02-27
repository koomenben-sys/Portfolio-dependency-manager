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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
    await supabase.auth.signOut();
    // Clear state immediately — don't wait for onAuthStateChange
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

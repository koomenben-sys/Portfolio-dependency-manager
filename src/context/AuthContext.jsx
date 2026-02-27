import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadRole(userId) {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (error) return 'viewer';
    return data?.role ?? 'viewer';
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

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { createRepository, DATA_SOURCE } from '../data/repository';
import { PERSONAS } from '../data/seed';
import { I18nContext } from '../i18n';

const PlanContext = createContext(null);

// Holds the plan state, the current actor (persona in mock mode) and the selected quarter.
// Every write goes through `run(name, ...args)` which calls the repository and replaces the state.
export function PlanProvider({ children, authUser }) {
  const [repo, setRepo] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [actorId, setActorId] = useState(() => { try { return localStorage.getItem('kwartaalplan.actor') || PERSONAS[0].id; } catch { return PERSONAS[0].id; } });
  const [quarterId, setQuarterId] = useState(null);

  useEffect(() => {
    let alive = true;
    createRepository().then(async (r) => {
      const s = await r.load();
      if (!alive) return;
      setRepo(r); setState(s);
    }).catch((e) => setError(e.message));
    return () => { alive = false; };
  }, []);

  // No real-time sync in the MVP; in Supabase mode refresh every 30 s so a facilitator's screen does not go stale.
  useEffect(() => {
    if (!repo || DATA_SOURCE !== 'supabase') return undefined;
    const id = setInterval(() => repo.load().then(setState).catch(() => {}), 30000);
    return () => clearInterval(id);
  }, [repo]);

  useEffect(() => {
    if (!state) return;
    if (quarterId && state.quarters.some((q) => q.id === quarterId)) return; // keep a valid selection; re-pick after a reset
    const preferred = state.quarters.find((q) => !['closed', 'active'].includes(q.phase)) || state.quarters.find((q) => q.phase === 'active') || state.quarters[0];
    setQuarterId(preferred?.id ?? null);
  }, [state, quarterId]);

  const [seenTick, setSeenTick] = useState(0);
  const actor = useMemo(() => {
    const base = DATA_SOURCE === 'supabase' && authUser ? authUser : (PERSONAS.find((p) => p.id === actorId) || PERSONAS[0]);
    let lastSeen = null;
    try { lastSeen = localStorage.getItem(`kwartaalplan.lastSeen.${base.id}`); } catch { /* ignore */ }
    return { ...base, lastSeen };
  }, [actorId, authUser, seenTick]);
  // Called when the user leaves My attention: everything shown is no longer "new".
  const markAttentionSeen = useCallback(() => { try { localStorage.setItem(`kwartaalplan.lastSeen.${actor.id}`, new Date().toISOString()); } catch { /* ignore */ } setSeenTick((t) => t + 1); }, [actor.id]);

  const chooseActor = useCallback((id) => { setActorId(id); try { localStorage.setItem('kwartaalplan.actor', id); } catch { /* ignore */ } }, []);

  // Runs a repository command; returns { ok, error }. Views show the error inline.
  const run = useCallback(async (method, ...args) => {
    if (!repo) return { ok: false, error: 'Not ready' };
    try {
      const result = await repo[method](actor, ...args);
      if (result && Array.isArray(result.teams)) setState(result);
      else setState(await repo.load());
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [repo, actor]);

  const reset = useCallback(async () => { if (repo?.reset) setState(await repo.reset()); }, [repo]);

  const quarter = state?.quarters.find((q) => q.id === quarterId) || null;
  const value = useMemo(() => ({ state, actor, chooseActor, personas: PERSONAS, quarter, quarterId, setQuarterId, run, reset, error, dataSource: DATA_SOURCE, markAttentionSeen }),
    [state, actor, chooseActor, quarter, quarterId, run, reset, error, markAttentionSeen]);

  const lang = state?.settings?.language || 'nl';
  return <PlanContext.Provider value={value}><I18nContext.Provider value={lang}>{children}</I18nContext.Provider></PlanContext.Provider>;
}

export const usePlan = () => useContext(PlanContext);

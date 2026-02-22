import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { DELETE_ALL } from '../lib/db'

export function useTeams() {
  const [teams, setTeamsState]         = useState([])   // string[] for UI
  const [teamsWithIds, setTeamsWithIds] = useState([])   // [{id, name}] for FK lookups
  const [loading, setLoading]          = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('created_at')

    if (error) { console.error('useTeams load error:', error); setLoading(false); return }

    const rows = data ?? []
    setTeamsWithIds(rows)
    setTeamsState(rows.map(t => t.name))
    setLoading(false)
  }

  const addTeam = async () => {
    const { data, error } = await supabase
      .from('teams')
      .insert({ name: 'New Team' })
      .select()
      .single()

    if (error) { console.error('addTeam error:', error); return }

    setTeamsWithIds(prev => [...prev, data])
    setTeamsState(prev => [...prev, data.name])
  }

  const updateTeam = async (index, name) => {
    const team = teamsWithIds[index]
    if (!team) return

    // Optimistic update
    setTeamsState(prev => prev.map((t, i) => i === index ? name : t))
    setTeamsWithIds(prev => prev.map((t, i) => i === index ? { ...t, name } : t))

    const { error } = await supabase
      .from('teams')
      .update({ name })
      .eq('id', team.id)

    if (error) console.error('updateTeam error:', error)
  }

  const deleteTeam = async (index) => {
    const team = teamsWithIds[index]
    if (!team) return

    // Optimistic update
    setTeamsState(prev => prev.filter((_, i) => i !== index))
    setTeamsWithIds(prev => prev.filter((_, i) => i !== index))

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', team.id)

    if (error) console.error('deleteTeam error:', error)
  }

  // Bulk replace — used by the import flow in App.jsx
  const setTeams = async (teamNames) => {
    await supabase.from('teams').delete().neq(DELETE_ALL.column, DELETE_ALL.value)

    if (!teamNames?.length) {
      setTeamsState([])
      setTeamsWithIds([])
      return []
    }

    const { data, error } = await supabase
      .from('teams')
      .insert(teamNames.map(name => ({ name })))
      .select()

    if (error) { console.error('setTeams error:', error); return [] }

    const rows = data ?? []
    setTeamsWithIds(rows)
    setTeamsState(rows.map(t => t.name))
    return rows   // returns [{id, name}] so import can build UUID maps
  }

  return { teams, teamsWithIds, setTeams, addTeam, updateTeam, deleteTeam, loading }
}

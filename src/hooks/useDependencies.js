import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { dependencyFromDb, nextRefCode, teamIdByName, DELETE_ALL } from '../lib/db'

export function useDependencies() {
  const [dependencies, setDependenciesState] = useState([])
  const [loading, setLoading]                = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const { data, error } = await supabase
      .from('dependencies')
      .select('*, teams(name)')
      .order('created_at')

    if (error) { console.error('useDependencies load error:', error); setLoading(false); return }

    setDependenciesState((data ?? []).map(dependencyFromDb))
    setLoading(false)
  }

  const addDependency = async (initiativeId) => {
    const refCode = await nextRefCode('dependency')

    const { data, error } = await supabase
      .from('dependencies')
      .insert({
        ref_code:           refCode,
        initiative_id:      initiativeId,
        depends_on_team_id: null,
        description:        '',
        quarters:           [],
        effort:             'TBD',
        status:             'Pending',
      })
      .select('*, teams(name)')
      .single()

    if (error) { console.error('addDependency error:', error); return }

    setDependenciesState(prev => [...prev, dependencyFromDb(data)])
  }

  const updateDependency = async (id, field, value) => {
    // Optimistic update
    setDependenciesState(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))

    let dbUpdate = {}
    switch (field) {
      case 'dependsOnTeam':
        dbUpdate.depends_on_team_id = await teamIdByName(value)
        break
      case 'initiativeId':
        dbUpdate.initiative_id = value
        break
      case 'refCode':
        dbUpdate.ref_code = value
        break
      default:
        dbUpdate[field] = value
    }

    const { error } = await supabase
      .from('dependencies')
      .update(dbUpdate)
      .eq('id', id)

    if (error) console.error('updateDependency error:', error)
  }

  const deleteDependency = async (id) => {
    setDependenciesState(prev => prev.filter(d => d.id !== id))

    const { error } = await supabase
      .from('dependencies')
      .delete()
      .eq('id', id)

    if (error) console.error('deleteDependency error:', error)
  }

  const toggleDependencyQuarter = async (id, quarter) => {
    const dep = dependencies.find(d => d.id === id)
    if (!dep) return

    const quarters = (dep.quarters ?? []).includes(quarter)
      ? dep.quarters.filter(q => q !== quarter)
      : [...(dep.quarters ?? []), quarter]

    setDependenciesState(prev => prev.map(d => d.id === id ? { ...d, quarters } : d))

    const { error } = await supabase
      .from('dependencies')
      .update({ quarters })
      .eq('id', id)

    if (error) console.error('toggleDependencyQuarter error:', error)
  }

  const updateDependencyStatus = async (id, status) => {
    setDependenciesState(prev => prev.map(d => d.id === id ? { ...d, status } : d))

    const { error } = await supabase
      .from('dependencies')
      .update({ status })
      .eq('id', id)

    if (error) console.error('updateDependencyStatus error:', error)
  }

  // Remove from local state for dependencies belonging to a deleted initiative.
  // The DB cascade handles the actual deletion — this just keeps React state in sync.
  const deleteDependenciesForInitiative = (initiativeId) => {
    setDependenciesState(prev => prev.filter(d => d.initiativeId !== initiativeId))
  }

  // Bulk replace — used by the import flow in App.jsx
  // Receives already-mapped DB rows (with correct UUIDs)
  const setDependencies = async (dbRows) => {
    await supabase.from('dependencies').delete().neq(DELETE_ALL.column, DELETE_ALL.value)

    if (!dbRows?.length) { setDependenciesState([]); return }

    const { data, error } = await supabase
      .from('dependencies')
      .insert(dbRows)
      .select('*, teams(name)')

    if (error) { console.error('setDependencies error:', error); return }

    setDependenciesState((data ?? []).map(dependencyFromDb))
  }

  return {
    dependencies,
    setDependencies,
    addDependency,
    updateDependency,
    deleteDependency,
    toggleDependencyQuarter,
    updateDependencyStatus,
    deleteDependenciesForInitiative,
    loading,
  }
}

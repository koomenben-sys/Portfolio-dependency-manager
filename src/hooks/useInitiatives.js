import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { initiativeFromDb, nextRefCode, teamIdByName, DELETE_ALL } from '../lib/db'

export function useInitiatives() {
  const [initiatives, setInitiativesState] = useState([])
  const [loading, setLoading]              = useState(true)

  useEffect(() => { load() }, [])

  async function load(attempt = 1) {
    const { data, error } = await supabase
      .from('initiatives')
      .select('*, teams(name)')
      .order('priority')

    if (error) {
      console.error('useInitiatives load error:', error)
      if (attempt === 1) setTimeout(() => load(2), 5000)
      setLoading(false)
      return
    }

    setInitiativesState((data ?? []).map(initiativeFromDb))
    setLoading(false)
  }

  const addInitiative = async (teamName) => {
    const [refCode, teamId] = await Promise.all([
      nextRefCode('initiative'),
      teamIdByName(teamName),
    ])

    const { data, error } = await supabase
      .from('initiatives')
      .insert({
        ref_code:     refCode,
        name:         '',
        team_id:      teamId,
        quarters:     [],
        portfolio_id: null,
        effort:       'M',
        value_type:   'EUR',
        value_amount: null,
        priority:     initiatives.length + 1,
      })
      .select('*, teams(name)')
      .single()

    if (error) { console.error('addInitiative error:', error); return }

    setInitiativesState(prev => [...prev, initiativeFromDb(data)])
  }

  const updateInitiative = async (id, field, value) => {
    // Optimistic update
    setInitiativesState(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))

    // Build the DB update object, mapping camelCase → snake_case and names → UUIDs
    let dbUpdate = {}
    switch (field) {
      case 'team':
        dbUpdate.team_id = await teamIdByName(value)
        break
      case 'portfolio':
        dbUpdate.portfolio_id = value || null
        break
      case 'valueType':
        dbUpdate.value_type = value
        break
      case 'valueAmount':
        dbUpdate.value_amount = value || null
        break
      case 'refCode':
        dbUpdate.ref_code = value
        break
      default:
        dbUpdate[field] = value
    }

    const { error } = await supabase
      .from('initiatives')
      .update(dbUpdate)
      .eq('id', id)

    if (error) console.error('updateInitiative error:', error)
  }

  const deleteInitiative = async (id) => {
    // Optimistic update (also remove orphaned dependencies from local state)
    setInitiativesState(prev => prev.filter(i => i.id !== id))

    // DB cascade handles dependency deletion automatically
    const { error } = await supabase
      .from('initiatives')
      .delete()
      .eq('id', id)

    if (error) console.error('deleteInitiative error:', error)
  }

  const toggleQuarter = async (id, quarter) => {
    const initiative = initiatives.find(i => i.id === id)
    if (!initiative) return

    const quarters = initiative.quarters.includes(quarter)
      ? initiative.quarters.filter(q => q !== quarter)
      : [...initiative.quarters, quarter]

    // Optimistic update
    setInitiativesState(prev => prev.map(i => i.id === id ? { ...i, quarters } : i))

    const { error } = await supabase
      .from('initiatives')
      .update({ quarters })
      .eq('id', id)

    if (error) console.error('toggleQuarter error:', error)
  }

  const reorderInitiatives = async (newOrder) => {
    // newOrder is the full array in the new sorted order
    setInitiativesState(newOrder)

    // Update priority for each initiative in Supabase
    await Promise.all(
      newOrder.map((initiative, index) =>
        supabase
          .from('initiatives')
          .update({ priority: index + 1 })
          .eq('id', initiative.id)
      )
    )
  }

  // Bulk replace — used by the import flow in App.jsx
  // Receives already-mapped DB rows (with correct UUIDs)
  const setInitiatives = async (dbRows) => {
    await supabase.from('initiatives').delete().neq(DELETE_ALL.column, DELETE_ALL.value)

    if (!dbRows?.length) { setInitiativesState([]); return [] }

    const { data, error } = await supabase
      .from('initiatives')
      .insert(dbRows)
      .select('*, teams(name)')

    if (error) { console.error('setInitiatives error:', error); return [] }

    const rows = data ?? []
    setInitiativesState(rows.map(initiativeFromDb))
    return rows
  }

  return {
    initiatives,
    setInitiatives,
    addInitiative,
    updateInitiative,
    deleteInitiative,
    toggleQuarter,
    reorderInitiatives,
    loading,
  }
}

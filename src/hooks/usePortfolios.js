import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { portfolioFromDb, nextRefCode, DELETE_ALL } from '../lib/db'

export function usePortfolios() {
  const [portfolios, setPortfoliosState] = useState([])
  const [loading, setLoading]            = useState(true)

  useEffect(() => { load() }, [])

  async function load(attempt = 1) {
    const { data, error } = await supabase
      .from('portfolios')
      .select('*')
      .order('created_at')

    if (error) {
      console.error('usePortfolios load error:', error)
      if (attempt === 1) setTimeout(() => load(2), 5000)
      setLoading(false)
      return
    }

    setPortfoliosState((data ?? []).map(portfolioFromDb))
    setLoading(false)
  }

  const addPortfolio = async () => {
    const refCode = await nextRefCode('portfolio')

    const { data, error } = await supabase
      .from('portfolios')
      .insert({
        ref_code:    refCode,
        name:        '',
        description: '',
        year:        new Date().getFullYear(),
        owner:       '',
      })
      .select()
      .single()

    if (error) { console.error('addPortfolio error:', error); return }

    setPortfoliosState(prev => [...prev, portfolioFromDb(data)])
  }

  const updatePortfolio = async (id, field, value) => {
    // Optimistic update
    setPortfoliosState(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))

    const dbField = field === 'refCode' ? 'ref_code' : field
    const { error } = await supabase
      .from('portfolios')
      .update({ [dbField]: value })
      .eq('id', id)

    if (error) console.error('updatePortfolio error:', error)
  }

  const deletePortfolio = async (id) => {
    // Optimistic update
    setPortfoliosState(prev => prev.filter(p => p.id !== id))

    const { error } = await supabase
      .from('portfolios')
      .delete()
      .eq('id', id)

    if (error) console.error('deletePortfolio error:', error)
  }

  // Bulk replace — used by the import flow in App.jsx
  const setPortfolios = async (appPortfolios) => {
    await supabase.from('portfolios').delete().neq(DELETE_ALL.column, DELETE_ALL.value)

    if (!appPortfolios?.length) { setPortfoliosState([]); return [] }

    const { data, error } = await supabase
      .from('portfolios')
      .insert(appPortfolios.map(p => ({
        ref_code:    p.refCode,
        name:        p.name        ?? '',
        description: p.description ?? '',
        year:        p.year,
        owner:       p.owner       ?? '',
      })))
      .select()

    if (error) { console.error('setPortfolios error:', error); return [] }

    const rows = data ?? []
    setPortfoliosState(rows.map(portfolioFromDb))
    return rows  // returns DB rows so import can build old-id → new-UUID map
  }

  return {
    portfolios,
    setPortfolios,
    addPortfolio,
    updatePortfolio,
    deletePortfolio,
    loading,
  }
}

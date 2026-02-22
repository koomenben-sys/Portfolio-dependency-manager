import { supabase } from './supabase'
import { generateRefCode } from '../utils/referenceCodeGenerator'

// ── Field mappers: DB row → app object ────────────────────────

export function portfolioFromDb(row) {
  return {
    id:          row.id,
    refCode:     row.ref_code,
    name:        row.name        ?? '',
    description: row.description ?? '',
    year:        row.year,
    owner:       row.owner       ?? '',
  }
}

// Requires the join: .select('*, teams(name)')
export function initiativeFromDb(row) {
  return {
    id:          row.id,
    refCode:     row.ref_code,
    name:        row.name          ?? '',
    team:        row.teams?.name   ?? '',   // resolved via join
    quarters:    row.quarters      ?? [],
    portfolio:   row.portfolio_id  ?? '',
    effort:      row.effort        ?? 'M',
    valueType:   row.value_type    ?? 'EUR',
    valueAmount: row.value_amount  ?? '',
    priority:    row.priority      ?? 0,
  }
}

// Requires the join: .select('*, teams(name)')
export function dependencyFromDb(row) {
  return {
    id:             row.id,
    refCode:        row.ref_code,
    initiativeId:   row.initiative_id,
    dependsOnTeam:  row.teams?.name  ?? '',   // resolved via join
    description:    row.description  ?? '',
    quarters:       row.quarters     ?? [],
    effort:         row.effort       ?? 'TBD',
    status:         row.status       ?? 'Pending',
  }
}

// ── Counter helper ─────────────────────────────────────────────

export async function nextRefCode(entity) {
  const { data, error } = await supabase
    .from('counters')
    .select('value')
    .eq('entity', entity)
    .single()

  if (error) {
    console.error('Counter fetch error:', error)
    return `${entity.toUpperCase()}-XXXX`
  }

  const value   = data.value
  const refCode = generateRefCode(entity, value)

  await supabase
    .from('counters')
    .update({ value: value + 1 })
    .eq('entity', entity)

  return refCode
}

// ── Team lookup: name → UUID ───────────────────────────────────

export async function teamIdByName(name) {
  if (!name) return null
  const { data } = await supabase
    .from('teams')
    .select('id')
    .eq('name', name)
    .single()
  return data?.id ?? null
}

// ── Delete-all helper (Supabase requires a filter to delete rows) ──

export const DELETE_ALL = { column: 'id', value: '00000000-0000-0000-0000-000000000000' }

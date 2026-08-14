import { logger } from '../lib/logger'
import { getSupabase, supabaseAvailable } from './supabase'

const PREFIX = 'prospex_'

export function getItem<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// fire-and-forget upload to Supabase (per-user storage)
async function uploadItemToSupabase<T>(key: string, value: T): Promise<void> {
  if (!supabaseAvailable) return
  const supabase = getSupabase()
  if (!supabase) return
  try {
    const { data: uData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !uData || !uData.user) return
    const userId = uData.user.id
    await supabase.from('app_storage').upsert(
      { user_id: userId, key, value },
      { onConflict: 'user_id,key' }
    )
  } catch (e) {
    logger.warn('STORAGE', `Falha ao sincronizar ${key} para Supabase`, String(e))
  }
}

async function deleteItemFromSupabase(key: string): Promise<void> {
  if (!supabaseAvailable) return
  const supabase = getSupabase()
  if (!supabase) return
  try {
    const { data: uData } = await supabase.auth.getUser()
    if (!uData || !uData.user) return
    const userId = uData.user.id
    await supabase.from('app_storage').delete().match({ user_id: userId, key })
  } catch (e) {
    logger.warn('STORAGE', `Falha ao deletar ${key} do Supabase`, String(e))
  }
}

export function setItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    // sync in background
    void uploadItemToSupabase(key, value)
  } catch (e) {
    logger.warn('STORAGE', `Falha ao persistir ${key}`, String(e))
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
    void deleteItemFromSupabase(key)
  } catch {
    /* ignore */
  }
}

export function listKeys(): string[] {
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length))
    }
  } catch {
    /* ignore */
  }
  return out
}

export function clearAll(): void {
  listKeys().forEach((k) => removeItem(k))
  logger.info('STORAGE', 'Todos os dados locais removidos')
}

// Fetch all keys/values from Supabase for the current user (returns map key->value)
export async function fetchAllFromSupabase(): Promise<Record<string, any> | null> {
  if (!supabaseAvailable) return null
  const supabase = getSupabase()
  if (!supabase) return null
  try {
    const { data: uData, error: userErr } = await supabase.auth.getUser()
    if (userErr || !uData || !uData.user) return null
    const userId = uData.user.id
    const { data, error } = await supabase.from('app_storage').select('key, value').eq('user_id', userId)
    if (error || !data) return null
    const out: Record<string, any> = {}
    for (const row of data as any[]) out[row.key] = row.value
    return out
  } catch (e) {
    logger.warn('STORAGE', `Falha ao buscar dados do Supabase`, String(e))
    return null
  }
}
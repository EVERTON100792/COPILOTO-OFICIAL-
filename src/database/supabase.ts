import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, isSupabaseConfigured } from '../config/env'
import { logger } from '../lib/logger'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null
  if (!client) {
    try {
      client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
      logger.info('DB', 'Supabase client inicializado')
    } catch (e) {
      logger.error('DB', 'Falha ao inicializar Supabase', String(e))
      client = null
    }
  }
  return client
}

export const supabaseAvailable = isSupabaseConfigured

export function onAuthStateChange(cb: (event: string, session: any) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) return () => {}
  try {
    const sub = supabase.auth.onAuthStateChange((event, session) => cb(event, session))
    // supabase-js returns an object containing subscription — try to unsubscribe safely
    return () => {
      try { (sub as any)?.data?.subscription?.unsubscribe?.(); } catch { /* ignore */ }
    }
  } catch (e) {
    return () => {}
  }
}
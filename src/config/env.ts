export const APP_NAME = 'PROSPEX AUTOPILOT'
export const APP_VERSION = '1.0.0'

export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'true') === 'true'

const normalizeSupabaseUrl = (raw?: string): string | undefined => {
  if (!raw) return raw
  const value = raw.trim().replace(/[\\/]+$/, '')
  return value.replace(/\/rest\/v1$/i, '').replace(/\/auth\/v1$/i, '')
}

const OVERPASS_DEFAULT = 'https://overpass-api.de/api/interpreter'
const NOMINATIM_DEFAULT = 'https://nominatim.openstreetmap.org/search'

export const env = {
  supabaseUrl: normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined),
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  aiProvider: import.meta.env.VITE_AI_PROVIDER as string | undefined,
  aiApiKey: import.meta.env.VITE_AI_API_KEY as string | undefined,
  aiModel: import.meta.env.VITE_AI_MODEL as string | undefined,
  searchProvider: import.meta.env.VITE_SEARCH_PROVIDER as string | undefined,
  searchApiKey: import.meta.env.VITE_SEARCH_API_KEY as string | undefined,
  emailProvider: import.meta.env.VITE_EMAIL_PROVIDER as string | undefined,
  emailApiKey: import.meta.env.VITE_EMAIL_API_KEY as string | undefined,
  whatsappProvider: import.meta.env.VITE_WHATSAPP_PROVIDER as string | undefined,
  whatsappApiKey: import.meta.env.VITE_WHATSAPP_API_KEY as string | undefined,
  whatsappPhoneNumberId: import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID as string | undefined,
  mapsApiKey: import.meta.env.VITE_MAPS_API_KEY as string | undefined,
  overpassEndpoint: (import.meta.env.VITE_OVERPASS_ENDPOINT as string | undefined) ?? OVERPASS_DEFAULT,
  nominatimEndpoint: (import.meta.env.VITE_NOMINATIM_ENDPOINT as string | undefined) ?? NOMINATIM_DEFAULT,
  demoMode: DEMO_MODE,
}

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

export const isOperational = (key: string | undefined): boolean => Boolean(key && key.trim().length > 0)
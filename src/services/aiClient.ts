// Unified AI Client — OpenCode Go, OpenRouter, OpenAI and compatible APIs

import { useApp } from './store'

export interface AIClientOptions {
  systemPrompt: string
  userMessage: string
  model?: string
  temperature?: number
  maxTokens?: number
  imageBase64?: string
}

// OpenCode Zen models (correct IDs for https://opencode.ai/zen/v1)
const OPENCODE_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-flash-free',
  'deepseek-v4-pro',
  'deepseek-chat',
  'gpt-5-nano',
  'minimax-m2.5-free',
]

// OpenRouter models
const OPENROUTER_MODELS = [
  'deepseek/deepseek-chat',
  'openai/gpt-4o-mini',
  'google/gemini-2.0-flash-001',
  'anthropic/claude-3.5-haiku',
]

// OpenAI models
const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo']

// Real canonical URLs
const ENDPOINTS = {
  opencode: 'https://opencode.ai/zen/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
} as const

// Vite dev proxy paths — each maps: /api/<name><path> → target<path>
// /api/opencode/zen/v1/chat/completions → https://opencode.ai/zen/v1/chat/completions
const PROXY = {
  opencode_zen: '/api/opencode_zen',
  opencode_go: '/api/opencode_go',
  openrouter: '/api/openrouter',
  openai: '/api/openai',
  gemini: '/api/gemini',
} as const

function isDev(): boolean {
  return import.meta.env.DEV === true
}

// Fetch available models from an API
export async function fetchOpenCodeModels(apiKey: string, baseUrl?: string): Promise<string[]> {
  const base = baseUrl || 'https://opencode.ai/zen/v1'
  const endpoint = base.endsWith('/models') ? base : `${base.replace(/\/+$/, '')}/models`
  
  // Hack to proxy to bypass CORS
  let url = endpoint
  if (endpoint.includes('opencode.co') || endpoint.includes('opencode.ai/zen/go')) url = '/api/opencode_go/zen/go/v1/models'
  else if (endpoint.includes('openrouter.ai')) url = '/api/openrouter/models'
  else if (endpoint.includes('opencode.ai/zen')) url = '/api/opencode_zen/zen/v1/models'

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data ?? data.models ?? []).map((m: any) => m.id ?? m).filter(Boolean)
  } catch {
    return []
  }
}

function detectProvider(apiKey: string, baseUrl: string): 'opencode_zen' | 'opencode_go' | 'openrouter' | 'openai' | 'gemini' | 'custom' {
  if (baseUrl.includes('openrouter.ai')) return 'openrouter'
  if (baseUrl.includes('openai.com')) return 'openai'
  if (baseUrl.includes('generativelanguage.googleapis')) return 'gemini'
  if (baseUrl.includes('opencode.ai/zen/go')) return 'opencode_go'
  if (baseUrl.includes('opencode.ai/zen')) return 'opencode_zen'
  if (apiKey.startsWith('sk-or-')) return 'openrouter'
  if (apiKey.startsWith('AIzaSy')) return 'gemini'
  if (apiKey.startsWith('sk-proj-') || (apiKey.startsWith('sk-') && apiKey.length < 60)) return 'openai'
  return 'custom'
}

function resolveEndpoint(provider: string, canonicalBaseUrl: string): string {
  if (provider === 'custom') {
    return canonicalBaseUrl.replace(/\/+$/, '')
  }

  // Route through proxy (Vite in dev, Netlify in prod) to bypass CORS
  const proxyBase = PROXY[provider as keyof typeof PROXY]
  if (proxyBase) {
    // Strip the canonical origin so we only keep the path after the host
    try {
      const url = new URL(canonicalBaseUrl)
      return proxyBase + url.pathname.replace(/\/+$/, '')
    } catch {
      return proxyBase
    }
  }

  return canonicalBaseUrl.replace(/\/+$/, '')
}

export async function callAI(options: AIClientOptions): Promise<string> {
  const settings = useApp.getState().settings

  // Use settings from the store
  const apiKey = settings.aiApiKey
  const configuredBaseUrl = settings.aiBaseUrl || 'https://opencode.ai/zen/go/v1'
  const preferredModel = settings.aiModel || 'deepseek-v4-flash'

  const provider = detectProvider(apiKey || '', configuredBaseUrl)

  // Default canonical URL per provider
  const canonicalBase = configuredBaseUrl

  const baseUrl = resolveEndpoint(provider, canonicalBase)

  const endpoint = baseUrl.endsWith('/chat/completions')
    ? baseUrl
    : `${baseUrl}/chat/completions`

  console.info(`[AI Client] provider=${provider} endpoint=${endpoint} dev=${isDev()}`)

  const defaultModels =
    provider === 'openrouter' ? OPENROUTER_MODELS :
    provider === 'openai' ? OPENAI_MODELS :
    OPENCODE_MODELS

  // Modelos a tentar em ordem: o preferido primeiro e, se ele falhar
  // (resposta vazia/reasoning longo demais), fallback automático para variantes.
  const requestedModel = options.model || preferredModel || defaultModels[0]
  const fallbackChain = provider === 'opencode_go' || provider === 'opencode_zen'
    ? ['deepseek-v4-flash', 'deepseek-v4-flash-free', 'deepseek-v4-pro']
    : defaultModels
  const modelsToTry = Array.from(new Set([requestedModel, ...fallbackChain]))

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://prospex.app'
    headers['X-Title'] = 'Prospex Autopilot'
  }

  let lastError: Error | null = null

  const userContent = options.imageBase64
    ? [
        { type: 'text', text: options.userMessage },
        { type: 'image_url', image_url: { url: options.imageBase64 } }
      ]
    : options.userMessage

  for (const model of modelsToTry) {
    try {
      console.info(`[AI Client] Trying model: ${model}`)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: userContent },
          ],
          max_tokens: options.maxTokens || 2000,
          temperature: options.temperature ?? 0.7,
        }),
      })

      const rawText = await response.text()

      if (!response.ok) {
        console.warn(`[AI Client] Model ${model} HTTP ${response.status}:`, rawText)
        lastError = new Error(`AI Provider error ${response.status}: ${rawText}`)
        continue
      }

      // Safe JSON parse — avoid crashing on plain-text responses
      let data: any
      try {
        data = JSON.parse(rawText)
      } catch {
        console.warn(`[AI Client] Response is not JSON for model ${model}:`, rawText)
        lastError = new Error(`Resposta inválida da API (não é JSON): ${rawText.slice(0, 200)}`)
        continue
      }

      if (data.error) {
        console.warn(`[AI Client] Model ${model} returned API error:`, data.error)
        lastError = new Error(`AI Provider error: ${data.error.message || JSON.stringify(data.error)}`)
        continue
      }

      const content = data.choices?.[0]?.message?.content ?? ''
      if (content) return content

      console.warn(`[AI Client] Model ${model} returned empty content`)
      lastError = new Error(`Modelo ${model} retornou resposta vazia.`)
    } catch (e) {
      console.warn(`[AI Client] Fetch error for model ${model}:`, e)
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw lastError || new Error('Nenhum modelo respondeu com sucesso.')
}

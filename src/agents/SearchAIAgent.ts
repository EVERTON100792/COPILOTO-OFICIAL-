import { callAI } from '../services/aiClient'

export interface SearchAIAgentInput {
  name: string
  city: string
  state: string
  category: string
}

export interface SearchAIAgentOutput {
  phone: string | null
  website: string | null
  rating: number | null
  reviewCount: number | null
  instagram: string | null
  facebook: string | null
  email: string | null
  hours: string | null
  summary: string | null
  address: string | null
}

export async function searchCompanyData(input: SearchAIAgentInput): Promise<SearchAIAgentOutput> {
  const { name, city, state, category } = input

  const TAVILY_API_KEY = "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"
  
  let searchContext = ''
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: `${name} ${city} ${state} telefone whatsapp site endereço horário instagram`,
        max_results: 4
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data && data.results && data.results.length > 0) {
        searchContext = data.results.map((r: any) => `TÍTULO: ${r.title}\nCONTEÚDO: ${r.content}\nURL: ${r.url}`).join('\n\n')
      }
    }
  } catch (err) {
    console.warn('[searchCompanyData] Erro ao buscar no Tavily:', err)
  }

  const systemPrompt = `Você é um agente de extração de dados empresariais ultra-preciso.
Seu objetivo é analisar os resultados de busca da internet fornecidos abaixo e extrair o máximo de dados oficias da empresa solicitada.
Se não houver a informação exata nos resultados, retorne null no respectivo campo (NUNCA invente).
Retorne APENAS um JSON válido no seguinte formato (sem formatação Markdown):
{
  "phone": "+5543999990000" (se encontrar, apenas números ou com o +55) ou null,
  "website": "https://www.site.com.br" ou null,
  "instagram": "https://instagram.com/..." ou null,
  "facebook": "https://facebook.com/..." ou null,
  "email": "contato@empresa.com" ou null,
  "hours": "ex: Seg-Sex 08:00 - 18:00" ou null,
  "summary": "Um breve resumo em português (1 frase) sobre o que a empresa faz, vende ou foca" ou null,
  "address": "Endereço completo, rua, número, bairro" ou null,
  "rating": 4.8 (apenas o número float) ou null,
  "reviewCount": 120 (apenas o número inteiro) ou null
}`

  const userMessage = `EMPRESA: ${name}\nLOCAL: ${city}/${state || 'PR'}
CATEGORIA: ${category || 'Local'}

RESULTADOS DA PESQUISA NA INTERNET:
${searchContext || 'Nenhum resultado encontrado.'}

Extraia todos os campos possíveis do JSON a partir dos resultados acima.`

  try {
    const raw = await callAI({
      systemPrompt,
      userMessage,
      model: 'deepseek-v4-flash',
      temperature: 0.1,
      maxTokens: 800,
    })

    const cleaned = raw.replace(/```json\s*|```/g, '').trim()
    const json = JSON.parse(cleaned)

    return {
      phone: typeof json.phone === 'string' && json.phone.length > 5 ? json.phone : null,
      website: typeof json.website === 'string' && json.website.includes('.') ? json.website : null,
      instagram: typeof json.instagram === 'string' ? json.instagram : null,
      facebook: typeof json.facebook === 'string' ? json.facebook : null,
      email: typeof json.email === 'string' && json.email.includes('@') ? json.email : null,
      hours: typeof json.hours === 'string' ? json.hours : null,
      summary: typeof json.summary === 'string' ? json.summary : null,
      address: typeof json.address === 'string' ? json.address : null,
      rating: typeof json.rating === 'number' ? json.rating : null,
      reviewCount: typeof json.reviewCount === 'number' ? json.reviewCount : null,
    }
  } catch (e) {
    console.warn('[searchCompanyData] Erro ao buscar dados via IA:', e)
    return { phone: null, website: null, rating: null, reviewCount: null, instagram: null, facebook: null, email: null, hours: null, summary: null, address: null }
  }
}

// Sales AI Engine — Prospex Autopilot
// Modo demo: templates determinísticos ricos, humanos e hiper-precisos
// Modo real: API unificada (OpenCode Go, OpenRouter, OpenAI, Gemini, etc.)
// Classificação de resposta: IA com contexto da conversa completa + cache;
// fallback automático para o motor de palavras-chave se a IA falhar.

import type { Company } from '../types'
import { callAI } from './aiClient'
import { useApp } from './store'
import { SALES_BRAIN_PROMPT } from './salesBrainPrompt'

export type SalesResponseCategory =
  | 'INTERESTED'
  | 'OBJECTION_PRICE'
  | 'OBJECTION_BUDGET'
  | 'OBJECTION_NEED'
  | 'THINK_ABOUT'
  | 'QUESTION'
  | 'NOT_INTERESTED'
  | 'WON'
  | 'PEDIU_PARAR'

export type SalesStage =
  | 'OPENING'
  | 'WAITING_RESPONSE'
  | 'ANALYZING'
  | 'INSTRUCTING'
  | 'CLOSING'
  | 'WON'
  | 'LOST'

// Categorias que encerram a conversa — nunca reclassificar depois disso
const FINAL_CATEGORIES: readonly SalesResponseCategory[] = ['WON', 'NOT_INTERESTED', 'PEDIU_PARAR']

export interface SalesMessage {
  id: string
  role: 'AI_OPENING' | 'CLIENT' | 'AI_INSTRUCTION'
  content: string
  category?: SalesResponseCategory
  timestamp: string
}

export interface SalesConversation {
  id: string
  companyId: string
  stage: SalesStage
  messages: SalesMessage[]
  createdAt: string
  updatedAt: string
}

export interface SalesAnalysis {
  category: SalesResponseCategory
  confidence: number
  summary: string
  emoji: string
}

export interface SalesInstruction {
  analysis: SalesAnalysis
  whatToDo: string
  whatToSay: string
  suggestedReply: string
  showSiteButton: boolean
  showProposalButton: boolean
  isWon: boolean
  isLost: boolean
  /** true quando veio da IA; false quando veio do motor de regras (fallback) */
  fromAI?: boolean
}

/** Turno de conversa usado como contexto para a IA */
export interface ConversationTurn {
  role: 'vendedor' | 'cliente' | 'sistema'
  content: string
}

// Cache de classificações: mesma mensagem/mesmo lead → mesma classificação, sem custo.
const classificationCache = new Map<string, SalesInstruction>()

export function clearClassificationCache(): void {
  classificationCache.clear()
}

function getNiche(category: string | null): string {
  const cat = (category || '').toLowerCase()
  if (cat.includes('restaurante') || cat.includes('comida') || cat.includes('bar') || cat.includes('pizzaria') || cat.includes('churrascaria') || cat.includes('padaria') || cat.includes('lanchonete')) return 'gastronomia'
  if (cat.includes('odonto') || cat.includes('dentista') || cat.includes('médic') || cat.includes('saúde') || cat.includes('clínica') || cat.includes('terapia') || cat.includes('psicolog')) return 'saude'
  if (cat.includes('salão') || cat.includes('estética') || cat.includes('barbe') || cat.includes('beleza') || cat.includes('nail') || cat.includes('sobrancelha')) return 'estetica'
  if (cat.includes('advoga') || cat.includes('juríd') || cat.includes('direito') || cat.includes('contábil') || cat.includes('contador')) return 'profissional'
  if (cat.includes('auto') || cat.includes('mecanic') || cat.includes('carro') || cat.includes('pneu') || cat.includes('funilaria')) return 'automotivo'
  if (cat.includes('academia') || cat.includes('personal') || cat.includes('crossfit') || cat.includes('pilates') || cat.includes('yoga')) return 'fitness'
  if (cat.includes('pet') || cat.includes('veterinár') || cat.includes('banho e tosa')) return 'pet'
  return 'servicos'
}

export function generateOpeningMessage(company: Company | any): string {
  const name = company?.name || 'sua empresa'
  const niche = getNiche(company?.category)
  const city = company?.city || 'sua região'

  const nicheDetail =
    niche === 'gastronomia' ? 'cardápio e integração direta com WhatsApp' :
    niche === 'saude' ? 'agendamento online e apresentação dos atendimentos' :
    niche === 'estetica' ? 'portfólio de trabalhos e facilidade de agendar pelo WhatsApp' :
    niche === 'automotivo' ? 'lista de serviços e pedido de orçamento pelo WhatsApp' :
    niche === 'fitness' ? 'horários, modalidades e planos' :
    niche === 'pet' ? 'agendamento de banho, tosa e consultas' : 'apresentação profissional dos serviços e botão direto para WhatsApp'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bom dia!' : hour < 18 ? 'Boa tarde!' : 'Boa noite!'

  return `${greeting} Tudo bem? Pesquisei um pouco sobre o ${name} em ${city} e percebi que vocês concentram o atendimento pelas redes sociais e pelo WhatsApp. Com isso em mente, imaginei que poderia ser útil ter uma página simples centralizando as informações da empresa, com ${nicheDetail}. Montei uma demonstração gratuita pensando nesse cenário. Posso te enviar o link?`
}

/** Formata o histórico da conversa como contexto legível para a IA */
export function formatConversationHistory(
  messages: Array<{ role: string; content: string }> | undefined | null,
  limit = 40
): string {
  if (!messages || messages.length === 0) return ''
  const turns = messages
    .filter((m) => m.content && m.content.trim())
    .slice(-limit)
    .map((m) => {
      const role = m.role
      if (role === 'CLIENT' || role === 'cliente') return `Cliente: ${m.content}`
      if (role === 'AI_OPENING' || role === 'AI_SUGGESTION' || role === 'vendedor') return `Vendedor: ${m.content}`
      if (role === 'AI_INSTRUCTION' || role === 'AI_ANALYSIS' || role === 'sistema') return `(IA interna, não enviada ao cliente): ${m.content}`
      return `Mensagem: ${m.content}`
    })
    .join('\n')
  return turns
}

export async function generateOpeningMessageAI(company: Company | any, apiKey?: string): Promise<string> {
  // Modo demo (settings) → template determinístico, sem custo.
  if (useApp.getState().settings.demoMode) return generateOpeningMessage(company)

  // Em produção a chave vive no servidor (proxy Netlify / proxy do Vite em dev).
  // O parâmetro apiKey é opcional (chave salva pelo usuário em Settings);
  // mesmo sem ele, a chamada é roteada pelo proxy que injeta a autenticação.
  void apiKey

  const extraFacts = [
    `Ramo da empresa: ${company?.category || 'Negócio Local'}`,
    company?.summary ? `Resumo do negócio: ${company.summary}` : '',
    company?.rating ? `Avaliação no Google: ${company.rating} estrelas${company.reviewCount ? ` (${company.reviewCount} avaliações)` : ''}` : '',
    company?.website ? `Site da empresa: ${company.website}` : '',
    company?.instagram ? `Instagram: ${company.instagram}` : '',
    company?.facebook ? `Facebook: ${company.facebook}` : '',
    company?.phone ? `Telefone/WhatsApp: ${company.phone}` : '',
    company?.hours ? `Horário de funcionamento: ${company.hours}` : '',
    company?.address ? `Endereço: ${company.address}` : '',
  ].filter(Boolean).join('\n')

  const hour = new Date().getHours()
const periodLabel = hour >= 5 && hour < 12 ? 'MANHÃ (use "Bom dia!")' : hour >= 12 && hour < 18 ? 'TARDE (use "Boa tarde!")' : 'NOITE (use "Boa noite!")'

const system = `${SALES_BRAIN_PROMPT}

O sistema solicita a GERAÇÃO DA PRIMEIRA ABORDAGEM para a empresa abaixo.
Horário atual do relógio: ${hour}:${String(new Date().getMinutes()).padStart(2, '0')} — período: ${periodLabel}
A empresa é: ${company?.name || 'Empresa Local'}
Tipo de negócio: ${company?.category || 'Negócio Local'}
Cidade: ${company?.city || 'N/D'}
${extraFacts ? `\nFATOS DESCOBERTOS NA INTERNET SOBRE A EMPRESA:\n${extraFacts}` : ''}

Regras extras para esta mensagem:
- Comece com o cumprimento de horário OBRIGATÓRIO ("Bom dia!" / "Boa tarde!" / "Boa noite!" conforme o período informado) e incorpore o que você faz de forma NATURAL e casual no meio do texto (nunca use "Me apresento:").
- Analise o ramo e a atividade da empresa e demonstre esse entendimento na mensagem, falando do negócio dela de forma natural.
- Use APENAS os fatos acima como observações verificáveis. Se não houver fatos suficientes, use a observação neutra padrão.
- Seja a primeira mensagem de um vendedor consultivo: sem pressão, sem gatilhos de medo, sem jargão técnico.
- Retorne APENAS o texto da mensagem, sem aspas, sem formatação JSON, sem introduções.`

  try {
    const raw = await callAI({
      systemPrompt: system,
      userMessage: "Gere a mensagem inicial de prospecção para esta empresa agora.",
    })
    return raw.trim() || `[IA retornou vazio] ${generateOpeningMessage(company)}`
  } catch (err: any) {
    console.warn('[salesAI] Falha ao gerar abordagem com IA:', err)
    return `[ERRO NA IA: ${err.message || String(err)}] - Fallback ativado:\n\n${generateOpeningMessage(company)}`
  }
}


// ---------------------------------------------------------------------------
// MOTOR DE PALAVRAS-CHAVE (FALLBACK) — usado APENAS quando a IA não responde
// ---------------------------------------------------------------------------
const WON_KW = ['fechado', 'fechei', 'contrato', 'aceito', 'aceitar', 'combinado', 'pode fazer', 'vamos em frente', 'aprovado', 'faz aí', 'pode começar', 'quero fechar']
const NOT_INTERESTED_KW = [
  'não gostei', 'nao gostei', 'não gostamos', 'nao gostamos', 'não curti', 'nao curti',
  'não tenho interesse', 'sem interesse', 'não preciso', 'nao preciso', 'não quero', 'nao quero',
  'não obrigado', 'nao obrigado', 'nao tenho', 'não muito obrigado',
  'nao obg', 'odiei', 'detestei', 'péssimo', 'pessimo', 'horrível', 'horrivel', 'ruim', 'fraco',
  'nada a ver', 'esquece', 'fora', 'descarte', 'não faz sentido', 'nao faz sentido'
]
const OPT_OUT_KW = [
  'pode parar', 'pare de', 'para de', 'não envie', 'nao envie', 'remov', 'bloquear', 'tirar do cadastro',
  'descadastrar', 'opt-out', 'spam', 'não quero receber', 'nao quero receber', 'não manda mais', 'nao manda mais'
]
const BUDGET_KW = [
  'sem dinheiro', 'sem grana', 'sem verba', 'sem caixa', 'grana curta', 'ta difícil', 'tá difícil',
  'crise', 'apertado', 'não tenho dinheiro', 'nao tenho dinheiro', 'sem condições', 'sem condicoes',
  'tá caro', 'ta caro', 'muito caro', 'sem dinheiro mesmo', 'estou sem dinheiro'
]
const PRICE_KW = ['custa', 'preço', 'preco', 'valor', 'quanto', 'quando custa', 'quanto e', 'quanto é', 'investimento', 'orçamento', 'orcamento', 'cobr', 'pagamento', 'parcel', 'valores', 'tabela']
const THINK_KW = ['deixa pensar', 'vou pensar', 'vou ver', 'amanhã', 'depois', 'próxima semana', 'espera', 'aguarda', 'consultar', 'sócio', 'esposa', 'marido', 'decidir']
const INTERESTED_KW = ['interesse', 'quero', 'queria', 'como funciona', 'me conta', 'adorei', 'gostei', 'sim', 'pode ser', 'vamos', 'topo', 'curioso', 'me manda', 'ver mais', 'que legal', 'bacana', 'me mostra', 'interessante']

export function analyzeClientResponse(response: string): SalesAnalysis {
  const lower = response.toLowerCase().trim()

  // 1. PEDIU_PARAR (opt-out) — prioridade máxima
  if (OPT_OUT_KW.some((k) => lower.includes(k))) {
    return { category: 'PEDIU_PARAR', confidence: 0.97, summary: 'Cliente pediu para parar de receber contato (opt-out).', emoji: '🛑' }
  }

  // 2. Check WON
  if (WON_KW.some((k) => lower.includes(k))) {
    return { category: 'WON', confidence: 0.97, summary: 'Cliente fechou o negócio!', emoji: '🎉' }
  }

  // 3. Check NOT_INTERESTED
  if (
    NOT_INTERESTED_KW.some((k) => lower.includes(k)) ||
    lower.includes('não gost') || lower.includes('nao gost') ||
    lower.includes('não curti') || lower.includes('nao curti') ||
    lower.includes('não quer') || lower.includes('nao quer')
  ) {
    return { category: 'NOT_INTERESTED', confidence: 0.95, summary: 'Cliente sinalizou desinteresse.', emoji: '😔' }
  }

  // 4. Check BUDGET CONSTRAINTS ("sem dinheiro", "sem caixa")
  if (BUDGET_KW.some((k) => lower.includes(k))) {
    return { category: 'OBJECTION_BUDGET', confidence: 0.95, summary: 'Cliente relatou limitação de orçamento ou caixa.', emoji: '💸' }
  }

  // 5. Check PRICE QUESTIONS ("quanto custa", "valor")
  if (PRICE_KW.some((k) => lower.includes(k))) {
    return { category: 'OBJECTION_PRICE', confidence: 0.95, summary: 'Cliente quer saber valores e orçamento.', emoji: '💰' }
  }

  // 6. Check THINK ABOUT
  if (THINK_KW.some((k) => lower.includes(k))) {
    return { category: 'THINK_ABOUT', confidence: 0.88, summary: 'Cliente quer mais tempo para decidir.', emoji: '🤔' }
  }

  // 7. Check INTERESTED
  const isNegated = lower.startsWith('não') || lower.startsWith('nao') || lower.includes(' não ') || lower.includes(' nao ')
  if (!isNegated && INTERESTED_KW.some((k) => lower.includes(k))) {
    return { category: 'INTERESTED', confidence: 0.90, summary: 'Cliente demonstrou interesse claro!', emoji: '🔥' }
  }

  // 8. Check QUESTION
  if (lower.includes('?')) {
    return { category: 'QUESTION', confidence: 0.80, summary: 'Cliente fez uma pergunta pontual.', emoji: '❓' }
  }

  // Default fallback
  return { category: 'NOT_INTERESTED', confidence: 0.70, summary: 'Cliente deu um retorno neutro ou negativo.', emoji: '😔' }
}

export function buildInstruction(analysis: SalesAnalysis, company: Company | any): SalesInstruction {
  const name = company?.name || 'a empresa'
  const city = company?.city || 'Rolândia'
  const niche = getNiche(company?.category)

  type InstrMap = {
    whatToDo: string
    whatToSay: string
    suggestedReply: string
  }

  const map: Record<SalesResponseCategory, InstrMap> = {
    WON: {
      whatToDo: 'PARABÉNS! Formalize agora. Envie o contrato/resumo e combine a data de início.',
      whatToSay: 'Confirme os detalhes e o próximo passo imediato.',
      suggestedReply: `Que ótima notícia! Vou te enviar agora o resumo do que combinamos e os próximos passos. Me confirma o melhor e-mail para te mandar o contrato. Quando você prefere que eu comece?`,
    },
    INTERESTED: {
      whatToDo: 'CLIENTE INTERESSADO! Mostre a demonstração gratuita agora e destaque o valor para o negócio dele.',
      whatToSay: 'Envia o link da demo e mostre os diferenciais.',
      suggestedReply: `Fico muito feliz pelo interesse! Preparei uma demonstração exclusiva de um site moderno para o ${name}, com botão de WhatsApp e estrutura pronta para atração de clientes no Google. Posso te enviar o link para dar uma olhada agora mesmo?`,
    },
    OBJECTION_BUDGET: {
      whatToDo: 'CLIENTE COM ORÇAMENTO APERTADO! Responda com empatia pelo caixa dele. Enfatize que a demonstração é 100% GRATUITA e sem compromisso, e mencione condições parceladas muito leves.',
      whatToSay: 'Acolha a situação e ofereça a demo sem custo.',
      suggestedReply: `Entendo perfeitamente a sua situação! Manter o caixa protegido é prioridade em qualquer empresa. Por isso mesmo, eu montei uma demonstração 100% gratuita do site do ${name} para você ver como ficaria sem gastar nada. E se um dia fizer sentido, facilitamos o pagamento em parcelas super baixas. Posso te enviar o link da demo só para você dar uma olhada sem compromisso?`,
    },
    OBJECTION_PRICE: {
      whatToDo: 'CLIENTE PERGUNTOU VALORES! Dê uma faixa transparente (R$ 600 a R$ 1.500 em até 12x) e convide para ver a demonstração gratuita.',
      whatToSay: 'Fale dos valores com clareza e direcione para a demonstração.',
      suggestedReply: `Nossos projetos de site profissional para empresas variam geralmente entre R$ 600 e R$ 1.500 (em até 12x), incluindo toda a criação, domínio e suporte. Mas montei uma demonstração gratuita exclusiva para o ${name} para você avaliar a qualidade sem nenhum custo antes. Posso te mandar o link da demo?`,
    },
    OBJECTION_NEED: {
      whatToDo: 'Mostre o valor da presença digital no Google e como os concorrentes captam clientes.',
      whatToSay: 'Mostre o impacto nas vendas locais.',
      suggestedReply: `Entendo perfeitamente! Mas hoje a maioria das pessoas em ${city} pesquisa no Google antes de comprar ou contratar. O site funciona como seu melhor vendedor 24 horas por dia. Quer ver a demonstração que montei sem compromisso nenhum?`,
    },
    THINK_ABOUT: {
      whatToDo: 'Deixe a demonstração com ele para analisar no próprio tempo.',
      whatToSay: 'Respeite o tempo dele e ofereça a demo.',
      suggestedReply: `Com certeza, faz todo sentido! Deixa eu te mandar o link da demonstração gratuita que montei para o ${name} — você pode dar uma olhada com calma no seu tempo, sem compromisso nenhum. Me avisa quando puder ver!`,
    },
    QUESTION: {
      whatToDo: 'Responda a dúvida de forma direta e convide para ver o site.',
      whatToSay: 'Responda com clareza e apresente a demo.',
      suggestedReply: `Ótima pergunta! Criamos sites 100% modernos, otimizados para celular e prontos para gerar contatos no WhatsApp. Quer dar uma olhada na demonstração que montei para o ${name}?`,
    },
    NOT_INTERESTED: {
      whatToDo: 'Agradeça educadamente e não insista.',
      whatToSay: 'Encerrar contato de forma cortês e elegante.',
      suggestedReply: `Poxa, sem problemas! Agradeço de coração pelo seu retorno. Deixo as portas abertas se no futuro o ${name} precisar de um site profissional. Desejo muito sucesso aos seus negócios!`,
    },
    PEDIU_PARAR: {
      whatToDo: 'RESPEITE O PEDIDO IMEDIATAMENTE. Não envie mais nada. Marque o contato como opt-out/DO_NOT_CONTACT.',
      whatToSay: 'Confirme o pedido de forma curta e respeitosa.',
      suggestedReply: `Perfeito, entendido! Já deixei registrado para não receberem mais contato da nossa parte. Desculpe qualquer incômodo e muito sucesso com a empresa!`,
    },
  }

  const instr = map[analysis.category]
  return {
    analysis,
    ...instr,
    showSiteButton: ['INTERESTED', 'WON', 'QUESTION', 'OBJECTION_PRICE', 'OBJECTION_BUDGET'].includes(analysis.category),
    showProposalButton: ['INTERESTED', 'WON', 'OBJECTION_PRICE'].includes(analysis.category),
    isWon: analysis.category === 'WON',
    isLost: analysis.category === 'NOT_INTERESTED' || analysis.category === 'PEDIU_PARAR',
  }
}

const EMOJI_MAP: Record<SalesResponseCategory, string> = {
  INTERESTED: '🔥',
  OBJECTION_BUDGET: '💸',
  OBJECTION_PRICE: '💰',
  OBJECTION_NEED: '🎯',
  THINK_ABOUT: '🤔',
  QUESTION: '❓',
  NOT_INTERESTED: '😔',
  WON: '🎉',
  PEDIU_PARAR: '🛑',
}

export interface AnalyzeOptions {
  /** Histórico completo da conversa (mensagens do vendedor e do cliente) */
  history?: Array<{ role: string; content: string }>
  /** Chave de cache explícita (ex: leadId + mensagem). Se omitida, deriva de company+resposta. */
  cacheKey?: string
  /** true → retorna classificação anterior em cache sem chamar a IA novamente */
  reuseCacheOnly?: boolean
}

export async function analyzeClientResponseAI(
  response: string,
  company: Company | any,
  apiKey: string,
  options?: AnalyzeOptions
): Promise<SalesInstruction> {
  const companyId = company?.id || 'unknown'
  const cacheKey = options?.cacheKey || `${companyId}::${response.trim().slice(0, 120)}`

  // Reuso de classificação já feita (evita custo desnecessário)
  const cached = classificationCache.get(cacheKey)
  if (cached) return cached
  if (options?.reuseCacheOnly) {
    const analysis = analyzeClientResponse(response)
    return buildInstruction(analysis, company)
  }

  const historyText = formatConversationHistory(options?.history)

  const systemPrompt = `${SALES_BRAIN_PROMPT}

O sistema solicita a ANÁLISE DA MENSAGEM DO CLIENTE para a empresa abaixo.
Você deve agir como o SALES BRAIN.
A empresa prospectada é: ${company?.name || 'Empresa Local'}
Tipo de negócio: ${company?.category || 'Negócio Local'}
Cidade: ${company?.city || 'Rolândia'}
${historyText ? `\nHISTÓRICO COMPLETO DA CONVERSA ATÉ AQUI (para responder com coerência com o que foi dito antes):\n${historyText}` : ''}

Analise a ÚLTIMA mensagem do cliente considerando TODO o histórico acima.

Retorne EXATAMENTE no formato JSON válido:
{
  "category": "INTERESTED" | "OBJECTION_BUDGET" | "OBJECTION_PRICE" | "OBJECTION_NEED" | "THINK_ABOUT" | "QUESTION" | "NOT_INTERESTED" | "WON" | "PEDIU_PARAR",
  "confidence": 0.0 a 1.0 (sua confiança na classificação),
  "summary": "Resumo em 1 frase curta do posicionamento do cliente",
  "whatToDo": "Instrução tática direta para o vendedor",
  "suggestedReply": "Mensagem exata pronta para enviar no WhatsApp do cliente, coerente com o histórico"
}
- Use "PEDIU_PARAR" quando o cliente pedir explicitamente para não ser mais contatado (remover, parar, spam, "não manda mais").
- Use "WON" apenas quando houver fechamento claro (aceitou, contratou, "pode fazer").`

  try {
    const raw = await callAI({
      systemPrompt,
      userMessage: `Empresa: ${company?.name || 'Empresa'} (${company?.category || 'Negócio Local'} em ${company?.city || 'Rolândia'})\nÚLTIMA resposta enviada pelo cliente no WhatsApp: "${response}"`,
    })

    const cleaned = raw.replace(/```json\s*|```/g, '').trim()
    const json = JSON.parse(cleaned)

    const fallbackAnalysis = analyzeClientResponse(response)
    const category: SalesResponseCategory = json.category || fallbackAnalysis.category

    const confidenceRaw = Number(json.confidence)
    const confidence = Number.isFinite(confidenceRaw) && confidenceRaw > 0 && confidenceRaw <= 1
      ? Math.round(confidenceRaw * 100) / 100
      : 0.9

    const analysis: SalesAnalysis = {
      category,
      confidence,
      summary: json.summary || fallbackAnalysis.summary,
      emoji: EMOJI_MAP[category] || '💬',
    }

    const instruction: SalesInstruction = {
      analysis,
      whatToDo: json.whatToDo || fallbackAnalysis.summary,
      whatToSay: json.whatToDo || '',
      suggestedReply: json.suggestedReply || buildInstruction(fallbackAnalysis, company).suggestedReply,
      showSiteButton: ['INTERESTED', 'WON', 'QUESTION', 'OBJECTION_PRICE', 'OBJECTION_BUDGET'].includes(category),
      showProposalButton: ['INTERESTED', 'WON', 'OBJECTION_PRICE'].includes(category),
      isWon: category === 'WON',
      isLost: category === 'NOT_INTERESTED' || category === 'PEDIU_PARAR',
      fromAI: true,
    }

    classificationCache.set(cacheKey, instruction)
    return instruction
  } catch (err: any) {
    console.warn('[salesAI] Usando motor de regras inteligentes devido a erro na chamada AI:', err)
    const analysis = analyzeClientResponse(response)
    const instruction = buildInstruction(analysis, company)
    instruction.whatToDo = `[ERRO NA IA: ${err.message || String(err)}] - Fallback ativado:\n${instruction.whatToDo}`
    instruction.suggestedReply = `[⚠️ A IA falhou ao gerar a resposta. Erro: ${err.message || String(err)}]\n\n${instruction.suggestedReply}`
    instruction.fromAI = false
    classificationCache.set(cacheKey, instruction)
    return instruction
  }
}

/** true se a categoria encerra a conversa (ganho/perdido/opt-out) */
export function isFinalCategory(category: SalesResponseCategory): boolean {
  return FINAL_CATEGORIES.includes(category)
}
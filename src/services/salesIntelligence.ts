import type { Company } from '../types'
import type { SalesInstruction } from './salesAI'
import type { SalesIntelligenceOutput } from '../types'
import { callAI } from './aiClient'
import { formatConversationHistory } from './salesAI'

const INTELLIGENCE_SYSTEM_PROMPT = `Você é a SALES INTELLIGENCE LAYER do PROSPEX.
O PROSPEX já possui inteligência comercial básica, mas sua missão é atuar como uma camada adicional para:
1. Interpretar contexto e intenção
2. Perceber nuances e sinais implícitos
3. Identificar o real estágio de negociação
4. Reconhecer emoções e resistências
5. Adaptar pressão comercial e timing
6. Recomendação de ação comercial

# REGRA MAIS IMPORTANTE
Você é um observador que recomenda. NÃO invente informações, preços, descontos, contratos ou funcionalidades.
Se houver incerteza ou risco legal/comercial, exija revisão humana (humanReviewRequired: true).

# CUSTOMER STATE & INTENT
Interprete a conversa considerando TODO o histórico.
Não confunda curiosidade com intenção de compra.
Observe sinais implícitos de interesse, resistência ou rejeição.
Silêncio também é resposta (timing).

# OBJEÇÕES
Classifique a objeção corretamente (price, timing, trust, need, authority, comparison, priority, technical).
Aceite rejeições claras (stop_contact).

# SAÍDA ESTRUTURADA
Retorne EXATAMENTE este formato JSON, sem marcação markdown:
{
  "enabled": true,
  "customerState": {
    "interestScore": 0,
    "trustScore": 0,
    "buyingIntent": 0,
    "urgencyScore": 0,
    "priceSensitivity": 0,
    "resistanceScore": 0,
    "engagementScore": 0,
    "sentiment": "positive",
    "engagement": "low",
    "salesStage": "first_contact"
  },
  "interpretation": {
    "explicitIntent": "string",
    "implicitIntent": "string",
    "mainConcern": "string",
    "mainOpportunity": "string",
    "keySignal": "string"
  },
  "objection": {
    "detected": false,
    "type": null,
    "severity": 0
  },
  "decision": {
    "nextAction": "respond_now",
    "reason": "Motivo curto e operacional",
    "decisionConfidence": 0,
    "humanReviewRequired": false
  },
  "timing": {
    "shouldWait": false,
    "recommendedDelayMinutes": 0
  },
  "communication": {
    "tone": "string",
    "messageLength": "short",
    "shouldAskQuestion": false,
    "shouldUseCTA": false,
    "shouldShowDemo": false,
    "shouldShowProposal": false
  }
}

* Valores permitidos em salesStage: "first_contact" | "contacted" | "curious" | "engaged" | "interested" | "discovery" | "presentation" | "evaluation" | "objection" | "negotiation" | "closing" | "won" | "lost" | "do_not_contact" | "human_review"
* Valores permitidos em objection.type: "price" | "timing" | "trust" | "need" | "authority" | "comparison" | "priority" | "technical" | "unknown" | null
* Valores permitidos em decision.nextAction: "respond_now" | "wait" | "follow_up" | "send_demo" | "send_proposal" | "ask_question" | "clarify" | "handle_objection" | "advance_to_closing" | "human_review" | "stop_contact"`

export async function analyzeWithSalesIntelligence(
  response: string,
  company: Company | any,
  apiKey: string,
  history?: Array<{ role: string; content: string }>
): Promise<SalesIntelligenceOutput> {
  const historyText = formatConversationHistory(history)
  
  const systemPrompt = `${INTELLIGENCE_SYSTEM_PROMPT}

CONTEXTO DA EMPRESA:
Nome: ${company?.name || 'Empresa Local'}
Ramo: ${company?.category || 'Negócio Local'}
Cidade: ${company?.city || 'Rolândia'}

HISTÓRICO DA CONVERSA:
${historyText || 'Nenhum histórico anterior.'}`

  const userMessage = `ÚLTIMA resposta do cliente: "${response}"
Analise o contexto completo e retorne o JSON estruturado.`

  try {
    const raw = await callAI({
      systemPrompt,
      userMessage,
    })
    
    const cleaned = raw.replace(/```json\s*|```/g, '').trim()
    const json = JSON.parse(cleaned) as SalesIntelligenceOutput
    return json
  } catch (err: any) {
    console.warn('[salesIntelligence] Falha na IA. Retornando fallback.', err)
    return getFallbackIntelligence()
  }
}

function getFallbackIntelligence(): SalesIntelligenceOutput {
  return {
    enabled: false,
    customerState: {
      interestScore: 0, trustScore: 0, buyingIntent: 0, urgencyScore: 0, priceSensitivity: 0, resistanceScore: 0, engagementScore: 0,
      sentiment: 'neutral', engagement: 'low', salesStage: 'contacted'
    },
    interpretation: { explicitIntent: '', implicitIntent: '', mainConcern: '', mainOpportunity: '', keySignal: '' },
    objection: { detected: false, type: null, severity: 0 },
    decision: { nextAction: 'human_review', reason: 'Falha na camada de inteligência (Fallback)', decisionConfidence: 0, humanReviewRequired: true },
    timing: { shouldWait: false, recommendedDelayMinutes: 0 },
    communication: { tone: 'neutral', messageLength: 'medium', shouldAskQuestion: false, shouldUseCTA: false, shouldShowDemo: false, shouldShowProposal: false }
  }
}

export interface ResolutionResult {
  finalInstruction: SalesInstruction
  overrideApplied: boolean
  overrideReason: string
}

export function resolveDecisions(
  existingDecision: SalesInstruction,
  intelligenceDecision: SalesIntelligenceOutput
): ResolutionResult {
  // Se a camada falhou ou não tem confiança, preserva a existente
  if (!intelligenceDecision.enabled || intelligenceDecision.decision.decisionConfidence < 50) {
    return { finalInstruction: existingDecision, overrideApplied: false, overrideReason: 'Baixa confiança da inteligência ou inativa' }
  }

  const existingCategory = existingDecision.analysis.category
  const intAction = intelligenceDecision.decision.nextAction

  // Caso 4: Risco ou pedido expresso de humano
  if (intelligenceDecision.decision.humanReviewRequired) {
    return {
      finalInstruction: {
        ...existingDecision,
        suggestedReply: `[REVISÃO HUMANA NECESSÁRIA] ${intelligenceDecision.decision.reason}\n\nResposta Original do Motor: ${existingDecision.suggestedReply}`,
      },
      overrideApplied: true,
      overrideReason: 'Revisão humana requerida pela inteligência'
    }
  }

  // Caso E (Stop Contact)
  if (intAction === 'stop_contact' || existingCategory === 'PEDIU_PARAR') {
    return {
      finalInstruction: {
        ...existingDecision,
        analysis: { ...existingDecision.analysis, category: 'PEDIU_PARAR' },
        isLost: true,
        isWon: false,
        showSiteButton: false,
        showProposalButton: false
      },
      overrideApplied: true,
      overrideReason: 'Cliente solicitou encerramento (stop_contact)'
    }
  }

  // Casos de Sobrescrita forte (Caso 3) baseada na ação
  if (intAction === 'wait' && existingCategory !== 'NOT_INTERESTED' && existingCategory !== 'WON') {
    return {
      finalInstruction: {
        ...existingDecision,
        suggestedReply: `[INTELIGÊNCIA: WAIT] ${intelligenceDecision.decision.reason}. Melhor não enviar nada agora ou reduzir a pressão.`,
      },
      overrideApplied: true,
      overrideReason: 'Inteligência recomendou silêncio tático (wait)'
    }
  }

  // Caso 1 e 2: Preservação (mantemos a sugerida do existingDecision e enriquecemos o whatToDo/análise)
  const finalInstruction: SalesInstruction = {
    ...existingDecision,
    whatToDo: `[Inteligência]: ${intelligenceDecision.decision.reason}\n[Motor Atual]: ${existingDecision.whatToDo}`,
    showSiteButton: existingDecision.showSiteButton || intelligenceDecision.communication.shouldShowDemo,
    showProposalButton: existingDecision.showProposalButton || intelligenceDecision.communication.shouldShowProposal
  }

  return {
    finalInstruction,
    overrideApplied: false,
    overrideReason: 'Preservado com recomendação complementar'
  }
}

import type { Company, ConversationStateOutput } from '../types'
import { callAI } from './aiClient'

const CONVERSATION_STATE_SYSTEM_PROMPT = `Você é o Conversation Intelligence Agent do PROSPEX, atuando como um VENDEDOR CONSULTIVO EXPERIENTE e diretor de vendas, especialista em timing e comportamento humano multi-turno.

Sua função é avaliar o histórico da conversa e decidir O QUE FAZER, mantendo e atualizando a MEMÓRIA COMERCIAL (Commercial Memory).

REGRA DE OURO (VENDEDOR CONSULTIVO):
Você NÃO tenta fechar em todas as mensagens. Você conduz a conversa até o próximo passo lógico (MICRO-AVANÇOS).
Não confunda "continuar a conversa" com "continuar vendendo". Se o cliente elogia, explore. Se ele objeta, investigue.

HIERARQUIA E PRECEDÊNCIA DE DECISÃO TÁTICA (Respeite a ordem):
1. SEGURANÇA (DO_NOT_CONTACT / STOP_CONTACT): Rejeição ou pedido para parar.
2. RISCO (HUMAN_REVIEW): Conflito, alto risco ou pedido de humano.
3. DIRECT ANSWER FIRST: Se o cliente perguntar preço/prazo/dúvida, responda PRIMEIRO (answer_price, answer_timing, answer_question). Não pule para vender.
4. SILÊNCIO TÁTICO (WAIT): O cliente respondeu algo que não exige tréplica (ex: "vou pensar", objeção de tempo).
5. RECONHECIMENTO (ACKNOWLEDGE): Apenas agradecer elogios ou reconhecer afirmações sem tentar avançar (Elogio não é fechamento).
6. DESCOBERTA (ASK_QUESTION / DISCOVERY_QUESTION): Descobrir necessidades quando houver abertura.
7. DEMONSTRAÇÃO (SHOW): Enviar demonstração, se oportuno.
8. AVANÇO (SALES): Avanço comercial claro somente se houver evidência contextual.

REGRA 2 - NÃO REPETIR AÇÕES:
Se a Commercial Memory ou as Ações Anteriores indicarem que a demonstração foi enviada (demoSent: true), NÃO recomende "send_demo" novamente, a não ser que o cliente peça. Avance na negociação (ex: discutir preço ou aguardar).

REGRA 3 - FATOS X INFERÊNCIAS:
- Fatos não retrocedem sem motivo. Se demoSent = true, deve continuar true.
- A intenção (buyingIntent) pode flutuar, mas mantenha a coerência.
- Se o histórico mostrar que o cliente perguntou "Quanto custa?", priceDiscussed vira true e o buyingIntent aumenta.

REGRA 4 - OBJECTION HISTORY E CURRENT OBJECTION:
Se o cliente reclamou de preço, e agora reclama de timing, adicione timing no objectionHistory, mas atualize currentObjection para timing.

REGRA 5 - INTERESSE ≠ VENDA E SINAIS DE COMPRA (BUYING SIGNALS):
- Se o cliente disser "Gostei bastante", o Interest aumenta, o Momentum sobe para "positive", mas NÃO é sinal forte de compra. Não faça Pitch de fechamento para um simples elogio. Escolha 'acknowledge' ou 'ask_question'.
- Sinais fortes (Buying Signals): "Quanto custa?", "Qual o prazo?", "Como contrato?", "Pode mandar a proposta?". Estes aumentam a pressão, o buyingIntent e geram Momentum "strong".
- Sinais fracos/Objeções reduzem o Momentum para "neutral" ou "negative". Adapte-se!

REGRA 6 - FASE 4.4: DEAL STATE & CLOSING INTELLIGENCE (MUITO IMPORTANTE):
"INTENÇÃO DE COMPRA NÃO É FECHAMENTO". O sistema deve distinguir:
- Interesse ("Gostei bastante") -> buyingIntentLevel: low/medium, dealStatus: discovery/demo_engaged
- Dúvida ("Quanto custa?") -> dealStatus: price_discussion
- Condição ("Se fizer por 1500 eu fecho") -> buyingIntentLevel: very_high, dealStatus: negotiation ou commitment (NÃO closed)
- Confirmação Operacional ("Pode mandar o contrato") -> explicitCloseConfirmation: true, dealStatus: closed_pending_action
NUNCA defina dealStatus como 'closed' a menos que haja explicitCloseConfirmation = true.
dealConfidence varia de 0 a 100, mas mesmo dealConfidence=100 não é closed se não houver confirmação explícita.
Identifique timing de compra (futurePurchaseTiming) quando for o caso ("mês que vem").

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON STRICT) - Retorne APENAS este objeto JSON:

{
  "salesStrategy": "build_rapport | discover | qualify | create_value | handle_objection | advance | close | nurture | wait | recover | answer | acknowledge",
  "salesMomentum": "negative | neutral | positive | strong",
  "buyingSignals": ["Sinal 1", "Sinal 2"],
  "conversationObjective": "O objetivo desta resposta",
  "nextSalesStep": "O próximo pequeno passo comercial",
  "dealStatus": "new | discovery | qualified | demo_pending | demo_sent | demo_engaged | price_discussion | objection | decision_pending | buying_intent | negotiation | commitment | closing | closed_pending_action | closed | lost | nurture | stopped",
  "buyingIntentLevel": "none | low | medium | high | very_high",
  "dealConfidence": <0 a 100>,
  "commitmentDetected": <booleano>,
  "closingSignalDetected": <booleano>,
  "explicitPurchaseIntent": <booleano>,
  "explicitCloseConfirmation": <booleano>,
  "dealBlocker": "Razão de bloqueio se houver",
  "dealNextStep": "Próximo passo na negociação",
  "closingReason": "Justificativa de fechamento",
  "closureEvidence": ["Trecho 1", "Trecho 2"],
  "proposalRequested": <booleano>,
  "contractRequested": <booleano>,
  "negotiationActive": <booleano>,
  "priceConditionDetected": <booleano>,
  "futurePurchaseTiming": "Timing se houver, ex: next_month",
  "stage": "initial_contact | discovery | engaged | demo_sent | evaluating | price_discussion | decision_pending | deferred | won | lost | do_not_contact",
  "interestScore": <0-100>,
  "buyingIntentScore": <0-100>,
  "trustScore": <0-100>,
  "resistanceScore": <0-100>,
  "urgencyScore": <0-100>,
  "currentObjection": "none | price | timing | decision_maker | existing_solution | lack_of_need | trust | unknown",
  "lastCustomerIntent": "Intenção da última mensagem",
  "preferredTone": "formal | casual | short | direct",
  "nextBestAction": "acknowledge | ask_question | send_demo | explain_value | handle_objection | answer_price | answer_timing | answer_question | discovery_question | wait | stop_contact | request_human | respond",
  "shouldRespond": <booleano, false para wait, stop_contact>,
  "shouldWait": <booleano>,
  "humanReviewRequired": <booleano>,
  "existingSolutionDetected": <booleano>,
  "customerSatisfaction": "satisfied | dissatisfied | neutral | unknown",
  "salesOpportunity": "low | medium | high | unknown",
  "conversationOpportunity": "low | medium | high | unknown",
  "pressureLevel": "low | medium | high",
  "decisionReason": "Justificativa curta.",
  "commercialMemory": {
    "demoSent": <booleano>,
    "demoViewed": <booleano ou "unknown">,
    "demoDiscussed": <booleano>,
    "priceDiscussed": <booleano>,
    "priceAccepted": <booleano ou "unknown">,
    "proposalSent": <booleano>,
    "messageCount": <numero>,
    "lastContactAt": <string ou null>,
    "previousActions": [<string>],
    "interestLevel": "low | medium | high | unknown",
    "buyingIntent": "low | medium | high | unknown",
    "decisionMakerKnown": <booleano>,
    "decisionMakerIsCurrentContact": <booleano ou "unknown">,
    "currentObjection": "none | price | timing | decision_maker | existing_solution | lack_of_need | trust | unknown",
    "objectionHistory": [<string>],
    "customerPainPoints": [<string>],
    "customerInterests": [<string>],
    "customerPreferences": [<string>],
    "lastMeaningfulAction": <string>,
    "lastMeaningfulCustomerSignal": <string>,
    "followUpNeeded": <booleano>,
    "followUpWindow": <string ou null>,
    "salesStage": "initial_contact | discovery | engaged | demo_sent | evaluating | price_discussion | decision_pending | deferred | won | lost | do_not_contact"
  }
}
`

export async function analyzeConversationState(
  history: Array<{ role: string; content: string }>,
  company: Company | any,
  apiKey: string,
  existingDecision?: any,
  previousCommercialMemory?: any
): Promise<ConversationStateOutput | null> {
  
  if (!history || history.length === 0) return null;

  let retries = 0
  const MAX_RETRIES = 2

  while (retries <= MAX_RETRIES) {
    try {
      const contextStr = history.map(m => `[${m.role === 'user' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.content}`).join('\n')
      
      let prompt = `
DADOS DA EMPRESA (OFERTANTE):
Nome: ${company?.name || 'Desconhecido'}
Nicho/Segmento: ${company?.category || 'Desconhecido'}

HISTÓRICO DA CONVERSA:
${contextStr}
`
      if (previousCommercialMemory) {
        prompt += `\n[MEMÓRIA COMERCIAL ANTERIOR]:\nEsta é a memória acumulada até o turno passado. ATUALIZE as inferências baseadas na nova mensagem, mas MANTENHA os Fatos (ex: se demoSent era true, continue true).\n${JSON.stringify(previousCommercialMemory, null, 2)}`
      }

      if (existingDecision) {
        prompt += `\n[CONTEXTO DA INTELIGÊNCIA ANTERIOR]: O motor sugeriu categoria "${existingDecision.category}".`
      }

      prompt += `\n\nRetorne APENAS o JSON conforme instruído no sistema.`

      const response = await callAI({
        systemPrompt: CONVERSATION_STATE_SYSTEM_PROMPT,
        userMessage: prompt,
        model: 'deepseek-v4-flash',
        temperature: 0.1
      })

      // Processamento Robusto de JSON
      let jsonStr = response
      
      // Limpar blocos de markdown
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.split('```json')[1].split('```')[0]
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.split('```')[1].split('```')[0]
      }
      
      jsonStr = jsonStr.trim()
      
      // Tentar recuperar strings não terminadas ou lixo no final
      try {
        JSON.parse(jsonStr) // teste rápido
      } catch (e) {
        // Se falhou, tenta encontrar o último fechamento de chave seguro
        const lastBrace = jsonStr.lastIndexOf('}')
        if (lastBrace !== -1) {
          jsonStr = jsonStr.substring(0, lastBrace + 1)
        }
      }

      const result = JSON.parse(jsonStr) as ConversationStateOutput

      // Proteções básicas para não quebrar contrato
      if (typeof result.shouldRespond !== 'boolean') result.shouldRespond = true
      if (!result.nextBestAction) result.nextBestAction = 'respond'

      return result

    } catch (error) {
      console.error(`[conversationIntelligence] Erro ao analisar estado (tentativa ${retries + 1}):`, error)
      retries++
      if (retries > MAX_RETRIES) {
        console.error('[conversationIntelligence] Fallback de segurança acionado após falhas.')
        // Fallback seguro em caso de falha contínua do JSON
        return {
          stage: 'discovery',
          interestScore: 50,
          buyingIntentScore: 0,
          trustScore: 50,
          resistanceScore: 0,
          urgencyScore: 0,
          nextBestAction: 'request_human',
          shouldRespond: false,
          shouldWait: true,
          humanReviewRequired: true,
          commercialMemory: previousCommercialMemory
        }
      }
    }
  }
  return null
}

import type { NextBestAction, CommercialMemory, ConversationStateOutput, ActionGuardMetrics } from '../types'

export interface ActionGuardResult {
  finalAction: NextBestAction
  metrics: Partial<ActionGuardMetrics>
}

export function validateNextBestAction(
  proposedAction: NextBestAction,
  commercialMemory: CommercialMemory | undefined,
  conversationState: ConversationStateOutput,
  lastClientMessage: string
): ActionGuardResult {
  
  const msgLower = lastClientMessage.toLowerCase()
  let finalAction = proposedAction
  
  const metrics: Partial<ActionGuardMetrics> = {
    actionBlockedByGuard: false,
    actionGuardReason: null,
    directAnswerUsed: false,
    repeatedActionPrevented: false,
    commercialMemoryUsed: true,
    discoveryQuestionUsed: false,
    salesAdvanceDetected: false
  }

  if (proposedAction === 'discovery_question' || proposedAction === 'ask_question') {
    metrics.discoveryQuestionUsed = true
  }
  if (conversationState.salesStrategy === 'advance' || conversationState.salesStrategy === 'close') {
    metrics.salesAdvanceDetected = true
  }

  if (!commercialMemory) {
    return { finalAction, metrics }
  }

  if (proposedAction === 'discovery_question' || proposedAction === 'ask_question') {
    metrics.discoveryQuestionUsed = true
  }
  if (conversationState.salesStrategy === 'advance' || conversationState.salesStrategy === 'close') {
    metrics.salesAdvanceDetected = true
  }

  // REGRAS DETERMINÍSTICAS (ACTION GUARD)

  // 1. DEMO SENTINEL (Não repete demo)
  if (proposedAction === 'send_demo' && commercialMemory.demoSent) {
    const isRequestingAgain = /(manda nov|envia de nov|pode reenviar|passa o link|perdi o link|manda de novo|envia o link)/i.test(msgLower)
    
    if (!isRequestingAgain) {
      finalAction = 'acknowledge' // Downgrade seguro
      metrics.actionBlockedByGuard = true
      metrics.actionGuardReason = 'demo_already_sent'
      metrics.repeatedActionPrevented = true
    }
  }

  // 2. PROPOSTA (Não repete proposta)
  if ((proposedAction as string) === 'send_proposal' && commercialMemory.proposalSent) {
    const isRequestingAgain = /(manda nov|envia de nov|reenviar|perdi)/i.test(msgLower)
    
    if (!isRequestingAgain) {
      finalAction = 'acknowledge'
      metrics.actionBlockedByGuard = true
      metrics.actionGuardReason = 'proposal_already_sent'
      metrics.repeatedActionPrevented = true
    }
  }

  // 3. DIRECT ANSWER FIRST
  const asksPrice = /(quanto custa|qual o valor|quanto fica|pre[çc]o|tabela|investimento)/i.test(msgLower)
  const asksTiming = /(quanto tempo|qual o prazo|prazo|demora|quando)/i.test(msgLower)
  
  if (asksPrice && finalAction !== 'answer_price' && finalAction !== 'stop_contact') {
    finalAction = 'answer_price'
    metrics.actionBlockedByGuard = true
    metrics.actionGuardReason = 'direct_answer_enforced_price'
    metrics.directAnswerUsed = true
  } 
  else if (asksTiming && finalAction !== 'answer_timing' && finalAction !== 'stop_contact') {
    finalAction = 'answer_timing'
    metrics.actionBlockedByGuard = true
    metrics.actionGuardReason = 'direct_answer_enforced_timing'
    metrics.directAnswerUsed = true
  }

  // 4. OBJEÇÕES CLARAS (Não empurrar vendas)
  const isDecisionMakerObjection = /(falar com meu s[óo]cio|esposa|marido|diretoria|equipe|chefe)/i.test(msgLower)
  const isTimingObjection = /(mais pra frente|m[êe]s que vem|daqui uns|agora n[ãa]o)/i.test(msgLower)
  const isBudgetObjection = /(n[ãa]o temos or[çc]amento|sem dinheiro|t[aá] caro|j[aá] gastamos|investimos muito)/i.test(msgLower)

  if (isDecisionMakerObjection && (finalAction === 'send_demo' || (finalAction as string) === 'send_proposal' || finalAction === 'close_sale')) {
    finalAction = 'wait'
    metrics.actionBlockedByGuard = true
    metrics.actionGuardReason = 'respect_decision_maker_objection'
  }
  
  if (isTimingObjection && (finalAction === 'send_demo' || (finalAction as string) === 'send_proposal' || finalAction === 'close_sale' || finalAction === 'handle_objection')) {
    finalAction = 'wait'
    metrics.actionBlockedByGuard = true
    metrics.actionGuardReason = 'respect_timing_objection'
  }

  if (isBudgetObjection && (finalAction === 'send_demo' || (finalAction as string) === 'send_proposal' || finalAction === 'close_sale')) {
    // É preferível descobrir/reconhecer do que forçar pitch
    finalAction = 'acknowledge'
    metrics.actionBlockedByGuard = true
    metrics.actionGuardReason = 'respect_budget_objection'
  }

  // 5. ELOGIOS SIMPLES SÃO APENAS RECONHECIDOS
  const isSimplePraise = /^(legal|bacana|gostei|muito bom|bom|gostei bastante|bonito|show|curti)[!\.]?$/i.test(msgLower.trim())
  if (isSimplePraise && ((finalAction as string) === 'send_proposal' || finalAction === 'close_sale' || finalAction === 'send_demo')) {
    finalAction = 'acknowledge'
    metrics.actionBlockedByGuard = true
    metrics.actionGuardReason = 'praise_is_not_closing'
  }

  return { finalAction, metrics }
}

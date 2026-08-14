import { BaseAgent } from './base'
import {
  analyzeClientResponse,
  analyzeClientResponseAI,
  buildInstruction,
  generateOpeningMessage,
  generateOpeningMessageAI,
} from '../services/salesAI'
import { analyzeWithSalesIntelligence, resolveDecisions } from '../services/salesIntelligence'
import { analyzeConversationState } from '../services/conversationIntelligence'
import { generateHumanResponse } from '../services/responseGenerator'
import { validateNextBestAction } from '../services/actionGuard'
import { validateDealState } from '../services/closingGuard'
import { validateLeadIdentity } from '../services/identityGuard'
import { useApp } from '../services/store'
import type { AgentContext } from './types'
import type { Company, SalesIntelligenceOutput, ConversationStateOutput, GeneratedResponse, NextBestAction, ActionGuardMetrics, DealStateMetrics } from '../types'

export interface SalesAgentInput {
  company: Company | any
  clientResponse: string
  apiKey?: string
  /** Histórico completo da conversa (vendedor + cliente) para contexto */
  history?: Array<{ role: string; content: string }>
}

export interface SalesAgentOutput {
  category: string
  emoji: string
  summary: string
  confidence: number
  whatToDo: string
  suggestedReply: string
  showSiteButton: boolean
  showProposalButton: boolean
  isWon: boolean
  isLost: boolean
  
  // Observabilidade da Sales Intelligence Layer (Fase 3)
  intelligenceApplied?: boolean
  overrideApplied?: boolean
  overrideReason?: string
  humanReviewRequired?: boolean
  intelligenceDecision?: SalesIntelligenceOutput | null
  existingDecisionCategory?: string
  finalDecisionCategory?: string
  
  // Observabilidade da Conversation Intelligence (Fase 4)
  existingSuggestedReply?: string
  generatedResponse?: string
  responseConfidence?: number
  responseGenerationApplied?: boolean
  responseFallbackUsed?: boolean
  conversationState?: ConversationStateOutput | null
  nextBestAction?: NextBestAction
  shouldRespond?: boolean
  shouldWait?: boolean
  salesStrategy?: string
  salesMomentum?: string
  buyingSignals?: string[]
  conversationObjective?: string
  nextSalesStep?: string
  
  // Observabilidade Action Guard
  actionGuardMetrics?: Partial<ActionGuardMetrics>
  
  // Observabilidade Deal State / Closing Guard (Fase 4.4)
  dealStateMetrics?: Partial<DealStateMetrics>
}

export class SalesAgent extends BaseAgent {
  readonly name = 'SALES_AGENT'
  readonly description = 'Analisa conversa de vendas e sugere próximos passos com Inteligência Comercial e Conversacional'

  protected async runCore(input: Record<string, unknown>): Promise<SalesAgentOutput> {
    // ==========================================
    // EXTRAÇÃO DE INPUTS
    // ==========================================
    const company = input.company as Company | any
    const clientResponse = input.clientResponse as string
    const history = input.history as Array<{ role: string; content: string }> | undefined
    const apiKey = input.apiKey as string | undefined
    let previousCommercialMemory = input.previousCommercialMemory as any | undefined
    const systemActions = input.systemActions as string[] | undefined // Array de ações do sistema (fatos)
    
    // Mesclar Fatos do Sistema (Regra 1 e 5) na memória prévia
    if (systemActions && systemActions.length > 0) {
      if (!previousCommercialMemory) previousCommercialMemory = {}
      if (systemActions.includes('demo_sent')) previousCommercialMemory.demoSent = true
      if (systemActions.includes('proposal_sent')) previousCommercialMemory.proposalSent = true
    }

    const demoMode = (input.demoMode as boolean | undefined) ?? useApp.getState().settings.demoMode

    // ==========================================
    // 1. Existing Engine (Cérebro Atual)
    // ==========================================
    const existingResult = demoMode
      ? buildInstruction(analyzeClientResponse(clientResponse), company)
      : await analyzeClientResponseAI(clientResponse, company, apiKey || '', { history })

    let intelligenceResult: SalesIntelligenceOutput | null = null
    let finalResult = existingResult
    let overrideApplied = false
    let overrideReason = ''
    let humanReviewRequired = false

    // Variáveis da Fase 4
    let convState: ConversationStateOutput | null = null
    let generatedResp: GeneratedResponse | null = null
    let responseGenerationApplied = false
    let responseFallbackUsed = true
    let finalSuggestedReply = existingResult.suggestedReply
    let guardMetrics: Partial<ActionGuardMetrics> | undefined = undefined
    let dealMetrics: Partial<DealStateMetrics> | undefined = undefined

    if (!demoMode) {
      // ==========================================
      // 2. Sales Intelligence Layer (Fase 3)
      // ==========================================
      intelligenceResult = await analyzeWithSalesIntelligence(clientResponse, company, apiKey || '', history)
      
      const resolution = resolveDecisions(existingResult, intelligenceResult)
      
      finalResult = resolution.finalInstruction
      overrideApplied = resolution.overrideApplied
      overrideReason = resolution.overrideReason
      humanReviewRequired = intelligenceResult.decision.humanReviewRequired
      finalSuggestedReply = finalResult.suggestedReply

      // ==========================================
      // 3. Conversation Intelligence (Fase 4 & 4.2)
      // ==========================================
      const fullHistory = [...(history || []), { role: 'user', content: clientResponse }]
      convState = await analyzeConversationState(fullHistory, company, apiKey || '', finalResult, previousCommercialMemory)
      
      if (convState) {
        // ==========================================
        // 3.5 Action Guard (Fase 4.2.1)
        // ==========================================
        const guardResult = validateNextBestAction(convState.nextBestAction, previousCommercialMemory, convState, clientResponse)
        convState.nextBestAction = guardResult.finalAction
        guardMetrics = guardResult.metrics

        // ==========================================
        // 3.6 Closing Guard (Fase 4.4)
        // ==========================================
        const closingGuardResult = validateDealState(
          convState.dealStatus,
          convState.explicitCloseConfirmation,
          convState.closureEvidence,
          previousCommercialMemory,
          clientResponse
        )
        const proposedStatus = convState.dealStatus
        convState.dealStatus = closingGuardResult.finalDealStatus
        
        dealMetrics = {
          previousDealStatus: proposedStatus,
          currentDealStatus: closingGuardResult.finalDealStatus,
          dealConfidence: convState.dealConfidence,
          buyingIntentLevel: convState.buyingIntentLevel,
          commitmentDetected: convState.commitmentDetected,
          closingSignalDetected: convState.closingSignalDetected,
          explicitCloseConfirmation: convState.explicitCloseConfirmation,
          proposalRequested: convState.proposalRequested,
          contractRequested: convState.contractRequested,
          negotiationActive: convState.negotiationActive,
          priceConditionDetected: convState.priceConditionDetected,
          identityGuardTriggered: false,
          closingGuardTriggered: closingGuardResult.closingGuardTriggered,
          closingGuardReason: closingGuardResult.closingGuardReason,
          falseClosePrevented: closingGuardResult.falseClosePrevented
        }

        // ==========================================
        // 4. Response Generator (Fase 4 & 4.2)
        // ==========================================
        generatedResp = await generateHumanResponse(convState, fullHistory, company, apiKey || '', finalResult, previousCommercialMemory)
        
        if (generatedResp) {
          responseGenerationApplied = true
          
          // ==========================================
          // 4.5 Identity Guard (Fase 4.4)
          // ==========================================
          const identityGuardResult = validateLeadIdentity(generatedResp.text, company?.name)
          
          if (dealMetrics) {
            dealMetrics.identityGuardTriggered = identityGuardResult.identityGuardTriggered
          }
                    
          if (!identityGuardResult.valid) {
             finalSuggestedReply = existingResult.suggestedReply
             responseFallbackUsed = true
             generatedResp.text = '' // Invalida a resposta alucinada
          } else {
            // Lógica de avaliação da nova inteligência
            if (generatedResp.confidence >= 85) {
               finalSuggestedReply = generatedResp.text
               responseFallbackUsed = false
            } else {
               finalSuggestedReply = existingResult.suggestedReply
               responseFallbackUsed = true
            }
          }
        }
      }
    }

    return {
      category: finalResult.analysis.category,
      emoji: finalResult.analysis.emoji,
      summary: finalResult.analysis.summary,
      confidence: finalResult.analysis.confidence,
      whatToDo: finalResult.whatToDo,
      
      // Conforme Regra: Na saída principal do app (para manter compatibilidade e simulação), 
      // suggestedReply recebe o finalSuggestedReply (que pode ser o novo ou o antigo dependendo do fallback).
      suggestedReply: finalSuggestedReply,
      
      showSiteButton: finalResult.showSiteButton,
      showProposalButton: finalResult.showProposalButton,
      isWon: finalResult.isWon,
      isLost: finalResult.isLost,
      
      // Observabilidade Fase 3
      intelligenceApplied: !demoMode,
      overrideApplied,
      overrideReason,
      humanReviewRequired,
      intelligenceDecision: intelligenceResult,
      existingDecisionCategory: existingResult.analysis.category,
      finalDecisionCategory: finalResult.analysis.category,
      
      // Observabilidade da Conversation Intelligence (Fase 4 e 4.3)
      existingSuggestedReply: existingResult.suggestedReply,
      generatedResponse: generatedResp?.text || '',
      responseConfidence: generatedResp?.confidence || 0,
      responseGenerationApplied,
      responseFallbackUsed,
      conversationState: convState,
      nextBestAction: convState?.nextBestAction,
      shouldRespond: convState?.shouldRespond,
      shouldWait: convState?.shouldWait,
      salesStrategy: convState?.salesStrategy,
      salesMomentum: convState?.salesMomentum,
      buyingSignals: convState?.buyingSignals,
      conversationObjective: convState?.conversationObjective,
      nextSalesStep: convState?.nextSalesStep,
      
      // Observabilidade Action Guard
      actionGuardMetrics: guardMetrics,
      
      // Observabilidade Closing Guard / Deal State
      dealStateMetrics: dealMetrics
    }
  }
}

export async function getOpeningMessage(company: Company | any, apiKey?: string): Promise<string> {
  // IA sempre tentada; proxy no servidor injeta a chave. Fallback interno p/ template.
  void apiKey
  return generateOpeningMessageAI(company)
}

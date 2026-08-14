import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SalesAgent } from '../src/agents/SalesAgent'
import * as aiClient from '../src/services/aiClient'
import type { DealStatus, NextBestAction } from '../src/types'

vi.mock('../src/services/aiClient', () => ({
  callAI: vi.fn()
}))

describe('FASE 4.4 - Deal State & Closing Intelligence Guard', () => {
  const companyMock = { name: 'Baterias Rolândia', category: 'Automotivo' }
  const mockCallAI = vi.mocked(aiClient.callAI)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockSalesAgentCalls = (
    dealStatus: DealStatus,
    buyingIntentLevel: string,
    explicitCloseConfirmation: boolean,
    generatedText: string,
    closureEvidence: string[] = [],
    nextBestAction: NextBestAction = 'respond',
    confidence: number = 90
  ) => {
    mockCallAI
      // 1. analyzeClientResponseAI (Base engine JSON)
      .mockResolvedValueOnce(JSON.stringify({
        category: 'interest',
        emoji: '💡',
        summary: 'Interesse',
        confidence: 90,
        suggestedReply: 'Sugestão base',
        whatToDo: 'Responder',
        reasoning: 'N/A'
      }))
      // 2. analyzeWithSalesIntelligence (Intelligence Layer JSON)
      .mockResolvedValueOnce(JSON.stringify({
        enabled: true,
        customerState: {
          interestScore: 80,
          trustScore: 80,
          buyingIntent: 80,
          urgencyScore: 50,
          priceSensitivity: 50,
          resistanceScore: 0,
          engagementScore: 80,
          sentiment: 'positive',
          engagement: 'high',
          salesStage: 'discovery'
        },
        interpretation: { explicitIntent: '', implicitIntent: '', mainConcern: '', mainOpportunity: '', keySignal: '' },
        objection: { detected: false, type: null, severity: 0 },
        decision: { nextAction: 'respond_now', reason: '', decisionConfidence: 90, humanReviewRequired: false },
        timing: { shouldWait: false, recommendedDelayMinutes: 0 },
        communication: { tone: 'casual', messageLength: 'short', shouldAskQuestion: false, shouldUseCTA: false, shouldShowDemo: false, shouldShowProposal: false }
      }))
      // 3. analyzeConversationState (Conversation Intelligence JSON)
      .mockResolvedValueOnce(JSON.stringify({
        dealStatus,
        buyingIntentLevel,
        explicitCloseConfirmation,
        closureEvidence,
        dealConfidence: confidence,
        stage: 'discovery',
        interestScore: 80,
        buyingIntentScore: 80,
        trustScore: 80,
        resistanceScore: 0,
        urgencyScore: 0,
        nextBestAction,
        shouldRespond: true,
        shouldWait: false,
        humanReviewRequired: false,
        salesStrategy: 'advance',
        salesMomentum: 'positive',
        buyingSignals: []
      }))
      // 4. generateHumanResponse (Response Generator JSON)
      .mockResolvedValueOnce(JSON.stringify({
        text: generatedText,
        tone: 'professional',
        confidence: 95
      }))
  }

  it('TESTE 1 - CURIOSIDADE: Não fecha o deal por curiosidade', async () => {
    mockSalesAgentCalls('closed', 'low', false, 'Venda fechada!')
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Gostei bastante.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.closingGuardTriggered).toBe(true)
    expect(out.dealStateMetrics?.falseClosePrevented).toBe(true)
    expect(out.dealStateMetrics?.currentDealStatus).not.toBe('closed')
    expect(out.dealStateMetrics?.explicitCloseConfirmation).toBe(false)
  })

  it('TESTE 2 - PREÇO: Status price_discussion', async () => {
    mockSalesAgentCalls('price_discussion', 'medium', false, 'O valor é 1500')
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Quanto custa?' })
    const out = result.output as any
    expect(out.dealStateMetrics?.currentDealStatus).toBe('price_discussion')
    expect(out.dealStateMetrics?.falseClosePrevented).toBe(false)
  })

  it('TESTE 3 - SÓCIO: Status decision_pending', async () => {
    mockSalesAgentCalls('decision_pending', 'medium', false, 'Entendo, fico no aguardo.')
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Preciso falar com meu sócio.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.currentDealStatus).toBe('decision_pending')
  })

  it('TESTE 5 - INTENÇÃO FORTE: Avanço sem falso fechamento', async () => {
    // LLM tenta dar 'closed' falsamente
    mockSalesAgentCalls('closed', 'very_high', false, 'Negócio fechado!')
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Se conseguir R$ 1.500, acho que podemos fazer.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.closingGuardTriggered).toBe(true)
    expect(out.dealStateMetrics?.currentDealStatus).toBe('negotiation') // downgrade
    expect(out.dealStateMetrics?.buyingIntentLevel).toBe('very_high')
  })

  it('TESTE 7 - CONTRATO: Confirmação de fechamento operacional', async () => {
    mockSalesAgentCalls('closed_pending_action', 'very_high', true, 'Mandarei o contrato.', ['Pode mandar o contrato que vamos fechar'])
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Pode mandar o contrato que vamos fechar.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.closingGuardTriggered).toBe(false)
    expect(out.dealStateMetrics?.currentDealStatus).toBe('closed_pending_action')
    expect(out.dealStateMetrics?.explicitCloseConfirmation).toBe(true)
  })

  it('TESTE 11 - FALSO FECHAMENTO: Guard atua sobre LLM empolgado', async () => {
    mockSalesAgentCalls('closed', 'high', false, 'CLIENTE FECHOU!')
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Acho que podemos fazer.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.closingGuardTriggered).toBe(true)
    expect(out.dealStateMetrics?.currentDealStatus).not.toBe('closed')
  })

  it('TESTE 15 - IDENTIDADE: Regressão Baterias Rolândia vs Premium', async () => {
    mockSalesAgentCalls('closed', 'very_high', true, 'Premium Auto Mecânica fechou.', ['Pode fechar'])
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Pode fechar.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.identityGuardTriggered).toBe(true)
    // Se o identityGuard engatilhou, o generatedResponse é apagado e usa o fallback
    expect(out.generatedResponse).toBe('')
    expect(out.responseFallbackUsed).toBe(true)
  })

  it('TESTE REGRESSÃO INTEGRAL Baterias Rolândia', async () => {
    // Simulando a exata mensagem da issue
    mockSalesAgentCalls('closed', 'very_high', false, 'Podemos iniciar o projeto Premium Auto Mecânica!')
    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, demoMode: false, clientResponse: 'Pode ser. Se você conseguir manter aquele valor que comentou, acho que podemos fazer.' })
    const out = result.output as any
    expect(out.dealStateMetrics?.closingGuardTriggered).toBe(true) // falso fechamento
    expect(out.dealStateMetrics?.identityGuardTriggered).toBe(true) // erro de identidade
    expect(out.dealStateMetrics?.currentDealStatus).not.toBe('closed')
    expect(out.generatedResponse).toBe('')
    expect(out.responseFallbackUsed).toBe(true)
  })
})

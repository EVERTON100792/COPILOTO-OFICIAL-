import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SalesAgent } from '../src/agents/SalesAgent'
import * as aiClient from '../src/services/aiClient'

vi.mock('../src/services/aiClient', () => ({
  callAI: vi.fn()
}))

describe('FASE 4.3 - Consultative Sales Behavior Engine', () => {
  const companyMock = { name: 'Agência XYZ', category: 'Marketing Digital' }
  const mockCallAI = vi.mocked(aiClient.callAI)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper function to mock the 4 LLM calls for SalesAgent execution
  const mockSalesAgentCalls = (
    strategy: string, 
    action: string, 
    momentum: string, 
    signals: string[], 
    responseText: string
  ) => {
    // 1) Motor Existente (Fallback)
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'UNKNOWN' }))
    // 2) Sales Intelligence Layer (Fase 3)
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'respond', reason: 'mock' } }))
    // 3) Conversation Intelligence (FASE 4.3)
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'discovery',
      interestScore: 80,
      nextBestAction: action,
      salesStrategy: strategy,
      salesMomentum: momentum,
      buyingSignals: signals,
      conversationObjective: 'Avançar naturalmente',
      shouldRespond: action !== 'wait' && action !== 'stop_contact',
      shouldWait: action === 'wait',
      commercialMemory: { demoSent: false, priceDiscussed: false, objectionHistory: [], previousActions: [] }
    }))
    // 3) Response Generator
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      text: responseText,
      tone: 'casual',
      confidence: 100
    }))
  }

  describe('Testes de Maturidade Consultiva (Cenários 1 a 15)', () => {
    
    it('1. Cliente demonstra curiosidade (Sem CTA agressivo)', async () => {
      mockSalesAgentCalls('discover', 'discovery_question', 'positive', [], 'O que mais chamou sua atenção no site?')
      const agent = new SalesAgent()
      const result = await agent.execute({ company: companyMock, clientResponse: 'Parece interessante.', history: [], demoMode: false })
      const out = result.output as any
      expect(out.salesStrategy).toBe('discover')
      expect(out.actionGuardMetrics.discoveryQuestionUsed).toBe(true)
    })

    it('2. Cliente elogia (Acknowledge sem fechamento)', async () => {
      mockSalesAgentCalls('acknowledge', 'acknowledge', 'positive', [], 'Que bom que gostou!')
      const agent = new SalesAgent()
      const result = await agent.execute({ company: companyMock, clientResponse: 'Ficou muito bonito.', history: [], demoMode: false })
      const out = result.output as any
      expect(out.salesStrategy).toBe('acknowledge')
      expect(out.nextBestAction).toBe('acknowledge')
    })

    it('3. Cliente pergunta preço (Direct Answer First)', async () => {
      mockSalesAgentCalls('answer', 'answer_price', 'strong', ['Quanto custa?'], 'O valor inicial é R$ X.')
      const agent = new SalesAgent()
      const result = await agent.execute({ company: companyMock, clientResponse: 'Qual o valor?', history: [], demoMode: false })
      const out = result.output as any
      expect(out.salesStrategy).toBe('answer')
      expect(out.nextBestAction).toBe('answer_price')
    })

    it('7. Cliente precisa falar com sócio (Autoridade / Wait)', async () => {
      mockSalesAgentCalls('wait', 'wait', 'neutral', [], '')
      const agent = new SalesAgent()
      const result = await agent.execute({ company: companyMock, clientResponse: 'Vou ver com meu sócio e te aviso.', history: [], demoMode: false })
      const out = result.output as any
      expect(out.salesStrategy).toBe('wait')
      expect(out.nextBestAction).toBe('wait')
    })

    it('11. Cliente demonstra intenção forte (Advance / Close)', async () => {
      mockSalesAgentCalls('close', 'close_sale', 'strong', ['Como contrato?'], 'Para começarmos, eu preciso apenas do seu OK e já libero o acesso.')
      const agent = new SalesAgent()
      const result = await agent.execute({ company: companyMock, clientResponse: 'Gostei, como faço para contratar?', history: [], demoMode: false })
      const out = result.output as any
      expect(out.salesStrategy).toBe('close')
      expect(out.actionGuardMetrics.salesAdvanceDetected).toBe(true)
    })
  })

  describe('Teste Multi-Turno Completo (Simulação de 10 Passos)', () => {
    it('Deve conduzir a estratégia gradualmente, adaptando momentum', async () => {
      const turns = [
        { c: 'Pode mandar o site.', s: 'discover', a: 'send_demo', m: 'positive' },
        { c: 'Gostei bastante.', s: 'build_rapport', a: 'acknowledge', m: 'positive' },
        { c: 'A parte do WhatsApp ficou legal.', s: 'create_value', a: 'discovery_question', m: 'positive' },
        { c: 'Quanto fica?', s: 'answer', a: 'answer_price', m: 'strong' },
        { c: 'Está um pouco acima do que pensei.', s: 'handle_objection', a: 'ask_question', m: 'negative' },
        { c: 'Preciso falar com meu sócio.', s: 'wait', a: 'wait', m: 'neutral' },
        { c: 'Talvez mês que vem.', s: 'nurture', a: 'wait', m: 'neutral' },
        { c: 'Se conseguirmos ajustar o valor, podemos fazer.', s: 'advance', a: 'advance', m: 'positive' },
        { c: 'Como funciona para começar?', s: 'qualify', a: 'answer_question', m: 'strong' },
        { c: 'Pode mandar a proposta.', s: 'close', a: 'send_proposal', m: 'strong' },
      ]

      const agent = new SalesAgent()
      let mem: any = undefined

      for (const t of turns) {
        mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'UNKNOWN' }))
        mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'respond', reason: 'mock' } }))
        mockCallAI.mockResolvedValueOnce(JSON.stringify({
          stage: 'discovery',
          salesStrategy: t.s,
          salesMomentum: t.m,
          nextBestAction: t.a,
          shouldRespond: true,
          shouldWait: t.a === 'wait',
          commercialMemory: mem || { demoSent: t.a === 'send_demo', priceDiscussed: false, objectionHistory: [], previousActions: [] }
        }))
        mockCallAI.mockResolvedValueOnce(JSON.stringify({
          text: 'Resposta gerada', tone: 'casual', confidence: 100
        }))

        const result = await agent.execute({ company: companyMock, clientResponse: t.c, previousCommercialMemory: mem, demoMode: false })
        const out = result.output as any
        
        expect(out.salesStrategy).toBe(t.s)
        expect(out.salesMomentum).toBe(t.m)
        mem = out.conversationState?.commercialMemory
      }
    })
  })
})

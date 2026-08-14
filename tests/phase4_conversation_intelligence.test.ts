import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SalesAgent } from '../src/agents/SalesAgent'
import * as aiClient from '../src/services/aiClient'
import { useApp } from '../src/services/store'

vi.mock('../src/services/aiClient', () => {
  return {
    callAI: vi.fn()
  }
})

describe('FASE 4 - Conversation Intelligence & Autonomous Sales Agent', () => {
  const companyMock = { name: 'Empresa Teste', category: 'Tecnologia' }
  const mockCallAI = vi.mocked(aiClient.callAI)

  beforeEach(() => {
    mockCallAI.mockClear()
  })

  it('1. Teste - Interesse ("Pode me mandar o site?")', async () => {
    // 1. Existing Engine
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      category: 'INTERESTED', confidence: 90, summary: 'Interesse',
      whatToDo: 'Enviar site', whatToSay: 'Aqui está', suggestedReply: 'Claro! site.com'
    }))
    
    // 2. Phase 3 Sales Intelligence
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      enabled: true,
      decision: { nextAction: 'respond_now', reason: 'Interesse', decisionConfidence: 90, humanReviewRequired: false }
    }))
    
    // 3. Phase 4 Conversation State Output
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'discovery',
      interestScore: 80,
      nextBestAction: 'respond',
      shouldRespond: true,
      shouldWait: false,
      humanReviewRequired: false
    }))
    
    // 4. Phase 4 Generated Response
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      text: 'Claro, aqui está o link do nosso site: www.site.com',
      tone: 'friendly',
      confidence: 90
    }))

    const agent = new SalesAgent()
    const result = await agent.execute({
      company: companyMock,
      clientResponse: 'Pode me mandar o site para eu dar uma olhada?',
      history: [],
      apiKey: 'test-key',
      demoMode: false
    })

    const out = result.output as any
    console.log('OUTPUT TESTE 1:', JSON.stringify(out, null, 2))
    expect(out.nextBestAction).toBe('respond')
    expect(out.shouldRespond).toBe(true)
    expect(out.generatedResponse).toContain('site.com')
    expect(out.responseFallbackUsed).toBe(false)
  })

  it('7. Teste - Rejeição definitiva ("Não quero mais receber mensagens.")', async () => {
    // 1. Existing Engine
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      category: 'PEDIU_PARAR', confidence: 95, summary: 'Opt out',
      whatToDo: 'Parar contato', whatToSay: 'Agradecer', suggestedReply: 'Tudo bem, sucesso.'
    }))
    
    // 2. Phase 3
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      decision: { nextAction: 'stop_contact', reason: 'Opt out', decisionConfidence: 100, humanReviewRequired: false }
    }))
    
    // 3. Phase 4
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'do_not_contact',
      nextBestAction: 'stop_contact',
      shouldRespond: false,
      shouldWait: false,
      humanReviewRequired: false
    }))
    
    // Phase 4 Generated Response (is skipped when shouldRespond is false, so no 4th mock needed)

    const agent = new SalesAgent()
    const result = await agent.execute({
      company: companyMock,
      clientResponse: 'Não quero mais receber mensagens.',
      history: [],
      apiKey: 'test-key',
      demoMode: false
    })

    const out = result.output as any
    expect(out.nextBestAction).toBe('stop_contact')
    expect(out.shouldRespond).toBe(false)
    expect(out.generatedResponse).toBe('') // shouldWait/stop_contact returns empty string
  })

  it('8. Teste - Silêncio (Cliente não responde há tempos)', async () => {
    // 1. Existing Engine
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      category: 'UNKNOWN', confidence: 50, summary: 'Silêncio',
      whatToDo: 'Aguardar', whatToSay: '', suggestedReply: ''
    }))
    
    // 2. Phase 3
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      decision: { nextAction: 'wait', reason: 'Silêncio', decisionConfidence: 90, humanReviewRequired: false }
    }))
    
    // 3. Phase 4
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'engagement',
      nextBestAction: 'wait',
      shouldRespond: false,
      shouldWait: true,
      humanReviewRequired: false
    }))

    const agent = new SalesAgent()
    const result = await agent.execute({
      company: companyMock,
      clientResponse: '', // Sem resposta
      history: [
        { role: 'assistant', content: 'Gostaria de saber mais?' }
      ],
      apiKey: 'test-key',
      demoMode: false
    })

    const out = result.output as any
    expect(['wait', 'stop_contact']).toContain(out.nextBestAction)
    expect(out.shouldRespond).toBe(false)
  })
  
  it('13. Teste - Cliente sem orçamento ("Agora estou sem dinheiro.")', async () => {
    // 1. Existing Engine
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      category: 'OBJECTION_BUDGET', confidence: 95, summary: 'Objeção de preço',
      whatToDo: 'Gerar valor', whatToSay: 'Entender momento', suggestedReply: 'Entendo perfeitamente...'
    }))
    
    // 2. Phase 3
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      decision: { nextAction: 'wait', reason: 'Objeção de preço', decisionConfidence: 90, humanReviewRequired: false }
    }))
    
    // 3. Phase 4
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'deferred',
      currentObjection: 'budget',
      nextBestAction: 'wait',
      shouldRespond: false,
      shouldWait: true,
      humanReviewRequired: false
    }))

    const agent = new SalesAgent()
    const result = await agent.execute({
      company: companyMock,
      clientResponse: 'Agora estou sem dinheiro.',
      history: [],
      apiKey: 'test-key',
      demoMode: false
    })

    const out = result.output as any
    expect(out.conversationState?.currentObjection).toMatch(/budget|price|dinheiro/i)
    expect(out.shouldRespond).toBe(false)
  })

  it('Fase 4.1 - Caso 1: "Já tenho quem faz meu site." (Apenas informa)', async () => {
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION', confidence: 90, whatToDo: 'Lidar', whatToSay: 'pitch', suggestedReply: 'Posso mandar?' }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'ask_question', reason: 'Descobrir' } }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'discovery',
      nextBestAction: 'acknowledge',
      shouldRespond: true,
      shouldWait: false,
      humanReviewRequired: false,
      existingSolutionDetected: true,
      customerSatisfaction: 'unknown',
      salesOpportunity: 'unknown',
      pressureLevel: 'low'
    }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Entendi, obrigado pelo retorno!', tone: 'professional', confidence: 100 }))

    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, clientResponse: 'Já tenho quem faz meu site.', history: [], apiKey: 'test-key', demoMode: false })
    const out = result.output as any

    expect(out.conversationState?.existingSolutionDetected).toBe(true)
    expect(out.conversationState?.customerSatisfaction).toBe('unknown')
    expect(out.nextBestAction).toBe('acknowledge')
    expect(out.conversationState?.pressureLevel).toBe('low')
  })

  it('Fase 4.1 - Caso 2: "Já tenho quem faz e estou satisfeito." (Baixa pressão)', async () => {
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION', confidence: 90, whatToDo: 'Lidar', whatToSay: 'pitch', suggestedReply: 'Posso mandar?' }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'wait', reason: 'Satisfeito' } }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'discovery',
      nextBestAction: 'acknowledge',
      shouldRespond: true,
      shouldWait: false,
      humanReviewRequired: false,
      existingSolutionDetected: true,
      customerSatisfaction: 'satisfied',
      salesOpportunity: 'low',
      pressureLevel: 'low'
    }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Perfeito! Fico feliz que estejam bem atendidos. Sucesso!', tone: 'friendly', confidence: 100 }))

    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, clientResponse: 'Já tenho quem faz e estou satisfeito.', history: [], apiKey: 'test-key', demoMode: false })
    const out = result.output as any

    expect(out.conversationState?.existingSolutionDetected).toBe(true)
    expect(out.conversationState?.customerSatisfaction).toBe('satisfied')
    expect(out.conversationState?.salesOpportunity).toBe('low')
    expect(out.conversationState?.pressureLevel).toBe('low')
  })

  it('Fase 4.1 - Caso 3: "Já tenho quem faz, mas não estou satisfeito." (Insatisfação)', async () => {
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION', confidence: 90, whatToDo: 'Lidar', whatToSay: 'pitch', suggestedReply: 'Posso mandar?' }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'ask_question', reason: 'Sondar' } }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'discovery',
      nextBestAction: 'ask_question',
      shouldRespond: true,
      shouldWait: false,
      humanReviewRequired: false,
      existingSolutionDetected: true,
      customerSatisfaction: 'dissatisfied',
      salesOpportunity: 'high',
      pressureLevel: 'medium'
    }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Entendo. O que mais te incomoda atualmente no serviço deles?', tone: 'professional', confidence: 100 }))

    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, clientResponse: 'Já tenho quem faz, mas não estou satisfeito.', history: [], apiKey: 'test-key', demoMode: false })
    const out = result.output as any

    expect(out.conversationState?.existingSolutionDetected).toBe(true)
    expect(out.conversationState?.customerSatisfaction).toBe('dissatisfied')
    expect(out.conversationState?.salesOpportunity).toMatch(/high|medium/)
    expect(out.nextBestAction).toBe('ask_question')
  })

  it('Fase 4.1 - Caso 4: "Já tenho quem faz, mas gostaria de conhecer outra opção." (Abertura)', async () => {
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED', confidence: 90, whatToDo: 'Mostrar', whatToSay: 'pitch', suggestedReply: 'Aqui está' }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo', reason: 'Abertura' } }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({
      stage: 'discovery',
      nextBestAction: 'send_demo',
      shouldRespond: true,
      shouldWait: false,
      humanReviewRequired: false,
      existingSolutionDetected: true,
      customerSatisfaction: 'unknown',
      salesOpportunity: 'high',
      pressureLevel: 'medium'
    }))
    mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Ótimo! Preparei um modelo demonstrativo, posso enviar o link?', tone: 'professional', confidence: 100 }))

    const agent = new SalesAgent()
    const result = await agent.execute({ company: companyMock, clientResponse: 'Já tenho quem faz, mas gostaria de conhecer outra opção.', history: [], apiKey: 'test-key', demoMode: false })
    const out = result.output as any

    expect(out.conversationState?.existingSolutionDetected).toBe(true)
    expect(out.conversationState?.salesOpportunity).toMatch(/high|medium/)
    expect(out.nextBestAction).toBe('send_demo')
  describe('Fase 4.2 - Commercial Memory Multi-Turn', () => {
    it('Deve preservar a Commercial Memory em 3 turnos (Demo -> Gostar -> Preço)', async () => {
      const agent = new SalesAgent()
      let prevMemory: any = undefined

      // ==========================================
      // TURNO 1: Enviar Demonstração
      // ==========================================
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        stage: 'discovery', nextBestAction: 'send_demo',
        commercialMemory: { demoSent: false, priceDiscussed: false, objectionHistory: [], previousActions: [] }
      }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Posso mandar a demonstração?', tone: 'professional', confidence: 90 }))

      let result = await agent.execute({ company: companyMock, clientResponse: 'Pode mandar.', history: [], demoMode: false })
      let out = result.output as any
      prevMemory = out.conversationState.commercialMemory

      // Simular que o sistema realmente enviou a demo
      let systemActions = ['demo_sent']
      expect(out.nextBestAction).toBe('send_demo')

      // ==========================================
      // TURNO 2: Cliente gostou (demoViewed)
      // ==========================================
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'ask_question' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        stage: 'engaged', nextBestAction: 'ask_question',
        commercialMemory: { ...prevMemory, demoSent: true, demoDiscussed: true, interestLevel: 'high' }
      }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Que bom que gostou! Tem alguma dúvida?', tone: 'friendly', confidence: 90 }))

      result = await agent.execute({ 
        company: companyMock, 
        clientResponse: 'Gostei bastante.', 
        history: [{role:'assistant', content:'Posso mandar a demonstração?'}, {role:'user', content:'Pode mandar.'}], 
        demoMode: false,
        previousCommercialMemory: prevMemory,
        systemActions
      })
      out = result.output as any
      prevMemory = out.conversationState.commercialMemory

      expect(prevMemory.demoSent).toBe(true)
      expect(prevMemory.demoDiscussed).toBe(true)
      expect(prevMemory.interestLevel).toBe('high')
      expect(out.nextBestAction).not.toBe('send_demo')

      // ==========================================
      // TURNO 3: Pergunta preço
      // ==========================================
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'PRICING' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'answer_price' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        stage: 'price_discussion', nextBestAction: 'answer_price',
        commercialMemory: { ...prevMemory, priceDiscussed: true, buyingIntent: 'high' }
      }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'O valor é X. O que acha?', tone: 'professional', confidence: 90 }))

      result = await agent.execute({ 
        company: companyMock, 
        clientResponse: 'Quanto fica?', 
        history: [{role:'assistant', content:'Que bom que gostou! Tem alguma dúvida?'}, {role:'user', content:'Gostei bastante.'}], 
        demoMode: false,
        previousCommercialMemory: prevMemory,
        systemActions
      })
      out = result.output as any
      prevMemory = out.conversationState.commercialMemory

      expect(prevMemory.priceDiscussed).toBe(true)
      expect(prevMemory.buyingIntent).toBe('high')
      expect(out.nextBestAction).toBe('answer_price')

      // ==========================================
      // TURNO 4: Objeção Sócio (Decision Maker)
      // ==========================================
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'ask_question' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        stage: 'decision_pending', nextBestAction: 'ask_question',
        commercialMemory: { ...prevMemory, decisionMakerKnown: true, currentObjection: 'decision_maker', objectionHistory: ['decision_maker'] }
      }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Perfeito. Como funciona o processo de decisão com ele?', tone: 'professional', confidence: 90 }))

      result = await agent.execute({ 
        company: companyMock, 
        clientResponse: 'Preciso falar com meu sócio.', 
        history: [{role:'user', content:'Quanto fica?'}, {role:'assistant', content:'O valor é X. O que acha?'}], 
        demoMode: false,
        previousCommercialMemory: prevMemory,
        systemActions
      })
      out = result.output as any
      prevMemory = out.conversationState.commercialMemory

      expect(prevMemory.currentObjection).toBe('decision_maker')
      expect(out.conversationState.stage).toBe('decision_pending')

      // ==========================================
      // TURNO 5: Objeção de Tempo (Timing)
      // ==========================================
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'wait' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({
        stage: 'deferred', nextBestAction: 'wait',
        commercialMemory: { ...prevMemory, currentObjection: 'timing', objectionHistory: ['decision_maker', 'timing'], followUpNeeded: true }
      }))
      // No response expected since shouldWait = true (fallback no agente retorna vazio)

      result = await agent.execute({ 
        company: companyMock, 
        clientResponse: 'Talvez daqui uns dois ou três meses.', 
        history: [{role:'user', content:'Preciso falar com meu sócio.'}, {role:'assistant', content:'Perfeito. Como funciona o processo de decisão com ele?'}], 
        demoMode: false,
        previousCommercialMemory: prevMemory,
        systemActions
      })
      out = result.output as any
      prevMemory = out.conversationState.commercialMemory

      expect(prevMemory.currentObjection).toBe('timing')
      expect(prevMemory.objectionHistory).toContain('decision_maker')
      expect(prevMemory.followUpNeeded).toBe(true)
      expect(out.conversationState.stage).toBe('deferred')
    })
  })

  describe('Fase 4.2.1 - Action Guard e Natural Sales Behavior', () => {
    
    it('TESTE 1: demoSent = true, Cliente elogia -> NÃO deve mandar demo', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      // IA tenta enviar demo
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Obrigado!', tone: 'casual', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Gostei bastante.', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.actionGuardMetrics.actionBlockedByGuard).toBe(true)
      expect(out.actionGuardMetrics.actionGuardReason).toBe('demo_already_sent')
      expect(out.nextBestAction).toBe('acknowledge')
    })

    it('TESTE 2: demoSent = true, Cliente pergunta preco -> responde preco', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'PRICING' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'O preço é X.', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Quanto custa?', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('answer_price')
    })

    it('TESTE 3: demoSent = true, Cliente pergunta prazo -> responde prazo', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'QUESTION' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'O prazo é 10 dias.', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Quanto tempo demora?', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('answer_timing')
    })

    it('TESTE 4: demoSent = true, Cliente precisa falar com sócio -> bloqueia pitch', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_proposal' } })) // IA tenta forçar
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_proposal', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'ok', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Preciso falar com meu sócio.', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('wait')
    })

    it('TESTE 5: Cliente já gastou com marketing -> acknowledge', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'close_sale' } })) // IA alucina pitch
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'close_sale', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'ok', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Já gastamos bastante com marketing esse ano.', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('acknowledge')
    })

    it('TESTE 6: Cliente "Gostei." -> acknowledge', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_proposal' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_proposal', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Fico feliz!', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Gostei.', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('acknowledge')
    })

    it('TESTE 7: Perdeu o link, demoSent=true -> permite demo', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Aqui esta', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Perdi o link que você mandou.', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('send_demo')
    })

    it('TESTE 8: Pode mandar de novo? -> permite demo', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'INTERESTED' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Aqui esta', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Pode mandar de novo?', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('send_demo')
    })

    it('TESTE 9: Timing deferral -> wait', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'OBJECTION' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'ok', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Talvez daqui uns três meses.', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('wait')
    })

    it('TESTE 10: Quanto custa e quanto demora -> answer_price (multi)', async () => {
      const agent = new SalesAgent()
      const prevMemory = { demoSent: true }
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'PRICING' }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: 'send_demo' } }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: 'send_demo', commercialMemory: prevMemory }))
      mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Preço e prazo.', tone: 'direct', confidence: 90 }))

      const result = await agent.execute({ company: companyMock, clientResponse: 'Quanto custa e quanto demora?', previousCommercialMemory: prevMemory })
      const out = result.output as any
      expect(out.nextBestAction).toBe('answer_price')
    })
    
    it('TESTE MULTI-TURNO: 8 Etapas', async () => {
      const agent = new SalesAgent()
      let mem: any = undefined

      const turns = [
        { c: 'Pode mandar o site.', expectAction: 'send_demo', initAI: 'send_demo' },
        { c: 'Gostei bastante.', expectAction: 'acknowledge', initAI: 'send_demo' }, // bloqueado
        { c: 'Quanto fica?', expectAction: 'answer_price', initAI: 'send_demo' }, // override price
        { c: 'Preciso falar com meu sócio.', expectAction: 'wait', initAI: 'send_proposal' }, // override wait
        { c: 'Já gastamos bastante com marketing esse ano.', expectAction: 'acknowledge', initAI: 'send_proposal' },
        { c: 'Talvez daqui uns dois ou três meses.', expectAction: 'wait', initAI: 'send_demo' },
        { c: 'Mas gostei daquela parte do WhatsApp.', expectAction: 'acknowledge', initAI: 'send_proposal' },
        { c: 'Quanto tempo demora?', expectAction: 'answer_timing', initAI: 'send_proposal' }
      ]

      for (const t of turns) {
        mockCallAI.mockResolvedValueOnce(JSON.stringify({ category: 'UNKNOWN' }))
        mockCallAI.mockResolvedValueOnce(JSON.stringify({ decision: { nextAction: t.initAI } }))
        mockCallAI.mockResolvedValueOnce(JSON.stringify({ nextBestAction: t.initAI, commercialMemory: { ...mem, demoSent: true } }))
        mockCallAI.mockResolvedValueOnce(JSON.stringify({ text: 'Ok', tone: 'direct', confidence: 90 }))
        
        const result = await agent.execute({ company: companyMock, clientResponse: t.c, previousCommercialMemory: mem })
        const out = result.output as any
        expect(out.nextBestAction).toBe(t.expectAction)
        mem = out.conversationState.commercialMemory
      }
    })
  })
})
})


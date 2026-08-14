import { analyzeWithSalesIntelligence, resolveDecisions } from '../src/services/salesIntelligence.ts'
import { analyzeClientResponse, buildInstruction } from '../src/services/salesAI.ts'

async function run() {
  const company = {
    name: 'Padaria Modelo',
    category: 'Padaria e Confeitaria',
    city: 'São Paulo'
  }

  const responses = [
    "Pode mandar o site para eu ver.",
    "Tá bonito, mas não sei se vale a pena.",
    "Quanto custa?",
    "Não tenho interesse no momento.",
    "Não quero mais receber mensagens."
  ]

  for (const resp of responses) {
    console.log('\\n=======================================')
    console.log('CLIENTE:', resp)
    
    const existingAnalysis = analyzeClientResponse(resp)
    const existingInstruction = buildInstruction(existingAnalysis, company)
    
    console.log('\\n[MOTOR EXISTENTE]:', existingInstruction.analysis.category)

    const intelligence = await analyzeWithSalesIntelligence(resp, company, 'no-key-needed', [])
    
    console.log('\\n[INTELIGÊNCIA]:', intelligence.decision.nextAction)
    console.log('Motivo:', intelligence.decision.reason)
    console.log('Objeção:', intelligence.objection.type)

    const resolved = resolveDecisions(existingInstruction, intelligence)
    
    console.log('\\n[DECISÃO FINAL]:')
    console.log('Categoria final:', resolved.finalInstruction.analysis.category)
    console.log('Override:', resolved.overrideApplied, '| Motivo:', resolved.overrideReason)
    console.log('Resposta:', resolved.finalInstruction.suggestedReply)
  }
}

run().catch(console.error)

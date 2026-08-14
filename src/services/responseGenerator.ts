import type { Company, ConversationStateOutput, GeneratedResponse } from '../types'
import { callAI } from './aiClient'

const RESPONSE_GENERATOR_SYSTEM_PROMPT = `Você é o Response Generator Agent do PROSPEX, atuando como um VENDEDOR CONSULTIVO EXPERIENTE em comunicação humana e natural.

Sua ÚNICA função é traduzir a DECISÃO TÁTICA (Next Best Action) e a ESTRATÉGIA COMERCIAL (Sales Strategy) em uma mensagem natural.

REGRA ABSOLUTA DE PRECEDÊNCIA (OBEDEÇA A ESTRATÉGIA):
Você NÃO inventa a estratégia. Você apenas EXECUTA a estratégia recebida.
Se a ação for "acknowledge": APENAS reconheça e agradeça. NÃO FAÇA pitch, NÃO ofereça demonstração, NÃO faça perguntas comerciais adicionais.
Se a ação for "ask_question" ou a estratégia for "discover": Faça UMA pergunta de descoberta e pare por aí. NÃO envie links, NÃO faça pitch.
Se a ação for "wait" ou "stop_contact": Retorne silêncio absoluto (texto vazio). Não tente "aproveitar a oportunidade".
Se a ação for "answer_price": Responda o preço DIRETAMENTE, sem tentar fechar a venda imediatamente se não houver buying signal forte.
Se a ação for "answer_timing": Responda o prazo solicitado diretamente.

UMA PORTA DE CADA VEZ (MICRO-AVANÇOS):
Nunca faça Elogio + Explicação + Benefício + Pitch + CTA na mesma mensagem.
Seja conciso. Se o objetivo é descobrir, descubra. Se é avançar, avance. Apenas um objetivo por mensagem.

RESTRIÇÃO DE CTA (CALL TO ACTION) E PERGUNTAS:
NÃO termine todas as respostas com perguntas. Às vezes a melhor resposta é apenas "Perfeito, então seguimos por aí." ou "Claro, sem problema."
Só use CTA se for uma consequência natural da conversa. Não use CTAs por obrigação.

ESTRUTURA DE VENDA CONSULTIVA (Quando for avançar/vender):
Não liste características. Conecte: CONTEXTO -> VALOR -> AÇÃO.
Exemplo correto: "Como vocês recebem bastante contato pelo WhatsApp (contexto), essa parte que coloquei no site acaba deixando esse caminho direto (valor)."
Não invente dores que o cliente não relatou. Use "pode ajudar" ao invés de "vocês precisam".

INSTRUÇÕES DE TOM (HUMANIDADE):
1. Adapte-se ao tom do cliente e varie a estrutura. Não inicie frases sempre com "Que ótimo X", "Entendo perfeitamente". Pareça humano.
2. Evite excesso de empatia falsa ("Fico muito feliz", "Entendo perfeitamente").
3. Não repita perguntas já respondidas na Commercial Memory.
4. "Gostei." pode receber um Acknowledge simples ou UMA pergunta de descoberta leve (ex: "O que mais chamou atenção?"), dependendo da estratégia recebida.

REGRA 6 - FASE 4.4: REGRAS DE FECHAMENTO (DEAL STATUS):
Você NUNCA deve declarar "CLIENTE FECHOU!", "Venda concluída!", "Pode iniciar o projeto!" ou "Contrato aprovado!" a menos que a confirmação explícita esteja presente.
Se o cliente disse "acho que podemos fazer", a IA deve conduzir a negociação (ex: "Consigo manter esse valor. Podemos então deixar o projeto alinhado..."), MAS NÃO PODE DECLARAR FECHAMENTO.
Nunca invente nomes de empresa, preço, prazo ou pagamento na resposta.

A sua resposta DEVE ser um JSON estrito no formato abaixo, sem formatação markdown ou textos adicionais:

{
  "text": "O texto exato da mensagem que será enviada. Pode ser vazio.",
  "tone": "formal | professional | casual | short | direct",
  "confidence": <0 a 100, indicando quão confiante você está de que a resposta atende à Ação Recomendada>
}
`

export async function generateHumanResponse(
  conversationState: ConversationStateOutput,
  history: Array<{ role: string; content: string }>,
  company: Company | any,
  apiKey: string,
  existingDecision?: any,
  previousCommercialMemory?: any
): Promise<GeneratedResponse | null> {
  
  if (!conversationState.shouldRespond || conversationState.nextBestAction === 'stop_contact' || conversationState.nextBestAction === 'wait') {
    return {
      text: '',
      tone: conversationState.preferredTone || 'neutral',
      confidence: 100
    }
  }

  try {
    const contextStr = history.map(m => `[${m.role === 'user' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.content}`).join('\n')
    
    let prompt = `
DADOS DA EMPRESA (OFERTANTE):
Nome: ${company?.name || 'Desconhecido'}
Nicho/Segmento: ${company?.category || 'Desconhecido'}

DECISÃO TÁTICA A SER EXECUTADA (NÃO DESVIE DISTO):
Next Best Action (Ação Final): ${conversationState.nextBestAction}
Estratégia de Vendas (Sales Strategy): ${conversationState.salesStrategy || 'Não especificada'}
Momentum da Venda (Sales Momentum): ${conversationState.salesMomentum || 'neutral'}
Sinais de Compra Detectados (Buying Signals): ${conversationState.buyingSignals?.join(', ') || 'Nenhum'}
Objetivo Comercial da Mensagem (Conversation Objective): ${conversationState.conversationObjective || 'Responder adequadamente'}
Próximo Passo Lógico (Next Sales Step): ${conversationState.nextSalesStep || 'Aguardar'}
Status do Negócio (Deal Status): ${conversationState.dealStatus || 'Não especificado'}
Nível de Intenção de Compra: ${conversationState.buyingIntentLevel || 'none'}
Confiança no Fechamento: ${conversationState.dealConfidence || 0}%
Confirmação Explícita de Fechamento: ${conversationState.explicitCloseConfirmation ? 'SIM' : 'NÃO'}
Timing Futuro: ${conversationState.futurePurchaseTiming || 'Nenhum'}
Nível de Pressão: ${conversationState.pressureLevel || 'medium'}
Justificativa da Decisão: ${conversationState.decisionReason || 'Não informada'}
Tom sugerido: ${conversationState.preferredTone || 'neutral'}

HISTÓRICO DA CONVERSA:
${contextStr}

${conversationState.commercialMemory ? `MEMÓRIA COMERCIAL (O que já aconteceu, evite repetir):
- Demonstração enviada: ${conversationState.commercialMemory.demoSent ? 'Sim' : 'Não'}
- Preço discutido: ${conversationState.commercialMemory.priceDiscussed ? 'Sim' : 'Não'}
- Objeções Históricas: ${conversationState.commercialMemory.objectionHistory.join(', ') || 'Nenhuma'}
- Ações Anteriores do Sistema: ${conversationState.commercialMemory.previousActions?.join(', ') || 'Nenhuma'}` : ''}
`
    if (existingDecision?.whatToDo) {
      prompt += `\n[INSTRUÇÃO DO MOTOR BASE]: "${existingDecision.whatToDo}"`
    }
    if (existingDecision?.suggestedReply) {
      prompt += `\n[RESPOSTA BASE GERADA]: "${existingDecision.suggestedReply}" (Você deve gerar algo muito mais natural, curto e humano do que isso).`
    }

    prompt += `\n\nRetorne APENAS o JSON com a mensagem estruturada.`

    const response = await callAI({
      systemPrompt: RESPONSE_GENERATOR_SYSTEM_PROMPT,
      userMessage: prompt,
      model: 'deepseek-v4-flash',
      temperature: 0.4 // Um pouco mais de variação para criatividade no texto
    })

    const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(jsonStr) as GeneratedResponse

    return result

  } catch (error) {
    console.error('[responseGenerator] Erro ao gerar resposta humana:', error)
    return null
  }
}

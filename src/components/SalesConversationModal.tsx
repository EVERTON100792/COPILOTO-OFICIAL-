import React, { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Button, Badge } from './ui'
import { useApp } from '../services/store'
import {
  generateOpeningMessage,
  generateOpeningMessageAI,
  analyzeClientResponse,
  analyzeClientResponseAI,
  buildInstruction,
  type SalesInstruction,
  type SalesStage,
} from '../services/salesAI'
import { enrichCompanyData } from '../services/enrichmentService'
import { downloadSiteZip, generateSiteFiles } from '../services/siteGenerator'
import { downloadProposalPdf } from '../services/proposalGenerator'
import { generateDemoForCompany } from '../services/demoEngine'
import { LiveSitePreview } from './LiveSitePreview'
import { ProposalEditorModal } from './ProposalEditorModal'
import type { Company, Demo } from '../types'
import { uid, nowIso } from '../lib/utils'

interface Props {
  open: boolean
  company: Company | any
  leadId?: string
  onClose: () => void
}

function getProviderLabel(baseUrl: string, model: string): string {
  if (baseUrl.includes('opencode.ai')) return `OpenCode Zen (${model || 'deepseek-v4-flash'})`
  if (baseUrl.includes('openrouter.ai')) return `OpenRouter (${model || 'auto'})`
  if (baseUrl.includes('openai.com')) return `OpenAI (${model || 'gpt-4o'})`
  if (baseUrl) return `IA Custom (${model || ''})`
  return `IA (${model || 'auto'})`
}

const ANIMATIONS_STYLE = `
  @keyframes scanline {
    0% { transform: translateY(-10px) scale(0.9); opacity: 0; }
    50% { transform: translateY(0px) scale(1.1); opacity: 1; filter: brightness(1.5) drop-shadow(0 0 15px var(--primary)); }
    100% { transform: translateY(10px) scale(0.9); opacity: 0; }
  }
  @keyframes floatBrain {
    0%, 100% { transform: translateY(0px); filter: drop-shadow(0 0 10px rgba(99,102,241,0.5)); }
    50% { transform: translateY(-8px); filter: drop-shadow(0 0 25px rgba(99,102,241,0.9)); }
  }
  @keyframes floatBrainSmall {
    0%, 100% { transform: translateY(0px); filter: drop-shadow(0 0 5px rgba(99,102,241,0.5)); }
    50% { transform: translateY(-4px); filter: drop-shadow(0 0 15px rgba(99,102,241,0.9)); }
  }
  @keyframes ringExpand {
    0% { width: 40px; height: 40px; opacity: 1; border-width: 4px; }
    100% { width: 140px; height: 140px; opacity: 0; border-width: 1px; }
  }
  @keyframes ringExpandSmall {
    0% { width: 30px; height: 30px; opacity: 1; border-width: 3px; }
    100% { width: 80px; height: 80px; opacity: 0; border-width: 1px; }
  }
  @keyframes gradientSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes pulseText {
    0%, 100% { opacity: 0.7; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.02); }
  }
`

export const SalesConversationModal: React.FC<Props> = ({ open, company, leadId, onClose }) => {
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const prospectingSessions = useApp((s) => s.prospectingSessions)
  const upsertProspectingSession = useApp((s) => s.upsertProspectingSession)
  const moveLead = useApp((s) => s.moveLead)

  const [stage, setStage] = useState<SalesStage>('OPENING')
  const [clientInput, setClientInput] = useState('')
  const [instruction, setInstruction] = useState<SalesInstruction | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [generatingSite, setGeneratingSite] = useState(false)
  const [copiedOpening, setCopiedOpening] = useState(false)
  const [copiedReply, setCopiedReply] = useState(false)
  const [generatedDemo, setGeneratedDemo] = useState<Demo | null>(null)
  const [proposalModalOpen, setProposalModalOpen] = useState(false)

  const [generatingOpening, setGeneratingOpening] = useState(false)
  const [openingMessage, setOpeningMessage] = useState('')

  const apiKey = settings.aiApiKey || (import.meta.env.VITE_AI_API_KEY as string | undefined) || ''
  const providerLabel = "OpenCode Go (deepseek-v4-pro)"

  React.useEffect(() => {
    if (open && company) {
      const existingSession = useApp.getState().prospectingSessions.find((s) => s.companyId === company.id)
      if (existingSession && existingSession.openingMessage) {
        setOpeningMessage(existingSession.openingMessage)
        if (existingSession.uiState) {
          setStage(existingSession.uiState.stage as SalesStage)
          setClientInput(existingSession.uiState.clientInput)
          setInstruction(existingSession.uiState.instruction)
        }
      } else if (!openingMessage && !generatingOpening) {
        setGeneratingOpening(true)
        generateOpeningMessageAI(company, apiKey)
          .then((msg) => {
            setOpeningMessage(msg)
            setGeneratingOpening(false)
          })
          .catch(() => {
            setOpeningMessage(generateOpeningMessage(company))
            setGeneratingOpening(false)
          })
      }
    }
  }, [open, company?.id]) // only run on open/company change to avoid loops

  // Save session state to store whenever local state changes
  React.useEffect(() => {
    if (open && company && openingMessage) {
      const existingSession = useApp.getState().prospectingSessions.find((s) => s.companyId === company.id)
      const sessionId = existingSession?.id || uid()
      
      upsertProspectingSession({
        id: sessionId,
        companyId: company.id,
        status: 'IN_PROGRESS',
        messages: existingSession?.messages || [],
        openingMessage,
        uiState: { stage, clientInput, instruction },
        createdAt: existingSession?.createdAt || nowIso(),
        updatedAt: nowIso(),
      })
    }
  }, [stage, clientInput, instruction, openingMessage, open, company?.id])

  function resetModal() {
    setStage('OPENING')
    setClientInput('')
    setInstruction(null)
    setAnalyzing(false)
    setGeneratingSite(false)
    setCopiedOpening(false)
    setCopiedReply(false)
    setGeneratedDemo(null)
    setOpeningMessage('')
  }

  function generateNewApproach() {
    setStage('OPENING')
    setClientInput('')
    setInstruction(null)
    setOpeningMessage('')
    setGeneratingOpening(true)
    generateOpeningMessageAI(company, apiKey)
      .then((msg) => {
        setOpeningMessage(msg)
        setGeneratingOpening(false)
      })
      .catch(() => {
        setOpeningMessage(generateOpeningMessage(company))
        setGeneratingOpening(false)
      })
  }

  function handleClose() {
    resetModal()
    onClose()
  }

  function markLeadContacted() {
    const lead = leadId 
      ? useApp.getState().leads.find(l => l.id === leadId)
      : useApp.getState().leads.find(l => l.companyId === company?.id)
      
    if (lead) {
      moveLead(lead.id, 'CONTACTED')
    }
  }

  function copyOpening() {
    navigator.clipboard.writeText(openingMessage)
    setCopiedOpening(true)
    toast('success', 'Mensagem de abertura copiada! Status do cliente atualizado para Contatado.')
    markLeadContacted()
    setTimeout(() => setCopiedOpening(false), 3000)
  }

  function openWhatsApp() {
    markLeadContacted()
    const phone = company?.whatsapp || company?.phone
    if (!phone) { copyOpening(); return }
    const digits = phone.replace(/\D/g, '')
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(openingMessage)}`
    window.open(url, '_blank')
  }

  async function analyzeResponse() {
    if (!clientInput.trim()) { toast('error', 'Digite a resposta do cliente antes de analisar.'); return }
    // Conversa já encerrada (ganho/perdido/opt-out) → reutilizar última classificação, sem custo de IA.
    const currentSession = useApp.getState().prospectingSessions.find((s) => s.companyId === company?.id)
    if (
      currentSession &&
      (currentSession.status === 'WON' || currentSession.status === 'NOT_INTERESTED')
    ) {
      toast('warning', 'Conversa já encerrada. A classificação anterior foi mantida (economia de chamadas de IA).')
      return
    }
    setAnalyzing(true)
    setStage('ANALYZING')
    try {
      // Histórico completo da conversa (abertura + troca de mensagens) como contexto
      const history = [
        ...(currentSession?.messages ?? []),
      ].filter((m) => m.content && m.content.trim())
      const result = settings.demoMode
        ? buildInstruction(analyzeClientResponse(clientInput), company)
        : await analyzeClientResponseAI(clientInput, company, apiKey, { history, cacheKey: `${company?.id}::${clientInput.trim()}` })
      setInstruction(result)
      const finalStage = result.isWon ? 'WON' : result.isLost ? 'LOST' : 'INSTRUCTING'
      setStage(finalStage)
      const lead = useApp.getState().leads.find((l) => l.companyId === company?.id)
      if (lead) {
        if (finalStage === 'WON') moveLead(lead.id, 'WON')
        if (finalStage === 'LOST') moveLead(lead.id, 'LOST')
      }
    } catch (err) {
      toast('error', 'Erro ao analisar resposta. Usando modo demo.')
      const result = buildInstruction(analyzeClientResponse(clientInput), company)
      setInstruction(result)
      setStage('INSTRUCTING')
    } finally {
      setAnalyzing(false)
    }
  }

  function copyReply() {
    if (!instruction) return
    navigator.clipboard.writeText(instruction.suggestedReply)
    setCopiedReply(true)
    toast('success', 'Resposta copiada!')
    setTimeout(() => setCopiedReply(false), 3000)
  }

  function openReplyWhatsApp() {
    if (!instruction) return
    const phone = company?.whatsapp || company?.phone
    if (!phone) { copyReply(); return }
    const digits = phone.replace(/\D/g, '')
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(instruction.suggestedReply)}`
    window.open(url, '_blank')
  }

  async function handleGenerateSite() {
    setGeneratingSite(true)
    toast('info', 'Buscando dados, gerando textos e montando site personalizado...')
    try {
      const enriched = await enrichCompanyData(company)
      const newDemo = await generateDemoForCompany(company, enriched)
      useApp.getState().upsertDemo(newDemo) // Save it globally
      setGeneratedDemo(newDemo)
      toast('success', 'Site gerado com sucesso! Veja o preview ao lado.')
    } catch (err) {
      toast('error', 'Erro ao gerar site. Tente novamente.')
    } finally {
      setGeneratingSite(false)
    }
  }

  function handleGenerateProposal() {
    setProposalModalOpen(true)
  }

  function handleNewResponse() {
    setClientInput('')
    setInstruction(null)
    setStage('WAITING_RESPONSE')
  }

  if (!open || !company) return null

  const phone = company?.whatsapp || company?.phone
  const hasPhone = !!phone

  return (
    <Modal open={open} onClose={handleClose} wide style={generatedDemo ? { maxWidth: 1100, transition: 'max-width 0.3s ease' } : { transition: 'max-width 0.3s ease' }} title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>🚀 Prospectar Cliente</span>
        <Badge variant={
          stage === 'WON' ? 'success' :
          stage === 'LOST' ? 'danger' :
          stage === 'INSTRUCTING' ? 'warning' : 'primary'
        }>
          {stage === 'OPENING' && 'Abordagem Inicial'}
          {stage === 'WAITING_RESPONSE' && 'Aguardando Resposta'}
          {stage === 'ANALYZING' && 'Analisando...'}
          {stage === 'INSTRUCTING' && 'Instrução da IA'}
          {stage === 'WON' && '🎉 Venda Fechada!'}
          {stage === 'LOST' && 'Não Interessado'}
        </Badge>
        {!settings.demoMode && <Badge variant="info">IA Real ({providerLabel})</Badge>}
      </div>
    }>
      <div style={{ display: 'grid', gridTemplateColumns: generatedDemo ? '350px 1fr' : '1fr', gap: 24, transition: 'all 0.3s ease' }}>
        
        {/* Left Column (Chat and Flow) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <style dangerouslySetInnerHTML={{ __html: ANIMATIONS_STYLE }} />

        {/* Company Info Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)'
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'var(--grad-primary)', display: 'grid', placeItems: 'center',
            fontSize: 22, flexShrink: 0
          }}>
            {company.category?.toLowerCase().includes('restaurante') ? '🍽️' :
             company.category?.toLowerCase().includes('saúde') || company.category?.toLowerCase().includes('odonto') ? '🏥' :
             company.category?.toLowerCase().includes('beleza') || company.category?.toLowerCase().includes('salão') ? '💅' :
             company.category?.toLowerCase().includes('auto') ? '🔧' : '🏢'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{company.name}</div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              {company.category || 'Negócio Local'} · {company.city || 'Local'}{company.state ? `/${company.state}` : ''}
              {company.rating ? ` · ⭐ ${company.rating.toFixed(1)}` : ''}
            </div>
          </div>
          {hasPhone && (
            <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
              📱 {phone}
            </div>
          )}
        </div>

        {/* ===== STAGE: OPENING ===== */}
        {stage === 'OPENING' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.08)',
              borderLeft: '3px solid var(--primary)',
              fontSize: 13, color: 'var(--muted)'
            }}>
              💡 A IA gerou uma abordagem personalizada para o nicho <strong>{company.category || 'deste negócio'}</strong>.
              Copie e envie — depois volte aqui para registrar a resposta do cliente.
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                💬 Mensagem de Abertura Personalizada pela IA
              </div>
              <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 18, fontSize: 14, lineHeight: 1.7,
                whiteSpace: 'pre-wrap', color: 'var(--text)', position: 'relative', minHeight: 120
              }}>
                {generatingOpening ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
                    <div style={{ position: 'relative', width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ position: 'absolute', borderRadius: '50%', border: 'solid var(--primary)', animation: 'ringExpandSmall 1.5s infinite cubic-bezier(0.16, 1, 0.3, 1)' }} />
                      <div style={{ position: 'absolute', borderRadius: '50%', border: 'solid var(--primary)', animation: 'ringExpandSmall 1.5s infinite cubic-bezier(0.16, 1, 0.3, 1)', animationDelay: '0.5s' }} />
                      <div style={{ position: 'absolute', fontSize: 24, animation: 'floatBrainSmall 2s ease-in-out infinite', zIndex: 10 }}>🧠</div>
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--muted)', animation: 'pulseText 1.5s infinite', fontWeight: 600 }}>
                      Cérebro IA escrevendo abordagem estratégica...
                    </span>
                  </div>
                ) : (
                  openingMessage
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={copyOpening} disabled={generatingOpening}>
                  {copiedOpening ? '✓ Copiado!' : '📋 Copiar Texto'}
                </Button>
                {hasPhone && (
                  <Button variant="success" size="sm" onClick={openWhatsApp} disabled={generatingOpening}>
                    💬 Abrir no WhatsApp
                  </Button>
                )}
                <div style={{ flex: 1 }} />
                <Button variant="secondary" size="sm" onClick={generateNewApproach} disabled={generatingOpening}>
                  🔄 Gerar Nova
                </Button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <Button
                variant="primary"
                onClick={() => setStage('WAITING_RESPONSE')}
                style={{ width: '100%' }}
                disabled={generatingOpening}
              >
                ✅ Já Enviei — Registrar Resposta do Cliente →
              </Button>
            </div>
          </div>
        )}

        {/* ===== STAGE: WAITING RESPONSE ===== */}
        {stage === 'WAITING_RESPONSE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(245, 158, 11, 0.08)',
              borderLeft: '3px solid var(--warning)',
              fontSize: 13, color: 'var(--muted)'
            }}>
              📝 Digite abaixo exatamente o que o cliente te respondeu. A IA vai analisar a resposta e te instruir no próximo passo.
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                O que o cliente disse?
              </label>
              <textarea
                className="textarea"
                rows={5}
                value={clientInput}
                onChange={(e) => setClientInput(e.target.value)}
                placeholder={'Ex: "Quanto custa?" / "Não tenho interesse agora" / "Pode me mandar mais informações?" / "Pode fazer sim!"'}
                style={{ fontSize: 14 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setStage('OPENING')} style={{ flex: 1 }}>
                ← Ver Abertura
              </Button>
              <Button
                variant="primary"
                onClick={analyzeResponse}
                disabled={!clientInput.trim() || analyzing}
                style={{ flex: 2 }}
              >
                {analyzing ? '⏳ Analisando com IA...' : '🧠 Analisar Resposta com IA →'}
              </Button>
            </div>
          </div>
        )}

        {/* ===== STAGE: ANALYZING ===== */}
        {stage === 'ANALYZING' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '60px 20px', textAlign: 'center' }}>

            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* Expanding Rings */}
              <div style={{ position: 'absolute', borderRadius: '50%', border: 'solid var(--primary)', animation: 'ringExpand 2s infinite cubic-bezier(0.16, 1, 0.3, 1)' }} />
              <div style={{ position: 'absolute', borderRadius: '50%', border: 'solid var(--primary)', animation: 'ringExpand 2s infinite cubic-bezier(0.16, 1, 0.3, 1)', animationDelay: '0.6s' }} />
              <div style={{ position: 'absolute', borderRadius: '50%', border: 'solid var(--primary)', animation: 'ringExpand 2s infinite cubic-bezier(0.16, 1, 0.3, 1)', animationDelay: '1.2s' }} />
              
              {/* Glowing Core */}
              <div style={{ 
                position: 'absolute', width: 80, height: 80, borderRadius: '50%', 
                background: 'conic-gradient(from 0deg, transparent, var(--primary), transparent, rgba(217, 70, 239, 0.8), transparent)',
                animation: 'gradientSpin 2s linear infinite', opacity: 0.4,
                boxShadow: '0 0 40px var(--primary), inset 0 0 20px var(--primary)'
              }} />

              {/* Brain Icon */}
              <div style={{ position: 'absolute', fontSize: 38, animation: 'floatBrain 3s ease-in-out infinite', zIndex: 10 }}>🧠</div>
              
              {/* Scanline Effect overlaying the brain */}
              <div style={{ position: 'absolute', width: '100%', height: 4, background: 'rgba(255,255,255,0.8)', borderRadius: 4, animation: 'scanline 1.5s linear infinite', zIndex: 11, boxShadow: '0 0 10px #fff' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ 
                fontWeight: 900, fontSize: 20, 
                background: 'linear-gradient(to right, var(--primary), #d946ef)', 
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                animation: 'pulseText 2s ease-in-out infinite',
                letterSpacing: '-0.5px'
              }}>
                {settings.demoMode ? 'Analisando com IA de Vendas...' : `${providerLabel} Analisando...`}
              </div>
              <div style={{ 
                color: 'var(--muted)', fontSize: 13, display: 'flex', gap: 12, 
                justifyContent: 'center', flexWrap: 'wrap', opacity: 0.9, fontWeight: 500,
                background: 'rgba(255,255,255,0.05)', padding: '6px 16px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <span style={{ animation: 'pulseText 1.5s infinite 0s' }}>Detectando intenção</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span style={{ animation: 'pulseText 1.5s infinite 0.5s' }}>Quebrando objeções</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span style={{ animation: 'pulseText 1.5s infinite 1s' }}>Gerando fechamento</span>
              </div>
            </div>
          </div>
        )}

        {/* ===== STAGE: INSTRUCTING ===== */}
        {stage === 'INSTRUCTING' && instruction && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Analysis Result */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              padding: 18, borderRadius: 12,
              background: 'var(--surface-2)', border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: 28 }}>{instruction.analysis.emoji}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  Diagnóstico: <span style={{ color: 'var(--primary)' }}>
                    {instruction.analysis.category === 'INTERESTED' ? 'INTERESSE!' :
                     instruction.analysis.category === 'OBJECTION_PRICE' ? 'OBJEÇÃO DE PREÇO' :
                     instruction.analysis.category === 'OBJECTION_NEED' ? 'QUESTIONA NECESSIDADE' :
                     instruction.analysis.category === 'THINK_ABOUT' ? 'PRECISA DE TEMPO' :
                     instruction.analysis.category === 'QUESTION' ? 'FEZ UMA PERGUNTA' :
                     instruction.analysis.category === 'NOT_INTERESTED' ? 'DESINTERESSE' :
                     instruction.analysis.category === 'PEDIU_PARAR' ? '🛑 PEDIU PARA PARAR (Opt-out)' :
                     instruction.analysis.category === 'WON' ? '🎉 VENDA FECHADA!' : 'ANALISADO'}
                  </span>
                  <Badge variant={instruction.analysis.confidence >= 0.85 ? 'success' : instruction.analysis.confidence >= 0.6 ? 'warning' : 'danger'}>
                    Confiança: {Math.round(instruction.analysis.confidence * 100)}%
                  </Badge>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{instruction.analysis.summary}</div>
              </div>
            </div>

            {/* What to Do */}
            <div style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.07)',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                📌 FAÇA ISSO AGORA
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{instruction.whatToDo}</div>
            </div>

            {/* Suggested Reply */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                💬 DIGA ISSO (Mensagem Sugerida pela IA)
              </div>
              <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 16, fontSize: 14, lineHeight: 1.7,
                whiteSpace: 'pre-wrap', color: 'var(--text)'
              }}>
                {instruction.suggestedReply}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={copyReply}>
                  {copiedReply ? '✓ Copiado!' : '📋 Copiar Mensagem'}
                </Button>
                {hasPhone && (
                  <Button variant="success" size="sm" onClick={openReplyWhatsApp}>
                    💬 Enviar no WhatsApp
                  </Button>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={handleNewResponse} style={{ flex: 1 }}>
                  📝 Registrar Nova Resposta
                </Button>
                {instruction.showSiteButton && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleGenerateSite}
                    disabled={generatingSite}
                    style={{ flex: 1 }}
                  >
                    {generatingSite ? '⏳ Gerando...' : '🌐 Gerar Site Real'}
                  </Button>
                )}
                {instruction.showProposalButton && (
                  <Button variant="secondary" size="sm" onClick={handleGenerateProposal} style={{ flex: 1 }}>
                    📄 Gerar Proposta PDF
                  </Button>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                <Button 
                  variant="success" 
                  size="sm" 
                  onClick={() => { 
                    setStage('WON');
                    const ld = useApp.getState().leads.find((l) => l.companyId === company?.id);
                    if (ld) moveLead(ld.id, 'WON');
                    toast('success', '🏆 Venda fechada com sucesso!');
                  }} 
                  style={{ flex: 1 }}
                >
                  ✅ Fechar Atendimento (Ganho)
                </Button>
                <Button 
                  variant="danger" 
                  size="sm" 
                  onClick={() => { 
                    setStage('LOST');
                    const ld = useApp.getState().leads.find((l) => l.companyId === company?.id);
                    if (ld) moveLead(ld.id, 'LOST');
                    toast('success', '🗑️ Atendimento encerrado (Arquivo Morto)');
                  }} 
                  style={{ flex: 1 }}
                >
                  ❌ Arquivo Morto (Perdido)
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STAGE: WON ===== */}
        {stage === 'WON' && instruction && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: 24, borderRadius: 16, textAlign: 'center',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '2px solid rgba(16, 185, 129, 0.35)'
            }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--success)', marginBottom: 6 }}>
                CLIENTE FECHOU!
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                Formalize o contrato e inicie o projeto para <strong>{company.name}</strong>.
              </div>
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Próximos Passos:</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Button
                variant="primary"
                onClick={handleGenerateSite}
                disabled={generatingSite}
                style={{ width: '100%' }}
              >
                {generatingSite ? '⏳ Gerando com Dados Reais...' : '🌐 Gerar Site Completo com Fotos e Avaliações'}
              </Button>
              <Button variant="secondary" onClick={handleGenerateProposal} style={{ width: '100%' }}>
                📄 Gerar Proposta Comercial PDF
              </Button>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="secondary" size="sm" onClick={copyReply} style={{ flex: 1 }}>
                  {copiedReply ? '✓ Copiado!' : '📋 Copiar Resposta Final'}
                </Button>
                {hasPhone && (
                  <Button variant="success" size="sm" onClick={openReplyWhatsApp} style={{ flex: 1 }}>
                    💬 Confirmar no WhatsApp
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== STAGE: LOST ===== */}
        {stage === 'LOST' && instruction && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: 20, borderRadius: 16, textAlign: 'center',
              background: 'rgba(239, 68, 68, 0.06)',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>😔</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--danger)', marginBottom: 4 }}>
                Não Interessado (Por Enquanto)
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                Mantenha o relacionamento. Muitos clientes voltam em 30–60 dias.
              </div>
            </div>

            <div style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(99, 102, 241, 0.06)',
              border: '1px solid rgba(99, 102, 241, 0.2)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', marginBottom: 8 }}>
                💡 O que fazer agora
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{instruction.whatToDo}</div>
            </div>

            {/* Suggested Reply (Final Message) */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                💬 DIGA ISSO (Mensagem de Despedida)
              </div>
              <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 16, fontSize: 14, lineHeight: 1.7,
                whiteSpace: 'pre-wrap', color: 'var(--text)'
              }}>
                {instruction.suggestedReply}
              </div>
            </div>


            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={handleNewResponse} style={{ flex: 1 }}>
                📝 Tentar Outro Ângulo
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { copyReply(); }} style={{ flex: 1 }}>
                📋 Copiar Mensagem Final
              </Button>
            </div>
          </div>
        )}
        
        </div> {/* End of Left Column */}

        {/* Right Column (Live Preview) */}
        {generatedDemo && (
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <LiveSitePreview demo={generatedDemo} company={company} />
          </div>
        )}
      </div>

      <ProposalEditorModal
        open={proposalModalOpen}
        company={company}
        onClose={() => setProposalModalOpen(false)}
      />
    </Modal>
  )
}

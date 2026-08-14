import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useApp } from '../services/store'
import { Card, Badge, Button, EmptyState } from '../components/ui'
import { generateOpeningMessage } from '../services/salesAI'
import { SalesAgent } from '../agents/SalesAgent'
import { runSiteOrchestrator } from '../agents/SiteOrchestrator'
import { downloadSiteZip } from '../services/siteGenerator'
import { uid, nowIso } from '../lib/utils'
import type { ProspectingSession, ProspectingMessage, ProspectingStatus, SiteGenerationStep } from '../types'

// ─── Constants & Labels ───────────────────────────────────────────────────────

const PROSPECTING_STATUS_LABELS: Record<ProspectingStatus, string> = {
  NOT_STARTED:    'Não iniciado',
  IN_PROGRESS:    'Em prospecção',
  REPLIED:        'Respondeu',
  INTERESTED:     'Interessado',
  NEGOTIATION:    'Negociação',
  WON:            'Fechado ✓',
  NOT_INTERESTED: 'Não interessado',
  NO_RESPONSE:    'Sem resposta',
}

const PROSPECTING_STATUS_VARIANT: Record<ProspectingStatus, 'muted' | 'info' | 'warning' | 'success' | 'danger' | 'primary'> = {
  NOT_STARTED:    'muted',
  IN_PROGRESS:    'info',
  REPLIED:        'primary',
  INTERESTED:     'warning',
  NEGOTIATION:    'warning',
  WON:            'success',
  NOT_INTERESTED: 'danger',
  NO_RESPONSE:    'muted',
}

function categoryIcon(category: string | null): string {
  const cat = (category || '').toLowerCase()
  if (cat.includes('restaurante') || cat.includes('comida') || cat.includes('bar') || cat.includes('pizzaria')) return '🍽️'
  if (cat.includes('odonto') || cat.includes('médic') || cat.includes('saúde') || cat.includes('clínica')) return '🏥'
  if (cat.includes('salão') || cat.includes('estética') || cat.includes('beleza') || cat.includes('barbe')) return '💅'
  if (cat.includes('auto') || cat.includes('mecanic') || cat.includes('carro')) return '🔧'
  if (cat.includes('advoga') || cat.includes('juríd')) return '⚖️'
  if (cat.includes('academia') || cat.includes('personal') || cat.includes('fitness')) return '💪'
  if (cat.includes('pet') || cat.includes('veterinár')) return '🐾'
  return '🏢'
}

type Tab = 'info' | 'sites'

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const chatScrollRef = useRef<HTMLDivElement>(null)

  const company    = useApp((s) => s.companies.find((c) => c.id === id))
  const sessions   = useApp((s) => s.prospectingSessions)
  const projects   = useApp((s) => s.websiteProjects)
  const settings   = useApp((s) => s.settings)
  const store      = useApp.getState()

  const session     = sessions.find((s) => s.companyId === id)
  const project     = projects.find((p) => p.companyId === id)

  const [tab, setTab]               = useState<Tab>('info')
  const [clientInput, setClientInput] = useState('')
  const [analyzing, setAnalyzing]   = useState(false)
  const [copied, setCopied]         = useState<string | null>(null)
  const [siteSteps, setSiteSteps]   = useState<SiteGenerationStep[]>([])
  const [siteRunning, setSiteRunning] = useState(false)
  const [sitePrompt, setSitePrompt]   = useState('')

  const apiKey = settings.aiApiKey || import.meta.env.VITE_AI_API_KEY || ''

  // ── Ensure Session Exists ────────────────────────────────────────────────
  useEffect(() => {
    if (!company || session) return
    const opening = generateOpeningMessage(company)
    const newSession: ProspectingSession = {
      id: uid('prs'),
      companyId: company.id,
      status: 'NOT_STARTED',
      openingMessage: opening,
      messages: [
        {
          id: uid('pm'),
          role: 'USER_SENT',
          content: opening,
          createdAt: nowIso(),
        },
      ],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    store.upsertProspectingSession(newSession)
  }, [company, session])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [session?.messages.length, analyzing])

  if (!company) {
    return (
      <div className="page">
        <EmptyState icon="🏢" title="Empresa não encontrada" subtitle="Essa empresa pode ter sido removida."
          action={<Link to="/companies" className="btn btn-secondary">← Voltar para Empresas</Link>} />
      </div>
    )
  }

  const openingMessage = session?.openingMessage || generateOpeningMessage(company!)

  // ── Helper Actions ──────────────────────────────────────────────────────

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2500)
  }

  function openWhatsApp(text: string) {
    const phone = company!.whatsapp || company!.phone
    if (!phone) { copyText(text, 'wa'); return }
    const digits = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank')
  }

  async function handleSendMessage(inputOverride?: string) {
    const textToSend = inputOverride || clientInput
    if (!textToSend.trim() || !session || analyzing) return

    // Conversa encerrada (ganho/perdido/opt-out) → não reclassificar: reutilize o último resultado.
    const closingRoles = ['WON', 'NOT_INTERESTED', 'LOST']
    const lastAnalysis = [...session.messages].reverse().find((m) => m.role === 'AI_ANALYSIS')
    if (closingRoles.includes(session.status) && lastAnalysis?.metadata?.suggestedReply) {
      store.toast('warning', 'Conversa encerrada (não foi reanalisada para economizar chamadas de IA). Última resposta mantida.')
      setClientInput('')
      return
    }

    setAnalyzing(true)

    // Add Client message to chat stream
    const clientMsg: ProspectingMessage = {
      id: uid('pm'), role: 'CLIENT', content: textToSend, createdAt: nowIso(),
    }
    store.addMessageToSession(session.id, clientMsg)
    setClientInput('')

    try {
      // Histórico completo da conversa como contexto (todas as mensagens, não só a última)
      const history = session.messages.map((m) => ({ role: m.role, content: m.content }))
      const agent = new SalesAgent()
      const result = await agent.execute({
        company: company!,
        clientResponse: textToSend,
        apiKey,
        history,
      }, {
        workspaceId: store.workspaceId, demoMode: settings.demoMode,
        nicheDna: null, campaign: null, settings,
      })
      const out = result.output as any

      // Add AI Response to chat stream
      const aiMsg: ProspectingMessage = {
        id: uid('pm'),
        role: 'AI_ANALYSIS',
        content: out?.suggestedReply || out?.whatToDo || '',
        metadata: {
          category: out?.category,
          emoji: out?.emoji,
          whatToDo: out?.whatToDo,
          suggestedReply: out?.suggestedReply,
          confidence: out?.confidence,
          showSiteButton: out?.showSiteButton,
          isWon: out?.isWon,
          isLost: out?.isLost,
          
          // Sales Intelligence Observability (Fase 3)
          intelligenceApplied: out?.intelligenceApplied,
          overrideApplied: out?.overrideApplied,
          overrideReason: out?.overrideReason,
          humanReviewRequired: out?.humanReviewRequired,
          existingDecisionCategory: out?.existingDecisionCategory,
          finalDecisionCategory: out?.finalDecisionCategory,
          intelligenceDecision: out?.intelligenceDecision,
          
          // Conversation Intelligence (Fase 4)
          existingSuggestedReply: out?.existingSuggestedReply,
          generatedResponse: out?.generatedResponse,
          responseConfidence: out?.responseConfidence,
          responseGenerationApplied: out?.responseGenerationApplied,
          responseFallbackUsed: out?.responseFallbackUsed,
          conversationState: out?.conversationState,
          nextBestAction: out?.nextBestAction,
          shouldRespond: out?.shouldRespond,
          shouldWait: out?.shouldWait
        },
        createdAt: nowIso(),
      }
      store.addMessageToSession(session.id, aiMsg)

      // Update session status
      if (out?.isWon) store.updateSessionStatus(session.id, 'WON')
      else if (out?.isLost) store.updateSessionStatus(session.id, 'NOT_INTERESTED')
      else if (out?.category === 'INTERESTED') store.updateSessionStatus(session.id, 'INTERESTED')
      else if (out?.category === 'OBJECTION_PRICE') store.updateSessionStatus(session.id, 'NEGOTIATION')
      else store.updateSessionStatus(session.id, 'REPLIED')

    } catch (err) {
      store.toast('error', 'Erro ao processar resposta. Tente novamente.')
    } finally {
      setAnalyzing(false)
    }
  }

  async function createSite(promptOverride?: string) {
    const promptToUse = promptOverride !== undefined ? promptOverride : sitePrompt
    setSiteRunning(true)
    setSiteSteps([
      { id: 'analyst',   label: '📋 Analisando empresa e prompt', detail: 'Aguardando...', status: 'PENDING' },
      { id: 'planner',   label: '🎯 Planejando estrutura, fotos e mapa', detail: 'Aguardando...', status: 'PENDING' },
      { id: 'generator', label: '⚙️ Gerando HTML5/CSS3 responsivo', detail: 'Aguardando...', status: 'PENDING' },
      { id: 'reviewer',  label: '🔍 Revisando SEO e responsividade', detail: 'Aguardando...', status: 'PENDING' },
      { id: 'done',      label: '✅ Site pronto para entrega!', detail: 'Aguardando...', status: 'PENDING' },
    ])
    setTab('sites')
    try {
      await runSiteOrchestrator({ company: company!, apiKey, customPrompt: promptToUse, onProgress: setSiteSteps })
      store.toast('success', `Site v${(project?.versions.length || 0) + 1} gerado com sucesso!`)
    } catch (e) {
      store.toast('error', 'Erro ao gerar site com IA. Tente novamente.')
    } finally {
      setSiteRunning(false)
    }
  }

  function downloadVersion(version: any) {
    const files = version?.files
    if (!files) return
    downloadSiteZip(company!)
  }

  const whatsappLink = (company.whatsapp || company.phone)
    ? `https://wa.me/${(company.whatsapp || company.phone || '').replace(/\D/g, '')}`
    : null

  const currentSession = sessions.find((s) => s.companyId === id)
  const currentStatus: ProspectingStatus = currentSession?.status || 'NOT_STARTED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/companies')}>← Empresas</button>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'var(--grad-primary)', display: 'grid', placeItems: 'center',
            fontSize: 24, flexShrink: 0,
          }}>
            {categoryIcon(company.category)}
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{company.name}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge variant={PROSPECTING_STATUS_VARIANT[currentStatus]}>
                {PROSPECTING_STATUS_LABELS[currentStatus]}
              </Badge>
              {company.category && <Badge variant="muted">{company.category}</Badge>}
              {company.city && <Badge variant="muted">📍 {company.city}</Badge>}
            </div>
          </div>
        </div>
        <div className="page-actions">
          {whatsappLink && (
            <a href={whatsappLink} target="_blank" rel="noopener" className="btn btn-success btn-sm">
              💬 WhatsApp
            </a>
          )}
          <Button variant="primary" onClick={createSite} disabled={siteRunning}>
            {siteRunning ? '⏳ Gerando...' : '🌐 Criar Site com DeepSeek'}
          </Button>
        </div>
      </div>

      {/* ── Status Selector ────────────────────────────────────────── */}
      <Card style={{ padding: '12px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Status da prospecção:</span>
          {(Object.keys(PROSPECTING_STATUS_LABELS) as ProspectingStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => { if (currentSession) store.updateSessionStatus(currentSession.id, s) }}
              style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `2px solid ${currentStatus === s ? 'var(--primary)' : 'var(--border)'}`,
                background: currentStatus === s ? 'var(--primary)' : 'transparent',
                color: currentStatus === s ? '#fff' : 'var(--muted)',
                transition: 'all 0.15s',
              }}
            >
              {PROSPECTING_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </Card>

      {/* ── Tab Bar ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([
          { id: 'info',        label: '📋 Dados da Empresa' },
          { id: 'sites',       label: `🌐 Sites Gerados${project ? ` (${project.versions.length})` : ''}` },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: 'transparent',
              color: tab === t.id ? 'var(--primary)' : 'var(--muted)',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>



      {/* ═══════════════════════════════════════════════════════════════
          TAB: DADOS DA EMPRESA
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Card title="📋 Informações Básicas">
            <InfoRow label="Nome" value={company.name} />
            <InfoRow label="Categoria" value={company.category} />
            <InfoRow label="Cidade" value={company.city ? `${company.city}${company.state ? `/${company.state}` : ''}` : null} />
            <InfoRow label="Endereço" value={company.address} />
            <InfoRow label="Telefone" value={company.phone} phone />
            <InfoRow label="WhatsApp" value={company.whatsapp} phone />
            <InfoRow label="Email" value={company.email} />
          </Card>
          <Card title="🌐 Presença Digital">
            <InfoRow label="Site" value={company.website} link />
            <InfoRow label="Instagram" value={company.instagram} link />
            <InfoRow label="Facebook" value={company.facebook} link />
            <InfoRow label="Avaliação Google" value={company.rating ? `⭐ ${company.rating.toFixed(1)} (${company.reviewCount || 0} avaliações)` : null} />
            <InfoRow label="Horários" value={company.hours} />
            <InfoRow label="Fonte dos dados" value={company.source} />
            <InfoRow label="Status dos dados" value={company.dataStatus || (company.isDemo ? 'DEMO' : 'IMPORTED')} />
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: SITES GERADOS (DeepSeek Engine)
      ═══════════════════════════════════════════════════════════════ */}
      {tab === 'sites' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* OpenCode AI Site Builder Prompt Box */}
          <Card title="✨ Criador de Site por Prompt Livre (Estilo OpenCode Chat)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Digite suas instruções livres como no chat do OpenCode (estilo, tema escuro, cores, fotos HD, mapa do Google, depoimentos, cardápio, WhatsApp):
              </div>
              <textarea
                className="textarea"
                rows={3}
                value={sitePrompt}
                onChange={(e) => setSitePrompt(e.target.value)}
                placeholder='Ex: "Crie um site ultra moderno e elegante para a empresa em Rolândia, com tema escuro, fotos de alta qualidade, mapa do Google integrado, depoimentos reais de clientes e botão chamativo para WhatsApp..."'
                style={{ width: '100%', resize: 'vertical', fontSize: 14 }}
              />

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="tiny muted">Sugestões de estilos:</span>
                {[
                  '🍕 Cardápio Digital & WhatsApp',
                  '🩺 Clínica Elegante com Fotos & Agendamento',
                  '💅 Catálogo Glamour & Redes Sociais',
                  '🚗 Oficina com Tabela de Serviços & Mapa',
                  '🌙 Tema Escuro Premium com Google Maps & Avaliações',
                ].map((preset) => (
                  <button
                    key={preset}
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setSitePrompt(preset)
                      createSite(preset)
                    }}
                    disabled={siteRunning}
                    style={{ fontSize: 11, borderRadius: 16 }}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <Button
                  variant="primary"
                  onClick={() => createSite()}
                  disabled={siteRunning}
                >
                  {siteRunning ? '⏳ Gerando com Agentes IA...' : '⚡ Criar Site Completo com IA'}
                </Button>
              </div>
            </div>
          </Card>

          {/* Generation Progress */}
          {(siteRunning || siteSteps.length > 0) && (
            <Card title="⚡ Pipeline de Geração com DeepSeek">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {siteSteps.map((step) => (
                  <div key={step.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                    borderRadius: 12, border: '1px solid var(--border)',
                    background: step.status === 'RUNNING' ? 'rgba(99,102,241,0.06)' :
                                step.status === 'DONE' ? 'rgba(16,185,129,0.05)' :
                                step.status === 'ERROR' ? 'rgba(239,68,68,0.06)' : 'var(--surface-2)',
                    borderColor: step.status === 'RUNNING' ? 'var(--primary)' :
                                 step.status === 'DONE' ? 'var(--success)' :
                                 step.status === 'ERROR' ? 'var(--danger)' : 'var(--border)',
                  }}>
                    <div style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
                      {step.status === 'PENDING' ? '○' :
                       step.status === 'RUNNING' ? '⏳' :
                       step.status === 'DONE' ? '✅' : '❌'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{step.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{step.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Version History */}
          {project && project.versions.length > 0 ? (
            <Card title={`🗂️ Versões Geradas pelo DeepSeek (${project.versions.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...project.versions].reverse().map((v) => (
                  <div key={v.id} style={{
                    padding: '16px 20px', borderRadius: 12,
                    border: `2px solid ${v.id === project.currentVersionId ? 'var(--primary)' : 'var(--border)'}`,
                    background: v.id === project.currentVersionId ? 'rgba(99,102,241,0.04)' : 'var(--surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700 }}>Versão {v.version}</span>
                        {v.id === project.currentVersionId && <Badge variant="primary">Atual</Badge>}
                        <Badge variant={v.status === 'READY' ? 'success' : v.status === 'FAILED' ? 'danger' : 'warning'}>
                          {v.status === 'READY' ? 'Pronto' : v.status === 'FAILED' ? 'Falhou' : v.status === 'GENERATING' ? 'Gerando' : 'Revisando'}
                        </Badge>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Score de qualidade: <strong>{v.reviewScore}/100</strong>
                        {v.reviewIssues.length > 0 && ` · ${v.reviewIssues.length} alerta(s)`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {v.files && (
                        <Button variant="secondary" size="sm" onClick={() => downloadVersion(v)}>
                          ⬇ Baixar ZIP
                        </Button>
                      )}
                      <Button variant="primary" size="sm"
                        onClick={createSite} disabled={siteRunning}>
                        🔄 Gerar Nova Versão (DeepSeek)
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : !siteRunning && siteSteps.length === 0 && (
            <Card>
              <EmptyState
                icon="🌐"
                title="Nenhum site gerado ainda"
                subtitle="Clique em 'Criar Site com DeepSeek' para planejar e gerar o código completo do site para esta empresa."
                action={
                  <Button variant="primary" onClick={createSite} disabled={siteRunning}>
                    🌐 Criar Site com DeepSeek
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      )}

    </div>
  )
}

function InfoRow({ label, value, phone, link }: { label: string; value: string | null | undefined; phone?: boolean; link?: boolean }) {
  if (!value) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
        <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13, gap: 12 }}>
      <span style={{ color: 'var(--muted)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
      {link ? (
        <a href={value.startsWith('http') ? value : `https://${value}`} target="_blank" rel="noopener"
          style={{ color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
          {value}
        </a>
      ) : phone ? (
        <a href={`tel:${value}`} style={{ color: 'var(--primary)', textAlign: 'right' }}>{value}</a>
      ) : (
        <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
      )}
    </div>
  )
}

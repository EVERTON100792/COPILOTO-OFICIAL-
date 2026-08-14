import React, { useState, useEffect, useRef } from 'react'
import { Button, Badge } from './ui'
import { useApp } from '../services/store'
import {
  generateOpeningMessage,
  generateOpeningMessageAI,
  analyzeClientResponse,
  analyzeClientResponseAI,
  buildInstruction,
} from '../services/salesAI'
import type { Company, ProspectingMessage, ProspectingSession } from '../types'
import { uid, nowIso, timeAgo } from '../lib/utils'

export function GlobalCopilotDrawer() {
  const { 
    copilotOpen, 
    activeCopilotCompanyId, 
    setCopilotOpen, 
    openCopilot, 
    prospectingSessions, 
    companies 
  } = useApp()
  
  if (!copilotOpen) return null

  // Sort sessions by most recently updated
  const sessionsList = [...prospectingSessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const activeCompany = companies.find(c => c.id === activeCopilotCompanyId)

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
          zIndex: 9998,
          animation: 'fadeIn 0.2s ease-out'
        }}
        onClick={() => setCopilotOpen(false)}
      />

      {/* Drawer */}
      <div 
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: 900,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 9999,
          display: 'flex',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.3)',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Left Sidebar (Sessions List) */}
        <div style={{
          width: 280, borderRight: '1px solid var(--border)', background: 'var(--bg)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>🤖 Copiloto</h3>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {sessionsList.length === 0 && (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                Nenhuma conversa ativa. Clique em "Copiloto" na busca para iniciar.
              </div>
            )}
            
            {sessionsList.map(session => {
              const comp = companies.find(c => c.id === session.companyId)
              const isActive = activeCopilotCompanyId === session.companyId
              
              return (
                <div 
                  key={session.id}
                  onClick={() => openCopilot(session.companyId)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isActive ? 'var(--primary)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--text)',
                    marginBottom: 4,
                    transition: 'all 0.2s',
                    border: isActive ? 'none' : '1px solid transparent'
                  }}
                  className={!isActive ? 'card-hover' : ''}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {comp?.name || 'Empresa Desconhecida'}
                  </div>
                  <div style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--muted)', marginTop: 4 }}>
                    {timeAgo(session.updatedAt)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Content (Chat View) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          {activeCompany ? (
            <CopilotChat company={activeCompany} onClose={() => setCopilotOpen(false)} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
                <div>Selecione ou inicie uma conversa para continuar.</div>
              </div>
            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}} />
    </>
  )
}

// Inner Chat Component
function CopilotChat({ company, onClose }: { company: Company, onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const upsertProspectingSession = useApp((s) => s.upsertProspectingSession)
  const addMessageToSession = useApp((s) => s.addMessageToSession)
  const moveLead = useApp((s) => s.moveLead)
  const prospectingSessions = useApp((s) => s.prospectingSessions)

  const [clientInput, setClientInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const leads = useApp((s) => s.leads)
  const lead = leads.find((l) => l.companyId === company.id)

  const apiKey = settings.aiApiKey || (import.meta.env.VITE_AI_API_KEY as string | undefined) || ''

  const session = prospectingSessions.find((s) => s.companyId === company?.id)
  const messages = session?.messages || []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  // Inicialização (Mensagem de Abertura)
  useEffect(() => {
    if (company) {
      if (!session) {
        // Cria sessão
        const newSessionId = uid()
        upsertProspectingSession({
          id: newSessionId,
          companyId: company.id,
          status: 'IN_PROGRESS',
          messages: [],
          openingMessage: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        })
      } else if (messages.length === 0 && !isTyping) {
        // Gera abordagem inicial
        setIsTyping(true)
        generateOpeningMessageAI(company, apiKey)
          .then((msg) => {
            addMessageToSession(session.id, {
              id: uid(),
              role: 'AI_SUGGESTION',
              content: msg,
              createdAt: nowIso(),
            })
            setIsTyping(false)
          })
          .catch(() => {
            addMessageToSession(session.id, {
              id: uid(),
              role: 'AI_SUGGESTION',
              content: generateOpeningMessage(company),
              createdAt: nowIso(),
            })
            setIsTyping(false)
          })
      }
    }
  }, [company?.id, session?.id, messages.length])

  function markLeadContacted() {
    const lead = useApp.getState().leads.find(l => l.companyId === company?.id)
    if (lead) moveLead(lead.id, 'CONTACTED')
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    toast('success', 'Mensagem copiada!')
    markLeadContacted()
  }

  function handleOpenWhatsApp(text: string) {
    markLeadContacted()
    const phone = company?.whatsapp || company?.phone
    if (!phone) { handleCopy(text); return }
    const digits = phone.replace(/\D/g, '')
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  async function handleSend() {
    if (!clientInput.trim() || !session) return
    const input = clientInput.trim()
    setClientInput('')

    // Adiciona a fala do cliente
    addMessageToSession(session.id, {
      id: uid(),
      role: 'CLIENT',
      content: input,
      createdAt: nowIso(),
    })

    setIsTyping(true)

    try {
      // Contexto: as mensagens + a mensagem atual
      const history = [...messages, { id: 'temp', role: 'CLIENT', content: input, createdAt: nowIso() }] as ProspectingMessage[]
      
      const result = settings.demoMode
        ? buildInstruction(analyzeClientResponse(input), company)
        : await analyzeClientResponseAI(input, company, apiKey, { history, cacheKey: `${company?.id}::${input}` })

      addMessageToSession(session.id, {
        id: uid(),
        role: 'AI_SUGGESTION',
        content: result.suggestedReply,
        metadata: {
          whatToDo: result.whatToDo,
          isWon: result.isWon,
          isLost: result.isLost
        },
        createdAt: nowIso(),
      })

      const lead = useApp.getState().leads.find((l) => l.companyId === company?.id)
      if (lead) {
        if (result.isWon) moveLead(lead.id, 'WON')
        if (result.isLost) moveLead(lead.id, 'LOST')
      }
    } catch (err) {
      toast('error', 'Erro ao analisar resposta.')
      const result = buildInstruction(analyzeClientResponse(input), company)
      addMessageToSession(session.id, {
        id: uid(),
        role: 'AI_SUGGESTION',
        content: result.suggestedReply,
        metadata: { whatToDo: result.whatToDo },
        createdAt: nowIso(),
      })
    } finally {
      setIsTyping(false)
    }
  }

  const setSessionStatus = (status: 'WON' | 'NOT_INTERESTED') => {
    if (!session) return
    upsertProspectingSession({ ...session, status, updatedAt: nowIso() })
    if (lead) {
      if (status === 'WON') moveLead(lead.id, 'WON')
      if (status === 'NOT_INTERESTED') moveLead(lead.id, 'LOST')
    }
    toast('success', `Status alterado para ${status === 'WON' ? 'Fechado' : 'Perdido'}!`)
  }

  const phone = company?.whatsapp || company?.phone
  const hasPhone = !!phone

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 'bold' }}>{company.name}</span>
          {session?.status === 'WON' && <Badge variant="success">Fechado</Badge>}
          {session?.status === 'NOT_INTERESTED' && <Badge variant="danger">Perdido</Badge>}
          {session && session.status !== 'WON' && session.status !== 'NOT_INTERESTED' && <Badge variant="primary">Em andamento</Badge>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {session && session.status !== 'WON' && session.status !== 'NOT_INTERESTED' && (
             <>
               <Button size="sm" variant="success" style={{ background: 'transparent', color: 'var(--success)', border: '1px solid var(--success)' }} onClick={() => setSessionStatus('WON')}>✅ Fechar Projeto</Button>
               <Button size="sm" variant="danger" style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' }} onClick={() => setSessionStatus('NOT_INTERESTED')}>❌ Não Fechado</Button>
             </>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>✕ Fechar</Button>
        </div>
      </div>

      {/* CHAT HISTORY */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '24px', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 20,
      }}>
        {messages.length === 0 && !isTyping && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 40 }}>
            Preparando inteligência inicial...
          </div>
        )}

        {messages.map((msg, index) => {
          const isClient = msg.role === 'CLIENT' || msg.role === 'USER_SENT'
          return (
            <div key={msg.id || index} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isClient ? 'flex-end' : 'flex-start',
              width: '100%',
            }}>
              {!isClient && (
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginBottom: 4, marginLeft: 4 }}>
                  CÉREBRO IA
                </div>
              )}
              {isClient && (
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, marginRight: 4 }}>
                  CLIENTE
                </div>
              )}
              
              <div style={{
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: 16,
                borderBottomLeftRadius: !isClient ? 4 : 16,
                borderBottomRightRadius: isClient ? 4 : 16,
                background: isClient ? 'var(--primary)' : 'var(--surface)',
                color: isClient ? '#fff' : 'var(--text)',
                border: isClient ? 'none' : '1px solid var(--border)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}>
                {msg.content}
              </div>

              {/* AI Strategy Metadata */}
              {!isClient && msg.metadata?.whatToDo && (
                <div style={{ 
                  marginTop: 8, 
                  maxWidth: '85%',
                  fontSize: 12, 
                  color: 'var(--muted)',
                  background: 'rgba(99, 102, 241, 0.05)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  borderLeft: '2px solid var(--primary)'
                }}>
                  <strong>Estratégia:</strong> {msg.metadata.whatToDo}
                </div>
              )}

              {/* AI Actions */}
              {!isClient && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 4 }}>
                  <Button variant="secondary" size="sm" onClick={() => handleCopy(msg.content)}>
                    📋 Copiar
                  </Button>
                  <Button 
                    variant={hasPhone ? 'primary' : 'secondary'} 
                    size="sm" 
                    onClick={() => handleOpenWhatsApp(msg.content)}
                    disabled={!hasPhone}
                    style={hasPhone ? { background: '#10b981', color: '#fff', border: 'none' } : {}}
                  >
                    💬 Enviar no Whats
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {isTyping && (
          <div style={{ alignSelf: 'flex-start', color: 'var(--muted)', fontSize: 13, marginLeft: 4 }}>
            🤖 Cérebro IA pensando...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT AREA */}
      <div style={{ 
        padding: '20px 24px', 
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)'
      }}>
        <div style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-end',
        }}>
          <textarea
            value={clientInput}
            onChange={(e) => setClientInput(e.target.value)}
            placeholder="Cole aqui a resposta do cliente..."
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 12,
              color: 'var(--text)',
              minHeight: 80,
              resize: 'none',
              fontFamily: 'inherit'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <Button 
            variant="primary" 
            onClick={handleSend}
            disabled={!clientInput.trim() || isTyping}
            style={{ padding: '0 24px', height: 44 }}
          >
            Analisar 🚀
          </Button>
        </div>
      </div>
    </div>
  )
}

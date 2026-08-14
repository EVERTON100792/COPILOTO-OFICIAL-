import React, { useState, useEffect, useRef } from 'react'
import { Modal, Button, Badge } from './ui'
import { useApp } from '../services/store'
import {
  generateOpeningMessage,
  generateOpeningMessageAI,
  analyzeClientResponse,
  analyzeClientResponseAI,
  buildInstruction,
} from '../services/salesAI'
import type { Company, ProspectingMessage } from '../types'
import { uid, nowIso } from '../lib/utils'

interface Props {
  open: boolean
  company: Company | any
  leadId?: string
  onClose: () => void
}

export const SalesConversationModal: React.FC<Props> = ({ open, company, leadId, onClose }) => {
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const upsertProspectingSession = useApp((s) => s.upsertProspectingSession)
  const addMessageToSession = useApp((s) => s.addMessageToSession)
  const moveLead = useApp((s) => s.moveLead)
  const prospectingSessions = useApp((s) => s.prospectingSessions)

  const [clientInput, setClientInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const apiKey = settings.aiApiKey || (import.meta.env.VITE_AI_API_KEY as string | undefined) || ''

  const session = prospectingSessions.find((s) => s.companyId === company?.id)
  const messages = session?.messages || []

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (open) scrollToBottom()
  }, [messages, open, isTyping])

  // Inicialização (Mensagem de Abertura)
  useEffect(() => {
    if (open && company) {
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
  }, [open, company?.id, session?.id, messages.length])

  function markLeadContacted() {
    const lead = leadId 
      ? useApp.getState().leads.find(l => l.id === leadId)
      : useApp.getState().leads.find(l => l.companyId === company?.id)
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

  if (!open || !company) return null

  const phone = company?.whatsapp || company?.phone
  const hasPhone = !!phone

  return (
    <Modal open={open} onClose={onClose} wide title={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🤖 Copiloto de Vendas</span>
        <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>| {company.name}</span>
      </div>
    }>
      <div style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
        
        {/* CHAT HISTORY */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '20px 10px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 16,
          background: 'var(--bg-card)',
          borderRadius: 12,
          marginBottom: 16
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
                  background: isClient ? 'var(--primary)' : 'var(--bg)',
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
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button variant="secondary" size="sm" onClick={() => handleCopy(msg.content)}>
                      📋 Copiar
                    </Button>
                    {hasPhone && (
                      <Button variant="success" size="sm" onClick={() => handleOpenWhatsApp(msg.content)}>
                        💬 Enviar no Whats
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
               <div style={{
                  padding: '12px 16px',
                  borderRadius: 16,
                  borderBottomLeftRadius: 4,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  fontSize: 14,
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <div className="typing-dot" style={{ animation: 'bounce 1.4s infinite ease-in-out both' }}>.</div>
                  <div className="typing-dot" style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.2s' }}>.</div>
                  <div className="typing-dot" style={{ animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.4s' }}>.</div>
                  <span style={{ marginLeft: 8 }}>IA analisando e digitando...</span>
                </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* INPUT AREA */}
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          paddingTop: 16,
          borderTop: '1px solid var(--border)'
        }}>
          <textarea
            className="textarea"
            value={clientInput}
            onChange={(e) => setClientInput(e.target.value)}
            placeholder="Cole aqui a resposta do cliente..."
            rows={2}
            style={{ flex: 1, resize: 'none', borderRadius: 8, fontSize: 14 }}
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
            style={{ alignSelf: 'flex-end', height: 48, padding: '0 24px', borderRadius: 8 }}
          >
            Analisar 🚀
          </Button>
        </div>

      </div>
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
        .typing-dot {
          display: inline-block;
          font-weight: bold;
        }
      `}</style>
    </Modal>
  )
}

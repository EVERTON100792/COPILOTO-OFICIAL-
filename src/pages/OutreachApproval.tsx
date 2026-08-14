import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../services/store'
import { Card, Button, Badge } from '../components/ui'
import { OutreachService } from '../services/outreach'
import type { OutreachMessage } from '../types'

export default function OutreachApproval() {
  const { outreachMessages, leads, companies, qualifications, upsertOutreachMessage, toast } = useApp()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')

  const pendingMessages = outreachMessages.filter((m) => m.status === 'PENDING_APPROVAL')
  const companyMap = new Map(companies.map((c) => [c.id, c]))
  const leadMap = new Map(leads.map((l) => [l.id, l]))
  const qualMap = new Map(qualifications.map((q) => [q.leadId, q]))

  const service = new OutreachService()

  const [isSending, setIsSending] = useState(false)

  const handleApprove = (msgId: string) => {
    service.approveMessage(msgId)
    toast('success', 'Mensagem aprovada com sucesso!')
  }

  const handleApproveAll = () => {
    if (!window.confirm(`Deseja aprovar todas as ${pendingMessages.length} mensagens pendentes?`)) return
    for (const msg of pendingMessages) {
      service.approveMessage(msg.id)
    }
    toast('success', `${pendingMessages.length} mensagens aprovadas em lote!`)
  }

  const handleDispatchAll = async () => {
    if (!window.confirm(`ATENÇÃO: Deseja aprovar e ENVIAR AUTOMATICAMENTE via WhatsApp todas as ${pendingMessages.length} mensagens pendentes?`)) return
    
    setIsSending(true)
    let successCount = 0
    let errorCount = 0

    for (const msg of pendingMessages) {
      const res = await service.dispatchMessageAutomatic(msg.id)
      if (res.ok) {
        successCount++
      } else {
        errorCount++
      }
    }

    setIsSending(false)
    if (errorCount > 0) {
      toast('warning', `Disparo concluído: ${successCount} enviados, ${errorCount} falhas.`)
    } else {
      toast('success', `Disparo em massa concluído! ${successCount} mensagens enviadas!`)
    }
  }

  const handleReject = (msg: OutreachMessage) => {
    upsertOutreachMessage({
      ...msg,
      status: 'REJECTED',
      updatedAt: new Date().toISOString(),
    })
    toast('info', 'Mensagem rejeitada.')
  }

  const handleStartEdit = (msg: OutreachMessage) => {
    setEditingId(msg.id)
    setEditBody(msg.body)
  }

  const handleSaveEdit = (msg: OutreachMessage) => {
    upsertOutreachMessage({
      ...msg,
      body: editBody,
      editedByUser: true,
      updatedAt: new Date().toISOString(),
    })
    setEditingId(null)
    toast('success', 'Mensagem editada e salva!')
  }

  const handleCopy = (msg: OutreachMessage) => {
    navigator.clipboard.writeText(msg.body)
    service.recordMessageCopied(msg.leadId, msg.id)
    toast('success', 'Mensagem copiada para a área de transferência! (Registro: COPIED)')
  }

  const handleOpenWhatsapp = (msg: OutreachMessage) => {
    const lead = leadMap.get(msg.leadId)
    const company = lead ? companyMap.get(lead.companyId) : null
    const phone = company?.phone?.replace(/\D/g, '')

    if (!phone) {
      toast('warning', 'Esta empresa não possui um telefone válido cadastrado.')
      return
    }

    service.recordWhatsappOpened(msg.leadId, msg.id)
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg.body)}`
    window.open(url, '_blank')
    toast('info', 'Link do WhatsApp aberto em nova aba. (Registro: WHATSAPP_OPENED)')
  }

  const handleConfirmSent = (msg: OutreachMessage) => {
    service.recordManualContact(msg.leadId, msg.id, msg.channel)
    toast('success', 'Envio confirmado pelo operador! Lead atualizado para CONTACTED.')
  }

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>⚡ Central de Aprovação de Mensagens</h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--muted)' }}>
            Revise, edite e aprove individualmente ou em lote antes de realizar a abordagem.
          </p>
        </div>
        {pendingMessages.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" onClick={handleApproveAll} disabled={isSending}>
              ✅ Aprovar Todas ({pendingMessages.length})
            </Button>
            <Button variant="primary" onClick={handleDispatchAll} disabled={isSending}>
              {isSending ? 'Enviando...' : `🚀 Disparar Automático (${pendingMessages.length})`}
            </Button>
          </div>
        )}
      </div>

      {pendingMessages.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--muted)' }}>Nenhuma mensagem aguardando aprovação</h3>
          <p style={{ margin: 0, color: 'var(--muted-2)' }}>Todas as mensagens foram revisadas ou não há campanhas ativas.</p>
          <div style={{ marginTop: '1.5rem' }}>
            <Link to="/outreach/new">
              <Button variant="secondary">➕ Criar Nova Campanha</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {pendingMessages.map((msg) => {
            const lead = leadMap.get(msg.leadId)
            const company = lead ? companyMap.get(lead.companyId) : null
            const qual = lead ? qualMap.get(lead.id) : null
            const isEditing = editingId === msg.id

            return (
              <Card key={msg.id} style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{company?.name || 'Empresa'}</h3>
                      <Badge variant={qual?.qualification === 'HIGH' ? 'danger' : 'warning'}>
                        Score: {qual?.finalScore ?? lead?.score ?? '—'}
                      </Badge>
                      <Badge variant="info">{msg.generatedBy === 'AI' ? '🤖 IA' : '📐 Template'}</Badge>
                      {msg.editedByUser && <Badge variant="muted">✍️ Editado</Badge>}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                      {company?.category || 'Categoria'} • {company?.city || 'Cidade'}/{company?.state || 'PR'} • Telefone: {company?.phone || 'Não informado'}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {new Date(msg.createdAt).toLocaleString('pt-BR')}
                  </div>
                </div>

                {/* Conteúdo da Mensagem */}
                <div style={{ background: 'var(--surface-2)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  {isEditing ? (
                    <div>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={5}
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-1)', color: 'inherit', fontFamily: 'inherit' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancelar</Button>
                        <Button size="sm" variant="primary" onClick={() => handleSaveEdit(msg)}>Salvar Edição</Button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.95rem', lineHeight: 1.5 }}>
                      {msg.body}
                    </div>
                  )}
                </div>

                {/* Botões de Ação */}
                {!isEditing && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button size="sm" variant="secondary" onClick={() => handleStartEdit(msg)}>✏️ Editar</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleCopy(msg)}>📋 Copiar</Button>
                      {company?.phone && (
                        <Button size="sm" variant="secondary" onClick={() => handleOpenWhatsapp(msg)}>📱 Abrir WhatsApp</Button>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Button size="sm" variant="danger" onClick={() => handleReject(msg)}>❌ Rejeitar</Button>
                      <Button size="sm" variant="primary" onClick={() => handleApprove(msg.id)}>✅ Aprovar</Button>
                      <Button size="sm" variant="success" onClick={() => handleConfirmSent(msg)}>🚀 Confirmar Envio</Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

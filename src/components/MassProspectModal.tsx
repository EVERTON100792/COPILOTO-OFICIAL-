import React, { useState, useEffect } from 'react'
import { Button } from './ui'
import type { Company } from '../types'
import { useApp } from '../services/store'
import { uid, nowIso, formatDateTime } from '../lib/utils'
import { useNavigate } from 'react-router-dom'

interface MassProspectModalProps {
  open: boolean
  onClose: () => void
  companies: Company[]
}

export function MassProspectModal({ open, onClose, companies }: MassProspectModalProps) {
  const s = useApp()
  const navigate = useNavigate()
  
  const [step, setStep] = useState<'CONFIRM' | 'PROCESSING' | 'SUCCESS'>('CONFIRM')
  const [progress, setProgress] = useState({ current: 0, total: 0, currentCompany: '' })
  
  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('CONFIRM')
      setProgress({ current: 0, total: companies.length, currentCompany: '' })
    }
  }, [open, companies.length])

  if (!open) return null

  async function handleConfirm() {
    setStep('PROCESSING')
    setProgress(p => ({ ...p, currentCompany: 'Iniciando lote...' }))

    try {
      // 1. Ensure all filtered companies are leads
      const leadsByCompany = new Set(s.leads.map(l => l.companyId))
      
      for (const c of companies) {
        if (!leadsByCompany.has(c.id) && c.whatsappStatus !== 'NO_WHATSAPP') {
          s.upsertLead({
            id: uid('ld'),
            workspaceId: c.workspaceId,
            companyId: c.id,
            status: 'NEW',
            createdAt: nowIso(),
            updatedAt: nowIso(),
          } as any)
        }
      }

      // 2. Load outreach service
      const { OutreachService } = await import('../services/outreach')
      const service = new OutreachService()

      // 3. Create Campaign
      const camp = service.createCampaign({
        name: `Prospecção em Lote - ${formatDateTime(nowIso())}`,
        description: 'Gerada automaticamente via Resultados da Busca',
        requiresApproval: true,
        minScore: 0
      })

      // 4. Generate Messages with Progress tracking
      await service.generateCampaignMessages(camp.id, (index, total, companyName) => {
        setProgress({ current: index, total, currentCompany: companyName })
      })

      // 5. Success
      setStep('SUCCESS')
      s.toast('success', 'Mensagens geradas! Redirecionando para aprovação...')
      
      setTimeout(() => {
        onClose()
        navigate('/outreach/approval')
      }, 1500)

    } catch (e: any) {
      s.toast('error', 'Erro ao prospectar em lote: ' + e.message)
      onClose()
    }
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div className="modal-content" style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: 32,
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        
        {step === 'CONFIRM' && (
          <div style={{ animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
            <h2 style={{ fontSize: 24, margin: '0 0 12px 0', color: 'var(--text)' }}>
              Disparo Automático em Lote
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 32px 0', lineHeight: 1.5 }}>
              Deseja prospectar automaticamente as <strong>{companies.length} empresas</strong> listadas e gerar as mensagens de Inteligência Artificial para a Fila de Aprovações?
            </p>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <Button variant="secondary" onClick={onClose} style={{ flex: 1, padding: '12px 0' }}>Cancelar</Button>
              <Button variant="primary" onClick={handleConfirm} style={{ flex: 1, padding: '12px 0', background: 'var(--primary)', color: '#fff', border: 'none', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}>
                Sim, Prospectar Tudo
              </Button>
            </div>
          </div>
        )}

        {step === 'PROCESSING' && (
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 24px' }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                border: '4px solid var(--border)', borderRadius: '50%'
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                border: '4px solid var(--primary)', borderRadius: '50%',
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite'
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24
              }}>🤖</div>
            </div>
            
            <h2 style={{ fontSize: 20, margin: '0 0 8px 0', color: 'var(--text)' }}>
              A Inteligência Artificial está trabalhando...
            </h2>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 24 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {progress.currentCompany || 'Preparando...'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--primary)' }}>
                {progress.current} / {progress.total}
              </span>
            </div>
            
            <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ 
                height: '100%', 
                background: 'var(--primary)', 
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 0 10px var(--primary)'
              }} />
            </div>
          </div>
        )}

        {step === 'SUCCESS' && (
          <div style={{ animation: 'scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ 
              width: 80, height: 80, background: 'rgba(16, 185, 129, 0.1)', 
              color: '#10b981', borderRadius: '50%', display: 'flex', 
              alignItems: 'center', justifyContent: 'center', fontSize: 40,
              margin: '0 auto 20px', border: '2px solid rgba(16, 185, 129, 0.2)'
            }}>
              ✓
            </div>
            <h2 style={{ fontSize: 24, margin: '0 0 12px 0', color: 'var(--text)' }}>
              Lote Concluído!
            </h2>
            <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>
              Todas as {progress.total} empresas foram enviadas para a fila de aprovações com sucesso.
            </p>
          </div>
        )}

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}} />
    </div>
  )
}

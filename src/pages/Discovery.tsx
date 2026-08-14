import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DotCard } from '../components/ui/DotCard'
import { useApp } from '../services/store'
import { Card, Button, Badge, EmptyState } from '../components/ui'
import { formatDateTime, uid, nowIso } from '../lib/utils'
import { DiscoveryService } from '../discovery/engine'
import { providerLabel } from '../discovery/registry'
import { LeadMap } from '../components/LeadMap'
import { SalesConversationModal } from '../components/SalesConversationModal'
import { MassProspectModal } from '../components/MassProspectModal'
import { MapsImportModal } from '../components/MapsImportModal'
import type { DiscoveryRun, Company } from '../types'


const RUN_COLOR: Record<DiscoveryRun['status'], string> = {
  QUEUED: 'var(--info)',
  RUNNING: 'var(--info)',
  COMPLETED: 'var(--success)',
  PARTIAL: 'var(--warning)',
  FAILED: 'var(--danger)',
  CANCELLED: 'var(--muted)',
}

const RUN_LABEL: Record<DiscoveryRun['status'], string> = {
  QUEUED: 'Na fila',
  RUNNING: 'Buscando…',
  COMPLETED: 'Concluída',
  PARTIAL: 'Parcial',
  FAILED: 'Falhou',
  CANCELLED: 'Cancelada',
}

function categoryIcon(category: string | null): string {
  const cat = (category || '').toLowerCase()
  if (cat.includes('restaurante') || cat.includes('comida') || cat.includes('bar') || cat.includes('pizzaria') || cat.includes('churrascaria')) return '🍽️'
  if (cat.includes('odonto') || cat.includes('dentista') || cat.includes('saúde') || cat.includes('clínica') || cat.includes('médic')) return '🏥'
  if (cat.includes('salão') || cat.includes('beleza') || cat.includes('estética') || cat.includes('barbe')) return '💅'
  if (cat.includes('auto') || cat.includes('mecanic') || cat.includes('carro') || cat.includes('pneu')) return '🔧'
  if (cat.includes('advoga') || cat.includes('juríd')) return '⚖️'
  if (cat.includes('academia') || cat.includes('personal') || cat.includes('fitness')) return '💪'
  if (cat.includes('pet') || cat.includes('veterinár')) return '🐾'
  if (cat.includes('supermercado') || cat.includes('mercearia') || cat.includes('padaria')) return '🛒'
  return '🏢'
}

function websiteStatus(company: Company) {
  if (!company.website) return { label: 'Sem site', variant: 'danger' as const }
  return { label: 'Tem site', variant: 'muted' as const }
}

export default function Discovery() {
  const navigate = useNavigate()
  const companies = useApp((s) => s.companies)
  const leads = useApp((s) => s.leads)
  const upsertLead = useApp((s) => s.upsertLead)
  const toast = useApp((s) => s.toast)

  const runs = useApp((s) => s.discoveryRuns)

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [salesModalOpen, setSalesModalOpen] = useState(false)
  const [massProspectModalOpen, setMassProspectModalOpen] = useState(false)
  const [mapsImportOpen, setMapsImportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showMap, setShowMap] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)
  const [activeTab, setActiveTab] = useState<'NEW' | 'CONTACTED' | 'NO_WHATSAPP'>('NEW')
  const prospectingSessions = useApp((s) => s.prospectingSessions)

  const sorted = useMemo(() => [...runs].reverse(), [runs])
  const removeCompany = useApp((s) => s.removeCompany)
  const patchCompany = useApp((s) => s.patchCompany)

  const active = sorted.find((r) => r.status === 'RUNNING' || r.status === 'QUEUED')

  const contactedCompanyIds = useMemo(() => {
    return new Set(
      prospectingSessions
        .map((s) => s.companyId)
        .filter((id) => companies.some((c) => c.id === id))
    )
  }, [prospectingSessions, companies])

  const filteredCompanies = useMemo(() => {
    let list = companies
    if (activeTab === 'NEW') {
      list = list.filter(c => !contactedCompanyIds.has(c.id) && c.whatsappStatus !== 'NO_WHATSAPP')
    } else if (activeTab === 'CONTACTED') {
      list = list.filter(c => contactedCompanyIds.has(c.id) && c.whatsappStatus !== 'NO_WHATSAPP')
    } else if (activeTab === 'NO_WHATSAPP') {
      list = list.filter(c => c.whatsappStatus === 'NO_WHATSAPP')
    }

    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q)
    )
  }, [companies, search, activeTab, contactedCompanyIds])

  function handleProspectar(company: Company) {
    setSelectedCompany(company)
    setSalesModalOpen(true)
  }

  const leadsByCompany = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of leads) map.set(l.companyId, (map.get(l.companyId) || 0) + 1)
    return map
  }, [leads])

  async function handleMassProspect() {
    if (filteredCompanies.length === 0) return
    setMassProspectModalOpen(true)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>

      {/* Sales Conversation Modal */}
      <SalesConversationModal
        open={salesModalOpen}
        company={selectedCompany}
        onClose={() => { setSalesModalOpen(false); setSelectedCompany(null) }}
      />

      <MassProspectModal
        open={massProspectModalOpen}
        companies={filteredCompanies}
        onClose={() => setMassProspectModalOpen(false)}
      />

      {/* Page Header - Ultra Compact */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="page-title" style={{ fontSize: 24, margin: 0 }}>🔍 Busca & Mapa</h1>
          <span style={{ fontSize: 13, color: 'var(--muted)', background: 'var(--surface)', padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)' }}>
            {companies.length} empresas
          </span>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <Button variant="primary" onClick={() => setMapsImportOpen(true)} className="shadow-lg shadow-primary/30 ring-2 ring-primary/50 animate-pulse-soft" size="sm">✨ Cadastrar Empresa</Button>
          <Link to="/campaigns/new" className="btn btn-primary btn-sm">Nova Busca</Link>
          <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)}>🗑️ Limpar</Button>
        </div>
      </div>

      {/* Empty state */}
      {companies.length === 0 && (
        <EmptyState
          icon="🔎"
          title="Nenhuma empresa encontrada ainda"
          subtitle="Crie uma busca no modo real (OpenStreetMap) ou carregue dados de demonstração."
          action={
            <div style={{ display: 'flex', gap: 10 }}>
              <Link to="/campaigns/new" className="btn btn-secondary">Criar busca agora</Link>
            </div>
          }
        />
      )}


      {/* Companies Grid */}
      {companies.length > 0 && (
        <>
          {/* Tabs */}
          {/* Search & Map Toggle */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 24, background: 'var(--surface)', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 300 }}>
              <input
                className="input"
                style={{ flex: 1, margin: 0 }}
                placeholder="Buscar por nome, categoria ou cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                variant={showMap ? 'primary' : 'secondary'}
                onClick={() => setShowMap(!showMap)}
              >
                {showMap ? '🗺️ Ocultar Mapa' : '🗺️ Ver Mapa'}
              </Button>
            </div>
            
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button 
                variant={activeTab === 'NEW' ? 'primary' : 'secondary'} 
                onClick={() => setActiveTab('NEW')}
                style={{ padding: '8px 16px' }}
              >
                🏢 Buscas ({companies.filter(c => !contactedCompanyIds.has(c.id) && c.whatsappStatus !== 'NO_WHATSAPP').length})
              </Button>
              <Button 
                variant={activeTab === 'CONTACTED' ? 'primary' : 'secondary'} 
                onClick={() => setActiveTab('CONTACTED')}
                style={{ padding: '8px 16px' }}
              >
                💬 Ativas ({companies.filter(c => contactedCompanyIds.has(c.id) && c.whatsappStatus !== 'NO_WHATSAPP').length})
              </Button>
              <Button 
                variant={activeTab === 'NO_WHATSAPP' ? 'primary' : 'secondary'} 
                onClick={() => setActiveTab('NO_WHATSAPP')}
                style={{ padding: '8px 16px' }}
              >
                🚫 Sem WhatsApp ({companies.filter(c => c.whatsappStatus === 'NO_WHATSAPP').length})
              </Button>
            </div>
          </div>

          {/* Map */}
          {showMap && (
            <div style={{ marginBottom: 24, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <LeadMap companies={companies} />
            </div>
          )}

          {/* Single Unified Grid for All Companies */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>Resultados da Busca</h2>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Exibindo {filteredCompanies.length} empresas</span>
              </div>
              {filteredCompanies.length > 0 && (
                <Button variant="primary" onClick={handleMassProspect}>
                  🚀 Prospectar Todos em Lote ({filteredCompanies.length})
                </Button>
              )}
            </div>
            <div className="grid grid-dense">
                  {filteredCompanies.map((company) => {
                    const ws = websiteStatus(company)
                    const icon = categoryIcon(company.category)
                    const hasLead = leadsByCompany.has(company.id)
                    return (
                      <DotCard key={company.id} className="card card-hover" style={{ display: 'flex', flexDirection: 'column', padding: 24 }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{
                              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                              background: 'var(--surface-2)', display: 'grid', placeItems: 'center',
                              fontSize: 22, border: '1px solid var(--border)',
                              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.05)'
                            }}>
                              {icon}
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2, wordBreak: 'break-word', color: 'var(--text)' }}>
                                {company.name}
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span>{company.category || 'Negócio Local'}</span>
                                {company.rating && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--warning)' }}>
                                    <span>⭐</span> <span style={{ fontWeight: 600 }}>{company.rating.toFixed(1)}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {company.whatsappStatus !== 'NO_WHATSAPP' && (
                              <button 
                                className="link-btn"
                                style={{ padding: 4, color: 'var(--muted)', fontSize: 16, background: 'var(--surface-2)', borderRadius: 6, width: 28, height: 28, display: 'grid', placeItems: 'center' }}
                                onClick={() => {
                                  patchCompany(company.id, { whatsappStatus: 'NO_WHATSAPP' })
                                  toast('info', 'Movida para contatos alternativos')
                                }}
                                title="Marcar Sem WhatsApp"
                              >
                                🚫
                              </button>
                            )}
                            <button 
                              className="link-btn"
                              style={{ padding: 4, color: 'var(--muted)', fontSize: 16, background: 'var(--surface-2)', borderRadius: 6, width: 28, height: 28, display: 'grid', placeItems: 'center' }}
                              onClick={() => removeCompany(company.id)}
                              title="Excluir"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Status Pills */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                          <Badge variant={ws.variant}>{ws.label}</Badge>
                          {company.isDemo && <Badge variant="muted">DEMO</Badge>}
                          {hasLead && <Badge variant="success">✓ Lead Cadastrado</Badge>}
                          {company.whatsappStatus === 'NO_WHATSAPP' && <Badge variant="danger">Sem WhatsApp</Badge>}
                        </div>

                        {/* Info Grid (Glass Pills) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, flex: 1 }}>
                          {company.phone && (
                            <a href={`https://wa.me/55${company.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" 
                               style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, color: 'var(--text)', textDecoration: 'none', border: '1px solid var(--border-soft)', transition: 'background 0.2s' }}>
                              <span style={{ color: 'var(--success)', fontSize: 16 }}>💬</span> 
                              <span style={{ fontWeight: 500 }}>{company.phone}</span>
                            </a>
                          )}
                          {company.website && (
                            <a href={company.website} target="_blank" rel="noopener noreferrer" 
                               style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, color: 'var(--info)', textDecoration: 'none', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
                              <span style={{ fontSize: 16 }}>🌐</span> 
                              <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                            </a>
                          )}
                          {company.instagram && (
                            <a href={company.instagram} target="_blank" rel="noopener noreferrer" 
                               style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, color: '#ec4899', textDecoration: 'none', border: '1px solid var(--border-soft)' }}>
                              <span style={{ fontSize: 16 }}>📸</span> Instagram
                            </a>
                          )}
                          
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            {company.city && (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, color: 'var(--muted)', fontSize: 12 }}>
                                <span style={{ filter: 'grayscale(0.5)' }}>📍</span> {company.city}
                              </div>
                            )}
                            {company.hours && (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, color: 'var(--muted)', fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                                <span>🕒</span> {company.hours}
                              </div>
                            )}
                          </div>
                          
                          {company.summary && (
                            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', marginTop: 8, lineHeight: 1.4, padding: '8px', background: 'var(--surface-2)', borderRadius: 6, borderLeft: '2px solid var(--primary)' }}>
                              "{company.summary.length > 90 ? company.summary.substring(0, 90) + '...' : company.summary}"
                            </div>
                          )}
                        </div>

                        {/* Actions Base */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                          <Button
                            variant="primary"
                            style={{ flex: 1, padding: '12px 16px', fontSize: 14, fontWeight: 700 }}
                            onClick={() => handleProspectar(company)}
                          >
                            {contactedCompanyIds.has(company.id) ? '💬 Continuar' : '⚡ Prospectar IA'}
                          </Button>
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(company.name + ' ' + (company.city || ''))}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ padding: '0 16px', display: 'grid', placeItems: 'center', fontSize: 18 }}
                            title="Ver no Maps"
                          >
                            🗺️
                          </a>
                        </div>
                      </DotCard>
                    )
                  })}
                </div>
          </div>
        </>
      )}

      {/* Active run indicator */}
      {active && (
        <Card style={{ borderColor: 'var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                🔄 Busca em andamento: {active.query} em {active.location}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Encontradas: <b>{active.foundCount}</b> · Novas: <b>{active.newCount}</b> ·
                Fonte: {providerLabel(active.provider)} · {RUN_LABEL[active.status]}
              </div>
            </div>
            <Button variant="danger" size="sm" onClick={() => {
              new DiscoveryService().cancel(active.id)
              toast('info', 'Cancelamento solicitado.')
            }}>Cancelar</Button>
          </div>
        </Card>
      )}

      {/* History table */}
      {sorted.length > 0 && (
        <Card title={`Histórico de buscas (${sorted.length})`}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th><th>Termo</th><th>Localização</th>
                  <th>Encontradas</th><th>Novas</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td className="tiny">{formatDateTime(r.startedAt)}</td>
                    <td>{r.query}</td>
                    <td>{r.location}</td>
                    <td>{r.foundCount}</td>
                    <td className="bold">{r.newCount}</td>
                    <td><span style={{ color: RUN_COLOR[r.status], fontSize: 12 }}>{RUN_LABEL[r.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <MapsImportModal open={mapsImportOpen} onClose={() => setMapsImportOpen(false)} />

      {/* Modal de confirmação — Limpar Buscas/Empresas */}
      {confirmClear && (
        <div className="modal-backdrop" onClick={() => setConfirmClear(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ color: 'var(--danger)' }}>⚠️ Excluir Dados do Sistema</h3>
            <p className="mt-8">Escolha o que você deseja limpar do sistema. <b>Estas ações não podem ser desfeitas.</b></p>
            
            <div className="flex col gap-8 mt-20">
              <Button variant="danger" onClick={() => {
                useApp.getState().clearAllCompanies()
                setConfirmClear(false)
                toast('success', 'Começando do zero! Empresas, leads e buscas foram removidos.')
              }}>
                🗑️ Excluir TUDO (Começar do zero)
              </Button>
              <Button variant="secondary" onClick={() => {
                useApp.getState().clearDiscoveryData()
                setConfirmClear(false)
                toast('success', 'Histórico de buscas limpo, mas as empresas foram mantidas.')
              }}>
                Limpar apenas histórico de buscas
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancelar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
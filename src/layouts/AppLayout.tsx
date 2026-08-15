import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../services/store'
import { APP_NAME } from '../config/env'
import { timeAgo } from '../lib/utils'
import { useState } from 'react'
import { Modal } from '../components/ui'
import { KineticGrid } from '../components/ui/KineticGrid'
import { GlobalCopilotDrawer } from '../components/GlobalCopilotDrawer'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { section: 'Visão geral', items: [{ to: '/', label: 'Dashboard', icon: '📊' }] },
  {
    section: 'Prospecção & Vendas',
    items: [
      { to: '/discovery', label: 'Busca & Mapa', icon: '🔎' },
      { to: '/companies', label: 'Empresas', icon: '🏢' },
      { to: '/radar', label: 'Radar Oportunidades', icon: '🎯' },
      { to: '/leads', label: 'Leads & CRM', icon: '🗂️' },
      { to: '/proposals', label: 'Propostas Comercial', icon: '📄' },
    ],
  },
  {
    section: 'Sistema',
    items: [
      { to: '/settings', label: 'Configurações', icon: '⚙️' },
    ],
  },
]


export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const notifications = useApp((s) => s.notifications)
  const leads = useApp((s) => s.leads)
  const companies = useApp((s) => s.companies)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const unread = notifications.filter((n) => !n.read).length

  const searchResults = query.trim()
    ? (() => {
        const q = query.trim().toLowerCase()
        return leads
          .map((l) => ({ lead: l, company: companies.find((c) => c.id === l.companyId) }))
          .filter(
            ({ lead, company }) =>
              company?.name?.toLowerCase().includes(q) ||
              company?.city?.toLowerCase().includes(q) ||
              company?.phone?.toLowerCase().includes(q) ||
              company?.instagram?.toLowerCase().includes(q) ||
              lead.status?.toLowerCase().includes(q)
          )
          .slice(0, 8)
      })()
    : []

  return (
    <div className="app-shell">
      <KineticGrid />
      {/* Overlay para mobile */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}></div>
      )}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`} aria-label="Navegação principal">
        <div className="sidebar-inner">
          <div className="sidebar-brand">
            <div className="logo">P</div>
            <div className="brand-name">
              PROSPEX
              <small>Autopilot</small>
            </div>
          </div>
          <nav className="sidebar-nav">
            {NAV.map((group) => (
              <div key={group.section}>
                <div className="sidebar-section">{group.section}</div>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    end={item.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <span className="icon" aria-hidden="true">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div className="sidebar-status">
              <span className={`dot ${isDemo ? 'dot-warning' : 'dot-success'}`} />
              {isDemo ? 'Modo DEMO' : 'Conectado'}
            </div>
            <div className="sidebar-status">
              <span className="dot dot-success" />
              {APP_NAME}
            </div>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              className="mobile-menu-btn icon-btn" 
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir Menu"
            >
              ☰
            </button>
            <div className="topbar-search">
              <span aria-hidden="true">🔍</span>
            <input
              placeholder="Buscar leads, empresas, telefone..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              aria-label="Busca global"
            />
            {query && (
              <button className="link-btn" onClick={() => { setQuery(''); setSearchOpen(false) }}>✕</button>
            )}
            </div>
          </div>
          <div className="topbar-right">
            {userMenuOpen && (
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={() => setUserMenuOpen(false)}
              />
            )}
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" onClick={() => setNotifOpen(!notifOpen)} aria-label="Notificações">
                🔔 {unread > 0 && <span className="badge-dot">{unread}</span>}
              </button>
              {notifOpen && (
                <div className="notif-panel card" style={{ position: 'absolute', right: 0, top: 44, width: 320 }}>
                  <div className="flex items-center justify-between mb-8">
                    <b>Notificações</b>
                    <button className="link-btn" onClick={() => useApp.getState().markAllNotificationsRead()}>Ler todas</button>
                  </div>
                  {notifications.length === 0 && <div className="muted small">Nenhuma notificação.</div>}
                  {notifications.slice(0, 12).map((n) => (
                    <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => { useApp.getState().markNotificationRead(n.id); if (n.leadId) navigate(`/leads/${n.leadId}`); setNotifOpen(false) }}>
                      <div className="bold small">{n.title}</div>
                      <div className="tiny muted">{n.message}</div>
                      <div className="tiny muted-2">{timeAgo(n.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                className="avatar"
                title={useApp.getState().currentUser.name}
                aria-label="Menu do usuário"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
              >
                {useApp.getState().currentUser.name.slice(0, 1).toUpperCase()}
              </button>
              {userMenuOpen && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 220, zIndex: 50 }}>
                  <div className="px-12 py-8 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                    <div className="bold small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {user?.email ?? useApp.getState().currentUser.name}
                    </div>
                  </div>
                  <button
                    className="link-btn px-12 py-8 full-width text-left"
                    onClick={() => { setUserMenuOpen(false); navigate('/settings') }}
                  >
                    ⚙️ Configurações
                  </button>
                  <button
                    className="link-btn px-12 py-8 full-width text-left"
                    style={{ color: 'var(--red, #f87171)' }}
                    onClick={async () => {
                      setUserMenuOpen(false)
                      await signOut()
                      navigate('/login')
                    }}
                  >
                    🚪 Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>

      <Modal open={searchOpen} onClose={() => setSearchOpen(false)} title={`Busca: "${query}"`}>
        {searchResults.length === 0 && <div className="muted">Nenhum resultado{(query && ' para ') + query || ''}.</div>}
        {searchResults.map(({ lead, company }) => (
          <button
            key={lead.id}
            className="search-row"
            onClick={() => { setSearchOpen(false); navigate(`/leads/${lead.id}`) }}
          >
            <div className="flex items-center justify-between">
              <b>{company?.name ?? 'Empresa'}</b>
              <span className={`badge badge-${tierVariant(lead.tier)}`}>{lead.score ?? '—'}</span>
            </div>
            <div className="tiny muted">{company?.city} · {company?.phone ?? 'sem telefone'}</div>
          </button>
        ))}
      </Modal>

      {/* Global Copilot Drawer */}
      <GlobalCopilotDrawer />
    </div>
  )
}

function tierVariant(tier: string | null): 'danger' | 'warning' | 'info' | 'muted' {
  if (tier === 'HOT') return 'danger'
  if (tier === 'HIGH') return 'warning'
  if (tier === 'MEDIUM') return 'info'
  return 'muted'
}

const isDemo = (import.meta.env.VITE_DEMO_MODE ?? 'true') === 'true'
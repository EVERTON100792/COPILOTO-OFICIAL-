import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../services/store'
import { APP_NAME } from '../config/env'
import { timeAgo } from '../lib/utils'
import { useEffect, useState } from 'react'
import { Modal } from '../components/ui'
import { StarfieldBg } from '../components/ui/StarfieldBg'
import { getSupabase, supabaseAvailable } from '../database/supabase'

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
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [sessionEmail, setSessionEmail] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const navigate = useNavigate()
  const notifications = useApp((s) => s.notifications)
  const leads = useApp((s) => s.leads)
  const companies = useApp((s) => s.companies)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase || !supabaseAvailable) {
      setAuthReady(true)
      return
    }

    const syncSession = async () => {
      const { data } = await supabase.auth.getSession()
      setSessionEmail(data.session?.user?.email ?? '')
      setAuthReady(true)
    }

    void syncSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextEmail = session?.user?.email ?? ''
      setSessionEmail(nextEmail)
      setAuthReady(true)
      if (_event === 'SIGNED_OUT') {
        setAuthMessage('Usuário desconectado.')
        setAuthPassword('')
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  async function handleAuth(type: 'signin' | 'signup') {
    const supabase = getSupabase()
    if (!supabase || !supabaseAvailable) {
      setAuthMessage('Supabase não configurado. Verifique as variáveis de ambiente.')
      return
    }

    const email = authEmail.trim()
    const password = authPassword.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessage('Informe um e-mail válido.')
      return
    }
    if (!password || password.length < 6) {
      setAuthMessage('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setAuthLoading(true)
    setAuthMessage('')
    const result = type === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password })

    setAuthLoading(false)

    if (result.error) {
      setAuthMessage(result.error.message)
      return
    }

    setSessionEmail(email)
    setAuthMessage(type === 'signup' ? 'Conta criada com sucesso.' : 'Login realizado com sucesso.')
    setAuthPassword('')
  }

  async function handleMagicLink() {
    const supabase = getSupabase()
    if (!supabase || !supabaseAvailable) {
      setAuthMessage('Supabase não configurado. Verifique as variáveis de ambiente.')
      return
    }

    const email = authEmail.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthMessage('Informe um e-mail válido para receber o link.')
      return
    }

    setAuthLoading(true)
    setAuthMessage('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setAuthLoading(false)

    if (error) {
      setAuthMessage(error.message)
      return
    }

    setAuthMessage('Link mágico enviado. Verifique seu e-mail.')
  }

  async function handleSignOut() {
    const supabase = getSupabase()
    if (!supabase || !supabaseAvailable) {
      setSessionEmail('')
      setAuthMessage('Usuário desconectado.')
      return
    }

    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthMessage(error.message)
      return
    }

    setSessionEmail('')
    setAuthEmail('')
    setAuthPassword('')
    setAuthMessage('Usuário desconectado.')
    navigate('/settings')
  }

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

  if (!authReady) {
    return <div className="page"><div className="loading-state">Carregando sessão...</div></div>
  }

  if (!sessionEmail) {
    return (
      <>
        <style>{`
          @keyframes authCardIn {
            0% { opacity: 0; transform: translateY(18px) scale(0.98); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 0 0 rgba(236,72,153,0.18), 0 18px 28px rgba(236,72,153,0.22); }
            50% { box-shadow: 0 0 26px rgba(236,72,153,0.42), 0 20px 34px rgba(168,85,247,0.28); }
          }
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(circle at 50% 25%, rgba(59,130,246,0.10), rgba(2,6,23,0.98) 30%, rgba(2,6,23,1) 100%)' }}>
          <div style={{
              width: 'min(620px, 100%)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.92), rgba(17,24,39,0.76))',
            border: '1px solid rgba(148,163,184,0.22)',
            borderRadius: 28,
            padding: '26px 30px 22px',
            boxShadow: '0 30px 70px rgba(2,6,23,0.8), inset 0 1px 0 rgba(255,255,255,0.06)',
            backdropFilter: 'blur(12px)',
            position: 'relative',
            overflow: 'hidden',
            animation: 'authCardIn 0.55s ease-out',
              maxWidth: 'calc(100vw - 24px)',
            }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, rgba(168,85,247,0.10), transparent 25%, transparent 70%, rgba(59,130,246,0.08))', backgroundSize: '200% 100%', animation: 'shimmer 8s linear infinite', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 12, height: 12, borderRadius: 999, background: 'linear-gradient(135deg, #fb7185, #a855f7)', boxShadow: '0 0 20px rgba(251,113,133,0.8)' }} />
                <div style={{ fontSize: 17, fontWeight: 800, color: '#ffffff', letterSpacing: -0.2 }}>Sincronização Supabase</div>
              </div>
              <div style={{ color: '#d9e6f7', fontSize: 15, marginBottom: 20, lineHeight: 1.5, maxWidth: 540 }}>
                {authMessage || 'Entre com seu e-mail e senha para acessar seus dados sincronizados.'}
              </div>
              <div style={{ display: 'grid', gap: 18 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, color: '#eef2ff', fontWeight: 600, fontSize: 14 }}>E-mail de acesso</label>
                  <input
                    className="input"
                    value={authEmail}
                    placeholder="voce@empresa.com"
                    onChange={(e) => setAuthEmail(e.target.value)}
                    style={{ width: '100%', height: 52, borderRadius: 14, background: 'rgba(15,23,42,0.74)', borderColor: 'rgba(148,163,184,0.25)', color: '#fff', boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.7)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, color: '#eef2ff', fontWeight: 600, fontSize: 14 }}>Senha</label>
                  <input
                    type="password"
                    className="input"
                    value={authPassword}
                    placeholder="Sua senha"
                    onChange={(e) => setAuthPassword(e.target.value)}
                    style={{ width: '100%', height: 52, borderRadius: 14, background: 'rgba(15,23,42,0.74)', borderColor: 'rgba(148,163,184,0.25)', color: '#fff', boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.7)' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                  <button
                    className="btn btn-primary"
                    disabled={authLoading}
                    onClick={() => void handleAuth('signin')}
                    style={{ minWidth: 120, height: 46, borderRadius: 12, fontWeight: 800, animation: 'pulseGlow 2.2s ease-in-out infinite', flex: '0 0 auto' }}
                  >
                    {authLoading ? 'Entrando...' : 'Entrar'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => void handleAuth('signup')} style={{ height: 46, borderRadius: 12, flex: '0 0 auto' }}>Criar conta</button>
                  <button className="btn btn-ghost" onClick={() => void handleMagicLink()} style={{ height: 46, borderRadius: 12, flex: '0 0 auto' }}>Link mágico</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <div className="app-shell">
      <StarfieldBg />
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
            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: 8, fontSize: 12 }}
              onClick={() => void handleSignOut()}
            >
              Sair da conta
            </button>
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
            <div className="avatar" title={useApp.getState().currentUser.name}>
              {useApp.getState().currentUser.name.slice(0, 1).toUpperCase()}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => void handleSignOut()}>Sair</button>
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
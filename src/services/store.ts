import { create } from 'zustand'
import type {
  Campaign, Company, Lead, LeadActivity, Note, Followup, Task, Notification,
  GlobalSettings, AgentRun, Proposal, AuditEntry, AutomationRule, AiUsage, ScoreWeights,
  DiscoveryRun, DiscoveryResultRow, LeadQualification, OutreachCampaign, OutreachMessage, OutreachActivity, Demo,
  ProspectingSession, ProspectingMessage, WebsiteProject, WebsiteVersion,
} from '../types'
import { DEFAULT_SETTINGS } from '../config/defaults'
import { getItem, setItem, clearAll, fetchAllFromSupabase } from '../database/storage'
import { buildDemoCompanies } from '../database/demoFactory'
import { uid, nowIso } from '../lib/utils'
import { getSupabase, supabaseAvailable } from '../database/supabase'
import { logger } from '../lib/logger'


export interface Toast {
  id: string
  kind: 'success' | 'error' | 'warning' | 'info'
  message: string
}

interface AppState {
  workspaceId: string
  currentUser: { id: string; name: string; email: string; role: string }
  settings: GlobalSettings
  companies: Company[]
  leads: Lead[]
  activities: LeadActivity[]
  notes: Note[]
  followups: Followup[]
  tasks: Task[]
  notifications: Notification[]
  agentRuns: AgentRun[]
  campaigns: Campaign[]
  audits: AuditEntry[]
  rules: AutomationRule[]
  aiUsage: AiUsage
  discoveryRuns: DiscoveryRun[]
  discoveryResults: DiscoveryResultRow[]
  qualifications: LeadQualification[]
  outreachCampaigns: OutreachCampaign[]
  outreachMessages: OutreachMessage[]
  outreachActivities: OutreachActivity[]
  demos: Demo[]
  prospectingSessions: ProspectingSession[]
  websiteProjects: WebsiteProject[]
  toasts: Toast[]
  hydrated: boolean

  hydrate: () => void
  resetAll: () => void

  saveSettings: (patch: Partial<GlobalSettings>) => void
  saveScoreWeights: (weights: ScoreWeights) => void

  addDiscoveryRun: (run: DiscoveryRun) => void
  patchDiscoveryRun: (id: string, patch: Partial<DiscoveryRun>) => void
  upsertDiscoveryResult: (row: DiscoveryResultRow) => void

  upsertQualification: (q: LeadQualification) => void
  removeQualification: (id: string) => void
  setQualifications: (qs: LeadQualification[]) => void

  upsertOutreachCampaign: (c: OutreachCampaign) => void
  upsertOutreachMessage: (m: OutreachMessage) => void
  pushOutreachActivity: (a: OutreachActivity) => void

  upsertDemo: (demo: Demo) => void
  removeDemo: (id: string) => void
  publishDemo: (id: string, url: string) => void

  upsertProspectingSession: (session: ProspectingSession) => void
  addMessageToSession: (sessionId: string, message: ProspectingMessage) => void
  updateSessionStatus: (sessionId: string, status: ProspectingSession['status']) => void

  upsertWebsiteProject: (project: WebsiteProject) => void
  patchWebsiteVersion: (projectId: string, versionId: string, patch: Partial<WebsiteVersion>) => void

  setCompanies: (companies: Company[]) => void
  upsertCompany: (company: Company) => void
  removeCompany: (id: string) => void
  clearAllCompanies: () => void
  clearDiscoveryData: () => void

  upsertLead: (lead: Lead) => void
  removeLead: (id: string) => void
  setLeads: (leads: Lead[]) => void
  moveLead: (id: string, status: Lead['status']) => void

  addActivity: (a: Omit<LeadActivity, 'id' | 'createdAt'>) => void
  addNote: (leadId: string, body: string, author: string) => void
  removeNote: (id: string) => void
  addFollowup: (f: Followup) => void
  updateFollowup: (id: string, patch: Partial<Followup>) => void
  addTask: (t: Task) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  removeTask: (id: string) => void
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  removeNotification: (id: string) => void
  pushAgentRun: (run: AgentRun) => void
  patchAgentRun: (id: string, patch: Partial<AgentRun>) => void
  upsertCampaign: (c: Campaign) => void
  addAudit: (a: Omit<AuditEntry, 'id' | 'createdAt'>) => void
  addRule: (r: AutomationRule) => void
  updateRule: (id: string, patch: Partial<AutomationRule>) => void
  removeRule: (id: string) => void
  addAiUsage: (requests: number, tokens: number, cost: number) => void
  toast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: string) => void
}

const LS_KEYS = [
  'settings', 'companies', 'leads', 'activities', 'notes', 'followups', 'tasks',
  'notifications', 'agentRuns', 'campaigns', 'audits', 'rules', 'aiUsage',
  'discoveryRuns', 'discoveryResults', 'qualifications',
  'outreachCampaigns', 'outreachMessages', 'outreachActivities', 'demos',
  'prospectingSessions', 'websiteProjects',
] as const

function persist(partial: Partial<AppState>): void {
  for (const k of LS_KEYS) {
    if (k in partial) setItem(k, partial[k as keyof AppState])
  }
}

export const useApp = create<AppState>((set, get) => ({
  workspaceId: 'ws_main',
  currentUser: { id: 'u_owner', name: 'Operador', email: 'operador@prospex.local', role: 'OWNER' },
  settings: DEFAULT_SETTINGS,
  companies: [],
  leads: [],
  activities: [],
  notes: [],
  followups: [],
  tasks: [],
  notifications: [],
  agentRuns: [],
  campaigns: [],
  audits: [],
  rules: [],
  aiUsage: { requests: 0, tokensUsed: 0, estimatedCostUsd: 0 },
  discoveryRuns: [],
  discoveryResults: [],
  qualifications: [],
  outreachCampaigns: [],
  outreachMessages: [],
  outreachActivities: [],
  demos: [],
  prospectingSessions: [],
  websiteProjects: [],
  toasts: [],
  hydrated: false,

  hydrate: () => {
    const loadedSettings = getItem('settings', DEFAULT_SETTINGS)
    if (!loadedSettings.aiApiKey && import.meta.env.VITE_AI_API_KEY) {
      loadedSettings.aiApiKey = import.meta.env.VITE_AI_API_KEY as string
    }
    const loadedCompanies = getItem<Company[]>('companies', [])
    set({
      settings: loadedSettings,
      companies: loadedCompanies,

      leads: getItem<Lead[]>('leads', []),
      activities: getItem<LeadActivity[]>('activities', []),
      notes: getItem<Note[]>('notes', []),
      followups: getItem<Followup[]>('followups', []),
      tasks: getItem<Task[]>('tasks', []),
      notifications: getItem<Notification[]>('notifications', []),
      agentRuns: getItem<AgentRun[]>('agentRuns', []),
      campaigns: getItem<Campaign[]>('campaigns', []),
      audits: getItem<AuditEntry[]>('audits', []),
      rules: getItem<AutomationRule[]>('rules', []),
      aiUsage: getItem<AiUsage>('aiUsage', { requests: 0, tokensUsed: 0, estimatedCostUsd: 0 }),
      discoveryRuns: getItem<DiscoveryRun[]>('discoveryRuns', []),
      discoveryResults: getItem<DiscoveryResultRow[]>('discoveryResults', []),
      qualifications: getItem<LeadQualification[]>('qualifications', []),
      outreachCampaigns: getItem<OutreachCampaign[]>('outreachCampaigns', []),
      outreachMessages: getItem<OutreachMessage[]>('outreachMessages', []),
      outreachActivities: getItem<OutreachActivity[]>('outreachActivities', []),
      demos: getItem<Demo[]>('demos', []),
      prospectingSessions: getItem<ProspectingSession[]>('prospectingSessions', []),
      websiteProjects: getItem<WebsiteProject[]>('websiteProjects', []),
      hydrated: true,
    })

    // background: if Supabase is configured and user signed-in, fetch remote and merge (remote wins)
    void (async () => {
      if (!supabaseAvailable) return
      try {
        const remote = await fetchAllFromSupabase()
        if (!remote) return
        const partial: Partial<AppState> = {}
        for (const k of LS_KEYS) {
          if (Object.prototype.hasOwnProperty.call(remote, k)) {
            partial[k as keyof AppState] = remote[k]
          }
        }
        if (Object.keys(partial).length > 0) {
          // apply remote values and persist locally
          set(partial as any)
          persist(partial)
          logger.info('STORAGE', 'Dados sincronizados do Supabase para o cliente')
        }
      } catch (e) {
        logger.warn('STORAGE', 'Falha ao mesclar dados do Supabase', String(e))
      }
    })()
  },

  resetAll: () => {
    clearAll()
    set({
      settings: DEFAULT_SETTINGS,
      companies: [],
      leads: [],
      activities: [],
      notes: [],
      followups: [],
      tasks: [],
      notifications: [],
      agentRuns: [],
      campaigns: [],
      audits: [],
      rules: [],
      aiUsage: { requests: 0, tokensUsed: 0, estimatedCostUsd: 0 },
      discoveryRuns: [],
      discoveryResults: [],
      qualifications: [],
      outreachCampaigns: [],
      outreachMessages: [],
      outreachActivities: [],
      prospectingSessions: [],
      websiteProjects: [],
      toasts: [],
    })
  },

  saveSettings: (patch) => {
    const next = { ...get().settings, ...patch }
    set({ settings: next })
    persist({ settings: next })
  },
  saveScoreWeights: (weights) => {
    const next = { ...get().settings, scoreWeights: weights }
    set({ settings: next })
    persist({ settings: next })
  },

  setCompanies: (companies) => { set({ companies }); persist({ companies }) },
  upsertCompany: (company) => {
    const companies = get().companies
    const idx = companies.findIndex((c) => c.id === company.id)
    const next = idx >= 0 ? companies.map((c) => (c.id === company.id ? company : c)) : [...companies, company]
    set({ companies: next }); persist({ companies: next })
  },
  removeCompany: (id) => {
    const companies = get().companies.filter((c) => c.id !== id)
    const leads = get().leads.filter((l) => l.companyId !== id)
    set({ companies, leads }); persist({ companies, leads })
  },
  clearAllCompanies: () => {
    set({ companies: [], leads: [], discoveryResults: [], discoveryRuns: [] })
    persist({ companies: [], leads: [], discoveryResults: [], discoveryRuns: [] })
  },
  clearDiscoveryData: () => {
    set({ discoveryResults: [], discoveryRuns: [] })
    persist({ discoveryResults: [], discoveryRuns: [] })
  },

  upsertDemo: (demo) => {
    const demos = get().demos
    const idx = demos.findIndex((d) => d.id === demo.id)
    const next = idx >= 0 ? demos.map((d) => (d.id === demo.id ? demo : d)) : [...demos, demo]
    set({ demos: next }); persist({ demos: next })
  },
  removeDemo: (id) => {
    const demos = get().demos.filter((d) => d.id !== id)
    set({ demos }); persist({ demos })
  },
  publishDemo: (id, url) => {
    const demos = get().demos
    const next = demos.map((d) =>
      d.id === id
        ? { ...d, status: 'PUBLISHED' as const, deploymentUrl: url, publishedAt: nowIso(), updatedAt: nowIso() }
        : d
    )
    set({ demos: next }); persist({ demos: next })
  },

  upsertLead: (lead) => {
    const leads = get().leads
    const idx = leads.findIndex((l) => l.id === lead.id)
    const next = idx >= 0 ? leads.map((l) => (l.id === lead.id ? lead : l)) : [...leads, lead]
    set({ leads: next }); persist({ leads: next })
  },
  setLeads: (leads) => { set({ leads }); persist({ leads }) },
  removeLead: (id) => {
    const leads = get().leads.filter((l) => l.id !== id)
    set({ leads }); persist({ leads })
  },
  moveLead: (id, status) => {
    const leads = get().leads.map((l) => (l.id === id ? { ...l, status, updatedAt: nowIso() } : l))
    set({ leads }); persist({ leads })
  },

  addActivity: (a) => {
    const activities = [{ ...a, id: uid('act'), createdAt: nowIso() } as LeadActivity, ...get().activities]
    set({ activities }); persist({ activities })
  },
  addNote: (leadId, body, author) => {
    const note: Note = { id: uid('note'), leadId, body, author, createdAt: nowIso() }
    const notes = [note, ...get().notes]
    const leads = get().leads.map((l) =>
      l.id === leadId ? { ...l, notesCount: (l.notesCount ?? 0) + 1, updatedAt: nowIso() } : l
    )
    set({ notes, leads }); persist({ notes, leads })
  },
  removeNote: (id) => {
    const note = get().notes.find((n) => n.id === id)
    const notes = get().notes.filter((n) => n.id !== id)
    const leads = note
      ? get().leads.map((l) => (l.id === note.leadId ? { ...l, notesCount: Math.max(0, (l.notesCount ?? 1) - 1) } : l))
      : get().leads
    set({ notes, leads }); persist({ notes, leads })
  },
  addFollowup: (f) => {
    const followups = [...get().followups, f]
    set({ followups }); persist({ followups })
  },
  updateFollowup: (id, patch) => {
    const followups = get().followups.map((f) => (f.id === id ? { ...f, ...patch } : f))
    set({ followups }); persist({ followups })
  },
  addTask: (t) => {
    const tasks = [t, ...get().tasks]
    set({ tasks }); persist({ tasks })
  },
  updateTask: (id, patch) => {
    const tasks = get().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t))
    set({ tasks }); persist({ tasks })
  },
  removeTask: (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id)
    set({ tasks }); persist({ tasks })
  },
  addNotification: (n) => {
    const notifications = [{ ...n, id: uid('ntf'), read: false, createdAt: nowIso() } as Notification, ...get().notifications]
    set({ notifications }); persist({ notifications })
  },
  markNotificationRead: (id) => {
    const notifications = get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    set({ notifications }); persist({ notifications })
  },
  markAllNotificationsRead: () => {
    const notifications = get().notifications.map((n) => ({ ...n, read: true }))
    set({ notifications }); persist({ notifications })
  },
  removeNotification: (id) => {
    const notifications = get().notifications.filter((n) => n.id !== id)
    set({ notifications }); persist({ notifications })
  },
  pushAgentRun: (run) => {
    const agentRuns = [run, ...get().agentRuns].slice(0, 300)
    set({ agentRuns }); persist({ agentRuns })
  },
  patchAgentRun: (id, patch) => {
    const agentRuns = get().agentRuns.map((r) => (r.id === id ? { ...r, ...patch } : r))
    set({ agentRuns }); persist({ agentRuns })
  },
  upsertCampaign: (c) => {
    const campaigns = get().campaigns
    const idx = campaigns.findIndex((x) => x.id === c.id)
    const next = idx >= 0 ? campaigns.map((x) => (x.id === c.id ? c : x)) : [...campaigns, c]
    set({ campaigns: next }); persist({ campaigns: next })
  },
  addAudit: (a) => {
    const audits = [{ ...a, id: uid('aud'), createdAt: nowIso() } as AuditEntry, ...get().audits].slice(0, 500)
    set({ audits }); persist({ audits })
  },
  addRule: (r) => {
    const rules = [...get().rules, r]
    set({ rules }); persist({ rules })
  },
  updateRule: (id, patch) => {
    const rules = get().rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
    set({ rules }); persist({ rules })
  },
  removeRule: (id) => {
    const rules = get().rules.filter((r) => r.id !== id)
    set({ rules }); persist({ rules })
  },
  addAiUsage: (requests, tokens, cost) => {
    const aiUsage = {
      requests: get().aiUsage.requests + requests,
      tokensUsed: get().aiUsage.tokensUsed + tokens,
      estimatedCostUsd: get().aiUsage.estimatedCostUsd + cost,
    }
    set({ aiUsage }); persist({ aiUsage })
  },

  addDiscoveryRun: (run) => {
    const discoveryRuns = [run, ...get().discoveryRuns].slice(0, 200)
    set({ discoveryRuns }); persist({ discoveryRuns })
  },
  patchDiscoveryRun: (id, patch) => {
    const discoveryRuns = get().discoveryRuns.map((r) => (r.id === id ? { ...r, ...patch } : r))
    set({ discoveryRuns }); persist({ discoveryRuns })
  },
  upsertDiscoveryResult: (row) => {
    const discoveryResults = [row, ...get().discoveryResults].slice(0, 1000)
    set({ discoveryResults }); persist({ discoveryResults })
  },

  upsertQualification: (q) => {
    const qualifications = get().qualifications
    const idx = qualifications.findIndex((item) => item.id === q.id || item.leadId === q.leadId)
    const next = idx >= 0 ? qualifications.map((item, i) => (i === idx ? q : item)) : [q, ...qualifications]
    set({ qualifications: next }); persist({ qualifications: next })
  },
  removeQualification: (id) => {
    const qualifications = get().qualifications.filter((q) => q.id !== id)
    set({ qualifications }); persist({ qualifications })
  },
  setQualifications: (qs) => { set({ qualifications: qs }); persist({ qualifications: qs }) },

  upsertOutreachCampaign: (c) => {
    const outreachCampaigns = get().outreachCampaigns
    const idx = outreachCampaigns.findIndex((item) => item.id === c.id)
    const next = idx >= 0 ? outreachCampaigns.map((item) => (item.id === c.id ? c : item)) : [c, ...outreachCampaigns]
    set({ outreachCampaigns: next }); persist({ outreachCampaigns: next })
  },
  upsertOutreachMessage: (m) => {
    const outreachMessages = get().outreachMessages
    const idx = outreachMessages.findIndex((item) => item.id === m.id)
    const next = idx >= 0 ? outreachMessages.map((item) => (item.id === m.id ? m : item)) : [m, ...outreachMessages]
    set({ outreachMessages: next }); persist({ outreachMessages: next })
  },
  pushOutreachActivity: (a) => {
    const outreachActivities = [a, ...get().outreachActivities].slice(0, 1000)
    set({ outreachActivities }); persist({ outreachActivities })
  },

  toast: (kind, message) => {
    const toast: Toast = { id: uid('tst'), kind, message }
    set({ toasts: [...get().toasts, toast] })
    setTimeout(() => get().dismissToast(toast.id), 4200)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  upsertProspectingSession: (session) => {
    const sessions = get().prospectingSessions
    const idx = sessions.findIndex((s) => s.id === session.id)
    const next = idx >= 0 ? sessions.map((s) => (s.id === session.id ? session : s)) : [...sessions, session]
    set({ prospectingSessions: next }); persist({ prospectingSessions: next })
  },
  addMessageToSession: (sessionId, message) => {
    const sessions = get().prospectingSessions.map((s) =>
      s.id === sessionId
        ? { ...s, messages: [...s.messages, message], updatedAt: new Date().toISOString() }
        : s
    )
    set({ prospectingSessions: sessions }); persist({ prospectingSessions: sessions })
  },
  updateSessionStatus: (sessionId, status) => {
    const sessions = get().prospectingSessions.map((s) =>
      s.id === sessionId ? { ...s, status, updatedAt: new Date().toISOString() } : s
    )
    set({ prospectingSessions: sessions }); persist({ prospectingSessions: sessions })
  },

  upsertWebsiteProject: (project) => {
    const projects = get().websiteProjects
    const idx = projects.findIndex((p) => p.id === project.id)
    const next = idx >= 0 ? projects.map((p) => (p.id === project.id ? project : p)) : [...projects, project]
    set({ websiteProjects: next }); persist({ websiteProjects: next })
  },
  patchWebsiteVersion: (projectId, versionId, patch) => {
    const projects = get().websiteProjects.map((p) => {
      if (p.id !== projectId) return p
      const versions = p.versions.map((v) => (v.id === versionId ? { ...v, ...patch } : v))
      const ready = versions.find((v) => v.id === versionId && (patch.status === 'READY' || v.status === 'READY'))
      return { ...p, versions, currentVersionId: ready ? versionId : p.currentVersionId, updatedAt: new Date().toISOString() }
    })
    set({ websiteProjects: projects }); persist({ websiteProjects: projects })
  },
}))

export function useToast(): AppState['toast'] {
  return useApp((s) => s.toast)
}
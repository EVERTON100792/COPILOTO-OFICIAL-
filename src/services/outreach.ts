import { useApp } from './store'
import { uid, nowIso } from '../lib/utils'
import { logger } from '../lib/logger'
import { requestAIQualification } from '../integrations/ai/qualification'
import { aiGenerate } from '../integrations/ai'
import { buildTemplateContext, renderTemplate } from './outreachTemplates'
import { FollowUpEngineService } from './followUpEngine'
import { sendWhatsApp } from '../integrations/whatsapp'
import type {
  OutreachCampaign,
  OutreachMessage,
  OutreachActivity,
  OutreachChannel,
  MessageType,
  QualificationLevel,
  Company,
  Lead,
} from '../types'

export interface CreateCampaignInput {
  name: string
  description?: string
  targetNiche?: string
  targetCity?: string
  targetSegment?: string
  minScore?: number
  opportunityFilter?: QualificationLevel | 'ALL'
  offerName?: string
  offerDescription?: string
  offerPrice?: number
  channel?: OutreachChannel
  requiresApproval?: boolean
  autoFollowUpEnabled?: boolean
}

export class OutreachService {
  /**
   * Cria uma nova campanha de prospecção e seleciona os leads qualificados compatíveis.
   */
  createCampaign(input: CreateCampaignInput): OutreachCampaign {
    const s = useApp.getState()
    const now = nowIso()

    const minScore = input.minScore ?? 60
    const oppFilter = input.opportunityFilter ?? 'ALL'

    // Seleciona os leads compatíveis com os filtros
    const qualMap = new Map(s.qualifications.map((q) => [q.leadId, q]))
    const companyMap = new Map(s.companies.map((c) => [c.id, c]))

    const selectedLeads = s.leads.filter((lead) => {
      const company = companyMap.get(lead.companyId)
      if (!company) return false

      // Bloqueios de segurança
      if (company.doNotContact || lead.status === 'DO_NOT_CONTACT') return false

      // Filtro de Score
      const finalScore = qualMap.get(lead.id)?.finalScore ?? lead.score ?? 0
      if (finalScore < minScore) return false

      // Filtro de Oportunidade
      if (oppFilter !== 'ALL') {
        const q = qualMap.get(lead.id)
        if (q && q.qualification !== oppFilter) return false
      }

      // Filtro de Cidade / Nicho
      if (input.targetCity && company.city?.toLowerCase() !== input.targetCity.toLowerCase()) return false
      if (input.targetNiche && company.category?.toLowerCase() !== input.targetNiche.toLowerCase()) return false

      return true
    })

    const campaign: OutreachCampaign = {
      id: uid('ocamp'),
      workspaceId: s.workspaceId,
      name: input.name,
      description: input.description ?? null,
      status: 'READY',
      targetNiche: input.targetNiche ?? null,
      targetCity: input.targetCity ?? null,
      targetSegment: input.targetSegment ?? null,
      minScore,
      opportunityFilter: oppFilter,
      offerName: input.offerName || 'Website Profissional',
      offerDescription: input.offerDescription ?? null,
      offerPrice: input.offerPrice ?? null,
      channel: input.channel || 'MANUAL',
      requiresApproval: input.requiresApproval ?? true,
      autoFollowUpEnabled: input.autoFollowUpEnabled ?? true,
      maxContactsPerDay: 20,
      maxContactsPerHour: 5,
      stats: {
        selectedCount: selectedLeads.length,
        readyCount: 0,
        contactedCount: 0,
        repliedCount: 0,
        interestedCount: 0,
        wonCount: 0,
        optOutCount: 0,
      },
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
    }

    s.upsertOutreachCampaign(campaign)

    // Associa a campanha aos leads selecionados
    for (const lead of selectedLeads) {
      s.upsertLead({
        ...lead,
        campaignId: campaign.id,
        updatedAt: now,
      })

      s.pushOutreachActivity({
        id: uid('act'),
        workspaceId: s.workspaceId,
        leadId: lead.id,
        campaignId: campaign.id,
        type: 'LEAD_QUEUED',
        channel: campaign.channel,
        direction: 'INTERNAL',
        summary: `Lead adicionado à campanha "${campaign.name}"`,
        actor: 'Sistema',
        createdAt: now,
      })
    }

    logger.info('OUTREACH', `Campanha "${campaign.name}" criada com ${selectedLeads.length} leads selecionados.`)
    return campaign
  }

  /**
   * Gera mensagens personalizadas para os leads de uma campanha.
   */
  async generateCampaignMessages(campaignId: string): Promise<OutreachMessage[]> {
    const s = useApp.getState()
    const campaign = s.outreachCampaigns.find((c) => c.id === campaignId)
    if (!campaign) throw new Error(`Campanha ${campaignId} não encontrada.`)

    const campaignLeads = s.leads.filter((l) => l.campaignId === campaignId)
    const companyMap = new Map(s.companies.map((c) => [c.id, c]))
    const qualMap = new Map(s.qualifications.map((q) => [q.leadId, q]))

    const generatedMessages: OutreachMessage[] = []

    for (const lead of campaignLeads) {
      const company = companyMap.get(lead.companyId)
      if (!company || company.doNotContact || lead.status === 'DO_NOT_CONTACT') continue

      // Evita duplicadas
      const existing = s.outreachMessages.find(
        (m) => m.leadId === lead.id && m.campaignId === campaignId && m.type === 'INITIAL'
      )
      if (existing) {
        generatedMessages.push(existing)
        continue
      }

      const qual = qualMap.get(lead.id)
      const ctx = buildTemplateContext(company, lead, campaign.offerPrice)
      let body = renderTemplate('INITIAL', ctx)
      let generatedBy: 'AI' | 'TEMPLATE' = 'TEMPLATE'

      // Tenta personalização via IA se ativa
      const canUseAI = !company.isDemo && s.settings.aiMode !== 'DISABLED'
      if (canUseAI) {
        try {
          const { generateOpeningMessageAI } = await import('./salesAI')
          const msg = await generateOpeningMessageAI(company, s.settings.aiApiKey)
          if (msg) {
            body = msg.trim()
            generatedBy = 'AI'
          }
        } catch {
          /* Fallback para template determinístico */
        }
      }

      const now = nowIso()
      const msg: OutreachMessage = {
        id: uid('omsg'),
        workspaceId: s.workspaceId,
        campaignId: campaign.id,
        leadId: lead.id,
        channel: campaign.channel,
        type: 'INITIAL',
        body,
        status: campaign.requiresApproval ? 'PENDING_APPROVAL' : 'READY',
        generatedBy,
        aiProvider: generatedBy === 'AI' ? s.settings.aiProvider || 'openrouter' : null,
        aiModel: generatedBy === 'AI' ? s.settings.aiModel || 'openrouter/auto' : null,
        promptVersion: s.settings.promptVersion ?? 'outreach-v1',
        createdAt: now,
        updatedAt: now,
      }

      s.upsertOutreachMessage(msg)
      generatedMessages.push(msg)

      s.pushOutreachActivity({
        id: uid('act'),
        workspaceId: s.workspaceId,
        leadId: lead.id,
        campaignId: campaign.id,
        type: 'MESSAGE_GENERATED',
        channel: campaign.channel,
        direction: 'INTERNAL',
        summary: `Mensagem (${generatedBy}) gerada para ${company.name}`,
        actor: 'Sistema',
        createdAt: now,
      })
    }

    // Atualiza estatísticas da campanha
    s.upsertOutreachCampaign({
      ...campaign,
      status: 'RUNNING',
      startedAt: campaign.startedAt ?? nowIso(),
      updatedAt: nowIso(),
      stats: {
        ...campaign.stats,
        readyCount: generatedMessages.filter((m) => m.status === 'READY' || m.status === 'APPROVED').length,
      },
    })

    logger.info('OUTREACH', `Geradas ${generatedMessages.length} mensagens para a campanha "${campaign.name}".`)
    return generatedMessages
  }

  /**
   * Aprova uma mensagem em fila pendente.
   */
  approveMessage(messageId: string): void {
    const s = useApp.getState()
    const msg = s.outreachMessages.find((m) => m.id === messageId)
    if (!msg) return

    const now = nowIso()
    s.upsertOutreachMessage({
      ...msg,
      status: 'APPROVED',
      approvedAt: now,
      updatedAt: now,
    })

    const lead = s.leads.find((l) => l.id === msg.leadId)
    if (lead) {
      s.upsertLead({ ...lead, status: 'READY_TO_CONTACT', updatedAt: now })
    }

    s.pushOutreachActivity({
      id: uid('act'),
      workspaceId: s.workspaceId,
      leadId: msg.leadId,
      campaignId: msg.campaignId,
      type: 'MESSAGE_APPROVED',
      channel: msg.channel,
      direction: 'INTERNAL',
      summary: 'Mensagem de prospecção aprovada pelo operador',
      actor: s.currentUser.name,
      createdAt: now,
    })
  }

  /**
   * Registra a cópia da mensagem (não marca como enviado de verdade).
   */
  recordMessageCopied(leadId: string, messageId: string): void {
    const s = useApp.getState()
    const msg = s.outreachMessages.find((m) => m.id === messageId)
    const now = nowIso()

    if (msg) {
      s.upsertOutreachMessage({ ...msg, copiedAt: now, updatedAt: now })
    }

    s.pushOutreachActivity({
      id: uid('act'),
      workspaceId: s.workspaceId,
      leadId,
      campaignId: msg?.campaignId ?? null,
      type: 'MESSAGE_COPIED',
      channel: 'MANUAL',
      direction: 'INTERNAL',
      summary: 'Conteúdo da mensagem copiado para a área de transferência',
      actor: s.currentUser.name,
      createdAt: now,
    })
  }

  /**
   * Registra a abertura do WhatsApp no navegador.
   */
  recordWhatsappOpened(leadId: string, messageId?: string): void {
    const s = useApp.getState()
    const msg = messageId ? s.outreachMessages.find((m) => m.id === messageId) : null
    const now = nowIso()

    if (msg) {
      s.upsertOutreachMessage({ ...msg, whatsappOpenedAt: now, updatedAt: now })
    }

    s.pushOutreachActivity({
      id: uid('act'),
      workspaceId: s.workspaceId,
      leadId,
      campaignId: msg?.campaignId ?? null,
      type: 'WHATSAPP_OPENED',
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      summary: 'Link do WhatsApp aberto pelo operador',
      actor: s.currentUser.name,
      createdAt: now,
    })
  }

  /**
   * Confirmação EXPLICÍTA do operador de que o contato foi realizado.
   */
  recordManualContact(leadId: string, messageId: string, channel: OutreachChannel = 'MANUAL'): void {
    const s = useApp.getState()
    const msg = s.outreachMessages.find((m) => m.id === messageId)
    const lead = s.leads.find((l) => l.id === leadId)
    if (!lead) return

    const now = nowIso()

    if (msg) {
      s.upsertOutreachMessage({
        ...msg,
        status: 'SENT',
        sentAt: now,
        updatedAt: now,
      })
    }

    s.upsertLead({
      ...lead,
      status: 'CONTACTED',
      updatedAt: now,
    })

    s.pushOutreachActivity({
      id: uid('act'),
      workspaceId: s.workspaceId,
      leadId,
      campaignId: msg?.campaignId ?? lead.campaignId,
      type: 'MESSAGE_SENT',
      channel,
      direction: 'OUTBOUND',
      summary: `Contato confirmado via ${channel}`,
      detail: msg?.body ?? null,
      actor: s.currentUser.name,
      createdAt: now,
    })

    // Agenda o próximo follow-up automático
    const followEngine = new FollowUpEngineService()
    followEngine.scheduleNextFollowUp(leadId, msg?.type ?? 'INITIAL')

    logger.info('OUTREACH', `Contato confirmado para o lead ${leadId} via ${channel}.`)
  }

  /**
   * Dispara a mensagem automaticamente via API do WhatsApp e registra.
   */
  async dispatchMessageAutomatic(messageId: string): Promise<{ ok: boolean; error?: string }> {
    const s = useApp.getState()
    const msg = s.outreachMessages.find((m) => m.id === messageId)
    if (!msg) return { ok: false, error: 'Mensagem não encontrada.' }

    const lead = s.leads.find((l) => l.id === msg.leadId)
    const company = lead ? s.companies.find((c) => c.id === lead.companyId) : null
    
    if (!company) return { ok: false, error: 'Empresa não encontrada.' }

    // Aprova automaticamente se estiver pendente
    if (msg.status === 'PENDING_APPROVAL') {
      this.approveMessage(msg.id)
    }

    const phone = company.phone?.replace(/\D/g, '')
    if (!phone) {
      return { ok: false, error: 'Sem telefone cadastrado.' }
    }

    // Se for ambiente de demonstração, simula sucesso
    if (company.isDemo) {
      this.recordManualContact(msg.leadId, msg.id, msg.channel)
      return { ok: true }
    }

    // Chama API
    const res = await sendWhatsApp(phone, msg.body)
    if (res.ok) {
      this.recordManualContact(msg.leadId, msg.id, msg.channel)
      return { ok: true }
    }
    
    return { ok: false, error: res.error || 'Falha na API do WhatsApp.' }
  }
}

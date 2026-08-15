import { useApp } from './store'
import { uid, nowIso } from '../lib/utils'
import { logger } from '../lib/logger'
import { tierFromScore } from '../config/defaults'
import { requestAIQualification } from '../integrations/ai/qualification'
import type {
  Company,
  Lead,
  LeadQualification,
  QualificationLevel,
  QualificationMethod,
  OpportunityType,
  RecommendedService,
  LeadEvidence,
  WebsiteScan,
} from '../types'

export interface QualifyLeadOptions {
  forceReanalysis?: boolean
  aiModeOverride?: 'DISABLED' | 'OPTIONAL' | 'REQUIRED'
}

export interface QualifyCampaignProgress {
  processed: number
  total: number
  highCount: number
  mediumCount: number
  lowCount: number
  unverifiedCount: number
  errors: number
  aiCount: number
  ruleCount: number
  percent: number
  currentLeadName?: string
}

export interface QualifyCampaignOptions {
  forceReanalysis?: boolean
  concurrency?: number
  onProgress?: (prog: QualifyCampaignProgress) => void
}

/**
 * Gera um hash determinístico do estado do lead para evitar chamadas de IA desnecessárias.
 */
export function qualificationInputHash(company: Company, lead: Lead, scan: WebsiteScan | null): string {
  const raw = [
    company.id,
    company.name,
    company.website ?? '',
    company.phone ?? '',
    company.dataStatus ?? '',
    company.sourceType ?? '',
    company.websiteQualityScore ?? '',
    scan?.exists ? `1_${scan.status}` : '0',
    lead.websiteStatus ?? '',
    lead.hasWhatsapp ? '1' : '0',
    lead.hasInstagram ? '1' : '0',
  ].join('|')

  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  return `qhash_${Math.abs(hash).toString(36)}`
}

/**
 * Calcula qualificação baseada estritamente em regras determinísticas (sem IA).
 */
export function computeRuleBasedQualification(
  company: Company,
  lead: Lead,
  scan: WebsiteScan | null
): {
  score: number
  opportunityTypes: OpportunityType[]
  positiveSignals: string[]
  negativeSignals: string[]
  evidence: LeadEvidence[]
  opportunityReasons: string[]
  recommendedService: RecommendedService
  recommendedApproach: string
  nextAction: string
} {
  const positiveSignals: string[] = []
  const negativeSignals: string[] = []
  const evidence: LeadEvidence[] = []
  const opportunityReasons: string[] = []
  const opportunityTypes: OpportunityType[] = []

  let score = 50

  // 1. Análise de Website
  const hasWebsite = Boolean(company.website && company.website.trim().length > 0)
  if (!hasWebsite) {
    score += 25
    opportunityTypes.push('NO_WEBSITE_IDENTIFIED')
    opportunityReasons.push('Não identificamos um site oficial registrado nas fontes públicas consultadas')
    evidence.push({
      signal: 'Ausência de site registrado',
      source: company.sourceType ?? 'Fonte pública',
      value: 'Nenhum website oficial informado',
      impact: 'positive',
      confidence: 0.85,
    })
    positiveSignals.push('Oportunidade alta para desenvolvimento de website institucional ou landing page')
  } else if (scan) {
    if (!scan.loadable || scan.status === 404 || scan.status === 500) {
      score += 20
      opportunityTypes.push('LOW_QUALITY_WEBSITE')
      opportunityReasons.push(`Website registrado encontra-se inacessível ou com erro (HTTP ${scan.status ?? 'Falha'})`)
      evidence.push({
        signal: 'Website inacessível',
        source: 'Scanner HTTP',
        value: `HTTP Status ${scan.status ?? 'Inacessível'}`,
        impact: 'positive',
        confidence: 0.95,
      })
      positiveSignals.push('Oportunidade para reativação e redesign de website')
    } else {
      if (!scan.https) {
        score += 10
        opportunityTypes.push('LOW_QUALITY_WEBSITE')
        opportunityReasons.push('Website não possui certificado de segurança HTTPS ativo')
        evidence.push({
          signal: 'Ausência de HTTPS',
          source: 'Scanner SSL',
          value: 'HTTP inseguro',
          impact: 'positive',
          confidence: 0.9,
        })
      }
      if (scan.mobileFriendly === false) {
        score += 15
        opportunityTypes.push('MOBILE_ISSUE')
        opportunityReasons.push('Website apresenta problemas de adaptação para dispositivos móveis')
        evidence.push({
          signal: 'Incompatível com mobile',
          source: 'Scanner Viewport',
          value: 'Sem viewport mobile responsivo',
          impact: 'positive',
          confidence: 0.85,
        })
      }
      if (scan.outdatedSignals > 0) {
        score += 10
        opportunityTypes.push('OUTDATED_WEBSITE')
        opportunityReasons.push('Website apresenta sinais de desatualização ou abandono')
        evidence.push({
          signal: 'Design/Código legado',
          source: 'Scanner de Conteúdo',
          value: `${scan.outdatedSignals} sinal(is) de desatualização`,
          impact: 'positive',
          confidence: 0.8,
        })
      }
    }
  }

  // 2. Análise de Contatabilidade & Presença
  if (company.phone) {
    score += 10
    evidence.push({
      signal: 'Telefone comercial disponível',
      source: 'Cadastro comercial',
      value: company.phone,
      impact: 'positive',
      confidence: 0.95,
    })
    positiveSignals.push('Contato telefônico direto disponível para abordagem')
  } else {
    score -= 15
    negativeSignals.push('Telefone de contato não informado nas fontes')
  }

  if (company.instagram || company.facebook) {
    score += 10
    evidence.push({
      signal: 'Presença em redes sociais',
      source: 'Redes Sociais',
      value: [company.instagram && 'Instagram', company.facebook && 'Facebook'].filter(Boolean).join(', '),
      impact: 'positive',
      confidence: 0.9,
    })
    positiveSignals.push('Possui redes sociais ativas (potencial interesse em presença digital)')
  } else {
    opportunityTypes.push('WEAK_DIGITAL_PRESENCE')
  }

  // Clampar score entre 0 e 100
  score = Math.min(100, Math.max(0, score))

  // Recomendação de serviço
  let recommendedService: RecommendedService = 'UNKNOWN'
  if (!hasWebsite) {
    recommendedService = 'WEBSITE_INSTITUTIONAL'
  } else if (scan && (!scan.loadable || (company.websiteQualityScore !== null && company.websiteQualityScore !== undefined && company.websiteQualityScore < 50))) {
    recommendedService = 'WEBSITE_REDESIGN'
  } else if (scan && scan.mobileFriendly === false) {
    recommendedService = 'LANDING_PAGE'
  } else {
    recommendedService = 'LOCAL_SEO'
  }

  const recommendedApproach = !hasWebsite
    ? `Durante nossa análise de mercado em ${company.city ?? 'sua região'}, não identificamos um site oficial registrado para a ${company.name}. Apresentar solução de presença digital centralizada.`
    : `Analisamos a estrutura digital da ${company.name} e identificamos pontos de melhoria na experiência mobile e conversão.`

  const nextAction = 'Preparar rascunho de apresentação comercial personalizada (Fase 4)'

  return {
    score,
    opportunityTypes: opportunityTypes.length > 0 ? opportunityTypes : ['UNKNOWN'],
    positiveSignals,
    negativeSignals,
    evidence,
    opportunityReasons: opportunityReasons.length > 0 ? opportunityReasons : ['Empresa em operação comercial ativa'],
    recommendedService,
    recommendedApproach,
    nextAction,
  }
}

export class QualificationService {
  async qualifyLead(leadId: string, opts: QualifyLeadOptions = {}): Promise<LeadQualification> {
    const s = useApp.getState()
    const lead = s.leads.find((l) => l.id === leadId)
    if (!lead) {
      throw new Error(`Lead ${leadId} não encontrado.`)
    }

    const company = s.companies.find((c) => c.id === lead.companyId)
    if (!company) {
      throw new Error(`Empresa vinculada ao lead ${leadId} não encontrada.`)
    }

    const scan = lead.websiteScan ?? null
    const inputHash = qualificationInputHash(company, lead, scan)

    // 1. Verificação de Cache
    if (!opts.forceReanalysis && s.settings.cacheEnabled !== false) {
      const existing = s.qualifications.find((q) => q.leadId === leadId && q.inputHash === inputHash)
      if (existing) {
        logger.info('QUALIFICATION', `Reutilizando qualificação em cache para ${company.name} (${existing.id})`)
        return existing
      }
    }

    // 2. Pontuação Baseada em Regras (Rule-Based)
    const ruleResult = computeRuleBasedQualification(company, lead, scan)

    let aiScore: number | null = null
    let finalScore = ruleResult.score
    let method: QualificationMethod = company.isDemo ? 'DEMO' : 'RULE_BASED'

    let positiveSignals = [...ruleResult.positiveSignals]
    let negativeSignals = [...ruleResult.negativeSignals]
    let evidence = [...ruleResult.evidence]
    let opportunityReasons = [...ruleResult.opportunityReasons]
    let opportunityTypes = [...ruleResult.opportunityTypes]
    let recommendedService = ruleResult.recommendedService
    let recommendedApproach = ruleResult.recommendedApproach
    let nextAction = ruleResult.nextAction
    let summary: string | undefined
    let websiteAssessment: string | undefined

    let aiProviderName: string | null = null
    let aiModelName: string | null = null
    let promptVersion: string | null = s.settings.promptVersion ?? 'qualification-v1'

    // 3. Verificação de IA
    const aiMode = opts.aiModeOverride ?? s.settings.aiMode ?? 'OPTIONAL'
    const hasApiKey = Boolean(s.settings.aiApiKey && s.settings.aiApiKey.trim().length > 0)
    const canUseAI = !company.isDemo && aiMode !== 'DISABLED' && (aiMode === 'REQUIRED' || hasApiKey)

    if (canUseAI) {
      try {
        const aiResponse = await requestAIQualification(
          {
            company: {
              name: company.name,
              category: company.category,
              city: company.city,
              state: company.state,
              address: company.address,
              phone: company.phone,
              website: company.website ?? null,
              instagram: company.instagram ?? null,
              facebook: company.facebook ?? null,
              rating: company.rating ?? null,
              reviewCount: company.reviewCount ?? null,
              dataStatus: company.dataStatus ?? 'REAL',
              sourceType: company.sourceType ?? 'openstreetmap',
              sourceUrl: company.sourceUrl ?? null,
            },
            websiteScan: scan
              ? {
                  exists: scan.exists,
                  status: scan.status,
                  https: scan.https,
                  title: scan.title,
                  description: scan.description,
                  mobileFriendly: scan.mobileFriendly,
                  loadable: scan.loadable,
                  outdatedSignals: scan.outdatedSignals,
                }
              : null,
            websiteQualityScore: company.websiteQualityScore ?? null,
            ruleBasedScore: ruleResult.score,
            opportunityReasons: ruleResult.opportunityReasons,
            discoveryConfidence: company.discoveryConfidence ?? null,
            confidenceReasons: company.confidenceReasons ?? [],
          },
          s.settings.aiApiKey
        )

        if (aiResponse) {
          aiScore = aiResponse.aiScore
          // Fórmula ponderada: 70% Regras Objetivas + 30% Análise IA
          finalScore = Math.round(0.7 * ruleResult.score + 0.3 * aiScore)
          method = 'AI'
          aiProviderName = s.settings.aiProvider || 'openrouter'
          aiModelName = s.settings.aiModel || 'openrouter/auto'

          summary = aiResponse.summary
          websiteAssessment = aiResponse.websiteAssessment
          recommendedService = aiResponse.recommendedService
          recommendedApproach = aiResponse.recommendedApproach
          nextAction = aiResponse.nextAction

          if (aiResponse.positiveSignals.length > 0) positiveSignals = aiResponse.positiveSignals
          if (aiResponse.negativeSignals.length > 0) negativeSignals = aiResponse.negativeSignals
          if (aiResponse.evidence.length > 0) evidence = [...evidence, ...aiResponse.evidence]
          if (aiResponse.opportunityReasons.length > 0) opportunityReasons = aiResponse.opportunityReasons
          if (aiResponse.opportunityTypes.length > 0) opportunityTypes = aiResponse.opportunityTypes
        } else if (aiMode === 'REQUIRED') {
          method = 'RULE_BASED_FALLBACK'
        }
      } catch (e) {
        logger.warn('QUALIFICATION', `IA falhou para lead ${leadId}, aplicando fallback Rule-Based: ${String(e)}`)
        method = 'RULE_BASED_FALLBACK'
      }
    }

    // 4. Determinação do Nível de Qualificação
    let qualificationLevel: QualificationLevel = 'UNVERIFIED'
    if (!company.phone && !company.website && company.verificationStatus === 'UNVERIFIED') {
      qualificationLevel = 'UNVERIFIED'
    } else if (finalScore >= 80) {
      qualificationLevel = 'HIGH'
    } else if (finalScore >= 60) {
      qualificationLevel = 'MEDIUM'
    } else {
      qualificationLevel = 'LOW'
    }

    const confidence = company.dataStatus === 'REAL' && company.discoveryConfidence === 'HIGH' ? 0.9 : 0.75

    // 5. Criação do Registro de Qualificação
    const now = nowIso()
    const qual: LeadQualification = {
      id: uid('lq'),
      workspaceId: s.workspaceId,
      companyId: company.id,
      leadId: lead.id,
      campaignId: lead.campaignId,

      ruleBasedScore: ruleResult.score,
      aiScore,
      finalScore,

      qualification: qualificationLevel,
      confidence,

      qualificationMethod: method,

      opportunityTypes,

      positiveSignals,
      negativeSignals,
      evidence,
      opportunityReasons,

      recommendedService,
      recommendedApproach,
      nextAction,

      summary,
      websiteAssessment,

      aiProvider: aiProviderName,
      aiModel: aiModelName,
      promptVersion,
      inputHash,

      status: 'COMPLETED',
      createdAt: now,
      updatedAt: now,
    }

    // 6. Atualização da Store
    s.upsertQualification(qual)

    // Atualiza Lead correspondente
    const updatedLead: Lead = {
      ...lead,
      status: 'QUALIFIED',
      score: finalScore,
      tier: tierFromScore(finalScore),
      updatedAt: now,
    }
    s.upsertLead(updatedLead)

    logger.info('QUALIFICATION', `Lead ${lead.id} (${company.name}) qualificado: ${qualificationLevel} (Score: ${finalScore}, Método: ${method})`)
    return qual
  }

  async qualifyCampaign(campaignId: string, opts: QualifyCampaignOptions = {}): Promise<LeadQualification[]> {
    const s = useApp.getState()
    const campaignLeads = s.leads.filter((l) => l.campaignId === campaignId)
    const total = campaignLeads.length
    if (total === 0) return []

    const concurrency = Math.min(3, Math.max(1, opts.concurrency ?? 2))
    const results: LeadQualification[] = []

    let processed = 0
    let highCount = 0
    let mediumCount = 0
    let lowCount = 0
    let unverifiedCount = 0
    let errors = 0
    let aiCount = 0
    let ruleCount = 0

    const updateProg = (leadName?: string) => {
      if (opts.onProgress) {
        opts.onProgress({
          processed,
          total,
          highCount,
          mediumCount,
          lowCount,
          unverifiedCount,
          errors,
          aiCount,
          ruleCount,
          percent: Math.round((processed / total) * 100),
          currentLeadName: leadName,
        })
      }
    }

    for (let i = 0; i < campaignLeads.length; i += concurrency) {
      const batch = campaignLeads.slice(i, i + concurrency)
      await Promise.all(
        batch.map(async (lead) => {
          const company = s.companies.find((c) => c.id === lead.companyId)
          try {
            const q = await this.qualifyLead(lead.id, { forceReanalysis: opts.forceReanalysis })
            results.push(q)
            if (q.qualification === 'HIGH') highCount++
            else if (q.qualification === 'MEDIUM') mediumCount++
            else if (q.qualification === 'LOW') lowCount++
            else unverifiedCount++

            if (q.qualificationMethod === 'AI') aiCount++
            else ruleCount++
          } catch (e) {
            errors++
            logger.error('QUALIFICATION', `Falha ao qualificar lead ${lead.id}`, String(e))
          } finally {
            processed++
            updateProg(company?.name)
          }
        })
      )
    }

    logger.info('QUALIFICATION', `Campanha ${campaignId} qualificada: ${results.length}/${total} processados. High: ${highCount}, Med: ${mediumCount}, Low: ${lowCount}`)
    return results
  }
}

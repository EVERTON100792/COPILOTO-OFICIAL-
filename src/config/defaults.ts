import type { ScoreWeights, GlobalSettings, LeadTier, LeadStatus, DataStatus } from '../types'

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  noWebsite: 30,
  poorWebsite: 20,
  greatWebsite: 0,
  manyReviews: 10,
  goodRating: 10,
  instagramActive: 10,
  facebookActive: 5,
  hasWhatsapp: 10,
  hasPhone: 5,
  activeBusiness: 5,
  incompleteData: -1,
}

export const DEFAULT_SETTINGS: GlobalSettings = {
  demoMode: (import.meta.env.VITE_DEMO_MODE ?? 'true') === 'true',
  masterSwitch: 'ON',
  scoreWeights: DEFAULT_SCORE_WEIGHTS,
  dailyContactLimit: 20,
  hourlyContactLimit: 5,
  campaignLimit: 100,
  cooldownDays: 3,
  followupIntervalDays: [3, 7],
  followupMax: 3,
  companyName: 'Prospex Studio',
  aiProvider: 'opencode',
  language: 'pt-BR',
  dataRetentionDays: 365,
  cacheHours: 24,
  discoveryMode: 'DEMO',
  dataFreshnessDays: 30,
  aiMode: 'OPTIONAL',
  aiModel: (import.meta.env.VITE_AI_MODEL as string | undefined) || 'deepseek-v4-pro',
  aiApiKey: (import.meta.env.VITE_AI_API_KEY as string | undefined) || 'sk-Ij7Pnh4rZAO5LowBUVQuQxMCDD6dRotijpprSQ189yJkGtaBGqgqmuqgjwPw7D2L',
  aiBaseUrl: (import.meta.env.VITE_AI_BASE_URL as string | undefined) || 'https://opencode.ai/zen/go/v1',

  aiMaxCalls: 100,
  aiMaxConcurrency: 2,
  promptVersion: 'qualification-v1',
  cacheEnabled: true,
}

export const DATA_STATUS_LABELS: Record<DataStatus, { label: string; icon: string }> = {
  REAL: { label: 'Real', icon: '🟢' },
  DEMO: { label: 'Demo', icon: '🔵' },
  IMPORTED: { label: 'Importado', icon: '🟣' },
  MANUAL: { label: 'Manual', icon: '⚪' },
  UNVERIFIED: { label: 'Não verificado', icon: '🟡' },
}

export const TIER_RULES: { min: number; max: number; tier: LeadTier; label: string; color: string }[] = [
  { min: 90, max: 100, tier: 'HOT', label: 'Quente', color: 'var(--danger)' },
  { min: 75, max: 89, tier: 'HIGH', label: 'Alto', color: 'var(--warning)' },
  { min: 60, max: 74, tier: 'MEDIUM', label: 'Médio', color: 'var(--info)' },
  { min: 40, max: 59, tier: 'LOW', label: 'Baixo', color: 'var(--muted)' },
  { min: 0, max: 39, tier: 'VERY_LOW', label: 'Muito baixo', color: 'var(--muted-2)' },
]

export function tierFromScore(score: number): LeadTier {
  for (const r of TIER_RULES) {
    if (score >= r.min && score <= r.max) return r.tier
  }
  return 'VERY_LOW'
}

export function tierLabel(tier: LeadTier | null): string {
  if (!tier) return '—'
  return TIER_RULES.find((r) => r.tier === tier)?.label ?? tier
}

export function tierColor(tier: LeadTier | null): string {
  if (!tier) return 'var(--muted-2)'
  return TIER_RULES.find((r) => r.tier === tier)?.color ?? 'var(--muted-2)'
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Novo',
  QUALIFIED: 'Qualificado',
  READY_TO_CONTACT: 'Pronto para contato',
  CONTACTED: 'Contatado',
  REPLIED: 'Respondeu',
  INTERESTED: 'Interessado',
  NEGOTIATION: 'Negociação',
  PROPOSAL_SENT: 'Proposta enviada',
  WON: 'Fechado (Won)',
  LOST: 'Perdido',
  NO_RESPONSE: 'Sem resposta',
  DO_NOT_CONTACT: 'Não contatar',
}

export function statusLabel(st: string): string {
  return LEAD_STATUS_LABELS[st as LeadStatus] ?? st
}

export const PIPELINE_ORDER: LeadStatus[] = [
  'NEW',
  'QUALIFIED',
  'READY_TO_CONTACT',
  'CONTACTED',
  'REPLIED',
  'INTERESTED',
  'NEGOTIATION',
  'PROPOSAL_SENT',
  'WON',
  'LOST',
  'NO_RESPONSE',
  'DO_NOT_CONTACT',
]

export const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW: 'var(--info)',
  QUALIFIED: 'var(--violet)',
  READY_TO_CONTACT: 'var(--primary)',
  CONTACTED: 'var(--secondary)',
  REPLIED: 'var(--success)',
  INTERESTED: 'var(--success)',
  NEGOTIATION: 'var(--pink)',
  PROPOSAL_SENT: 'var(--warning)',
  WON: 'var(--success)',
  LOST: 'var(--danger)',
  NO_RESPONSE: 'var(--muted)',
  DO_NOT_CONTACT: 'var(--danger)',
}

export const WEBSITE_STATUS_LABELS: Record<string, string> = {
  NO_WEBSITE: 'Sem site',
  WEBSITE_FOUND: 'Site encontrado',
  WEBSITE_UNVERIFIED: 'Site não verificado',
  WEBSITE_BROKEN: 'Site fora do ar',
  WEBSITE_OUTDATED: 'Site desatualizado',
  WEBSITE_POOR_MOBILE: 'Site ruim no mobile',
  WEBSITE_UNKNOWN: 'Desconhecido',
}

export const WEBSITE_STATUS_COLORS: Record<string, string> = {
  NO_WEBSITE: 'var(--danger)',
  WEBSITE_FOUND: 'var(--success)',
  WEBSITE_UNVERIFIED: 'var(--muted-2)',
  WEBSITE_BROKEN: 'var(--danger)',
  WEBSITE_OUTDATED: 'var(--warning)',
  WEBSITE_POOR_MOBILE: 'var(--warning)',
  WEBSITE_UNKNOWN: 'var(--muted)',
}

export const STATES_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const CITIES_BY_STATE: Record<string, string[]> = {
  AC: ['Rio Branco'],
  AL: ['Maceió', 'Arapiraca'],
  AM: ['Manaus', 'Parintins'],
  AP: ['Macapá'],
  BA: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Ilhéus', 'Barreiras'],
  CE: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Sobral'],
  DF: ['Brasília', 'Águas Claras', 'Taguatinga', 'Ceilândia', 'Planaltina'],
  ES: ['Vitória', 'Vila Velha', 'Serra'],
  GO: ['Goiânia', 'Anápolis', 'Aparecida de Goiânia', 'Rio Verde', 'Luziânia'],
  MA: ['São Luís', 'Imperatriz'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Juiz de Fora', 'Montes Claros', 'Governador Valadares', 'Divinópolis', 'Ipatinga'],
  MS: ['Campo Grande', 'Dourados'],
  MT: ['Cuiabá', 'Várzea Grande'],
  PA: ['Belém', 'Ananindeua'],
  PB: ['João Pessoa', 'Campina Grande'],
  PE: ['Recife', 'Olinda', 'Caruaru', 'Petrolina', 'Jaboatão dos Guararapes'],
  PI: ['Teresina', 'Parnaíba'],
  PR: ['Londrina', 'Maringá', 'Curitiba', 'Ponta Grossa', 'Cascavel', 'Foz do Iguaçu', 'Lapa', 'Paranavaí', 'Rolândia', 'Ibiporã', 'Arapongas', 'Apucarana', 'Umuarama', 'Campo Mourão', 'Guarapuava', 'Telêmaco Borba', 'Palotina'],
  RJ: ['Rio de Janeiro', 'Niterói', 'Petrópolis', 'Nova Iguaçu', 'Duque de Caxias', 'Campos dos Goytacazes', 'Teresópolis'],
  RN: ['Natal', 'Mossoró'],
  RO: ['Porto Velho'],
  RR: ['Boa Vista'],
  RS: ['Porto Alegre', 'Canoas', 'Caxias do Sul', 'Pelotas', 'Santa Maria', 'Novo Hamburgo'],
  SC: ['Florianópolis', 'Joinville', 'Blumenau', 'Chapecó', 'Criciúma', 'Itajaí'],
  SE: ['Aracaju', 'Nossa Senhora do Socorro'],
  SP: ['São Paulo', 'Campinas', 'Santos', 'São José dos Campos', 'Ribeirão Preto', 'São José do Rio Preto', 'Sorocaba', 'Presidente Prudente', 'Bauru', 'Mogi das Cruzes', 'Jundiaí', 'Piracicaba'],
  TO: ['Palmas', 'Araguaína'],
}

export const NICHES: string[] = [
  'Odontologia',
  'Restaurantes',
  'Academias',
  'Escolas',
  'Clínicas de saúde',
  'Imobiliárias',
  'Salões de beleza',
  'Barbearias',
  'Oficinas mecânicas',
  'Advogados',
  'Contadores',
  'Hotéis e pousadas',
  'Lojas de varejo',
  'Estética e beleza',
  'Fotografia',
  'Pet shops',
  'Construtoras',
  'Mercados',
  'Farmácias',
  'Consultorias',
  'Igrejas',
  'Padarias',
]
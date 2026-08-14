import type { DealStatus, CommercialMemory, ConversationStateOutput } from '../types'

export interface ClosingGuardMetrics {
  closingGuardTriggered: boolean
  closingGuardReason?: string
  falseClosePrevented: boolean
  finalDealStatus: DealStatus
}

export function validateDealState(
  proposedStatus: DealStatus | undefined,
  explicitCloseConfirmation: boolean | undefined,
  closureEvidence: string[] | undefined,
  commercialMemory: CommercialMemory | undefined,
  lastClientMessage: string
): ClosingGuardMetrics {
  
  let finalStatus = proposedStatus || 'discovery'
  const metrics: ClosingGuardMetrics = {
    closingGuardTriggered: false,
    falseClosePrevented: false,
    finalDealStatus: finalStatus
  }

  const msgLower = lastClientMessage.toLowerCase()

  // 1. Prevent false closing: if proposedStatus is closed/closed_pending_action but there's no explicit confirmation
  if (finalStatus === 'closed' || finalStatus === 'closed_pending_action') {
    if (!explicitCloseConfirmation) {
      metrics.closingGuardTriggered = true
      metrics.falseClosePrevented = true
      metrics.closingGuardReason = 'Fechamento impedido: Ausência de confirmação explícita.'
      finalStatus = 'negotiation' // Downgrade seguro
    } else if (!closureEvidence || closureEvidence.length === 0) {
      metrics.closingGuardTriggered = true
      metrics.falseClosePrevented = true
      metrics.closingGuardReason = 'Fechamento impedido: Confirmação sem evidência de texto (closureEvidence vazia).'
      finalStatus = 'negotiation' // Downgrade seguro
    }
  }

  metrics.finalDealStatus = finalStatus

  return metrics
}

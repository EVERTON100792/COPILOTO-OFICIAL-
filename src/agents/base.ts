import { logger } from '../lib/logger'
import { sleep } from '../lib/retry'
import { nowIso, uid } from '../lib/utils'
import { useApp } from '../services/store'
import type { AgentRun } from '../types'
import type { AgentContext, AgentResult } from './types'

export interface AgentOptions {
  maxRetries?: number
  baseDelayMs?: number
}

export abstract class BaseAgent {
  abstract readonly name: string
  abstract readonly description: string
  protected opts: AgentOptions

  constructor(opts: AgentOptions = {}) {
    this.opts = { maxRetries: 3, baseDelayMs: 600, ...opts }
  }

  protected abstract runCore(input: Record<string, unknown>, ctx: AgentContext): Promise<unknown>

  async execute(input: Record<string, unknown>, ctx: AgentContext = {} as AgentContext): Promise<AgentResult> {
    const startedAt = nowIso()
    const startedMs = Date.now()
    const runId = uid('run')
    let run: AgentRun = {
      id: runId,
      runId,
      agent: this.name,
      status: 'QUEUED',
      input,
      output: null,
      error: null,
      durationMs: 0,
      retries: 0,
      startedAt,
      finishedAt: null,
    }
    useApp.getState().pushAgentRun(run)
    logger.info(this.name, `${this.description} iniciado`, JSON.stringify(input).slice(0, 300))

    let retries = 0
    try {
      for (let attempt = 0; attempt <= this.opts.maxRetries!; attempt++) {
        if (attempt > 0) {
          retries = attempt
          run.status = 'RETRYING'
          useApp.getState().patchAgentRun(run.id, { status: 'RETRYING' })
          logger.warn(this.name, `Tentativa ${attempt} após erro`)
          await sleep(this.opts.baseDelayMs! * 2 ** (attempt - 1))
        }
        try {
          const output = await this.runCore(input, ctx)
          run = {
            ...run,
            status: 'SUCCESS',
            output: output as Record<string, unknown>,
            durationMs: Date.now() - startedMs,
            finishedAt: nowIso(),
            retries,
          }
          useApp.getState().patchAgentRun(run.id, run)
          logger.info(this.name, 'concluído', `dur ${run.durationMs}ms`)
          return { status: 'SUCCESS', output, error: null, durationMs: run.durationMs, retries }
        } catch (e) {
          if (attempt === this.opts.maxRetries!) {
            throw e
          }
        }
      }
      throw new Error('Falha inesperada')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      run = {
        ...run,
        status: 'FAILED',
        error: msg,
        durationMs: Date.now() - startedMs,
        finishedAt: nowIso(),
        retries,
      }
      useApp.getState().patchAgentRun(run.id, run)
      logger.error(this.name, 'falhou', msg)
      return { status: 'FAILED', output: null, error: msg, durationMs: run.durationMs, retries }
    }
  }
}
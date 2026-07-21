import { describe, expect, it, vi } from 'vitest'

import type { KnowledgeGateway } from '../../domain/gateways'
import type { UiKnowledgeIngestionJob } from '../../domain/models'
import { asUiOpaqueId } from '../../domain/models'
import { KnowledgePollingTimeoutError, pollKnowledgeIngestion } from './knowledge-polling'

const jobId = asUiOpaqueId<'knowledge-ingestion-job'>('job_knowledge_12345678')
const sourceId = asUiOpaqueId<'knowledge-source'>('source_knowledge_12345678')

const createJob = (status: UiKnowledgeIngestionJob['status']): UiKnowledgeIngestionJob => ({
  id: jobId,
  sourceId,
  status,
  progressPercent: status === 'succeeded' ? 100 : 0,
  errorCode: status === 'failed' ? 'knowledge.ingestion_failed' : null,
  errorDetail: null
})

describe('pollKnowledgeIngestion', () => {
  it('polls queued and running jobs until success', async () => {
    const jobs = [createJob('queued'), createJob('running'), createJob('succeeded')]
    const gateway = {
      getKnowledgeIngestionJob: vi
        .fn<KnowledgeGateway['getKnowledgeIngestionJob']>()
        .mockImplementation(() => Promise.resolve(jobs.shift()!))
    }
    const wait = vi.fn((): Promise<void> => Promise.resolve())

    await expect(
      pollKnowledgeIngestion({ gateway, jobId, maxAttempts: 3, wait })
    ).resolves.toMatchObject({ status: 'succeeded' })
    expect(gateway.getKnowledgeIngestionJob).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledTimes(2)
  })

  it('returns a failed terminal job without another wait', async () => {
    const gateway = {
      getKnowledgeIngestionJob: vi
        .fn<KnowledgeGateway['getKnowledgeIngestionJob']>()
        .mockResolvedValue(createJob('failed'))
    }
    const wait = vi.fn((): Promise<void> => Promise.resolve())

    await expect(pollKnowledgeIngestion({ gateway, jobId, wait })).resolves.toMatchObject({
      status: 'failed'
    })
    expect(wait).not.toHaveBeenCalled()
  })

  it('throws a named timeout after the maximum number of attempts', async () => {
    const gateway = {
      getKnowledgeIngestionJob: vi
        .fn<KnowledgeGateway['getKnowledgeIngestionJob']>()
        .mockResolvedValue(createJob('running'))
    }

    await expect(
      pollKnowledgeIngestion({
        gateway,
        jobId,
        maxAttempts: 2,
        wait: (): Promise<void> => Promise.resolve()
      })
    ).rejects.toBeInstanceOf(KnowledgePollingTimeoutError)
    expect(gateway.getKnowledgeIngestionJob).toHaveBeenCalledTimes(2)
  })

  it('aborts before issuing the next request', async () => {
    const controller = new AbortController()
    const gateway = {
      getKnowledgeIngestionJob: vi
        .fn<KnowledgeGateway['getKnowledgeIngestionJob']>()
        .mockResolvedValue(createJob('queued'))
    }

    await expect(
      pollKnowledgeIngestion({
        gateway,
        jobId,
        signal: controller.signal,
        wait: (): Promise<void> => {
          controller.abort()
          return Promise.resolve()
        }
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(gateway.getKnowledgeIngestionJob).toHaveBeenCalledTimes(1)
  })

  it('removes the default wait abort listener after cancellation', async () => {
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    const gateway = {
      getKnowledgeIngestionJob: vi
        .fn<KnowledgeGateway['getKnowledgeIngestionJob']>()
        .mockResolvedValue(createJob('queued'))
    }

    const polling = pollKnowledgeIngestion({ gateway, jobId, signal: controller.signal })
    await Promise.resolve()
    controller.abort()

    await expect(polling).rejects.toMatchObject({ name: 'AbortError' })
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})

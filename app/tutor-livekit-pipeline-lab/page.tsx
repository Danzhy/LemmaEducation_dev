'use client'

import { useEffect, useMemo, useState } from 'react'
import TutorWorkspace from '@/components/tutor/TutorWorkspace'
import { useLiveKitTutor } from '@/hooks/useLiveKitTutor'

type PipelineModelOption = {
  id: string
  label: string
  shortLabel: string
  provider: string
  model: string
  description: string
  configured: boolean
  missing: string[]
  experimental?: boolean
}

const DEFAULT_MODEL_ID = 'openai-gpt-5-4'

function providerLabel(provider: string) {
  if (provider === 'openai_responses') return 'OpenAI Responses'
  if (provider === 'openai_chat') return 'OpenAI Chat'
  if (provider === 'openrouter_compatible') return 'OpenRouter'
  if (provider === 'groq_compatible') return 'Groq'
  return provider
}

export default function TutorLiveKitPipelineLabPage() {
  const [error, setError] = useState<string | null>(null)
  const [modelOptions, setModelOptions] = useState<PipelineModelOption[]>([])
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID)
  const [modelConfigError, setModelConfigError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadModels() {
      try {
        const response = await fetch('/api/livekit-pipeline/models', { cache: 'no-store' })
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean
          models?: PipelineModelOption[]
          message?: string
        }

        if (!response.ok || !data.ok || !Array.isArray(data.models)) {
          throw new Error(data.message || 'Could not load pipeline model options.')
        }

        const models = data.models

        if (cancelled) return
        setModelOptions(models)
        const configuredDefault = models.find((model) => model.id === DEFAULT_MODEL_ID && model.configured)
        const firstConfigured = models.find((model) => model.configured)
        setSelectedModelId((current) => {
          if (models.some((model) => model.id === current && model.configured)) return current
          return configuredDefault?.id || firstConfigured?.id || models[0]?.id || DEFAULT_MODEL_ID
        })
        setModelConfigError(null)
      } catch (loadError) {
        if (cancelled) return
        setModelConfigError(loadError instanceof Error ? loadError.message : 'Could not load pipeline model options.')
      }
    }

    void loadModels()

    return () => {
      cancelled = true
    }
  }, [])

  const selectedModel = useMemo(
    () => modelOptions.find((model) => model.id === selectedModelId) ?? null,
    [modelOptions, selectedModelId]
  )

  const session = useLiveKitTutor({
    onError: (userMessage) => setError(userMessage),
    sessionEndpoint: '/api/livekit-pipeline/session',
    modelSnapshot: 'livekit-pipeline-lab',
    liveKitWorkerCommand: 'npm run dev:livekit-pipeline-agent',
  })

  const modelSelector = (
    <div className="rounded-[22px] border border-[#DCE7E2] bg-white/74 px-4 py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <label
            htmlFor="livekit-pipeline-model"
            className="block text-[11px] uppercase tracking-[0.22em] text-[#5C7069]"
          >
            Model
          </label>
          <p className="mt-1 text-[12px] leading-relaxed text-[#6A7E78]">
            LiveKit handles voice transport. This chooses the tutor model.
          </p>
        </div>
        {selectedModel?.experimental ? (
          <span className="rounded-full border border-[#D5E1DD] bg-[#F7FAF8] px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-[#5C7069]">
            Lab
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        <select
          id="livekit-pipeline-model"
          value={selectedModelId}
          onChange={(event) => setSelectedModelId(event.target.value)}
          disabled={session.isConnected || modelOptions.length === 0}
          className="w-full appearance-none rounded-[14px] border border-[#D5E1DD] bg-[#F7FAF8] px-3.5 py-2.5 text-[13px] font-normal text-[#203A34] outline-none transition-colors focus:border-[#16423C] disabled:cursor-not-allowed disabled:opacity-70"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%233F524C'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
            backgroundPosition: 'right 0.9rem center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '14px',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {modelOptions.length === 0 ? (
            <option value={selectedModelId}>Loading models...</option>
          ) : (
            modelOptions.map((model) => (
              <option key={model.id} value={model.id} disabled={!model.configured}>
                {model.label}
                {model.configured ? '' : ' (not configured)'}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="mt-3 border-t border-[#E1EAE6] pt-3 text-[12px] leading-relaxed text-[#6A7E78]">
        {modelConfigError ? (
          <p className="text-red-700">{modelConfigError}</p>
        ) : selectedModel ? (
          <>
            <p>
              {providerLabel(selectedModel.provider)} · {selectedModel.model}
            </p>
            <p className="mt-1">{selectedModel.description}</p>
            {!selectedModel.configured ? (
              <p className="mt-2 text-red-700">This model needs server-side credentials before it can run.</p>
            ) : null}
          </>
        ) : (
          <p>Loading the server-side model allowlist...</p>
        )}
      </div>
    </div>
  )

  return (
    <TutorWorkspace
      mode="livekit-pipeline-lab"
      error={error}
      setError={setError}
      session={session}
      connectOptions={{ liveKitModelId: selectedModelId }}
      sessionConfig={modelSelector}
    />
  )
}

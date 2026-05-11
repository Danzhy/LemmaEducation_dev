import { createHash } from 'crypto'

export const CURRICULUM_EMBEDDING_DIMENSIONS = 1536
export const DEFAULT_CURRICULUM_EMBEDDING_MODEL = 'text-embedding-3-small'
export const MAX_CURRICULUM_DOCUMENT_CHARS = 80_000
export const MAX_CURRICULUM_CHUNK_CHARS = 1_200
export const CURRICULUM_CHUNK_OVERLAP_CHARS = 180

export type CurriculumChunk = {
  chunkIndex: number
  content: string
  tokenEstimate: number
}

export type CurriculumEmbeddingResult = {
  embedding: number[]
  model: string
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function sanitizeCurriculumText(value: string) {
  return normalizeWhitespace(value).slice(0, MAX_CURRICULUM_DOCUMENT_CHARS)
}

export function hashCurriculumText(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4))
}

export function chunkCurriculumText(value: string): CurriculumChunk[] {
  const text = sanitizeCurriculumText(value)
  if (!text) return []

  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  const chunks: CurriculumChunk[] = []
  let buffer = ''

  function flush() {
    const content = buffer.trim()
    if (!content) return
    chunks.push({
      chunkIndex: chunks.length,
      content,
      tokenEstimate: estimateTokens(content),
    })
    buffer = content.slice(Math.max(0, content.length - CURRICULUM_CHUNK_OVERLAP_CHARS))
  }

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CURRICULUM_CHUNK_CHARS) {
      flush()
      for (let start = 0; start < paragraph.length; start += MAX_CURRICULUM_CHUNK_CHARS - CURRICULUM_CHUNK_OVERLAP_CHARS) {
        const content = paragraph.slice(start, start + MAX_CURRICULUM_CHUNK_CHARS).trim()
        if (content) {
          chunks.push({
            chunkIndex: chunks.length,
            content,
            tokenEstimate: estimateTokens(content),
          })
          buffer = content.slice(Math.max(0, content.length - CURRICULUM_CHUNK_OVERLAP_CHARS)).trim()
        }
      }
      continue
    }

    const next = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    if (next.length > MAX_CURRICULUM_CHUNK_CHARS) {
      flush()
      buffer = paragraph
    } else {
      buffer = next
    }
  }

  flush()
  return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }))
}

export function getCurriculumEmbeddingModel() {
  return process.env.OPENAI_CURRICULUM_EMBEDDING_MODEL?.trim() || DEFAULT_CURRICULUM_EMBEDDING_MODEL
}

export function vectorToSqlLiteral(embedding: number[]) {
  if (embedding.length !== CURRICULUM_EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${CURRICULUM_EMBEDDING_DIMENSIONS} embedding dimensions.`)
  }

  return `[${embedding
    .map((value) => {
      if (!Number.isFinite(value)) {
        throw new Error('Embedding contains a non-finite value.')
      }
      return Number(value).toPrecision(8)
    })
    .join(',')}]`
}

export async function createCurriculumEmbedding(input: string): Promise<CurriculumEmbeddingResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('OPENAI_API_KEY is required for curriculum embeddings.')
  }

  const model = getCurriculumEmbeddingModel()
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: input.slice(0, MAX_CURRICULUM_CHUNK_CHARS),
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Embedding request failed.${details ? ` ${details.slice(0, 180)}` : ''}`)
  }

  const body = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>
    model?: string
  }
  const embedding = body.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding response did not include a vector.')
  }

  return {
    embedding,
    model: body.model || model,
  }
}

export function buildCurriculumContextInstruction(input: {
  agentProfiles: Array<{ name: string; gradeBand: string | null; instructions: string }>
  documentTitles: string[]
}) {
  const profileLines = input.agentProfiles
    .slice(0, 3)
    .map((profile, index) => {
      const grade = profile.gradeBand ? ` (${profile.gradeBand})` : ''
      return `${index + 1}. ${profile.name}${grade}: ${profile.instructions.slice(0, 700)}`
    })

  const documentLines = input.documentTitles
    .slice(0, 6)
    .map((title, index) => `${index + 1}. ${title.slice(0, 140)}`)

  if (profileLines.length === 0 && documentLines.length === 0) return ''

  return [
    'Teacher-provided curriculum context for this hidden lab session:',
    profileLines.length > 0 ? `Custom tutor profile:\n${profileLines.join('\n')}` : '',
    documentLines.length > 0 ? `Available curriculum documents:\n${documentLines.join('\n')}` : '',
    'Use this context as guidance only. Do not reveal private teacher notes verbatim unless they are appropriate for the student.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

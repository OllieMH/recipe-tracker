// Provider-agnostic LLM access. Only this file knows about Gemini.
// Switching provider = rewrite callProvider() + change env vars.
import { z } from 'zod'

export interface LlmResult<T> {
  data: T
  model: string
  tokensIn: number
  tokensOut: number
}

interface RawResult {
  text: string
  tokensIn: number
  tokensOut: number
}

export class LlmError extends Error {}

const MODEL = () => Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'

async function callProvider(
  systemPrompt: string,
  userContent: string,
  jsonSchema: unknown,
): Promise<RawResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new LlmError('GEMINI_API_KEY is not set')

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseJsonSchema: jsonSchema,
    temperature: 0.2,
  }
  // 'minimal' is unsupported on this model. Set GEMINI_THINKING_LEVEL=none to omit.
  const level = Deno.env.get('GEMINI_THINKING_LEVEL') ?? 'low'
  if (level !== 'none') generationConfig.thinkingConfig = { thinkingLevel: level }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig,
      }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    console.error('Gemini error', res.status, body.slice(0, 500))
    throw new LlmError(`LLM request failed (${res.status})`)
  }
  const json = await res.json()
  const cand = json.candidates?.[0]
  if (cand?.finishReason && cand.finishReason !== 'STOP') {
    throw new LlmError(`LLM stopped early: ${cand.finishReason}`)
  }
  const text = (cand?.content?.parts ?? [])
    .filter((p: { thought?: boolean }) => !p.thought)
    .map((p: { text?: string }) => p.text ?? '')
    .join('')
  const usage = json.usageMetadata ?? {}
  return {
    text,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
  }
}

/** Call the LLM, validate against a zod schema, retry once on invalid output. */
export async function generateStructured<S extends z.ZodType>(
  systemPrompt: string,
  userContent: string,
  schema: S,
): Promise<LlmResult<z.infer<S>>> {
  const jsonSchema = z.toJSONSchema(schema)
  let tokensIn = 0
  let tokensOut = 0
  let lastError = ''

  for (let attempt = 0; attempt < 2; attempt++) {
    const content = attempt === 0
      ? userContent
      : `${userContent}\n\n---\nYour previous answer was invalid (${lastError}). Return valid JSON matching the schema.`
    const raw = await callProvider(systemPrompt, content, jsonSchema)
    tokensIn += raw.tokensIn
    tokensOut += raw.tokensOut
    try {
      const parsed = schema.safeParse(JSON.parse(raw.text))
      if (parsed.success) {
        return { data: parsed.data, model: MODEL(), tokensIn, tokensOut }
      }
      lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    } catch {
      lastError = 'not valid JSON'
    }
  }
  throw new LlmError(`LLM returned invalid output: ${lastError}`)
}

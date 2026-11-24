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

/** A picture sent along with the prompt (base64, no data: prefix). */
export interface LlmImage {
  mime_type: string
  data: string
}

export class LlmError extends Error {
  /** busy: temporary overload (UI says "try again"). skip: try the next model in the chain.
   *  quota: the model's request limit is used up (429): retrying the same model cannot help. */
  constructor(message: string, readonly busy = false, readonly skip = busy, readonly quota = false) {
    super(message)
  }
}

const MODEL = () => Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash'
// Optional comma-separated list, tried in order when a model keeps returning overload errors.
const FALLBACK_MODELS = () =>
  (Deno.env.get('GEMINI_FALLBACK_MODELS') ?? '').split(',').map((m) => m.trim()).filter(Boolean)
const RETRYABLE = new Set([429, 500, 503])
// Only overload is worth a second try on the same model. A 429 is a used-up quota, and every failed
// request counts against the free tier's daily limit too, so do not hammer.
const RETRY_SAME_MODEL = new Set([500, 503])
const ATTEMPTS_PER_MODEL = 2
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Supabase kills a function after 150 s of wall-clock time. Stay under that: each Gemini call
// may take at most CALL_TIMEOUT_MS, and nothing new starts once the whole request has used TOTAL_BUDGET_MS.
const CALL_TIMEOUT_MS = 50_000
const TOTAL_BUDGET_MS = 125_000

async function callProvider(
  model: string,
  systemPrompt: string,
  userContent: string,
  jsonSchema: unknown,
  primary: boolean,
  images: LlmImage[],
  deadline: number,
): Promise<RawResult> {
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) throw new LlmError('GEMINI_API_KEY is not set')

  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseJsonSchema: jsonSchema,
  }
  // temperature is deprecated on newer Gemini models, so it is not sent.
  // Thinking level is verified only for the primary model ('minimal' is rejected there).
  // Fallback models use their own default. Set GEMINI_THINKING_LEVEL=none to omit.
  const level = Deno.env.get('GEMINI_THINKING_LEVEL') ?? 'low'
  if (primary && level !== 'none') generationConfig.thinkingConfig = { thinkingLevel: level }

  let res!: Response
  for (let i = 0; i < ATTEMPTS_PER_MODEL; i++) {
    const remaining = deadline - Date.now()
    if (remaining < 8_000) throw new LlmError('LLM time budget used up', true, false)
    try {
      res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining)),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          // Text first, then the images (Gemini's recommendation for single-prompt image input).
          contents: [{
            role: 'user',
            parts: [
              { text: userContent },
              ...images.map((i) => ({ inlineData: { mimeType: i.mime_type, data: i.data } })),
            ],
          }],
          generationConfig,
        }),
      },
      )
    } catch (err) {
      // A call that hangs is treated like an overloaded model: try the next one in the chain.
      console.warn(`Gemini ${model} did not answer in time`, err)
      throw new LlmError(`LLM request timed out (${model})`, true)
    }
    if (res.ok || !RETRY_SAME_MODEL.has(res.status)) break
    console.warn(`Gemini ${model} returned ${res.status}, attempt ${i + 1}/${ATTEMPTS_PER_MODEL}`)
    if (i < ATTEMPTS_PER_MODEL - 1) await sleep(3000)
  }
  if (!res.ok) {
    const body = await res.text()
    console.error('Gemini error', model, res.status, body.slice(0, 500))
    throw new LlmError(`LLM request failed (${res.status})`, RETRYABLE.has(res.status), RETRYABLE.has(res.status) || res.status === 404, res.status === 429)
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
  images: LlmImage[] = [],
): Promise<LlmResult<z.infer<S>>> {
  const jsonSchema = z.toJSONSchema(schema)
  let tokensIn = 0
  let tokensOut = 0
  let lastError = ''
  let model = MODEL()
  const deadline = Date.now() + TOTAL_BUDGET_MS

  for (let attempt = 0; attempt < 2; attempt++) {
    const content = attempt === 0
      ? userContent
      : `${userContent}\n\n---\nYour previous answer was invalid (${lastError}). Return valid JSON matching the schema.`
    let raw: RawResult | null = null
    const chain = [model, ...FALLBACK_MODELS().filter((m) => m !== model)]
    for (let i = 0; i < chain.length && !raw; i++) {
      try {
        raw = await callProvider(chain[i], systemPrompt, content, jsonSchema, chain[i] === MODEL(), images, deadline)
        model = chain[i]
      } catch (err) {
        const last = i === chain.length - 1
        if (err instanceof LlmError && err.skip && !last) {
          console.warn(`${chain[i]} busy, falling back to ${chain[i + 1]}`)
        } else {
          throw err
        }
      }
    }
    if (!raw) throw new LlmError('LLM unavailable', true)
    tokensIn += raw.tokensIn
    tokensOut += raw.tokensOut
    try {
      const parsed = schema.safeParse(JSON.parse(raw.text))
      if (parsed.success) {
        return { data: parsed.data, model, tokensIn, tokensOut }
      }
      lastError = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    } catch {
      lastError = 'not valid JSON'
    }
  }
  throw new LlmError(`LLM returned invalid output: ${lastError}`)
}

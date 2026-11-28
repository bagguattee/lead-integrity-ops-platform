/* ──────────────────────────────────────────────────────────────────────────
 * Production Groq LLM Helper (OpenAI-compatible REST client)
 *
 * Used by:
 *  1. Workspace Ops Copilot (tenant-scoped RAG over live operational telemetry)
 *  2. Interactive 2-Way Voice AI ("Ash") simulator for natural conversation,
 *     objection handling, and dynamic slot negotiation (after deterministic
 *     compliance guards run first).
 *
 * Features:
 *  - Automatic model fallback chain + in-memory working-model cache so
 *    deprecated model IDs never break production deployments.
 *  - Strict timeouts and fail-safe fallback when GROQ_API_KEY is absent/offline.
 * ────────────────────────────────────────────────────────────────────────── */

export interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GroqChatResult {
  ok: boolean;
  content?: string;
  tokensUsed?: number;
  model?: string;
  error?: string;
}

const MODEL_FALLBACK_CHAIN = [
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
];

let cachedWorkingModel: string | null = null;

export function isGroqConfigured(): boolean {
  const key = process.env.GROQ_API_KEY?.trim();
  return Boolean(key && key.length > 10 && !key.includes("your_"));
}

function cleanModelOutput(raw: string): string {
  // Strip any <think>...</think> reasoning tags if emitted by reasoning models
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function callGroqChat(params: {
  messages: GroqMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
  model?: string;
}): Promise<GroqChatResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "GROQ_API_KEY not configured" };
  }

  const candidates = Array.from(
    new Set(
      [
        params.model,
        process.env.GROQ_MODEL?.trim(),
        cachedWorkingModel,
        ...MODEL_FALLBACK_CHAIN,
      ].filter((m): m is string => Boolean(m && m.length > 0))
    )
  );

  let lastError = "Groq request failed";

  for (const model of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 7000);

    try {
      const body: Record<string, unknown> = {
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.25,
        max_tokens: params.maxTokens ?? 420,
      };
      if (params.jsonMode) {
        body.response_format = { type: "json_object" };
      }

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY!.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `Groq HTTP ${res.status}: ${errText.slice(0, 160)}`;
        // If model is not found / deprecated / unsupported, try next model in chain
        if (res.status === 404 || res.status === 400) {
          if (cachedWorkingModel === model) cachedWorkingModel = null;
          continue;
        }
        return { ok: false, error: lastError };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
        model?: string;
      };

      const rawContent = json.choices?.[0]?.message?.content;
      const content = rawContent ? cleanModelOutput(rawContent) : "";
      if (!content) {
        lastError = "Empty response from Groq";
        continue;
      }

      cachedWorkingModel = json.model || model;

      return {
        ok: true,
        content,
        tokensUsed: json.usage?.total_tokens ?? 180,
        model: cachedWorkingModel,
      };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : "Groq request failed";
      return { ok: false, error: lastError };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, error: lastError };
}

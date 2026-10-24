import "server-only";
import { acquireProviderSlot, reportProviderPressure } from "./provider-gate";

const BASE = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Streams a chat completion from the configured NVIDIA endpoint. Tokens are
 * handed to onToken as they arrive; the accumulated text is returned for
 * persistence and citation verification. Request starts are paced through
 * the shared provider gate; a 429 pauses the gate and retries once.
 */
export async function streamChat(opts: {
  model: string;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  signal?: AbortSignal;
}): Promise<{ text: string }> {
  for (let attempt = 0; ; attempt++) {
    await acquireProviderSlot();
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 1024,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: opts.signal,
    });

    if (res.status === 429 && attempt === 0) {
      await res.text().catch(() => "");
      reportProviderPressure();
      continue;
    }
    if (!res.ok || !res.body) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[chat] request failed:", res.status, detail);
      throw new Error(`The answer model returned an error (${res.status}).`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            text += delta;
            opts.onToken(delta);
          }
        } catch {
          // Ignore keep-alive or malformed frames; the stream continues.
        }
      }
    }
    return { text };
  }
}

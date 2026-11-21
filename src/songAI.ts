// Claude for Songs, called straight from this device with your own API key (Settings → AI). The key stays on this
// device: it's kept in local storage, never in your synced progress. Without a key, Songs copies Nekko's request
// for you to paste into the Claude app (or any AI app) and reads the answer you paste back.
// The Anthropic SDK loads only when you first use it.

import type Anthropic from "@anthropic-ai/sdk";
import type { Settings } from "./srs";

const KEY = "nekko.aiKey";

export function getAIKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAIKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: nothing to keep
  }
}

export type AIModel = NonNullable<Settings["aiModel"]>;

export const MODELS: Record<AIModel, { id: string; label: string; price: string }> = {
  haiku: { id: "claude-haiku-5-5", label: "Haiku", price: "cheapest, about 1 cent a song" },
  sonnet: { id: "claude-sonnet-5-5", label: "Sonnet", price: "best value, about 10-15 cents a song" },
  opus: { id: "claude-opus-5-5", label: "Opus", price: "most thorough, about 20-40 cents a song" },
};

export const modelOf = (settings: Settings) => MODELS[settings.aiModel ?? "sonnet"];

async function client(): Promise<Anthropic> {
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  // The key is the person's own, typed into this device, so calling from the browser is what we want here.
  return new AnthropicSDK({ apiKey: getAIKey(), dangerouslyAllowBrowser: true });
}

/** A message for each kind of failure, in plain words. */
export async function aiError(e: unknown): Promise<string> {
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  if (e instanceof AnthropicSDK.APIUserAbortError) return "Stopped.";
  if (e instanceof AnthropicSDK.AuthenticationError) return "Claude didn't accept your API key. Check it in Settings → AI.";
  if (e instanceof AnthropicSDK.PermissionDeniedError) return "Your API key isn't allowed to do this. Check your account at console.anthropic.com.";
  if (e instanceof AnthropicSDK.RateLimitError) return "Too many requests for now, or your API credit ran out. Try again in a little while.";
  if (e instanceof AnthropicSDK.BadRequestError) return /credit|balance/i.test(e.message) ? "Your API credit ran out. Add credit at console.anthropic.com." : `Claude couldn't take this request: ${e.message}`;
  if (e instanceof AnthropicSDK.APIConnectionError) return "Couldn't reach Claude. Check your connection.";
  if (e instanceof AnthropicSDK.APIError) return `Claude had a problem (${e.status ?? "no answer"}). Try again.`;
  return e instanceof Error ? e.message : String(e);
}

/** Sonnet and Opus can hand a declined request to another model instead of stopping (server-side fallback). */
const fallback = (model: string) => (model === MODELS.haiku.id ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const });

type Progress = (text: string, searches: number) => void;

/** Asks Claude to research the song on the web and answer Nekko's request (songs.ts aiPrompt). Returns the answer text. */
export async function askForNotes(prompt: string, settings: Settings, onProgress: Progress, signal: AbortSignal): Promise<string> {
  const c = await client();
  const model = modelOf(settings).id;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let text = "";
  let searches = 0;
  // A turn with web searches can pause partway; sending it back as it is lets Claude carry on.
  for (let round = 0; round < 4; round++) {
    const stream = c.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
        messages,
        ...fallback(model),
      },
      { signal },
    );
    stream.on("streamEvent", (event) => {
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") onProgress(text, ++searches);
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onProgress(text, searches);
      }
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("Claude declined to answer this one.");
    if (msg.stop_reason !== "pause_turn") return text;
    messages.push({ role: "assistant", content: msg.content });
  }
  return text;
}

/** One answer in the Ask chat, streamed into `onText` (the whole answer so far). */
export async function askChat(system: string, turns: { role: "user" | "assistant"; content: string }[], settings: Settings, onText: (text: string) => void, signal: AbortSignal): Promise<string> {
  const c = await client();
  const model = modelOf(settings).id;
  let text = "";
  const stream = c.beta.messages.stream(
    {
      model,
      max_tokens: 4000,
      system,
      output_config: { effort: "low" },
      messages: turns,
      ...fallback(model),
    },
    { signal },
  );
  stream.on("text", (delta) => {
    text += delta;
    onText(text);
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to answer that. Try asking another way.");
  return text;
}

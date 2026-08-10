import type { UIMessageChunk } from "ai";

/**
 * Keys each UI message chunk type is allowed to carry in AI SDK v6.
 *
 * The v6 client validates every chunk against a union of *strict* zod objects,
 * so a single unknown key fails the whole union with `unrecognized_keys` and
 * aborts the stream. v7 (what this server runs) added fields v6 never saw —
 * `toolMetadata` on every tool chunk, `providerMetadata` on tool outputs — and
 * the MCP tools populate `toolMetadata` on every call.
 *
 * The mobile app ships a pinned v6 client, and already-installed builds cannot
 * be upgraded server-side, so the server stays backwards compatible instead.
 * Nothing in the web or mobile clients reads the stripped fields.
 */
const V6_CHUNK_KEYS: Record<string, readonly string[]> = {
  "text-start": ["id", "providerMetadata"],
  "text-delta": ["id", "delta", "providerMetadata"],
  "text-end": ["id", "providerMetadata"],
  error: ["errorText"],
  "tool-input-start": [
    "toolCallId",
    "toolName",
    "providerExecuted",
    "providerMetadata",
    "dynamic",
    "title",
  ],
  "tool-input-delta": ["toolCallId", "inputTextDelta"],
  "tool-input-available": [
    "toolCallId",
    "toolName",
    "input",
    "providerExecuted",
    "providerMetadata",
    "dynamic",
    "title",
  ],
  "tool-input-error": [
    "toolCallId",
    "toolName",
    "input",
    "providerExecuted",
    "providerMetadata",
    "dynamic",
    "errorText",
    "title",
  ],
  "tool-approval-request": ["approvalId", "toolCallId"],
  "tool-output-available": [
    "toolCallId",
    "output",
    "providerExecuted",
    "dynamic",
    "preliminary",
  ],
  "tool-output-error": [
    "toolCallId",
    "errorText",
    "providerExecuted",
    "dynamic",
  ],
  "tool-output-denied": ["toolCallId"],
  "reasoning-start": ["id", "providerMetadata"],
  "reasoning-delta": ["id", "delta", "providerMetadata"],
  "reasoning-end": ["id", "providerMetadata"],
  "source-url": ["sourceId", "url", "title", "providerMetadata"],
  "source-document": [
    "sourceId",
    "mediaType",
    "title",
    "filename",
    "providerMetadata",
  ],
  file: ["url", "mediaType", "providerMetadata"],
  "data-*": ["id", "data", "transient"],
  "start-step": [],
  "finish-step": [],
  start: ["messageId", "messageMetadata"],
  finish: ["finishReason", "messageMetadata"],
  abort: ["reason"],
  "message-metadata": ["messageMetadata"],
};

/**
 * Strips fields that AI SDK v6 clients would reject from a UI message chunk
 * stream. Chunk types v6 does not know at all (`custom`, `reasoning-file`,
 * `tool-approval-response`) are passed through and logged — we never emit them.
 */
export function createV6CompatTransform<
  T extends UIMessageChunk,
>(): TransformStream<T, T> {
  const logged = new Set<string>();
  const logOnce = (key: string, message: string) => {
    if (logged.has(key)) return;
    logged.add(key);
    console.warn(message);
  };

  return new TransformStream<T, T>({
    transform(chunk, controller) {
      const allowed = chunk.type.startsWith("data-")
        ? V6_CHUNK_KEYS["data-*"]
        : V6_CHUNK_KEYS[chunk.type];

      if (!allowed) {
        logOnce(
          `type:${chunk.type}`,
          `[chat] chunk type "${chunk.type}" is unknown to AI SDK v6 clients — passing through unchanged`,
        );
        controller.enqueue(chunk);
        return;
      }

      const sanitized: Record<string, unknown> = { type: chunk.type };
      const dropped: string[] = [];
      for (const [key, value] of Object.entries(chunk)) {
        if (key === "type") continue;
        if (allowed.includes(key)) sanitized[key] = value;
        else dropped.push(key);
      }

      if (dropped.length === 0) {
        controller.enqueue(chunk);
        return;
      }

      for (const key of dropped) {
        logOnce(
          `${chunk.type}.${key}`,
          `[chat] stripped v7-only field "${key}" from "${chunk.type}" chunks for v6 client compatibility`,
        );
      }
      controller.enqueue(sanitized as T);
    },
  });
}

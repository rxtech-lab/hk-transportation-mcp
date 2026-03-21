import { Redis } from "@upstash/redis";
import { KV_REST_API_URL, KV_REST_API_TOKEN } from "@/lib/config";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;

  redis = new Redis({
    url: KV_REST_API_URL,
    token: KV_REST_API_TOKEN,
  });

  return redis;
}

const STREAM_TTL = 300; // 5 minutes

export async function getActiveStreamId(
  chatId: string,
): Promise<string | null> {
  const r = getRedis();
  if (!r) return null;
  return r.get<string>(`chat:${chatId}:activeStreamId`);
}

export async function setActiveStreamId(
  chatId: string,
  streamId: string,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.set(`chat:${chatId}:activeStreamId`, streamId, { ex: STREAM_TTL });
}

export async function clearActiveStreamId(chatId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  await r.del(`chat:${chatId}:activeStreamId`);
}

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { KV_REST_API_URL, KV_REST_API_TOKEN } from "@/lib/config";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (ratelimit) return ratelimit;
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return null;

  ratelimit = new Ratelimit({
    redis: new Redis({
      url: KV_REST_API_URL,
      token: KV_REST_API_TOKEN,
    }),
    limiter: Ratelimit.fixedWindow(200, "1 d"),
    prefix: "ratelimit:chat",
  });

  return ratelimit;
}

/**
 * Check if the given IP is within the rate limit.
 * Returns { success: true, remaining: -1 } when rate limiting is disabled (no env vars configured).
 */
export async function checkRateLimit(
  ip: string,
): Promise<{ success: boolean; remaining: number }> {
  const limiter = getRatelimit();
  if (!limiter) {
    return { success: true, remaining: -1 };
  }

  const { success, remaining } = await limiter.limit(ip);
  return { success, remaining };
}

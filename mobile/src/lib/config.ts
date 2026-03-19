// Frontend (Next.js) — handles /api/chat
export const FRONTEND_URL =
  process.env.EXPO_PUBLIC_FRONTEND_URL ?? "http://localhost:3001";

// Backend (Go) — handles /api/arrivals
export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

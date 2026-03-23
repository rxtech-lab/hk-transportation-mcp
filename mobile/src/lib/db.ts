import * as SQLite from "expo-sqlite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UIMessage } from "ai";

const db = SQLite.openDatabaseSync("chat.db");

// Enable foreign keys and create tables
db.execSync(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    data TEXT NOT NULL,
    seq INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);

  CREATE TABLE IF NOT EXISTS route_tracking (
    route TEXT NOT NULL,
    destination TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    last_tracked_at INTEGER NOT NULL,
    PRIMARY KEY (route, destination)
  );
`);

export interface ChatSessionMeta {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function listSessions(): ChatSessionMeta[] {
  const rows = db.getAllSync<{
    id: string;
    title: string | null;
    created_at: number;
    updated_at: number;
  }>("SELECT * FROM sessions ORDER BY updated_at DESC");
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function loadSessionMessages(sessionId: string): UIMessage[] {
  const rows = db.getAllSync<{ data: string }>(
    "SELECT data FROM messages WHERE session_id = ? ORDER BY seq",
    [sessionId],
  );
  return rows.map((r) => JSON.parse(r.data));
}

export function saveSessionMessages(
  sessionId: string,
  messages: UIMessage[],
): void {
  db.withTransactionSync(() => {
    // Ensure session exists
    const existing = db.getFirstSync<{ id: string }>(
      "SELECT id FROM sessions WHERE id = ?",
      [sessionId],
    );
    const now = Date.now();
    if (!existing) {
      db.runSync(
        "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, NULL, ?, ?)",
        [sessionId, now, now],
      );
    }

    db.runSync("DELETE FROM messages WHERE session_id = ?", [sessionId]);
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      db.runSync(
        "INSERT INTO messages (id, session_id, data, seq) VALUES (?, ?, ?, ?)",
        [msg.id, sessionId, JSON.stringify(msg), i],
      );
    }
    db.runSync("UPDATE sessions SET updated_at = ? WHERE id = ?", [
      now,
      sessionId,
    ]);
  });
}

export function createSession(): ChatSessionMeta {
  const id = generateId();
  const now = Date.now();
  db.runSync(
    "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, NULL, ?, ?)",
    [id, now, now],
  );
  return { id, title: null, createdAt: now, updatedAt: now };
}

export function deleteSession(id: string): void {
  db.runSync("DELETE FROM sessions WHERE id = ?", [id]);
}

export function getSessionTitle(id: string): string | null {
  const row = db.getFirstSync<{ title: string | null }>(
    "SELECT title FROM sessions WHERE id = ?",
    [id],
  );
  return row?.title ?? null;
}

export function updateSessionTitle(id: string, title: string): void {
  db.runSync("UPDATE sessions SET title = ? WHERE id = ?", [title, id]);
}

// ── Route tracking ──────────────────────────────────────────────

export interface RouteTrackingMeta {
  route: string;
  destination: string;
  count: number;
  lastTrackedAt: number;
}

export function incrementRouteTracking(
  route: string,
  destination: string,
): void {
  const now = Date.now();
  db.runSync(
    `INSERT INTO route_tracking (route, destination, count, last_tracked_at)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(route, destination)
     DO UPDATE SET count = count + 1, last_tracked_at = ?`,
    [route, destination, now, now],
  );
}

export function getRouteTrackingCounts(): Map<string, number> {
  const rows = db.getAllSync<{ route: string; destination: string; count: number }>(
    "SELECT route, destination, count FROM route_tracking",
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.route}|${r.destination}`, r.count);
  }
  return map;
}

export function listRouteTracking(): RouteTrackingMeta[] {
  const rows = db.getAllSync<{
    route: string;
    destination: string;
    count: number;
    last_tracked_at: number;
  }>("SELECT * FROM route_tracking ORDER BY count DESC");
  return rows.map((r) => ({
    route: r.route,
    destination: r.destination,
    count: r.count,
    lastTrackedAt: r.last_tracked_at,
  }));
}

export function deleteRouteTracking(
  route: string,
  destination: string,
): void {
  db.runSync(
    "DELETE FROM route_tracking WHERE route = ? AND destination = ?",
    [route, destination],
  );
}

// Migrate legacy AsyncStorage data
const LEGACY_KEY = "hk-transport-chat";
const MIGRATION_DONE_KEY = "chat-db-migrated";

export async function migrateLegacyData(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(MIGRATION_DONE_KEY);
    if (done) return;

    const stored = await AsyncStorage.getItem(LEGACY_KEY);
    if (stored) {
      const messages: UIMessage[] = JSON.parse(stored);
      if (messages.length > 0) {
        const session = createSession();
        saveSessionMessages(session.id, messages);
      }
      await AsyncStorage.removeItem(LEGACY_KEY);
    }
    await AsyncStorage.setItem(MIGRATION_DONE_KEY, "1");
  } catch {
    // Migration is best-effort
  }
}

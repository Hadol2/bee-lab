import { getChatGPTUser } from "../../chatgpt-auth";

const QUESTION_ID = /^\d{8}-\d{3}$/;

type DatabaseStatement = {
  bind: (...values: unknown[]) => DatabaseStatement;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

type ProgressDatabase = {
  prepare: (query: string) => DatabaseStatement;
};

type ProgressRuntime = typeof globalThis & {
  __WASTE_PROGRESS_DB__?: ProgressDatabase;
};

function getDatabase(): ProgressDatabase {
  const db = (globalThis as ProgressRuntime).__WASTE_PROGRESS_DB__;
  if (!db) throw new Error("DB binding unavailable");
  return db;
}

async function userKey(email: string): Promise<string> {
  const value = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sanitizeWrongIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 2200) return null;
  const ids = [...new Set(value)];
  if (!ids.every((id) => typeof id === "string" && QUESTION_ID.test(id))) return null;
  return ids;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDatabase();
  const row = await db
    .prepare("SELECT wrong_ids FROM user_progress WHERE user_key = ?")
    .bind(await userKey(user.email))
    .first<{ wrong_ids: string }>();

  return Response.json({ wrongIds: row ? JSON.parse(row.wrong_ids) : [] });
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const wrongIds = sanitizeWrongIds(body?.wrongIds);
  if (!wrongIds) return Response.json({ error: "Invalid progress" }, { status: 400 });

  const db = getDatabase();
  await db
    .prepare(
      `INSERT INTO user_progress (user_key, wrong_ids, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_key) DO UPDATE SET
         wrong_ids = excluded.wrong_ids,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(await userKey(user.email), JSON.stringify(wrongIds))
    .run();

  return Response.json({ wrongIds });
}

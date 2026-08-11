import { neon } from "@neondatabase/serverless";
import { auth } from "../../../lib/auth/server";

const QUESTION_ID = /^\d{8}-\d{3}$/;

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return neon(databaseUrl);
}

function sanitizeWrongIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 2200) return null;
  const ids = [...new Set(value)];
  if (!ids.every((id) => typeof id === "string" && QUESTION_ID.test(id))) return null;
  return ids;
}

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sql = getDatabase();
  const rows = await sql`
    SELECT wrong_ids
    FROM user_progress
    WHERE user_key = ${session.user.id}
  `;

  return Response.json({ wrongIds: rows[0]?.wrong_ids ?? [] });
}

export async function PUT(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const wrongIds = sanitizeWrongIds(body?.wrongIds);
  if (!wrongIds) return Response.json({ error: "Invalid progress" }, { status: 400 });

  const sql = getDatabase();
  await sql`
    INSERT INTO user_progress (user_key, wrong_ids, updated_at)
    VALUES (${session.user.id}, ${JSON.stringify(wrongIds)}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT(user_key) DO UPDATE SET
      wrong_ids = excluded.wrong_ids,
      updated_at = CURRENT_TIMESTAMP
  `;

  return Response.json({ wrongIds });
}

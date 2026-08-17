import { neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { auth } from "../../../lib/auth/server";
import { loadExplanationQuestion } from "../../../lib/question-library-server";

const QUESTION_ID = /^\d{8}-\d{3}$/;
const REPORT_CATEGORIES = new Set(["answer", "explanation", "question", "source"]);

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return neon(databaseUrl);
}

export async function POST(request: Request) {
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const questionId = typeof body?.questionId === "string" ? body.questionId : "";
  const category = typeof body?.category === "string" ? body.category : "";
  const details = typeof body?.details === "string" ? body.details.trim() : "";

  if (
    !QUESTION_ID.test(questionId) ||
    !REPORT_CATEGORIES.has(category) ||
    details.length < 10 ||
    details.length > 1000
  ) {
    return Response.json({ error: "Invalid report" }, { status: 400 });
  }

  if (!(await loadExplanationQuestion(questionId))) {
    return Response.json({ error: "Question not found" }, { status: 404 });
  }

  const sql = getDatabase();
  const rows = await sql`
    INSERT INTO question_reports (
      id, question_id, user_key, category, details, status
    ) VALUES (
      ${nanoid()}, ${questionId}, ${session.user.id}, ${category}, ${details}, 'open'
    )
    ON CONFLICT (user_key, question_id) WHERE status = 'open'
    DO UPDATE SET
      category = excluded.category,
      details = excluded.details,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, question_id, category, status, created_at, updated_at
  `;

  return Response.json({ report: rows[0] }, { status: 201 });
}

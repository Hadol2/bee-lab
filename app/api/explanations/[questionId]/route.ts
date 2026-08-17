import { neon } from "@neondatabase/serverless";
import {
  EXPLANATION_MODEL,
  EXPLANATION_PROMPT_VERSION,
} from "../../../../lib/explanation-config";
import { isDetailedExplanation, toReviewStatus } from "../../../../lib/explanations";

const QUESTION_ID = /^\d{8}-\d{3}$/;

function getDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  return neon(databaseUrl);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ questionId: string }> },
) {
  const { questionId } = await params;
  if (!QUESTION_ID.test(questionId)) {
    return Response.json({ status: "missing" }, { status: 404 });
  }

  const sql = getDatabase();
  const cached = await sql`
    SELECT g.content, g.updated_at, g.review_status
    FROM question_explanation_cache c
    JOIN explanation_generations g ON g.id = c.generation_id
    WHERE c.question_id = ${questionId}
      AND g.status = 'complete'
      AND g.model = ${EXPLANATION_MODEL}
      AND g.prompt_version = ${EXPLANATION_PROMPT_VERSION}
    LIMIT 1
  `;
  if (!cached[0]?.content || !isDetailedExplanation(cached[0].content)) {
    return Response.json(
      { status: "missing" },
      { status: 404, headers: { "Cache-Control": "public, s-maxage=60" } },
    );
  }

  return Response.json(
    {
      status: "complete",
      explanation: cached[0].content,
      reviewStatus: toReviewStatus(cached[0].review_status),
      generatedAt: new Date(cached[0].updated_at).toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}

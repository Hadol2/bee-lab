import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const sql = neon(databaseUrl);

await sql`
  CREATE TABLE IF NOT EXISTS user_progress (
    user_key text PRIMARY KEY,
    wrong_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS explanation_generations (
    id text PRIMARY KEY,
    question_id text NOT NULL,
    model text NOT NULL,
    prompt_version text NOT NULL,
    prompt_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'complete', 'error')),
    content jsonb,
    token_usage jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS explanation_generations_question_id_idx
  ON explanation_generations (question_id, created_at DESC)
`;

await sql`
  ALTER TABLE explanation_generations
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(12, 8)
`;

await sql`
  ALTER TABLE explanation_generations
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'unreviewed'
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS explanation_generations_active_prompt_idx
  ON explanation_generations (question_id, prompt_hash)
  WHERE status <> 'error'
`;

await sql`
  CREATE TABLE IF NOT EXISTS question_explanation_cache (
    question_id text PRIMARY KEY,
    generation_id text NOT NULL REFERENCES explanation_generations(id),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

await sql`
  CREATE TABLE IF NOT EXISTS question_reports (
    id text PRIMARY KEY,
    question_id text NOT NULL,
    user_key text NOT NULL,
    category text NOT NULL CHECK (
      category IN ('answer', 'explanation', 'question', 'source')
    ),
    details text NOT NULL CHECK (char_length(details) BETWEEN 10 AND 1000),
    status text NOT NULL DEFAULT 'open' CHECK (
      status IN ('open', 'resolved', 'dismissed')
    ),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

await sql`
  CREATE INDEX IF NOT EXISTS question_reports_status_created_idx
  ON question_reports (status, created_at DESC)
`;

await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS question_reports_open_user_question_idx
  ON question_reports (user_key, question_id)
  WHERE status = 'open'
`;

console.log("user progress, explanations, and question reports are ready");

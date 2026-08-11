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

console.log("user_progress table is ready");

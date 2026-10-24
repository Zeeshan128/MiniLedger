import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // For hosted PostgreSQL providers that require TLS, set PGSSL=true.
  ...(process.env.PGSSL === "true" ? { ssl: { rejectUnauthorized: false } } : {})
});

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
) {
  return pool.query<T>(text, params);
}

import { neon } from '@neondatabase/serverless';

let schemaReady = false;

export function db() {
  return neon(process.env.DATABASE_URL);
}

export async function ensureSchema(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      address JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS verification_codes (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_paise INTEGER NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      customizable BOOLEAN NOT NULL DEFAULT FALSE,
      custom_label TEXT NOT NULL DEFAULT 'Your message',
      in_stock BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      items JSONB NOT NULL,
      address JSONB NOT NULL,
      total_paise INTEGER NOT NULL,
      upi_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      user_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  schemaReady = true;
}

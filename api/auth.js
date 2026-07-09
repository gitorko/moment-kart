import { randomUUID, randomInt } from 'crypto';
import { db, ensureSchema } from './_db.js';
import { hashPassword, checkPassword, createToken, isAdminEmail } from './_auth.js';
import { sendVerificationEmail } from './_email.js';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function issueCode(sql, email) {
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await sql`
    INSERT INTO verification_codes (email, code, expires_at)
    VALUES (${email}, ${code}, ${expiresAt})
    ON CONFLICT (email) DO UPDATE SET code = ${code}, expires_at = ${expiresAt}
  `;
  const { sent } = await sendVerificationEmail(email, code);
  // Dev fallback: expose the code when no email provider is configured.
  return sent ? {} : { devCode: code };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const sql = db();
  await ensureSchema(sql);

  const { action } = req.body || {};
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  if (action === 'signup') {
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const [existing] = await sql`SELECT verified FROM users WHERE email = ${email}`;
    if (existing?.verified) return res.status(409).json({ error: 'Account already exists — please login' });

    const passwordHash = hashPassword(password);
    if (existing) {
      await sql`UPDATE users SET name = ${name}, password_hash = ${passwordHash} WHERE email = ${email}`;
    } else {
      await sql`INSERT INTO users (id, email, name, password_hash) VALUES (${randomUUID()}, ${email}, ${name}, ${passwordHash})`;
    }
    const extra = await issueCode(sql, email);
    return res.json({ message: 'Verification code sent to your email', ...extra });
  }

  if (action === 'resend') {
    const [user] = await sql`SELECT verified FROM users WHERE email = ${email}`;
    if (!user) return res.status(404).json({ error: 'No account found — please signup' });
    if (user.verified) return res.status(400).json({ error: 'Account already verified — please login' });
    const extra = await issueCode(sql, email);
    return res.json({ message: 'Verification code resent', ...extra });
  }

  if (action === 'verify') {
    const code = String(req.body?.code || '').trim();
    const [row] = await sql`SELECT code, expires_at FROM verification_codes WHERE email = ${email}`;
    if (!row || row.code !== code) return res.status(400).json({ error: 'Invalid verification code' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Code expired — request a new one' });
    }
    await sql`UPDATE users SET verified = TRUE WHERE email = ${email}`;
    await sql`DELETE FROM verification_codes WHERE email = ${email}`;
    const [user] = await sql`SELECT id, email, name FROM users WHERE email = ${email}`;
    return res.json({ token: createToken(user), admin: isAdminEmail(email) });
  }

  if (action === 'login') {
    const password = String(req.body?.password || '');
    const [user] = await sql`SELECT id, email, name, password_hash, verified FROM users WHERE email = ${email}`;
    if (!user || !checkPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.verified) {
      const extra = await issueCode(sql, email);
      return res.status(403).json({ error: 'Email not verified', needsVerification: true, ...extra });
    }
    return res.json({ token: createToken(user), admin: isAdminEmail(email) });
  }

  return res.status(400).json({ error: 'Unknown action' });
}

import { db, ensureSchema } from './_db.js';
import { requireAdmin, createToken } from './_auth.js';
import { log, logError } from './_log.js';

const IMPERSONATION_TTL_MS = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const sql = db();
    await ensureSchema(sql);

    // Impersonate: mint a short-lived token for another user so the admin
    // can see the shop exactly as that customer (place orders, etc).
    if (req.method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const [user] = await sql`SELECT id, email, name FROM users WHERE email = ${email}`;
      if (!user) return res.status(404).json({ error: 'User not found' });
      log('admin_impersonation', { target: email, by: admin.email });
      return res.json({ token: createToken(user, IMPERSONATION_TTL_MS) });
    }

    if (req.method !== 'GET') return res.status(405).end();
    const rows = await sql`
      SELECT u.email, u.name, u.verified, u.created_at,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(o.total_paise), 0)::bigint AS spent_paise
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    return res.json(rows.map((r) => ({ ...r, spent_paise: Number(r.spent_paise) })));
  } catch (err) {
    logError('users_handler_error', err, { method: req.method });
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

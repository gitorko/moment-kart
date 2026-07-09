import { randomUUID } from 'crypto';
import { db, ensureSchema } from './_db.js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  const sql = db();
  await ensureSchema(sql);

  if (req.method === 'GET') {
    // Public: the shop needs the catalog without login.
    const rows = await sql`
      SELECT id, name, description, price_paise, image_url, customizable, custom_label, in_stock
      FROM products ORDER BY created_at DESC
    `;
    return res.json(rows);
  }

  if (!requireAdmin(req, res)) return;

  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.name || !Number.isInteger(p.price_paise) || p.price_paise <= 0) {
      return res.status(400).json({ error: 'Name and a positive price are required' });
    }
    const id = randomUUID();
    await sql`
      INSERT INTO products (id, name, description, price_paise, image_url, customizable, custom_label, in_stock)
      VALUES (${id}, ${p.name}, ${p.description || ''}, ${p.price_paise}, ${p.image_url || ''},
              ${!!p.customizable}, ${p.custom_label || 'Your message'}, ${p.in_stock !== false})
    `;
    return res.status(201).json({ id });
  }

  if (req.method === 'PUT') {
    const p = req.body || {};
    if (!p.id) return res.status(400).json({ error: 'Product id required' });
    if (!p.name || !Number.isInteger(p.price_paise) || p.price_paise <= 0) {
      return res.status(400).json({ error: 'Name and a positive price are required' });
    }
    await sql`
      UPDATE products SET
        name = ${p.name}, description = ${p.description || ''}, price_paise = ${p.price_paise},
        image_url = ${p.image_url || ''}, customizable = ${!!p.customizable},
        custom_label = ${p.custom_label || 'Your message'}, in_stock = ${p.in_stock !== false}
      WHERE id = ${p.id}
    `;
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Product id required' });
    await sql`DELETE FROM products WHERE id = ${id}`;
    return res.json({ ok: true });
  }

  res.status(405).end();
}

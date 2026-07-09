import { randomUUID } from 'crypto';
import { db, ensureSchema } from './_db.js';
import { requireAdmin } from './_auth.js';
import { log, logError } from './_log.js';

export default async function handler(req, res) {
  try {
    return await productsHandler(req, res);
  } catch (err) {
    logError('products_handler_error', err, { method: req.method });
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

// Event tags ("birthday", "rakhi", …) — lowercase, deduped, max 12 per product.
const normalizeTags = (tags) =>
  Array.isArray(tags)
    ? [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 12)
    : [];

async function productsHandler(req, res) {
  const sql = db();
  await ensureSchema(sql);

  if (req.method === 'GET') {
    // Public: the shop needs the catalog without login.
    const rows = await sql`
      SELECT id, name, description, price_paise, image_url, customizable, custom_label, in_stock, tags
      FROM products ORDER BY created_at DESC
    `;
    return res.json(rows);
  }

  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.name || !Number.isInteger(p.price_paise) || p.price_paise <= 0) {
      return res.status(400).json({ error: 'Name and a positive price are required' });
    }
    const id = randomUUID();
    await sql`
      INSERT INTO products (id, name, description, price_paise, image_url, customizable, custom_label, in_stock, tags)
      VALUES (${id}, ${p.name}, ${p.description || ''}, ${p.price_paise}, ${p.image_url || ''},
              ${!!p.customizable}, ${p.custom_label || 'Your message'}, ${p.in_stock !== false},
              ${JSON.stringify(normalizeTags(p.tags))})
    `;
    log('product_created', { productId: id, name: p.name, by: admin.email });
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
        custom_label = ${p.custom_label || 'Your message'}, in_stock = ${p.in_stock !== false},
        tags = ${JSON.stringify(normalizeTags(p.tags))}
      WHERE id = ${p.id}
    `;
    log('product_updated', { productId: p.id, name: p.name, inStock: p.in_stock !== false, by: admin.email });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Product id required' });
    await sql`DELETE FROM products WHERE id = ${id}`;
    log('product_deleted', { productId: id, by: admin.email });
    return res.json({ ok: true });
  }

  res.status(405).end();
}

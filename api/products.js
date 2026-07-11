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

// Up to 3 photos; the first is the cover shown on cards. Falls back to the
// legacy single image_url for products saved before multi-photo support.
const normalizeImages = (p) => {
  const images = Array.isArray(p.images) ? p.images.filter(Boolean).slice(0, 3) : [];
  return images.length > 0 ? images : (p.image_url ? [p.image_url] : []);
};

async function productsHandler(req, res) {
  const sql = db();
  await ensureSchema(sql);

  if (req.method === 'GET') {
    // Public: the shop needs the catalog without login.
    const rows = await sql`
      SELECT id, name, description, price_paise, image_url, images, customizable, custom_label, in_stock, tags, featured
      FROM products ORDER BY created_at DESC
    `;
    return res.json(rows.map((r) => ({ ...r, images: normalizeImages(r) })));
  }

  const admin = requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'POST') {
    const p = req.body || {};
    if (!p.name || !Number.isInteger(p.price_paise) || p.price_paise <= 0) {
      return res.status(400).json({ error: 'Name and a positive price are required' });
    }
    const id = randomUUID();
    const images = normalizeImages(p);
    await sql`
      INSERT INTO products (id, name, description, price_paise, image_url, images, customizable, custom_label, in_stock, tags, featured)
      VALUES (${id}, ${p.name}, ${p.description || ''}, ${p.price_paise}, ${images[0] || ''}, ${JSON.stringify(images)},
              ${!!p.customizable}, ${p.custom_label || 'Your message'}, ${p.in_stock !== false},
              ${JSON.stringify(normalizeTags(p.tags))}, ${!!p.featured})
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
    const images = normalizeImages(p);
    await sql`
      UPDATE products SET
        name = ${p.name}, description = ${p.description || ''}, price_paise = ${p.price_paise},
        image_url = ${images[0] || ''}, images = ${JSON.stringify(images)}, customizable = ${!!p.customizable},
        custom_label = ${p.custom_label || 'Your message'}, in_stock = ${p.in_stock !== false},
        tags = ${JSON.stringify(normalizeTags(p.tags))}, featured = ${!!p.featured}
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

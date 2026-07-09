import { randomUUID } from 'crypto';
import { db, ensureSchema } from './_db.js';
import { requireAuth, requireAdmin } from './_auth.js';
import { log, logError } from './_log.js';

export default async function handler(req, res) {
  try {
    return await ordersHandler(req, res);
  } catch (err) {
    logError('orders_handler_error', err, { method: req.method });
    return res.status(500).json({ error: 'Something went wrong' });
  }
}

async function ordersHandler(req, res) {
  const sql = db();
  await ensureSchema(sql);

  if (req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (req.query.scope === 'admin') {
      if (!user.admin) return res.status(403).json({ error: 'Admin only' });
      const status = req.query.status;
      const rows = status
        ? await sql`
            SELECT o.*, u.email AS user_email, u.name AS user_name FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.status = ${status} ORDER BY o.created_at DESC`
        : await sql`
            SELECT o.*, u.email AS user_email, u.name AS user_name FROM orders o
            JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC`;
      return res.json(rows);
    }
    const rows = await sql`SELECT * FROM orders WHERE user_id = ${user.uid} ORDER BY created_at DESC`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;
    const { items, address, upi_ref } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    if (!address?.line1 || !address?.city || !address?.pincode) {
      return res.status(400).json({ error: 'Shipping address is incomplete' });
    }
    if (!upi_ref || String(upi_ref).trim().length < 6) {
      return res.status(400).json({ error: 'Valid UPI transaction reference is required' });
    }

    // Recompute the total server-side from the catalog; never trust client prices.
    let total = 0;
    const verifiedItems = [];
    for (const item of items) {
      const [product] = await sql`
        SELECT id, name, price_paise, in_stock, customizable FROM products WHERE id = ${item.productId}
      `;
      if (!product) return res.status(400).json({ error: `Product no longer available` });
      if (!product.in_stock) return res.status(400).json({ error: `"${product.name}" is out of stock` });
      const qty = Math.max(1, Math.min(20, parseInt(item.qty, 10) || 1));
      total += product.price_paise * qty;
      verifiedItems.push({
        productId: product.id,
        name: product.name,
        price_paise: product.price_paise,
        qty,
        message: product.customizable ? String(item.message || '').slice(0, 200) : '',
      });
    }

    const id = randomUUID();
    await sql`
      INSERT INTO orders (id, user_id, items, address, total_paise, upi_ref)
      VALUES (${id}, ${user.uid}, ${JSON.stringify(verifiedItems)}, ${JSON.stringify(address)},
              ${total}, ${String(upi_ref).trim()})
    `;

    // Save the shipping address into the profile if it's not already there.
    const [row] = await sql`SELECT address FROM users WHERE id = ${user.uid}`;
    const saved = Array.isArray(row?.address) ? row.address : row?.address ? [row.address] : [];
    const key = (a) => `${a.line1}|${a.pincode}`.toLowerCase();
    if (!saved.some((a) => key(a) === key(address)) && saved.length < 10) {
      saved.push(address);
      await sql`UPDATE users SET address = ${JSON.stringify(saved)} WHERE id = ${user.uid}`;
    }

    log('order_placed', { orderId: id, userId: user.uid, totalPaise: total, itemCount: verifiedItems.length });
    return res.status(201).json({ id, total_paise: total });
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res);
    if (!user) return;
    const { id, status, courier, tracking_id, upi_ref } = req.body || {};

    // Customer path: resubmit payment on their own flagged order.
    if (upi_ref !== undefined && !status) {
      if (!id || String(upi_ref).trim().length < 6) {
        return res.status(400).json({ error: 'Valid UPI transaction reference is required' });
      }
      const [order] = await sql`SELECT user_id, status FROM orders WHERE id = ${id}`;
      if (!order || order.user_id !== user.uid) return res.status(404).json({ error: 'Order not found' });
      if (order.status !== 'payment_issue') {
        return res.status(400).json({ error: 'This order is not awaiting payment confirmation' });
      }
      await sql`UPDATE orders SET upi_ref = ${String(upi_ref).trim()}, status = 'pending' WHERE id = ${id}`;
      log('payment_resubmitted', { orderId: id, userId: user.uid });
      return res.json({ ok: true });
    }

    // Admin path: status transitions.
    if (!user.admin) return res.status(403).json({ error: 'Admin only' });
    if (!id || !['pending', 'payment_issue', 'shipped', 'fulfilled'].includes(status)) {
      return res.status(400).json({ error: 'Order id and a valid status are required' });
    }
    if (status === 'shipped' && (!courier || !String(tracking_id || '').trim())) {
      return res.status(400).json({ error: 'Courier name and tracking ID are required to mark shipped' });
    }
    if (status === 'shipped') {
      await sql`
        UPDATE orders SET status = 'shipped',
          courier = ${String(courier).trim()}, tracking_id = ${String(tracking_id).trim()}
        WHERE id = ${id}
      `;
    } else {
      await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;
    }
    log('order_status_changed', { orderId: id, status, by: user.email });
    return res.json({ ok: true });
  }

  res.status(405).end();
}

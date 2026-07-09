import { randomUUID } from 'crypto';
import { db, ensureSchema } from './_db.js';
import { requireAuth, requireAdmin } from './_auth.js';
import { log, logError } from './_log.js';
import { sendShippedEmail } from './_email.js';

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

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res);
    if (!user) return;
    if (!user.admin) return res.status(403).json({ error: 'Admin only' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'No order ids given' });
    // Only fulfilled orders may be deleted — active orders must run their course.
    const deleted = await sql`DELETE FROM orders WHERE id = ANY(${ids}) AND status = 'fulfilled' RETURNING id`;
    log('orders_deleted', { count: deleted.length, requested: ids.length, by: user.email });
    return res.json({ deleted: deleted.length, skipped: ids.length - deleted.length });
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res);
    if (!user) return;

    // Admin path: restore orders from a CSV export. Users are matched by email;
    // rows whose user no longer exists are skipped.
    if (req.query.scope === 'import') {
      if (!user.admin) return res.status(403).json({ error: 'Admin only' });
      const rows = Array.isArray(req.body?.orders) ? req.body.orders : [];
      if (rows.length === 0) return res.status(400).json({ error: 'No orders to import' });
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        if (!row.id || !row.user_email || !Array.isArray(row.items) || !row.address) { skipped++; continue; }
        const [u] = await sql`SELECT id FROM users WHERE email = ${String(row.user_email).toLowerCase()}`;
        if (!u) { skipped++; continue; }
        let orderNo = parseInt(row.order_no, 10);
        if (!Number.isInteger(orderNo)) {
          const [m] = await sql`SELECT COALESCE(MAX(order_no), 1000) + 1 AS next FROM orders`;
          orderNo = Number(m.next);
        }
        await sql`
          INSERT INTO orders (id, order_no, user_id, items, address, total_paise, upi_ref, status, courier, tracking_id, created_at)
          VALUES (${row.id}, ${orderNo}, ${u.id}, ${JSON.stringify(row.items)}, ${JSON.stringify(row.address)},
                  ${parseInt(row.total_paise, 10) || 0}, ${String(row.upi_ref || '')},
                  ${String(row.status || 'pending')}, ${row.courier || null}, ${row.tracking_id || null},
                  ${row.created_at || new Date().toISOString()})
          ON CONFLICT (id) DO UPDATE SET
            order_no = EXCLUDED.order_no,
            items = EXCLUDED.items, address = EXCLUDED.address, total_paise = EXCLUDED.total_paise,
            upi_ref = EXCLUDED.upi_ref, status = EXCLUDED.status,
            courier = EXCLUDED.courier, tracking_id = EXCLUDED.tracking_id, created_at = EXCLUDED.created_at
        `;
        imported++;
      }
      // Keep the auto-numbering ahead of any imported order numbers.
      await sql`SELECT setval(pg_get_serial_sequence('orders', 'order_no'), (SELECT COALESCE(MAX(order_no), 1000) FROM orders))`;
      log('orders_imported', { imported, skipped, by: user.email });
      return res.json({ imported, skipped });
    }

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
    const [created] = await sql`
      INSERT INTO orders (id, user_id, items, address, total_paise, upi_ref)
      VALUES (${id}, ${user.uid}, ${JSON.stringify(verifiedItems)}, ${JSON.stringify(address)},
              ${total}, ${String(upi_ref).trim()})
      RETURNING order_no
    `;

    // Save the shipping address into the profile if it's not already there.
    const [row] = await sql`SELECT address FROM users WHERE id = ${user.uid}`;
    const saved = Array.isArray(row?.address) ? row.address : row?.address ? [row.address] : [];
    const key = (a) => `${a.line1}|${a.pincode}`.toLowerCase();
    if (!saved.some((a) => key(a) === key(address)) && saved.length < 10) {
      saved.push(address);
      await sql`UPDATE users SET address = ${JSON.stringify(saved)} WHERE id = ${user.uid}`;
    }

    log('order_placed', { orderId: id, orderNo: Number(created.order_no), userId: user.uid, totalPaise: total, itemCount: verifiedItems.length });
    return res.status(201).json({ id, order_no: Number(created.order_no), total_paise: total });
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
      // Notify the customer. Email failure must not fail the status change.
      try {
        const [row] = await sql`
          SELECT o.order_no, o.items, o.address, o.courier, o.tracking_id, u.email, u.name
          FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ${id}
        `;
        if (row) {
          await sendShippedEmail(row.email, {
            order_no: row.order_no,
            name: row.name,
            items: row.items,
            courier: row.courier,
            tracking_id: row.tracking_id,
            address: row.address,
          });
          log('shipped_email_sent', { orderId: id, to: row.email });
        }
      } catch (err) {
        logError('shipped_email_failed', err, { orderId: id });
      }
    } else {
      await sql`UPDATE orders SET status = ${status} WHERE id = ${id}`;
    }
    log('order_status_changed', { orderId: id, status, by: user.email });
    return res.json({ ok: true });
  }

  res.status(405).end();
}

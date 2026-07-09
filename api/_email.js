// Emails are sent via Resend (https://resend.com).
// Set RESEND_API_KEY in Vercel. Without a key (local dev), nothing is sent.
// The sender is always the admin account (ADMIN_EMAIL).

const APP_NAME = process.env.APP_NAME || 'Moment Kart';

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };

  const sender = process.env.ADMIN_EMAIL || 'onboarding@resend.dev';
  const post = (body) =>
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

  let res = await post({ from: `${APP_NAME} <${sender}>`, to: [to], subject, html });
  if (!res.ok && sender !== 'onboarding@resend.dev') {
    // Resend only accepts senders on domains verified in its dashboard (so never
    // gmail.com etc.). Fall back to its shared sender, keeping the admin as reply-to.
    res = await post({
      from: `${APP_NAME} <onboarding@resend.dev>`,
      reply_to: sender,
      to: [to],
      subject,
      html,
    });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email send failed: ${res.status} ${detail}`);
  }
  return { sent: true };
}

export async function sendVerificationEmail(email, code) {
  return sendEmail({
    to: email,
    subject: `${code} is your ${APP_NAME} verification code`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:linear-gradient(180deg,#e0f2fe,#f0f9ff);border-radius:12px">
        <h2 style="color:#0369a1">🌊 ${APP_NAME}</h2>
        <p>Your verification code is:</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#0c4a6e">${code}</p>
        <p style="color:#64748b;font-size:13px">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
      </div>
    `,
  });
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendShippedEmail(email, { order_no, name, items, courier, tracking_id, address }) {
  const itemLines = (items || [])
    .map((i) => `<li>${escapeHtml(i.name)} × ${Number(i.qty) || 1}</li>`)
    .join('');
  const dest = address
    ? escapeHtml([address.line1, address.city, address.pincode].filter(Boolean).join(', '))
    : '';
  return sendEmail({
    to: email,
    subject: `Your ${APP_NAME} order is on its way 📦`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:linear-gradient(180deg,#e0f2fe,#f0f9ff);border-radius:12px">
        <h2 style="color:#0369a1">🌊 ${APP_NAME}</h2>
        <p>Hi ${escapeHtml(name || 'there')}, your order has been shipped!</p>
        ${order_no ? `<p style="color:#64748b;font-size:13px">Order ID: <strong>#${escapeHtml(order_no)}</strong></p>` : ''}
        <ul style="color:#0c4a6e">${itemLines}</ul>
        <p><strong>Courier:</strong> ${escapeHtml(courier || '')}<br/>
           <strong>Tracking ID:</strong> ${escapeHtml(tracking_id || '')}</p>
        ${dest ? `<p style="color:#64748b;font-size:13px">Delivering to: ${dest}</p>` : ''}
        <p style="color:#64748b;font-size:13px">Thank you for shopping with ${APP_NAME}.</p>
      </div>
    `,
  });
}

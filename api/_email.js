// Emails are sent via Gmail SMTP using nodemailer.
// Set GMAIL_USER and GMAIL_APP_PASSWORD in Vercel. Without them (local dev), nothing is sent.
// GMAIL_APP_PASSWORD is a 16-character App Password from
// https://myaccount.google.com/apppasswords (requires 2-Step Verification enabled).

import nodemailer from 'nodemailer';

const APP_NAME = process.env.APP_NAME || 'Moment Kart';

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { sent: false };

  await getTransporter().sendMail({
    from: `${APP_NAME} <${user}>`,
    to,
    subject,
    html,
  });
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

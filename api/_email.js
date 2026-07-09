// Sends the verification code email via Resend (https://resend.com).
// Set RESEND_API_KEY and EMAIL_FROM env vars in Vercel.
// Without a key (local dev), the code is returned in the API response instead.
export async function sendVerificationEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Moment Kart <onboarding@resend.dev>',
      to: [email],
      subject: `${code} is your Moment Kart verification code`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:linear-gradient(180deg,#e0f2fe,#f0f9ff);border-radius:12px">
          <h2 style="color:#0369a1">🌊 Moment Kart</h2>
          <p>Your verification code is:</p>
          <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#0c4a6e">${code}</p>
          <p style="color:#64748b;font-size:13px">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email send failed: ${res.status} ${detail}`);
  }
  return { sent: true };
}

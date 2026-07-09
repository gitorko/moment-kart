import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Everything the dev server does (emails, OTP codes, errors) is appended here.
// Rolls over at 5 MB: app.log → app.log.1 → app.log.2 → app.log.3 (oldest dropped).
const DEV_LOG = 'app.log';
const MAX_LOG_BYTES = 5 * 1024 * 1024;
const KEEP_ROTATED = 3;

function rotateLogIfNeeded() {
  try {
    if (!fs.existsSync(DEV_LOG) || fs.statSync(DEV_LOG).size < MAX_LOG_BYTES) return;
    for (let i = KEEP_ROTATED - 1; i >= 1; i--) {
      if (fs.existsSync(`${DEV_LOG}.${i}`)) fs.renameSync(`${DEV_LOG}.${i}`, `${DEV_LOG}.${i + 1}`);
    }
    fs.renameSync(DEV_LOG, `${DEV_LOG}.1`);
  } catch { /* rotation must not break logging */ }
}

// Dev-only /api/dev-email endpoint on the Vite dev server: sends real emails via
// Resend (RESEND_API_KEY from .env.local) and prints OTP codes to this terminal
// and app.log — codes never appear in the browser.
function devEmailApi() {
  return {
    name: 'dev-email-api',
    apply: 'serve',
    configureServer(server) {
      const record = (line, isError = false) => {
        const stamped = `[${new Date().toISOString()}] ${line}`;
        if (isError) server.config.logger.error(`  ${stamped}`);
        else server.config.logger.info(`\x1b[1;36m  ${stamped}\x1b[0m`);
        try {
          rotateLogIfNeeded();
          fs.appendFileSync(DEV_LOG, stamped + '\n');
        } catch { /* logging must not break dev */ }
      };

      server.middlewares.use('/api/dev-email', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { kind, to, code, order } = JSON.parse(body || '{}');
            if (kind === 'verification') record(`verification code for ${to}: ${code}`);
            const email = await import(pathToFileURL(path.resolve('api/_email.js')).href);
            const result = kind === 'shipped'
              ? await email.sendShippedEmail(to, order || {})
              : await email.sendVerificationEmail(to, code);
            record(`${kind} email to ${to}: ${result.sent ? 'sent via Resend' : 'NOT sent (no RESEND_API_KEY in .env.local)'}`);
            res.end(JSON.stringify(result));
          } catch (err) {
            record(`email send failed: ${err.message}`, true);
            res.statusCode = 500;
            res.end(JSON.stringify({ sent: false, error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Same env var names in local dev (.env.local) and production (Vercel dashboard).
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const isDev = command === 'serve';
  // api/_email.js reads these from process.env — make .env.local values visible to it in dev.
  for (const key of ['APP_NAME', 'ADMIN_EMAIL', 'RESEND_API_KEY']) {
    if (env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), devEmailApi()],
    define: {
      // Shop display name — set APP_NAME in .env.local / Vercel to rebrand.
      __APP_NAME__: JSON.stringify(env.APP_NAME || ''),
      // UPI id is public by nature (customers pay to it) — embedded in all builds.
      __UPI_ID__: JSON.stringify(env.ADMIN_UPI_ID || ''),
      // Admin credentials are injected in `npm run dev` ONLY —
      // they must never end up in a production bundle.
      __DEV_ADMIN_EMAIL__: JSON.stringify(isDev ? env.ADMIN_EMAIL || '' : ''),
      __DEV_ADMIN_PASSWORD__: JSON.stringify(isDev ? env.ADMIN_PASSWORD || '' : ''),
    },
  };
});

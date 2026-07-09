import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // Same env var names in local dev (.env.local) and production (Vercel dashboard).
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const isDev = command === 'serve';
  return {
    plugins: [react()],
    define: {
      // UPI id is public by nature (customers pay to it) — embedded in all builds.
      __UPI_ID__: JSON.stringify(env.ADMIN_UPI_ID || ''),
      // Admin credentials are injected in `npm run dev` ONLY —
      // they must never end up in a production bundle.
      __DEV_ADMIN_EMAIL__: JSON.stringify(isDev ? env.ADMIN_EMAIL || '' : ''),
      __DEV_ADMIN_PASSWORD__: JSON.stringify(isDev ? env.ADMIN_PASSWORD || '' : ''),
    },
  };
});

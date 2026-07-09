// Structured logging for Vercel's function logs (View Logs in the dashboard, or
// `vercel logs`). Emits one JSON line per event — easy to grep/filter by "event".
export function log(event, data = {}) {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

export function logError(event, err, data = {}) {
  console.error(JSON.stringify({ event, ts: new Date().toISOString(), error: err?.message || String(err), ...data }));
}

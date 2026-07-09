// Data layer. In production every call hits the Vercel serverless APIs (Postgres).
// In local dev (`npm run dev`) everything is served from localStorage — no backend,
// no database, and the email verification code is shown on screen.

export const IS_DEV = !import.meta.env.PROD;

export const AUTH_KEY = 'moment-kart-auth';

function authFetch(url, opts = {}) {
  const token = localStorage.getItem(AUTH_KEY) || '';
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  }).then((r) => {
    if (r.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      window.location.hash = '#/auth';
      window.location.reload();
    }
    return r;
  });
}

async function toResult(resPromise) {
  try {
    const res = await resPromise;
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { error: 'Connection error — please try again' } };
  }
}

// ─── Local (dev) storage helpers ──────────────────────────────────────────────

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const USERS_KEY = 'mk-dev-users';
const PRODUCTS_KEY = 'mk-dev-products';
const ORDERS_KEY = 'mk-dev-orders';
const CODES_KEY = 'mk-dev-codes';
const REVIEWS_KEY = 'mk-dev-reviews';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// Default dev admin credentials come from .env.local (VITE_ADMIN_EMAIL / VITE_ADMIN_PASSWORD).
const DEV_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'admin@momentkart.dev').toLowerCase();
const DEV_ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

function devIsAdmin(email) {
  return email.toLowerCase() === DEV_ADMIN_EMAIL;
}

function devToken(user) {
  const payload = btoa(
    JSON.stringify({
      uid: user.id,
      email: user.email,
      name: user.name,
      admin: devIsAdmin(user.email),
      exp: Date.now() + 90 * 24 * 60 * 60 * 1000,
    })
  ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${payload}.dev`;
}

function devCurrentUser() {
  try {
    const token = localStorage.getItem(AUTH_KEY);
    const [payload] = token.split('.');
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authAction(body) {
  if (!IS_DEV) return toResult(fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

  const users = read(USERS_KEY, []);
  const codes = read(CODES_KEY, {});
  const email = String(body.email || '').trim().toLowerCase();
  const user = users.find((u) => u.email === email);

  if (body.action === 'signup') {
    if (user?.verified) return { ok: false, data: { error: 'Account already exists — please login' } };
    const next = users.filter((u) => u.email !== email);
    next.push({ id: user?.id || uid(), email, name: body.name, password: body.password, verified: false, address: null });
    write(USERS_KEY, next);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes[email] = code;
    write(CODES_KEY, codes);
    return { ok: true, data: { devCode: code } };
  }
  if (body.action === 'resend') {
    if (!user) return { ok: false, data: { error: 'No account found — please signup' } };
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes[email] = code;
    write(CODES_KEY, codes);
    return { ok: true, data: { devCode: code } };
  }
  if (body.action === 'verify') {
    if (!user || codes[email] !== String(body.code)) return { ok: false, data: { error: 'Invalid verification code' } };
    user.verified = true;
    write(USERS_KEY, users);
    delete codes[email];
    write(CODES_KEY, codes);
    return { ok: true, data: { token: devToken(user) } };
  }
  if (body.action === 'login') {
    // Built-in dev admin — no signup or verification needed locally.
    if (email === DEV_ADMIN_EMAIL && body.password === DEV_ADMIN_PASSWORD) {
      return { ok: true, data: { token: devToken({ id: 'dev-admin', email, name: 'Admin' }) } };
    }
    if (!user || user.password !== body.password) return { ok: false, data: { error: 'Invalid email or password' } };
    if (!user.verified) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      codes[email] = code;
      write(CODES_KEY, codes);
      return { ok: false, data: { error: 'Email not verified', needsVerification: true, devCode: code } };
    }
    return { ok: true, data: { token: devToken(user) } };
  }
  return { ok: false, data: { error: 'Unknown action' } };
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function fetchProducts() {
  if (!IS_DEV) return fetch('/api/products').then((r) => r.json());
  return read(PRODUCTS_KEY, []);
}

export async function saveProduct(product, editingId) {
  if (!IS_DEV) {
    return toResult(authFetch('/api/products', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify({ ...product, id: editingId }),
    }));
  }
  const products = read(PRODUCTS_KEY, []);
  if (editingId) {
    const idx = products.findIndex((p) => p.id === editingId);
    if (idx >= 0) products[idx] = { ...products[idx], ...product, id: editingId };
  } else {
    products.unshift({ ...product, id: uid() });
  }
  write(PRODUCTS_KEY, products);
  return { ok: true, data: {} };
}

export async function deleteProduct(id) {
  if (!IS_DEV) return toResult(authFetch(`/api/products?id=${id}`, { method: 'DELETE' }));
  write(PRODUCTS_KEY, read(PRODUCTS_KEY, []).filter((p) => p.id !== id));
  return { ok: true, data: {} };
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile() {
  if (!IS_DEV) {
    const res = await authFetch('/api/profile');
    return res.ok ? res.json() : null;
  }
  const me = devCurrentUser();
  const user = read(USERS_KEY, []).find((u) => u.email === me?.email);
  if (!user && me) return { email: me.email, name: me.name, addresses: read(`mk-dev-addr-${me.email}`, []) };
  return user ? { email: user.email, name: user.name, addresses: user.addresses || [] } : null;
}

export async function saveProfile({ name, addresses }) {
  if (!IS_DEV) return toResult(authFetch('/api/profile', { method: 'PUT', body: JSON.stringify({ name, addresses }) }));
  const me = devCurrentUser();
  const users = read(USERS_KEY, []);
  const user = users.find((u) => u.email === me?.email);
  if (!user) {
    // Built-in dev admin has no user record — keep its addresses separately.
    if (me) {
      write(`mk-dev-addr-${me.email}`, addresses || []);
      return { ok: true, data: {} };
    }
    return { ok: false, data: { error: 'User not found' } };
  }
  user.name = name;
  user.addresses = addresses || [];
  write(USERS_KEY, users);
  return { ok: true, data: {} };
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function placeOrder({ items, address, upi_ref }) {
  if (!IS_DEV) return toResult(authFetch('/api/orders', { method: 'POST', body: JSON.stringify({ items, address, upi_ref }) }));

  const me = devCurrentUser();
  const products = read(PRODUCTS_KEY, []);
  let total = 0;
  const verifiedItems = [];
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return { ok: false, data: { error: 'Product no longer available' } };
    if (!product.in_stock) return { ok: false, data: { error: `"${product.name}" is out of stock` } };
    const qty = Math.max(1, Math.min(20, parseInt(item.qty, 10) || 1));
    total += product.price_paise * qty;
    verifiedItems.push({ productId: product.id, name: product.name, price_paise: product.price_paise, qty, message: product.customizable ? String(item.message || '').slice(0, 200) : '' });
  }
  const orders = read(ORDERS_KEY, []);
  orders.unshift({
    id: uid(), user_email: me?.email, user_name: me?.name,
    items: verifiedItems, address, total_paise: total,
    upi_ref, status: 'pending', created_at: new Date().toISOString(),
  });
  write(ORDERS_KEY, orders);
  return { ok: true, data: {} };
}

export async function fetchMyOrders() {
  if (!IS_DEV) {
    const res = await authFetch('/api/orders');
    return res.ok ? res.json() : [];
  }
  const me = devCurrentUser();
  return read(ORDERS_KEY, []).filter((o) => o.user_email === me?.email);
}

export async function fetchAdminOrders(filter) {
  if (!IS_DEV) {
    const q = filter === 'all' ? '' : `&status=${filter}`;
    const res = await authFetch(`/api/orders?scope=admin${q}`);
    return res.ok ? res.json() : [];
  }
  const orders = read(ORDERS_KEY, []);
  return filter === 'all' ? orders : orders.filter((o) => o.status === filter);
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export async function fetchReviews(productId) {
  if (!IS_DEV) {
    const res = await fetch(`/api/reviews?productId=${productId}`);
    return res.ok ? res.json() : [];
  }
  return read(REVIEWS_KEY, []).filter((r) => r.product_id === productId && r.status === 'approved');
}

export async function fetchFeaturedReviews() {
  if (!IS_DEV) {
    const res = await fetch('/api/reviews?scope=featured');
    return res.ok ? res.json() : [];
  }
  const products = read(PRODUCTS_KEY, []);
  return read(REVIEWS_KEY, [])
    .filter((r) => r.status === 'approved' && r.featured)
    .map((r) => ({ ...r, product_name: products.find((p) => p.id === r.product_id)?.name || '' }))
    .slice(0, 6);
}

export async function submitReview({ productId, rating, text }) {
  if (!IS_DEV) return toResult(authFetch('/api/reviews', { method: 'POST', body: JSON.stringify({ productId, rating, text }) }));
  const me = devCurrentUser();
  if (!me) return { ok: false, data: { error: 'Please login to review' } };
  const reviews = read(REVIEWS_KEY, []);
  reviews.unshift({
    id: uid(), product_id: productId, user_id: me.uid, user_name: me.name,
    rating, text: String(text || '').slice(0, 1000),
    status: 'pending', featured: false, created_at: new Date().toISOString(),
  });
  write(REVIEWS_KEY, reviews);
  return { ok: true, data: { message: 'Review submitted — it will appear once approved' } };
}

export async function fetchAdminReviews(filter) {
  if (!IS_DEV) {
    const q = filter === 'all' ? '' : `&status=${filter}`;
    const res = await authFetch(`/api/reviews?scope=admin${q}`);
    return res.ok ? res.json() : [];
  }
  const products = read(PRODUCTS_KEY, []);
  const reviews = read(REVIEWS_KEY, []).map((r) => ({
    ...r, product_name: products.find((p) => p.id === r.product_id)?.name || '',
  }));
  return filter === 'all' ? reviews : reviews.filter((r) => r.status === filter);
}

export async function updateReview(id, patch) {
  if (!IS_DEV) return toResult(authFetch('/api/reviews', { method: 'PUT', body: JSON.stringify({ id, ...patch }) }));
  const reviews = read(REVIEWS_KEY, []);
  const review = reviews.find((r) => r.id === id);
  if (review) Object.assign(review, patch);
  write(REVIEWS_KEY, reviews);
  return { ok: true, data: {} };
}

export async function deleteReview(id) {
  if (!IS_DEV) return toResult(authFetch(`/api/reviews?id=${id}`, { method: 'DELETE' }));
  write(REVIEWS_KEY, read(REVIEWS_KEY, []).filter((r) => r.id !== id));
  return { ok: true, data: {} };
}

export async function setOrderStatus(id, status) {
  if (!IS_DEV) return toResult(authFetch('/api/orders', { method: 'PUT', body: JSON.stringify({ id, status }) }));
  const orders = read(ORDERS_KEY, []);
  const order = orders.find((o) => o.id === id);
  if (order) order.status = status;
  write(ORDERS_KEY, orders);
  return { ok: true, data: {} };
}

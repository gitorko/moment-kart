import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import {
  AUTH_KEY, authAction, fetchProducts, saveProduct, deleteProduct,
  fetchProfile, saveProfile, placeOrder as apiPlaceOrder,
  fetchMyOrders, fetchAdminOrders, setOrderStatus as apiSetOrderStatus, resubmitPayment,
  deleteOrders, importOrders,
  fetchReviews, fetchFeaturedReviews, submitReview, fetchAdminReviews, updateReview, deleteReview,
  fetchAdminUsers, impersonateUser,
} from './api.js';

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

const CART_KEY = 'moment-kart-cart';
const UPI_ID = (typeof __UPI_ID__ !== 'undefined' && __UPI_ID__) || 'momentkart@upi';

const buildUpiLink = (totalPaise) =>
  `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(APP_NAME)}&am=${(totalPaise / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`${APP_NAME} order`)}`;
// Shop display name, configurable via APP_NAME in .env.local (dev) / Vercel env vars (prod).
const APP_NAME = (typeof __APP_NAME__ !== 'undefined' && __APP_NAME__) || 'Moment Kart';
const [BRAND_FIRST, ...BRAND_REST_WORDS] = APP_NAME.split(' ');
const BRAND_REST = BRAND_REST_WORDS.join(' ');
const BRAND_INITIALS = APP_NAME.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function b64urlDecode(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

function getSession() {
  try {
    const token = localStorage.getItem(AUTH_KEY);
    if (!token) return null;
    const [payload] = token.split('.');
    const data = JSON.parse(b64urlDecode(payload));
    if (!data.exp || data.exp < Date.now()) {
      localStorage.removeItem(AUTH_KEY);
      return null;
    }
    return { token, name: data.name, email: data.email, admin: !!data.admin };
  } catch {
    localStorage.removeItem(AUTH_KEY);
    return null;
  }
}

// ─── CART (localStorage) ──────────────────────────────────────────────────────

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

const rupees = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

// ─── ROUTING ──────────────────────────────────────────────────────────────────

function useHashRoute() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

const go = (path) => (window.location.hash = '#' + path);

// ─── WAVES (landing decoration) ───────────────────────────────────────────────

function waveDataUri(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 140" preserveAspectRatio="none"><path d="M0,70 C200,140 400,0 600,70 C800,140 1000,0 1200,70 L1200,140 L0,140 Z" fill="${color}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function Waves() {
  return (
    <div className="waves">
      <div className="wave wave-1" style={{ backgroundImage: waveDataUri('#3e7d8f') }} />
      <div className="wave wave-2" style={{ backgroundImage: waveDataUri('#e8eef0') }} />
      <div className="wave wave-3" style={{ backgroundImage: waveDataUri('#f7f5f0') }} />
    </div>
  );
}

function Bubbles() {
  const bubbles = [
    { left: '8%', size: 22, dur: 11, delay: 0 },
    { left: '20%', size: 14, dur: 9, delay: 2 },
    { left: '35%', size: 30, dur: 13, delay: 1 },
    { left: '52%', size: 12, dur: 8, delay: 4 },
    { left: '68%', size: 26, dur: 12, delay: 0.5 },
    { left: '82%', size: 16, dur: 10, delay: 3 },
    { left: '93%', size: 20, dur: 14, delay: 1.5 },
  ];
  return bubbles.map((b, i) => (
    <span
      key={i}
      className="bubble"
      style={{
        left: b.left,
        width: b.size,
        height: b.size,
        animationDuration: `${b.dur}s`,
        animationDelay: `${b.delay}s`,
      }}
    />
  ));
}

// ─── REVIEWS ──────────────────────────────────────────────────────────────────

function Stars({ value, onChange }) {
  return (
    <span className={onChange ? 'stars stars-input' : 'stars'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={n <= value ? 'star filled' : 'star'}
          onClick={onChange ? () => onChange(n) : undefined}
          role={onChange ? 'button' : undefined}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function ProductReviews({ productId, session }) {
  const [reviews, setReviews] = useState(null);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchReviews(productId).then(setReviews).catch(() => setReviews([]));
  }, [productId]);

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      setNote('Please pick a star rating');
      return;
    }
    setBusy(true);
    const { ok, data } = await submitReview({ productId, rating, text });
    setBusy(false);
    if (ok) {
      setRating(0);
      setText('');
      setNote('Thank you — your review will appear once approved.');
    } else {
      setNote(data.error || 'Could not submit review');
    }
  }

  return (
    <div className="reviews-panel">
      {reviews === null ? (
        <p style={{ fontSize: 13, color: 'var(--slate)' }}>Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--slate)', fontStyle: 'italic' }}>No reviews yet.</p>
      ) : (
        reviews.map((r) => (
          <div key={r.id} className="review">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Stars value={r.rating} />
              <span style={{ fontSize: 12, color: 'var(--slate)' }}>{r.user_name}</span>
            </div>
            {r.text && <p style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{r.text}</p>}
          </div>
        ))
      )}
      {session?.admin ? null : session ? (
        <form onSubmit={submit} style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Stars value={rating} onChange={setRating} />
            <span style={{ fontSize: 12, color: 'var(--slate)' }}>Rate this product</span>
          </div>
          <textarea
            className="review-input"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={2}
            placeholder="Share your experience (optional)"
          />
          {note && <p style={{ fontSize: 12, color: 'var(--ocean)', margin: '4px 0' }}>{note}</p>}
          <button className="btn btn-sm btn-ghost" disabled={busy}>{busy ? 'Submitting…' : 'Submit review'}</button>
        </form>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--slate)', marginTop: 8 }}>
          <a href="#/auth" style={{ color: 'var(--ocean)' }}>Login</a> to write a review.
        </p>
      )}
    </div>
  );
}

// ─── CAROUSEL ─────────────────────────────────────────────────────────────────

// Any image dropped into src/assets/carousel/ is picked up automatically at build time.
const carouselImages = Object.entries(
  import.meta.glob('./assets/carousel/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' })
)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url);

function Carousel() {
  const [index, setIndex] = useState(0);
  const count = carouselImages.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="page" style={{ paddingBottom: 48 }}>
      <h2 style={{ textAlign: 'center' }}>Signature Pieces</h2>
      <div className="carousel">
        {carouselImages.map((src, i) => (
          <img key={src} src={src} alt="" className={i === index ? 'slide active' : 'slide'} />
        ))}
        {count > 1 && (
          <>
            <button className="carousel-arrow prev" onClick={() => setIndex((index - 1 + count) % count)} aria-label="Previous">‹</button>
            <button className="carousel-arrow next" onClick={() => setIndex((index + 1) % count)} aria-label="Next">›</button>
            <div className="carousel-dots">
              {carouselImages.map((_, i) => (
                <button key={i} className={i === index ? 'dot active' : 'dot'} onClick={() => setIndex(i)} aria-label={`Slide ${i + 1}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── AUTH PAGE ────────────────────────────────────────────────────────────────

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login'); // login | signup | verify
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function call(body) {
    setError('');
    setLoading(true);
    const result = await authAction(body);
    setLoading(false);
    return result;
  }

  async function handleSignup(e) {
    e.preventDefault();
    const r = await call({ action: 'signup', email, name, password });
    if (!r) return;
    if (r.ok) {
      setInfo('Verification code sent to your email');
      setMode('verify');
    } else setError(r.data.error || 'Signup failed');
  }

  async function handleLogin(e) {
    e.preventDefault();
    const r = await call({ action: 'login', email, password });
    if (!r) return;
    if (r.ok) {
      localStorage.setItem(AUTH_KEY, r.data.token);
      onLogin();
    } else if (r.data.needsVerification) {
      setInfo('Verification code sent to your email');
      setMode('verify');
    } else setError(r.data.error || 'Login failed');
  }

  async function handleVerify(e) {
    e.preventDefault();
    const r = await call({ action: 'verify', email, code });
    if (!r) return;
    if (r.ok) {
      localStorage.setItem(AUTH_KEY, r.data.token);
      onLogin();
    } else setError(r.data.error || 'Verification failed');
  }

  async function handleResend() {
    const r = await call({ action: 'resend', email });
    if (r?.ok) setInfo('Verification code resent');
    else if (r) setError(r.data.error || 'Could not resend code');
  }

  async function handleForgot(e) {
    e.preventDefault();
    const r = await call({ action: 'forgot', email });
    if (!r) return;
    if (r.ok) {
      setInfo('If an account exists, a reset code has been sent');
      setMode('reset');
    } else setError(r.data.error || 'Could not send reset code');
  }

  async function handleReset(e) {
    e.preventDefault();
    const r = await call({ action: 'reset', email, code, password });
    if (!r) return;
    if (r.ok) {
      localStorage.setItem(AUTH_KEY, r.data.token);
      onLogin();
    } else setError(r.data.error || 'Could not reset password');
  }

  return (
    <div className="auth-wrap card">
      <h1 style={{ textAlign: 'center', color: 'var(--deep)', marginBottom: 6 }}>{APP_NAME}</h1>
      <p style={{ textAlign: 'center', color: 'var(--slate)', marginBottom: 20, fontSize: 14 }}>
        Souvenirs that flow with your memories
      </p>
      {mode !== 'verify' && mode !== 'forgot' && mode !== 'reset' && (
        <div className="tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
            Login
          </button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>
            Sign Up
          </button>
        </div>
      )}

      {mode === 'signup' && (
        <form onSubmit={handleSignup}>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="At least 6 characters" />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Sending code…' : 'Create account'}
          </button>
        </form>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Your password" />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
          <button
            type="button"
            className="link-btn"
            style={{ margin: '14px auto 0', display: 'block' }}
            onClick={() => { setError(''); setInfo(''); setMode('forgot'); }}
          >
            Forgot password?
          </button>
        </form>
      )}

      {mode === 'forgot' && (
        <form onSubmit={handleForgot}>
          <p style={{ marginBottom: 12, color: 'var(--slate)', fontSize: 14 }}>
            Enter your email and we'll send you a reset code.
          </p>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoFocus />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Sending code…' : 'Send reset code'}
          </button>
          <button type="button" className="link-btn" style={{ margin: '14px auto 0', display: 'block' }} onClick={() => { setError(''); setMode('login'); }}>
            Back to login
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form onSubmit={handleReset}>
          <p style={{ marginBottom: 12, color: 'var(--slate)', fontSize: 14 }}>
            Enter the 6-digit code sent to <strong>{email}</strong> and your new password.
          </p>
          {info && <p className="success">{info}</p>}
          <div className="field">
            <label>Reset code</label>
            <input
              className="otp-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              placeholder="••••••"
              autoFocus
            />
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="At least 6 characters" />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={loading || code.length !== 6}>
            {loading ? 'Resetting…' : 'Reset password & login'}
          </button>
          <button type="button" className="link-btn" style={{ margin: '14px auto 0', display: 'block' }} onClick={handleForgot} disabled={loading}>
            Resend code
          </button>
        </form>
      )}

      {mode === 'verify' && (
        <form onSubmit={handleVerify}>
          <p style={{ marginBottom: 12, color: 'var(--slate)', fontSize: 14 }}>
            Enter the 6-digit code sent to <strong>{email}</strong>
          </p>
          {info && <p className="success">{info}</p>}
          <div className="field">
            <input
              className="otp-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              inputMode="numeric"
              placeholder="••••••"
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" style={{ width: '100%' }} disabled={loading || code.length !== 6}>
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 10 }} onClick={handleResend} disabled={loading}>
            Resend code
          </button>
        </form>
      )}
    </div>
  );
}

// ─── LANDING ──────────────────────────────────────────────────────────────────

function Landing({ products }) {
  const featured = products.filter((p) => p.in_stock).slice(0, 3);
  const [quotes, setQuotes] = useState([]);
  useEffect(() => {
    fetchFeaturedReviews().then(setQuotes).catch(() => {});
  }, []);
  return (
    <>
      <section className="hero">
        <Bubbles />
        <h1>{APP_NAME}</h1>
        <div className="rule" />
        <p>
          Souvenirs that flow with your memories — personalised keepsakes,
          delivered like a gentle tide to your doorstep.
        </p>
        <button className="btn" onClick={() => go('/shop')}>
          Explore the Collection
        </button>
        <Waves />
      </section>
      <Carousel />
      {featured.length > 0 && (
        <div className="page">
          <h2 style={{ textAlign: 'center' }}>Featured Keepsakes</h2>
          <div className="grid" style={{ marginTop: 20 }}>
            {featured.map((p, i) => (
              <div key={p.id} className="ripple-float" style={{ animationDelay: `${i * 0.7}s` }}>
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </div>
      )}
      {quotes.length > 0 && (
        <div className="page" style={{ paddingTop: 0 }}>
          <h2 style={{ textAlign: 'center' }}>Words from Our Customers</h2>
          <div className="quotes">
            {quotes.map((q) => (
              <figure key={q.id} className="quote card">
                <Stars value={q.rating} />
                <blockquote>“{q.text}”</blockquote>
                <figcaption>
                  — {q.user_name}
                  {q.product_name && <span> · {q.product_name}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── SHOP ─────────────────────────────────────────────────────────────────────

function ProductCard({ product, onAdd, session }) {
  const [message, setMessage] = useState('');
  const [added, setAdded] = useState(false);
  const [showReviews, setShowReviews] = useState(false);

  function add() {
    onAdd(product, message);
    setMessage('');
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <div className="card product-card">
      {product.image_url ? (
        <img src={product.image_url} alt={product.name} />
      ) : (
        <div className="img-placeholder">{BRAND_INITIALS}</div>
      )}
      <div className="body">
        <strong>{product.name}</strong>
        <span className="desc">{product.description}</span>
        <span className="price">{rupees(product.price_paise)}</span>
        {!product.in_stock && <span className="badge badge-oos">Out of stock</span>}
        {onAdd && product.in_stock && (
          <>
            {product.customizable && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>{product.custom_label || 'Your message'}</label>
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                  placeholder="e.g. Happy Birthday Asha!"
                />
              </div>
            )}
            <button className="btn btn-sm" onClick={add}>
              {added ? 'Added ✓' : 'Add to Cart'}
            </button>
          </>
        )}
        {(product.tags || []).length > 0 && (
          <span className="product-tags">
            {product.tags.map((t) => <span key={t} className="ptag">{t}</span>)}
          </span>
        )}
        <button type="button" className="link-btn" onClick={() => setShowReviews(!showReviews)}>
          {showReviews ? 'Hide reviews' : 'Reviews'}
        </button>
        {showReviews && <ProductReviews productId={product.id} session={session} />}
      </div>
    </div>
  );
}

const SHOP_PAGE_SIZE = 12;

function Shop({ products, onAdd, session }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(0);

  const allTags = [...new Set(products.flatMap((p) => p.tags || []))].sort();
  const q = query.trim().toLowerCase();
  const filtered = products.filter((p) => {
    if (tag && !(p.tags || []).includes(tag)) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.includes(q))
    );
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / SHOP_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageSlice = filtered.slice(safePage * SHOP_PAGE_SIZE, (safePage + 1) * SHOP_PAGE_SIZE);

  return (
    <div className="page">
      <h1>The Collection</h1>
      {products.length === 0 ? (
        <p className="empty">The tide hasn't brought any products yet — check back soon!</p>
      ) : (
        <>
          <div className="shop-toolbar">
            <input
              type="search"
              className="shop-search"
              placeholder="Search by name, event or description…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
            />
            {allTags.length > 0 && (
              <div className="tag-row">
                <button type="button" className={tag === '' ? 'tag-chip active' : 'tag-chip'}
                  onClick={() => { setTag(''); setPage(0); }}>
                  All
                </button>
                {allTags.map((t) => (
                  <button key={t} type="button" className={tag === t ? 'tag-chip active' : 'tag-chip'}
                    onClick={() => { setTag(tag === t ? '' : t); setPage(0); }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filtered.length === 0 ? (
            <p className="empty">Nothing matches — try another event or search term.</p>
          ) : (
            <div className="grid">
              {pageSlice.map((p) => (
                <ProductCard key={p.id} product={p} onAdd={onAdd} session={session} />
              ))}
            </div>
          )}
          {pageCount > 1 && (
            <div className="shop-pager">
              <button type="button" className="btn btn-sm btn-ghost" disabled={safePage <= 0}
                onClick={() => setPage(safePage - 1)}>
                ← Previous
              </button>
              <span>Page {safePage + 1} of {pageCount} · {filtered.length} products</span>
              <button type="button" className="btn btn-sm btn-ghost" disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── CART ─────────────────────────────────────────────────────────────────────

function Cart({ cart, setCart, session }) {
  const total = cart.reduce((sum, item) => sum + item.price_paise * item.qty, 0);

  function setQty(idx, qty) {
    const next = [...cart];
    if (qty <= 0) next.splice(idx, 1);
    else next[idx] = { ...next[idx], qty: Math.min(20, qty) };
    setCart(next);
  }

  if (cart.length === 0) {
    return (
      <div className="page">
        <h1>Your Cart</h1>
        <p className="empty">
          Your cart is as empty as a calm sea. <a href="#/shop" style={{ color: 'var(--ocean)', fontWeight: 600 }}>Browse the collection →</a>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Your Cart</h1>
      <div className="card">
        {cart.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--foam)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>{item.name}</strong>
              {item.message && (
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>💬 “{item.message}”</div>
              )}
            </div>
            <div className="qty-controls">
              <button onClick={() => setQty(idx, item.qty - 1)}>−</button>
              <span>{item.qty}</span>
              <button onClick={() => setQty(idx, item.qty + 1)}>+</button>
            </div>
            <strong style={{ minWidth: 90, textAlign: 'right' }}>{rupees(item.price_paise * item.qty)}</strong>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 18 }}>
          <strong>Total</strong>
          <strong style={{ color: 'var(--ocean)' }}>{rupees(total)}</strong>
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 18 }} onClick={() => go(session ? '/checkout' : '/auth')}>
          {session ? 'Proceed to checkout →' : 'Login to checkout →'}
        </button>
      </div>
    </div>
  );
}

// ─── CHECKOUT ─────────────────────────────────────────────────────────────────

function UpiQr({ value }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: 200,
        margin: 2,
        color: { dark: '#123845', light: '#f7f5f0' },
      });
    }
  }, [value]);
  return <canvas ref={canvasRef} className="upi-qr" />;
}

const EMPTY_ADDRESS = { label: '', line1: '', line2: '', city: '', state: '', pincode: '', phone: '' };

const addressSummary = (a) =>
  [a.line1, a.city, a.pincode].filter(Boolean).join(', ');

function AddressForm({ address, setAddress }) {
  const set = (k) => (e) => setAddress({ ...address, [k]: e.target.value });
  return (
    <>
      <div className="field"><label>Label</label><input value={address.label || ''} onChange={set('label')} placeholder="e.g. Home, Office" /></div>
      <div className="field"><label>Address line 1 *</label><input value={address.line1} onChange={set('line1')} required /></div>
      <div className="field"><label>Address line 2</label><input value={address.line2} onChange={set('line2')} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>City *</label><input value={address.city} onChange={set('city')} required /></div>
        <div className="field"><label>State</label><input value={address.state} onChange={set('state')} /></div>
        <div className="field"><label>PIN code *</label><input value={address.pincode} onChange={set('pincode')} required pattern="[0-9]{6}" title="6-digit PIN code" /></div>
        <div className="field"><label>Phone</label><input value={address.phone} onChange={set('phone')} /></div>
      </div>
    </>
  );
}

function Checkout({ cart, setCart }) {
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState(-1); // index into saved, or -1 for a new address
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [upiRef, setUpiRef] = useState('');
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const total = cart.reduce((sum, item) => sum + item.price_paise * item.qty, 0);
  const upiLink = buildUpiLink(total);

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        const list = profile?.addresses || [];
        setSaved(list);
        if (list.length > 0) {
          setSelected(0);
          setAddress({ ...EMPTY_ADDRESS, ...list[0] });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function pick(idx) {
    setSelected(idx);
    setAddress(idx >= 0 ? { ...EMPTY_ADDRESS, ...saved[idx] } : EMPTY_ADDRESS);
  }

  async function placeOrder(e) {
    e.preventDefault();
    setError('');
    setPlacing(true);
    const { ok, data } = await apiPlaceOrder({
      items: cart.map((i) => ({ productId: i.productId, qty: i.qty, message: i.message })),
      address,
      upi_ref: upiRef,
    });
    if (ok) {
      setCart([]);
      go('/orders');
    } else {
      setError(data.error || 'Could not place order');
    }
    setPlacing(false);
  }

  if (cart.length === 0) {
    return (
      <div className="page">
        <p className="empty">Nothing to check out. <a href="#/shop" style={{ color: 'var(--ocean)', fontWeight: 700 }}>Browse the shop →</a></p>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1>Checkout</h1>
      <form onSubmit={placeOrder}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Order summary</h2>
          {cart.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}>
              <span>
                {item.name} × {item.qty}
                {item.message && <em style={{ color: 'var(--slate)' }}> — “{item.message}”</em>}
              </span>
              <span>{rupees(item.price_paise * item.qty)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 17 }}>
            <strong>Total</strong>
            <strong style={{ color: 'var(--ocean)' }}>{rupees(total)}</strong>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Shipping address</h2>
          {!loaded ? (
            <p>Loading saved addresses…</p>
          ) : (
            <>
              {saved.length > 0 && (
                <div className="addr-picker">
                  {saved.map((a, i) => (
                    <label key={i} className={selected === i ? 'addr-option active' : 'addr-option'}>
                      <input type="radio" name="addr" checked={selected === i} onChange={() => pick(i)} />
                      <span>
                        <strong>{a.label || `Address ${i + 1}`}</strong>
                        <em>{addressSummary(a)}</em>
                      </span>
                    </label>
                  ))}
                  <label className={selected === -1 ? 'addr-option active' : 'addr-option'}>
                    <input type="radio" name="addr" checked={selected === -1} onChange={() => pick(-1)} />
                    <span><strong>New address</strong></span>
                  </label>
                </div>
              )}
              <AddressForm address={address} setAddress={setAddress} />
            </>
          )}
          <p style={{ fontSize: 12, color: 'var(--slate)' }}>
            Changes here apply to this order only. Manage saved addresses in your <a href="#/profile" style={{ color: 'var(--ocean)' }}>profile</a>.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>Pay via UPI</h2>
          <div className="upi-box">
            <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 6 }}>
              Pay <strong>{rupees(total)}</strong> to:
            </p>
            <p className="upi-id">{UPI_ID}</p>
            <UpiQr value={upiLink} />
            <p style={{ fontSize: 12, color: 'var(--slate)' }}>
              Scan with any UPI app — GPay, PhonePe, Paytm — or tap below on your phone.
            </p>
            <a href={upiLink}>
              <button type="button" className="btn btn-sm" style={{ marginTop: 12 }}>
                Open UPI App
              </button>
            </a>
          </div>
          <div className="field">
            <label>UPI transaction reference (UTR) *</label>
            <input
              value={upiRef}
              onChange={(e) => setUpiRef(e.target.value)}
              required
              minLength={6}
              placeholder="e.g. 415223344556"
            />
            <span style={{ fontSize: 12, color: 'var(--slate)' }}>
              Complete the payment in your UPI app, then paste the transaction/UTR number here.
            </span>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        <button className="btn" style={{ width: '100%' }} disabled={placing}>
          {placing ? 'Placing order…' : `Place order — ${rupees(total)}`}
        </button>
      </form>
    </div>
  );
}

// ─── MY ORDERS ────────────────────────────────────────────────────────────────

function MyOrders() {
  const [orders, setOrders] = useState(null);
  const [fixing, setFixing] = useState(null); // { orderId, upi_ref }
  const [fixError, setFixError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => fetchMyOrders().then(setOrders).catch(() => setOrders([]));
  useEffect(() => { load(); }, []);

  async function resubmit(e, order) {
    e.preventDefault();
    setBusy(true);
    const { ok, data } = await resubmitPayment(order.id, fixing.upi_ref);
    setBusy(false);
    if (ok) {
      setFixing(null);
      setFixError('');
      load();
    } else {
      setFixError(data.error || 'Could not update payment reference');
    }
  }

  if (!orders) return <div className="page"><p className="empty">Loading your orders…</p></div>;

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1>My Orders</h1>
      {orders.length === 0 ? (
        <p className="empty">No orders yet — your memories await!</p>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <strong>{new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
              <span className={`badge badge-${o.status}`}>{o.status.replace('_', ' ')}</span>
            </div>
            <dl className="order-details">
              <div className="order-row">
                <dt>Order ID:</dt>
                <dd className="order-id">{o.order_no ? `#${o.order_no}` : o.id}</dd>
              </div>
              {o.items.map((item, i) => (
                <div key={i} className="order-row">
                  <dt>Product:</dt>
                  <dd>
                    {item.name} × {item.qty}
                    {item.message && (
                      <div><span className="order-sublabel">Message:</span> <em>“{item.message}”</em></div>
                    )}
                  </dd>
                </div>
              ))}
              {o.address && (
                <div className="order-row">
                  <dt>Address:</dt>
                  <dd>{[o.address.line1, o.address.line2, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}</dd>
                </div>
              )}
              <div className="order-row">
                <dt>Transaction:</dt>
                <dd>{o.upi_ref}</dd>
              </div>
              {(o.status === 'shipped' || o.status === 'fulfilled') && o.courier && (
                <div className="order-row">
                  <dt>Shipping:</dt>
                  <dd>{o.courier} · Tracking ID: <strong>{o.tracking_id}</strong></dd>
                </div>
              )}
              <div className="order-row">
                <dt>Total:</dt>
                <dd><strong style={{ color: 'var(--ocean)' }}>{rupees(o.total_paise)}</strong></dd>
              </div>
            </dl>
            {o.status === 'payment_issue' && (
              <div className="payment-issue-box">
                <p style={{ fontSize: 13, marginBottom: 8 }}>
                  <strong>Payment not received.</strong> Please check the transaction in your UPI app
                  and resubmit the correct transaction/UTR reference. If the payment didn't go through,
                  scan the QR below to pay again.
                </p>
                <div className="upi-box" style={{ background: 'white' }}>
                  <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 6 }}>
                    Pay <strong>{rupees(o.total_paise)}</strong> to:
                  </p>
                  <p className="upi-id">{UPI_ID}</p>
                  <UpiQr value={buildUpiLink(o.total_paise)} />
                  <a href={buildUpiLink(o.total_paise)}>
                    <button type="button" className="btn btn-sm" style={{ marginTop: 10 }}>Open UPI App</button>
                  </a>
                </div>
                {fixing?.orderId === o.id ? (
                  <form onSubmit={(e) => resubmit(e, o)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                      <label>UPI transaction reference (UTR)</label>
                      <input
                        value={fixing.upi_ref}
                        onChange={(e) => setFixing({ ...fixing, upi_ref: e.target.value })}
                        required
                        minLength={6}
                        placeholder="e.g. 415223344556"
                        autoFocus
                      />
                    </div>
                    <button className="btn btn-sm" disabled={busy}>{busy ? 'Submitting…' : 'Resubmit'}</button>
                    <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setFixing(null); setFixError(''); }}>Cancel</button>
                    {fixError && <p className="error" style={{ width: '100%', margin: 0 }}>{fixError}</p>}
                  </form>
                ) : (
                  <button className="btn btn-sm" onClick={() => { setFixError(''); setFixing({ orderId: o.id, upi_ref: o.upi_ref }); }}>
                    Update transaction ID
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── PROFILE ──────────────────────────────────────────────────────────────────

function Profile({ session }) {
  const [name, setName] = useState('');
  const [addresses, setAddresses] = useState([]);
  const [editing, setEditing] = useState(null); // { idx, address } — idx -1 for new
  const [status, setStatus] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProfile()
      .then((profile) => {
        if (profile) {
          setName(profile.name || '');
          setAddresses(profile.addresses || []);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function persist(nextName, nextAddresses) {
    setStatus('');
    setBusy(true);
    const { ok } = await saveProfile({ name: nextName, addresses: nextAddresses });
    setBusy(false);
    setStatus(ok ? 'saved' : 'error');
    return ok;
  }

  async function saveName(e) {
    e.preventDefault();
    await persist(name, addresses);
  }

  async function saveAddress(e) {
    e.preventDefault();
    const next = [...addresses];
    if (editing.idx === -1) next.push(editing.address);
    else next[editing.idx] = editing.address;
    if (await persist(name, next)) {
      setAddresses(next);
      setEditing(null);
    }
  }

  async function removeAddress(idx) {
    if (!window.confirm('Remove this address?')) return;
    const next = addresses.filter((_, i) => i !== idx);
    if (await persist(name, next)) setAddresses(next);
  }

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <h1>My Profile</h1>
      {!loaded ? (
        <p className="empty">Loading…</p>
      ) : (
        <>
          <form onSubmit={saveName} className="card" style={{ marginBottom: 20 }}>
            <div className="field">
              <label>Email</label>
              <input value={session.email} disabled style={{ background: 'var(--foam)' }} />
            </div>
            <div className="field">
              <label>Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </form>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Saved addresses</h2>
            {addresses.length === 0 && !editing && (
              <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 12 }}>No addresses saved yet.</p>
            )}
            {addresses.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--foam)' }}>
                <div style={{ flex: 1 }}>
                  <strong>{a.label || `Address ${i + 1}`}</strong>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                    {[a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', ')}
                    {a.phone && ` · ${a.phone}`}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing({ idx: i, address: { ...EMPTY_ADDRESS, ...a } })}>Edit</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeAddress(i)}>Remove</button>
              </div>
            ))}

            {editing ? (
              <form onSubmit={saveAddress} style={{ marginTop: 16 }}>
                <h2 style={{ marginTop: 0, fontSize: 20 }}>{editing.idx === -1 ? 'New address' : 'Edit address'}</h2>
                <AddressForm address={editing.address} setAddress={(a) => setEditing({ ...editing, address: a })} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <button className="btn btn-sm btn-ghost" style={{ marginTop: 14 }} onClick={() => setEditing({ idx: -1, address: EMPTY_ADDRESS })}>
                + Add address
              </button>
            )}
            {status === 'saved' && <p className="success">Saved ✓</p>}
            {status === 'error' && <p className="error">Could not save</p>}
          </div>
        </>
      )}
    </div>
  );
}

// ─── ADMIN: PRODUCTS ──────────────────────────────────────────────────────────

const EMPTY_PRODUCT = {
  name: '', description: '', price: '', image_url: '', tags: '',
  customizable: false, custom_label: 'Your message', in_stock: true,
};

const parseTags = (raw) =>
  [...new Set(String(raw).split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);

// Center-crops the uploaded image to 4:3, scales it down to 800×600 and compresses
// to a JPEG data URI, so it stays small enough for localStorage (dev) and Postgres (prod).
function processImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const W = 800, H = 600;
      const scale = Math.max(W / img.width, H / img.height);
      const sw = W / scale, sh = H / scale;
      const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchProducts().then(setProducts);
  }, []);
  useEffect(load, [load]);

  const set = (k) => (e) =>
    setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    const pricePaise = Math.round(parseFloat(form.price) * 100);
    if (!Number.isInteger(pricePaise) || pricePaise <= 0) {
      setError('Enter a valid price in rupees');
      return;
    }
    const body = {
      name: form.name,
      description: form.description,
      price_paise: pricePaise,
      image_url: form.image_url,
      tags: parseTags(form.tags),
      customizable: form.customizable,
      custom_label: form.custom_label,
      in_stock: form.in_stock,
    };
    setBusy(true);
    const { ok, data } = await saveProduct(body, editingId);
    setBusy(false);
    if (ok) {
      setForm(EMPTY_PRODUCT);
      setEditingId(null);
      load();
    } else {
      setError(data.error || 'Save failed');
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      description: p.description,
      price: String(p.price_paise / 100),
      image_url: p.image_url,
      tags: (p.tags || []).join(', '),
      customizable: p.customizable,
      custom_label: p.custom_label,
      in_stock: p.in_stock,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleStock(p) {
    setBusy(true);
    await saveProduct({ ...p, in_stock: !p.in_stock }, p.id);
    setBusy(false);
    load();
  }

  async function remove(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    setBusy(true);
    await deleteProduct(p.id);
    setBusy(false);
    load();
  }

  return (
    <div className="page">
      <h1>Admin · Products</h1>

      <form onSubmit={save} className="card" style={{ marginBottom: 28, maxWidth: 560 }}>
        <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit product' : 'Add product'}</h2>
        <div className="field"><label>Name *</label><input value={form.name} onChange={set('name')} required placeholder="e.g. Photo frame with custom name" /></div>
        <div className="field"><label>Description</label><textarea value={form.description} onChange={set('description')} rows={2} /></div>
        <div className="field"><label>Price (₹) *</label><input type="number" step="0.01" min="0.01" value={form.price} onChange={set('price')} required /></div>
        <div className="field">
          <label>Tags (comma-separated)</label>
          <input value={form.tags} onChange={set('tags')} placeholder="e.g. birthday, anniversary, rakhi" />
          <span style={{ fontSize: 12, color: 'var(--slate)' }}>Customers can search and filter the shop by these</span>
        </div>
        <div className="field">
          <label>Product image</label>
          {form.image_url && (
            <img src={form.image_url} alt="preview" style={{ width: 200, height: 150, objectFit: 'cover', borderRadius: 10, border: '1.5px solid #bae6fd' }} />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setForm((f) => ({ ...f, image_url: '' }));
                const dataUri = await processImage(file);
                setForm((f) => ({ ...f, image_url: dataUri }));
              } catch {
                setError('Could not read that image — try a different file');
              }
              e.target.value = '';
            }}
          />
          {form.image_url && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setForm((f) => ({ ...f, image_url: '' }))}>
              Remove image
            </button>
          )}
          <span style={{ fontSize: 12, color: 'var(--slate)' }}>Cropped to 4:3 and compressed automatically</span>
        </div>
        <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.customizable} onChange={set('customizable')} id="customizable" style={{ width: 'auto' }} />
          <label htmlFor="customizable" style={{ cursor: 'pointer' }}>Customer can add a personal message</label>
        </div>
        {form.customizable && (
          <div className="field"><label>Message prompt shown to customer</label><input value={form.custom_label} onChange={set('custom_label')} placeholder="e.g. Name to engrave" /></div>
        )}
        <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.in_stock} onChange={set('in_stock')} id="in_stock" style={{ width: 'auto' }} />
          <label htmlFor="in_stock" style={{ cursor: 'pointer' }}>In stock</label>
        </div>
        {error && <p className="error">{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Update product' : 'Add product'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setEditingId(null); setForm(EMPTY_PRODUCT); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Image</th><th>Name</th><th>Price</th><th>Tags</th><th>Custom</th><th>Stock</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.image_url
                    ? <img src={p.image_url} alt="" style={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 6 }} />
                    : '—'}
                </td>
                <td>{p.name}</td>
                <td>{rupees(p.price_paise)}</td>
                <td>{(p.tags || []).join(', ') || '—'}</td>
                <td>{p.customizable ? `✓ (${p.custom_label})` : '—'}</td>
                <td>
                  {p.in_stock ? <span className="badge badge-fulfilled">in stock</span> : <span className="badge badge-oos">out of stock</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => startEdit(p)}>Edit</button>{' '}
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => toggleStock(p)}>
                    {p.in_stock ? 'Mark out of stock' : 'Mark in stock'}
                  </button>{' '}
                  <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--slate)' }}>No products yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ADMIN: ORDERS ────────────────────────────────────────────────────────────

// CSV export/import. The human-readable columns are for spreadsheets; the
// *_json columns carry the exact data so an exported file can be re-imported
// losslessly (e.g. after deleting old orders to free database space).
const ORDER_CSV_COLUMNS = [
  'id', 'order_no', 'created_at', 'status', 'user_name', 'user_email', 'items_summary',
  'total_rupees', 'upi_ref', 'courier', 'tracking_id', 'address_json', 'items_json',
];

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function ordersToCsv(orders) {
  const lines = [ORDER_CSV_COLUMNS.join(',')];
  for (const o of orders) {
    lines.push([
      o.id, o.order_no ?? '', o.created_at, o.status, o.user_name, o.user_email,
      o.items.map((i) => `${i.name} x${i.qty}${i.message ? ` (${i.message})` : ''}`).join('; '),
      (o.total_paise / 100).toFixed(2), o.upi_ref, o.courier || '', o.tracking_id || '',
      JSON.stringify(o.address), JSON.stringify(o.items),
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || '').trim() !== '');
}

function csvToOrders(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;
  const header = rows[0].map((h) => h.trim());
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  if (col.id === undefined || col.items_json === undefined || col.address_json === undefined) return null;
  const get = (r, key) => (col[key] === undefined ? '' : r[col[key]] ?? '');
  const orders = [];
  for (const r of rows.slice(1)) {
    try {
      orders.push({
        id: get(r, 'id'),
        order_no: get(r, 'order_no'),
        created_at: get(r, 'created_at'),
        status: get(r, 'status') || 'pending',
        user_name: get(r, 'user_name'),
        user_email: get(r, 'user_email'),
        total_paise: Math.round(parseFloat(get(r, 'total_rupees') || '0') * 100),
        upi_ref: get(r, 'upi_ref'),
        courier: get(r, 'courier') || null,
        tracking_id: get(r, 'tracking_id') || null,
        address: JSON.parse(get(r, 'address_json')),
        items: JSON.parse(get(r, 'items_json')),
      });
    } catch {
      // skip malformed row
    }
  }
  return orders;
}

function downloadFile(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetchAdminOrders(filter).then((list) => {
      setOrders(list);
      setSelected(new Set());
    });
  }, [filter]);
  useEffect(load, [load]);

  const [shipping, setShipping] = useState(null); // { orderId, courier, tracking_id }
  const [shipError, setShipError] = useState('');
  const [busy, setBusy] = useState(false);

  async function setStatus(order, status, extra) {
    setBusy(true);
    const { ok, data } = await apiSetOrderStatus(order.id, status, extra);
    setBusy(false);
    if (!ok) {
      setShipError(data.error || 'Update failed');
      return;
    }
    setShipping(null);
    setShipError('');
    load();
  }

  function toggleSelected(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function exportCsv() {
    const label = filter === 'all' ? 'all' : filter;
    downloadFile(
      `orders-${label}-${new Date().toISOString().slice(0, 10)}.csv`,
      ordersToCsv(orders),
      'text/csv',
    );
  }

  function importCsv() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const rows = csvToOrders(String(ev.target?.result || ''));
        if (!rows || rows.length === 0) {
          setNotice('Could not read that CSV — use a file exported from this page.');
          return;
        }
        if (!window.confirm(`Import ${rows.length} order(s)? Existing orders with the same id are overwritten.`)) return;
        setBusy(true);
        const { ok, data } = await importOrders(rows);
        setBusy(false);
        setNotice(ok
          ? `Imported ${data.imported} order(s)${data.skipped ? `, skipped ${data.skipped} (unknown customer or malformed)` : ''}.`
          : data.error || 'Import failed');
        load();
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async function removeOrders(ids) {
    if (ids.length === 0) return;
    const label = ids.length === 1 ? 'this fulfilled order' : `${ids.length} fulfilled orders`;
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone — export a CSV backup first if you need one.`)) return;
    setBusy(true);
    const { ok, data } = await deleteOrders(ids);
    setBusy(false);
    setNotice(ok
      ? `Deleted ${data.deleted} order(s).${data.skipped ? ` ${data.skipped} skipped (only fulfilled orders can be deleted).` : ''}`
      : data.error || 'Delete failed');
    load();
  }

  // Only fulfilled orders can be deleted, so only they are selectable.
  const deletable = orders.filter((o) => o.status === 'fulfilled');
  const allSelected = deletable.length > 0 && selected.size === deletable.length;

  return (
    <div className="page">
      <h1>Admin · Orders</h1>
      <div className="tabs" style={{ maxWidth: 680 }}>
        {[['pending', 'Pending'], ['payment_issue', 'Payment Issue'], ['shipped', 'Shipped'], ['fulfilled', 'Fulfilled'], ['all', 'All']].map(([f, label]) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '0 0 18px' }}>
        <button className="btn btn-sm btn-ghost" disabled={busy || orders.length === 0} onClick={exportCsv}>
          Export CSV
        </button>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={importCsv}>
          Import CSV
        </button>
        {deletable.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--slate)', cursor: 'pointer', marginLeft: 6 }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(deletable.map((o) => o.id)))}
            />
            Select all fulfilled
          </label>
        )}
        {selected.size > 0 && (
          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => removeOrders([...selected])}>
            Delete selected ({selected.size})
          </button>
        )}
      </div>
      {notice && <p className="success" style={{ marginTop: -8 }}>{notice}</p>}
      {orders.length === 0 ? (
        <p className="empty">No {filter === 'all' ? '' : filter} orders</p>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {o.status === 'fulfilled' && (
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggleSelected(o.id)}
                    style={{ marginTop: 4 }}
                    aria-label="Select order for deletion"
                  />
                )}
                <div>
                  <strong>{o.user_name}</strong>{' '}
                  <span style={{ color: 'var(--slate)', fontSize: 13 }}>({o.user_email})</span>
                  <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                    {new Date(o.created_at).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <span className={`badge badge-${o.status}`}>{o.status.replace('_', ' ')}</span>
            </div>
            <dl className="order-details">
              <div className="order-row">
                <dt>Order ID:</dt>
                <dd className="order-id">{o.order_no ? `#${o.order_no}` : o.id}</dd>
              </div>
              {o.items.map((item, i) => (
                <div key={i} className="order-row">
                  <dt>Product:</dt>
                  <dd>
                    {item.name} × {item.qty}
                    {item.message && (
                      <div><span className="order-sublabel">Message:</span> <em style={{ color: 'var(--ocean)' }}>“{item.message}”</em></div>
                    )}
                  </dd>
                </div>
              ))}
              <div className="order-row">
                <dt>Address:</dt>
                <dd>
                  {[o.address.line1, o.address.line2, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}
                  {o.address.phone && ` · Phone: ${o.address.phone}`}
                </dd>
              </div>
              <div className="order-row">
                <dt>Transaction:</dt>
                <dd><strong>{o.upi_ref}</strong></dd>
              </div>
              {(o.status === 'shipped' || o.status === 'fulfilled') && o.courier && (
                <div className="order-row">
                  <dt>Shipping:</dt>
                  <dd>{o.courier} · Tracking ID: <strong>{o.tracking_id}</strong></dd>
                </div>
              )}
              <div className="order-row">
                <dt>Total:</dt>
                <dd><strong style={{ color: 'var(--ocean)' }}>{rupees(o.total_paise)}</strong></dd>
              </div>
            </dl>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {o.status === 'pending' && (
                  <>
                    <button className="btn btn-sm" onClick={() => { setShipError(''); setShipping({ orderId: o.id, courier: 'Bluedart', tracking_id: '' }); }}>
                      Mark shipped
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => setStatus(o, 'payment_issue')}>
                      Payment not received
                    </button>
                  </>
                )}
                {o.status === 'payment_issue' && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setStatus(o, 'pending')}>Back to pending</button>
                )}
                {o.status === 'shipped' && (
                  <>
                    <button className="btn btn-sm" onClick={() => setStatus(o, 'fulfilled')}>Mark fulfilled ✓</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setStatus(o, 'pending')}>Back to pending</button>
                  </>
                )}
                {o.status === 'fulfilled' && (
                  <>
                    <button className="btn btn-sm btn-ghost" onClick={() => setStatus(o, 'shipped', { courier: o.courier || 'Bluedart', tracking_id: o.tracking_id || '-' })}>
                      Back to shipped
                    </button>
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => removeOrders([o.id])}>
                      Delete
                    </button>
                  </>
                )}
              </span>
            </div>
            {shipping?.orderId === o.id && (
              <form
                className="ship-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setStatus(o, 'shipped', { courier: shipping.courier, tracking_id: shipping.tracking_id });
                }}
              >
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Courier</label>
                  <input value={shipping.courier} onChange={(e) => setShipping({ ...shipping, courier: e.target.value })} required placeholder="Bluedart" />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label>Tracking ID</label>
                  <input value={shipping.tracking_id} onChange={(e) => setShipping({ ...shipping, tracking_id: e.target.value })} required placeholder="e.g. 69847712345" />
                </div>
                <button className="btn btn-sm" disabled={busy}>{busy ? 'Shipping…' : 'Ship'}</button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => { setShipping(null); setShipError(''); }}>Cancel</button>
                {shipError && <p className="error" style={{ width: '100%', margin: '4px 0 0' }}>{shipError}</p>}
              </form>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── ADMIN: REVIEWS ───────────────────────────────────────────────────────────

function AdminReviews() {
  const [reviews, setReviews] = useState([]);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(() => {
    fetchAdminReviews(filter).then(setReviews);
  }, [filter]);
  useEffect(load, [load]);

  const [busy, setBusy] = useState(false);

  async function patch(review, changes) {
    setBusy(true);
    await updateReview(review.id, changes);
    setBusy(false);
    load();
  }

  async function remove(review) {
    if (!window.confirm(`Delete this review by ${review.user_name}?`)) return;
    setBusy(true);
    await deleteReview(review.id);
    setBusy(false);
    load();
  }

  return (
    <div className="page">
      <h1>Admin · Reviews</h1>
      <div className="tabs" style={{ maxWidth: 420 }}>
        {['pending', 'approved', 'all'].map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {reviews.length === 0 ? (
        <p className="empty">No {filter === 'all' ? '' : filter} reviews</p>
      ) : (
        reviews.map((r) => (
          <div key={r.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{r.user_name}</strong>{' '}
                <span style={{ color: 'var(--slate)', fontSize: 13 }}>on {r.product_name}</span>
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                  {new Date(r.created_at).toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Stars value={r.rating} />
                <span className={`badge badge-${r.status === 'approved' ? 'fulfilled' : 'pending'}`}>{r.status}</span>
                {r.featured && <span className="badge badge-featured">featured</span>}
              </div>
            </div>
            {r.text && <p style={{ margin: '10px 0', fontSize: 14, lineHeight: 1.55 }}>{r.text}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {r.status === 'pending' ? (
                <button className="btn btn-sm" disabled={busy} onClick={() => patch(r, { status: 'approved' })}>Approve</button>
              ) : (
                <>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => patch(r, { status: 'pending' })}>Unapprove</button>
                  <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => patch(r, { featured: !r.featured })}>
                    {r.featured ? 'Remove from home page' : 'Feature on home page ★'}
                  </button>
                </>
              )}
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => remove(r)}>Delete</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── ADMIN: USERS ─────────────────────────────────────────────────────────────

// While impersonating, the admin's own token is parked here so they can return.
const ADMIN_TOKEN_BACKUP_KEY = 'moment-kart-admin-token';

async function startImpersonation(email) {
  const token = await impersonateUser(email);
  if (!token) return false;
  localStorage.setItem(ADMIN_TOKEN_BACKUP_KEY, localStorage.getItem(AUTH_KEY) || '');
  localStorage.setItem(AUTH_KEY, token);
  window.location.hash = '#/shop';
  window.location.reload();
  return true;
}

function stopImpersonation() {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_BACKUP_KEY);
  localStorage.removeItem(ADMIN_TOKEN_BACKUP_KEY);
  if (adminToken) localStorage.setItem(AUTH_KEY, adminToken);
  window.location.hash = '#/admin/users';
  window.location.reload();
}

function AdminUsers({ session }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  async function impersonate(u) {
    setError('');
    if (!(await startImpersonation(u.email))) {
      setError(`Could not impersonate ${u.email}`);
    }
  }

  return (
    <div className="page">
      <h1>Admin · Users</h1>
      {error && <p className="error">{error}</p>}
      {users === null ? (
        <p className="empty">Loading users…</p>
      ) : users.length === 0 ? (
        <p className="empty">No registered users yet.</p>
      ) : (
        <div className="table-wrap card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Verified</th><th>Joined</th><th>Orders</th><th>Total spent</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.verified ? <span className="badge badge-fulfilled">verified</span> : <span className="badge badge-pending">pending</span>}</td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td>{u.order_count}</td>
                  <td>{u.spent_paise > 0 ? rupees(u.spent_paise) : '—'}</td>
                  <td>
                    {u.email !== session?.email && (
                      <button className="btn btn-sm btn-ghost" onClick={() => impersonate(u)}>Impersonate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── USER MENU ────────────────────────────────────────────────────────────────

function UserMenu({ session, onLogout, route }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="user-menu" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={open || route === '/profile' ? 'user-menu-btn open' : 'user-menu-btn'}
        onClick={() => setOpen(!open)}
      >
        {session.name || 'Account'} <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="user-menu-dropdown">
          <a href="#/profile" onClick={() => setOpen(false)}>My Profile</a>
          <a href="#/orders" onClick={() => setOpen(false)}>My Orders</a>
          <button type="button" onClick={() => { setOpen(false); onLogout(); }}>Logout</button>
        </div>
      )}
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────

export default function App() {
  const route = useHashRoute();
  const [session, setSession] = useState(getSession);
  const [cart, setCartState] = useState(loadCart);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    document.title = `${APP_NAME} — Souvenirs that flow with your memories`;
  }, []);

  // Reload the catalog on navigation so admin edits show up in the shop right away.
  useEffect(() => {
    fetchProducts().then(setProducts).catch(() => {});
  }, [route]);

  const setCart = (next) => {
    setCartState(next);
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  };

  function addToCart(product, message) {
    const existing = cart.findIndex(
      (i) => i.productId === product.id && (i.message || '') === (message || '')
    );
    if (existing >= 0) {
      const next = [...cart];
      next[existing] = { ...next[existing], qty: Math.min(20, next[existing].qty + 1) };
      setCart(next);
    } else {
      setCart([
        ...cart,
        { productId: product.id, name: product.name, price_paise: product.price_paise, qty: 1, message: message || '' },
      ]);
    }
  }

  function logout() {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(ADMIN_TOKEN_BACKUP_KEY);
    setSession(null);
    go('/');
  }

  const impersonating = !!session && !session.admin && !!localStorage.getItem(ADMIN_TOKEN_BACKUP_KEY);

  const cartCount = cart.reduce((n, i) => n + i.qty, 0);
  const needsAuth = ['/checkout', '/orders', '/profile'].includes(route) || route.startsWith('/admin');

  let content;
  if (route === '/auth' || (needsAuth && !session)) {
    content = <AuthPage onLogin={() => { setSession(getSession()); go('/shop'); }} />;
  } else if (route === '/shop') {
    // The admin manages the shop but doesn't buy from it — no cart. Use
    // "Impersonate" on Admin · Users to act on a customer's behalf.
    content = <Shop products={products} onAdd={session?.admin ? undefined : addToCart} session={session} />;
  } else if (route === '/cart' && !session?.admin) {
    content = <Cart cart={cart} setCart={setCart} session={session} />;
  } else if (route === '/checkout' && !session?.admin) {
    content = <Checkout cart={cart} setCart={setCart} />;
  } else if (route === '/orders') {
    content = <MyOrders />;
  } else if (route === '/profile') {
    content = <Profile session={session} />;
  } else if (route === '/admin/products' && session?.admin) {
    content = <AdminProducts />;
  } else if (route === '/admin/orders' && session?.admin) {
    content = <AdminOrders />;
  } else if (route === '/admin/reviews' && session?.admin) {
    content = <AdminReviews />;
  } else if (route === '/admin/users' && session?.admin) {
    content = <AdminUsers session={session} />;
  } else {
    content = <Landing products={products} />;
  }

  const link = (path, label) => (
    <a href={'#' + path} className={route === path ? 'active' : ''}>{label}</a>
  );

  return (
    <>
      <nav className="nav">
        <a href="#/" className="brand">{BRAND_FIRST}{BRAND_REST && <> <em>{BRAND_REST}</em></>}</a>
        {link('/shop', 'Shop')}
        {!session?.admin && (
          <a href="#/cart" className={route === '/cart' ? 'active' : ''}>
            Cart{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </a>
        )}
        {session?.admin && <span className="nav-sep" />}
        {session?.admin && link('/admin/products', 'Products')}
        {session?.admin && link('/admin/orders', 'Orders')}
        {session?.admin && link('/admin/reviews', 'Reviews')}
        {session?.admin && link('/admin/users', 'Users')}
        <span className="nav-sep" />
        {session ? (
          <UserMenu session={session} onLogout={logout} route={route} />
        ) : (
          link('/auth', 'Login')
        )}
      </nav>
      {impersonating && (
        <div className="impersonation-bar">
          👁 Viewing as <strong>{session.name} ({session.email})</strong>
          <button type="button" onClick={stopImpersonation}>Return to admin</button>
        </div>
      )}
      {content}
    </>
  );
}

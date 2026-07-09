import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import {
  AUTH_KEY, IS_DEV, authAction, fetchProducts, saveProduct, deleteProduct,
  fetchProfile, saveProfile, placeOrder as apiPlaceOrder,
  fetchMyOrders, fetchAdminOrders, setOrderStatus as apiSetOrderStatus,
  fetchReviews, fetchFeaturedReviews, submitReview, fetchAdminReviews, updateReview, deleteReview,
} from './api.js';

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

const CART_KEY = 'moment-kart-cart';
const UPI_ID = import.meta.env.VITE_UPI_ID || 'momentkart@upi';

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

  useEffect(() => {
    fetchReviews(productId).then(setReviews).catch(() => setReviews([]));
  }, [productId]);

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      setNote('Please pick a star rating');
      return;
    }
    const { ok, data } = await submitReview({ productId, rating, text });
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
      {session ? (
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
          <button className="btn btn-sm btn-ghost">Submit review</button>
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
    <div className="page" style={{ paddingBottom: 0 }}>
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

  function showDevCode(data) {
    // Local dev without an email provider: the API returns the code directly.
    if (data.devCode) setInfo(`Dev mode — your code is ${data.devCode}`);
    else setInfo('Verification code sent to your email 📧');
  }

  async function handleSignup(e) {
    e.preventDefault();
    const r = await call({ action: 'signup', email, name, password });
    if (!r) return;
    if (r.ok) {
      showDevCode(r.data);
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
      showDevCode(r.data);
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
    if (r?.ok) showDevCode(r.data);
    else if (r) setError(r.data.error || 'Could not resend code');
  }

  return (
    <div className="auth-wrap card">
      <h1 style={{ textAlign: 'center', color: 'var(--deep)', marginBottom: 6 }}>Moment Kart</h1>
      <p style={{ textAlign: 'center', color: 'var(--slate)', marginBottom: 20, fontSize: 14 }}>
        Souvenirs that flow with your memories
      </p>
      {IS_DEV && (
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--slate)', background: 'var(--foam)', borderRadius: 2, padding: '6px 10px', marginBottom: 14 }}>
          Dev mode — data lives in browser localStorage. Admin login: {import.meta.env.VITE_ADMIN_EMAIL || 'admin@momentkart.dev'} / {import.meta.env.VITE_ADMIN_PASSWORD || 'admin123'}
        </p>
      )}

      {mode !== 'verify' && (
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
        <h1>Moment Kart</h1>
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
        <div className="img-placeholder">MK</div>
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
        <button type="button" className="link-btn" onClick={() => setShowReviews(!showReviews)}>
          {showReviews ? 'Hide reviews' : 'Reviews'}
        </button>
        {showReviews && <ProductReviews productId={product.id} session={session} />}
      </div>
    </div>
  );
}

function Shop({ products, onAdd, session }) {
  return (
    <div className="page">
      <h1>The Collection</h1>
      {products.length === 0 ? (
        <p className="empty">The tide hasn't brought any products yet — check back soon!</p>
      ) : (
        <div className="grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onAdd={onAdd} session={session} />
          ))}
        </div>
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
  const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('Moment Kart')}&am=${(total / 100).toFixed(2)}&cu=INR&tn=${encodeURIComponent('Moment Kart order')}`;

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

  useEffect(() => {
    fetchMyOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

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
              <span className={`badge badge-${o.status}`}>{o.status}</span>
            </div>
            {o.items.map((item, i) => (
              <div key={i} style={{ fontSize: 14, padding: '4px 0', color: 'var(--slate)' }}>
                {item.name} × {item.qty}
                {item.message && <em> — “{item.message}”</em>}
              </div>
            ))}
            {(o.status === 'shipped' || o.status === 'fulfilled') && o.courier && (
              <div style={{ fontSize: 13, color: 'var(--ocean)', marginTop: 6 }}>
                Shipped via <strong>{o.courier}</strong> · Tracking ID: <strong>{o.tracking_id}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--slate)' }}>UPI ref: {o.upi_ref}</span>
              <strong style={{ color: 'var(--ocean)' }}>{rupees(o.total_paise)}</strong>
            </div>
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
    const { ok } = await saveProfile({ name: nextName, addresses: nextAddresses });
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
            <button className="btn">Save</button>
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
                  <button className="btn btn-sm">Save address</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
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
  name: '', description: '', price: '', image_url: '',
  customizable: false, custom_label: 'Your message', in_stock: true,
};

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
      customizable: form.customizable,
      custom_label: form.custom_label,
      in_stock: form.in_stock,
    };
    const { ok, data } = await saveProduct(body, editingId);
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
      customizable: p.customizable,
      custom_label: p.custom_label,
      in_stock: p.in_stock,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function toggleStock(p) {
    await saveProduct({ ...p, in_stock: !p.in_stock }, p.id);
    load();
  }

  async function remove(p) {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    await deleteProduct(p.id);
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
          <button className="btn">{editingId ? 'Update product' : 'Add product'}</button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY_PRODUCT); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr><th>Image</th><th>Name</th><th>Price</th><th>Custom</th><th>Stock</th><th>Actions</th></tr>
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
                <td>{p.customizable ? `✓ (${p.custom_label})` : '—'}</td>
                <td>
                  {p.in_stock ? <span className="badge badge-fulfilled">in stock</span> : <span className="badge badge-oos">out of stock</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => startEdit(p)}>Edit</button>{' '}
                  <button className="btn btn-sm btn-ghost" onClick={() => toggleStock(p)}>
                    {p.in_stock ? 'Mark out of stock' : 'Mark in stock'}
                  </button>{' '}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--slate)' }}>No products yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ADMIN: ORDERS ────────────────────────────────────────────────────────────

function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(() => {
    fetchAdminOrders(filter).then(setOrders);
  }, [filter]);
  useEffect(load, [load]);

  const [shipping, setShipping] = useState(null); // { orderId, courier, tracking_id }
  const [shipError, setShipError] = useState('');

  async function setStatus(order, status, extra) {
    const { ok, data } = await apiSetOrderStatus(order.id, status, extra);
    if (!ok) {
      setShipError(data.error || 'Update failed');
      return;
    }
    setShipping(null);
    setShipError('');
    load();
  }

  return (
    <div className="page">
      <h1>Admin · Orders</h1>
      <div className="tabs" style={{ maxWidth: 560 }}>
        {['pending', 'shipped', 'fulfilled', 'all'].map((f) => (
          <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {orders.length === 0 ? (
        <p className="empty">No {filter === 'all' ? '' : filter} orders</p>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>{o.user_name}</strong>{' '}
                <span style={{ color: 'var(--slate)', fontSize: 13 }}>({o.user_email})</span>
                <div style={{ fontSize: 13, color: 'var(--slate)' }}>
                  {new Date(o.created_at).toLocaleString('en-IN')}
                </div>
              </div>
              <span className={`badge badge-${o.status}`}>{o.status}</span>
            </div>
            <div style={{ margin: '10px 0' }}>
              {o.items.map((item, i) => (
                <div key={i} style={{ fontSize: 14, padding: '2px 0' }}>
                  • {item.name} × {item.qty}
                  {item.message && <em style={{ color: 'var(--ocean)' }}> — “{item.message}”</em>}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--slate)' }}>
              📍 {[o.address.line1, o.address.line2, o.address.city, o.address.state, o.address.pincode].filter(Boolean).join(', ')}
              {o.address.phone && ` · 📞 ${o.address.phone}`}
            </div>
            {(o.status === 'shipped' || o.status === 'fulfilled') && o.courier && (
              <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 6 }}>
                🚚 {o.courier} · Tracking: <strong>{o.tracking_id}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13 }}>
                UPI ref: <strong>{o.upi_ref}</strong> · Total: <strong style={{ color: 'var(--ocean)' }}>{rupees(o.total_paise)}</strong>
              </span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {o.status === 'pending' && (
                  <button className="btn btn-sm" onClick={() => { setShipError(''); setShipping({ orderId: o.id, courier: 'Bluedart', tracking_id: '' }); }}>
                    Mark shipped
                  </button>
                )}
                {o.status === 'shipped' && (
                  <>
                    <button className="btn btn-sm" onClick={() => setStatus(o, 'fulfilled')}>Mark fulfilled ✓</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setStatus(o, 'pending')}>Back to pending</button>
                  </>
                )}
                {o.status === 'fulfilled' && (
                  <button className="btn btn-sm btn-ghost" onClick={() => setStatus(o, 'shipped', { courier: o.courier || 'Bluedart', tracking_id: o.tracking_id || '-' })}>
                    Back to shipped
                  </button>
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
                <button className="btn btn-sm">Ship</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setShipping(null); setShipError(''); }}>Cancel</button>
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

  async function patch(review, changes) {
    await updateReview(review.id, changes);
    load();
  }

  async function remove(review) {
    if (!window.confirm(`Delete this review by ${review.user_name}?`)) return;
    await deleteReview(review.id);
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
                <button className="btn btn-sm" onClick={() => patch(r, { status: 'approved' })}>Approve</button>
              ) : (
                <>
                  <button className="btn btn-sm btn-ghost" onClick={() => patch(r, { status: 'pending' })}>Unapprove</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => patch(r, { featured: !r.featured })}>
                    {r.featured ? 'Remove from home page' : 'Feature on home page ★'}
                  </button>
                </>
              )}
              <button className="btn btn-sm btn-danger" onClick={() => remove(r)}>Delete</button>
            </div>
          </div>
        ))
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
    setSession(null);
    go('/');
  }

  const cartCount = cart.reduce((n, i) => n + i.qty, 0);
  const needsAuth = ['/checkout', '/orders', '/profile'].includes(route) || route.startsWith('/admin');

  let content;
  if (route === '/auth' || (needsAuth && !session)) {
    content = <AuthPage onLogin={() => { setSession(getSession()); go('/shop'); }} />;
  } else if (route === '/shop') {
    content = <Shop products={products} onAdd={addToCart} session={session} />;
  } else if (route === '/cart') {
    content = <Cart cart={cart} setCart={setCart} session={session} />;
  } else if (route === '/checkout') {
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
  } else {
    content = <Landing products={products} />;
  }

  const link = (path, label) => (
    <a href={'#' + path} className={route === path ? 'active' : ''}>{label}</a>
  );

  return (
    <>
      <nav className="nav">
        <a href="#/" className="brand">Moment <em>Kart</em></a>
        {link('/shop', 'Shop')}
        <a href="#/cart" className={route === '/cart' ? 'active' : ''}>
          Cart{cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </a>
        {session?.admin && <span className="nav-sep" />}
        {session?.admin && link('/admin/products', 'Products')}
        {session?.admin && link('/admin/orders', 'Orders')}
        {session?.admin && link('/admin/reviews', 'Reviews')}
        <span className="nav-sep" />
        {session ? (
          <UserMenu session={session} onLogout={logout} route={route} />
        ) : (
          link('/auth', 'Login')
        )}
      </nav>
      {content}
    </>
  );
}

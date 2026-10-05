const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const compression = require('compression');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const webpush = require('web-push');
const db = require('./src/db');
const { normalizePhone } = require('./src/phone');

const app = express();
let databaseReady = false;
const safe = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const firstDefined = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto
  .createHash('sha256')
  .update(`${process.env.DATABASE_URL || 'local'}:bee-sneaker-session-v25`)
  .digest('hex');

const GHSV_TOKEN = String(process.env.GHSV_TOKEN || '').trim();
const GHSV_ORDER_INFO_URL = String(process.env.GHSV_ORDER_INFO_URL || 'https://api.svexpress.vn/v1/open-api/order/info').trim();
const GHSV_TRACKING_URL = String(process.env.GHSV_TRACKING_URL || 'https://api.svexpress.vn/v1/open-api/order/tracking').trim();
const GHSV_CREATE_ORDER_URL = String(process.env.GHSV_CREATE_ORDER_URL || 'https://api.svexpress.vn/v1/open-api/order/create').trim();
const GHSV_PROVINCES_URL = String(process.env.GHSV_PROVINCES_URL || 'https://api.svexpress.vn/v1/open-api/address/provinces').trim();
const GHSV_DISTRICTS_URL = String(process.env.GHSV_DISTRICTS_URL || 'https://api.svexpress.vn/v1/open-api/address/districts').trim();
const GHSV_WARDS_URL = String(process.env.GHSV_WARDS_URL || 'https://api.svexpress.vn/v1/open-api/address/wards').trim();
const GHSV_SHOP_LIST_URL = String(process.env.GHSV_SHOP_LIST_URL || 'https://api.svexpress.vn/v1/open-api/shop/list').trim();
const GHSV_ROOM_DETAIL_URL = String(process.env.GHSV_ROOM_DETAIL_URL || 'https://api.svexpress.vn/v1/room/detail').trim();
// V82: room/detail la endpoint web noi bo cua GHSV, dung Authorization: Bearer.
// Neu GHSV_TOKEN hien tai khong phai web bearer, co the dat GHSV_ROOM_BEARER rieng tren Render.
const GHSV_ROOM_BEARER = String(process.env.GHSV_ROOM_BEARER || '').trim();
const GHSV_CUSTOMER_CODE = String(process.env.GHSV_CUSTOMER_CODE || '').trim().toUpperCase();

// V75: token GHSV của từng CTV chỉ được lưu dạng AES-256-GCM trong DB.
// Key được dẫn xuất từ SESSION_SECRET, vì vậy hãy giữ SESSION_SECRET ổn định trên Render.
const CTV_GHSV_CREDENTIAL_KEY = crypto.createHash('sha256').update(`${SESSION_SECRET}:bee-ctv-ghsv-v75`).digest();
const encryptCtvGhsvToken = value => {
  const token = String(value || '').trim();
  if (!token) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CTV_GHSV_CREDENTIAL_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
};
const decryptCtvGhsvToken = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const [version, ivB64, tagB64, dataB64] = raw.split(':');
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) throw new Error('Token GHSV CTV đã lưu không đọc được. Hãy lưu lại token cho CTV này.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', CTV_GHSV_CREDENTIAL_KEY, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8').trim();
};

let WEB_PUSH_PUBLIC_KEY = '';
let WEB_PUSH_PRIVATE_KEY = '';
const WEB_PUSH_SUBJECT = String(process.env.WEB_PUSH_SUBJECT || 'mailto:beesneaker@example.com').trim();

if (isProd && !process.env.SESSION_SECRET) {
  console.warn('Khuyến nghị: thêm SESSION_SECRET riêng trong Render Environment để tăng bảo mật session.');
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 9 },
  fileFilter: (_, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF.'));
  }
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  skip: req => req.path === '/healthz'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Có quá nhiều lần đăng nhập từ thiết bị này. Vui lòng thử lại sau 15 phút.'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Thiết bị này đã đăng ký quá nhiều lần. Vui lòng thử lại sau 1 giờ.'
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Có quá nhiều lần thử OTP. Vui lòng quay lại sau 15 phút.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Có quá nhiều thao tác xác thực. Vui lòng thử lại sau 15 phút.'
});

const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Có quá nhiều thao tác cập nhật. Vui lòng thử lại sau ít phút.'
});

const orderIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Mạng này đang tạo đơn quá nhanh. Vui lòng thử lại sau ít phút.'
});

const orderUserLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: req => `user:${req.session?.user?.id || 'unknown'}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Bạn đã tạo quá nhiều đơn trong thời gian ngắn. Vui lòng thử lại sau ít phút.'
});

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.locals.variantLabel = (v) => v === 'Like Auth' ? 'Loại A' : v;
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 100 }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1h' : 0, etag: true }));
app.use(globalLimiter);

// V73: health check trả lời ngay để Render thấy process đã bind PORT.
// DB khởi tạo ở nền; trạng thái ready chỉ để quan sát, không làm health check timeout.
app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true, ready: databaseReady, service: 'bee-sneaker-v75' });
});

// Trong vài giây DB đang migrate/khởi tạo, chặn route ứng dụng thay vì để request lỗi ngẫu nhiên.
app.use((req, res, next) => {
  if (databaseReady) return next();
  res.status(503).send('Bee Sneaker đang khởi động, vui lòng thử lại sau vài giây.');
});

app.use(session({
  store: new pgSession({
    pool: db.pool,
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  }),
  name: 'bee.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    maxAge: 4 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
  }
}));

// CSRF token + same-origin protection. Token được tự gắn vào mọi form POST khi render.
app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;

  const originalRender = res.render.bind(res);
  res.render = (view, options = {}, callback) => {
    originalRender(view, options, (err, html) => {
      if (err) return callback ? callback(err) : next(err);
      const token = encodeURIComponent(req.session.csrfToken);
      const withToken = String(html)
        .replace(/<form\b([^>]*)>/gi, (tag, attrs) => {
          if (!/\bmethod=["']?post["']?/i.test(attrs)) return tag;
          if (/\baction=["'][^"']*[?&]_csrf=/i.test(attrs)) return tag;
          return tag.replace(/\baction=(["'])([^"']*)\1/i, (m, q, url) => {
            const sep = url.includes('?') ? '&' : '?';
            return `action=${q}${url}${sep}_csrf=${token}${q}`;
          });
        })
        .replace(/\bformaction=(["'])([^"']*)\1/gi, (m, q, url) => {
          if (/[?&]_csrf=/.test(url)) return m;
          const sep = url.includes('?') ? '&' : '?';
          return `formaction=${q}${url}${sep}_csrf=${token}${q}`;
        });
      if (callback) return callback(null, withToken);
      res.send(withToken);
    });
  };
  next();
});

app.use((req, res, next) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const expected = String(req.session?.csrfToken || '');
  const supplied = String(req.query?._csrf || req.get('x-csrf-token') || req.body?._csrf || '');
  const sameLength = expected.length && expected.length === supplied.length;
  const valid = sameLength && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
  if (!valid) {
    console.warn(`[${req.id}] CSRF blocked ${req.method} ${req.originalUrl}`);
    return res.status(403).send('Yêu cầu bảo mật không hợp lệ. Hãy tải lại trang và thử lại.');
  }
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).send('Nguồn yêu cầu không hợp lệ.');
    } catch { return res.status(403).send('Nguồn yêu cầu không hợp lệ.'); }
  }
  next();
});

app.use((req, res, next) => {
  if (req.session?.user || ['/login','/register','/register/verify'].includes(req.path)) res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cartCount = Array.isArray(req.session.cart) ? req.session.cart.reduce((n,x)=>n+(Number(x.quantity)||0),0) : 0;
  res.locals.message = req.session.message || null;
  delete req.session.message;
  next();
});

// V35: badge thông báo cho chủ shop.
app.use(safe(async (req,res,next)=>{
  res.locals.adminBadges = { newOrders:0, pendingCtv:0, newSupport:0 };
  if (req.session?.user?.role === 'admin') res.locals.adminBadges = await db.getAdminBadges();
  next();
}));

// V54: badge thông báo thay đổi tình trạng phân loại hàng cho CTV.
app.use(safe(async (req,res,next)=>{
  res.locals.ctvBadges = { stockUpdates:0 };
  if (req.session?.user?.role === 'ctv') res.locals.ctvBadges = await db.getCtvBadges(req.session.user.id);
  next();
}));

// Kiểm tra DB mỗi request: chủ shop từ chối/xóa tài khoản thì phiên cũ không còn quyền truy cập.
app.use(safe(async (req, res, next) => {
  const sessionUser = req.session.user;
  if (!sessionUser || sessionUser.role === 'admin') return next();
  const current = await db.findUserById(sessionUser.id);
  if (!current || current.role !== 'ctv' || current.approval_status !== 'approved') {
    return req.session.destroy(() => res.redirect('/login'));
  }
  next();
}));
const login = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const admin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.redirect('/dashboard');
const regenSession = req => new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
const passwordStrongEnough = value => {
  const p = String(value || '');
  return p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
};
const audit = async (req, action, entityType='', entityId='', details={}) => {
  try {
    await db.addAuditLog({
      actor_user_id: req.session?.user?.id || null,
      actor_name: req.session?.user?.full_name || '',
      actor_role: req.session?.user?.role || '',
      action, entity_type: entityType, entity_id: entityId, details,
      ip: req.ip || '', user_agent: String(req.get('user-agent') || '').slice(0,500)
    });
  } catch (e) { console.error('Audit log error:', e.message); }
};
const text = (value, max = 255) => String(value || '').trim().slice(0, max);
const positiveInt = (value, fallback = 0, max = 1000000) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : fallback;
};
const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 10000000000) : 0;
};
const shippingFeeForQuantity = (value) => {
  const qty = Math.max(1, Math.min(100, Number.parseInt(value, 10) || 1));
  return 35000 + (qty - 1) * 10000;
};
const variantPricesFromBody = (body) => ({
  'Like Auth': money(body.price_like_auth),
  'Siêu Cấp': money(body.price_sieu_cap),
  'Best': money(body.price_best)
});
const legacyPriceFromVariants = (variants) => {
  const prices = Object.values(variants || {}).map(Number).filter(n => Number.isFinite(n) && n > 0);
  return prices.length ? Math.min(...prices) : 0;
};

const splitSizes = (value='') => [...new Set(String(value||'').split(/[,;\n\/\s]+/).map(x=>x.trim()).filter(Boolean))];
const sizeStockFromBody = (body, sizeText) => {
  const sizes = splitSizes(sizeText);
  const raw = body.size_stock && typeof body.size_stock === 'object' ? body.size_stock : {};
  const stock = {};
  for (const size of sizes) stock[size] = positiveInt(raw[size], 0, 100000);
  return stock;
};
const hasSizeStock = p => p?.size_stock && typeof p.size_stock === 'object' && Object.keys(p.size_stock).length > 0;
const hasUsableSizeStock = p => {
  if (!hasSizeStock(p)) return false;
  const sizes = splitSizes(p?.size || '');
  const hasKeys = sizes.some(size => Object.prototype.hasOwnProperty.call(p.size_stock, size));
  if (!hasKeys) return false;
  const hasPositive = sizes.some(size => Number(p.size_stock[size] || 0) > 0);
  // Tương thích sản phẩm cũ: V21 từng tạo size_stock toàn 0 trong khi quantity cũ vẫn > 0.
  // Trường hợp đó vẫn dùng tồn tổng cũ cho tới khi chủ shop nhập tồn riêng từng size.
  return hasPositive || Number(p.quantity || 0) <= 0;
};
const availableForSize = (p, size) => hasUsableSizeStock(p) ? Number(p.size_stock[size] || 0) : Number(p.quantity || 0);
const availableSizes = p => {
  const sizes = splitSizes(p?.size || '');
  const legacy = sizes.length > 1 && !hasUsableSizeStock(p);
  return sizes.map(size => ({ size, stock: availableForSize(p,size), legacy }));
};

const ctvOnly = (req,res,next) => req.session.user?.role === 'ctv' ? next() : res.redirect('/orders');
const cartOf = req => Array.isArray(req.session.cart) ? req.session.cart : (req.session.cart=[]);
const cartSelected = cart => cart.filter(x => x.selected !== false);
const cartTotals = cart => {
  const rows = cartSelected(cart);
  return {
    totalQuantity: rows.reduce((n,x)=>n+(Number(x.quantity)||0),0),
    totalMoney: rows.reduce((n,x)=>n+(Number(x.unit_price)||0)*(Number(x.quantity)||0),0),
    selectedCount: rows.length
  };
};

const ghsvConfigured = () => Boolean(GHSV_TOKEN);

// V52: Mã nội bộ Bee luôn suy ra cố định từ ID đơn, không phụ thuộc mã GHSV/B57.
const beeInternalCode = orderId => `BEE${String(orderId).padStart(6,'0')}`;


// V38: GHSV accepts either the GHSV code (required_code) or the shop's own
// client code (client_code). Short codes such as GYRPPH9Y are usually client
// codes, while GHSV examples such as YCCL.1400000004 are required codes.
// We try both safely on the server so CTVs never receive the API token.
const https = require('https');
const GHSV_TRACKING_ALT_URL = String(process.env.GHSV_TRACKING_ALT_URL || '').trim();

const jsonHttpRequest = (endpoint, {
  method = 'GET',
  headers = {},
  body = null,
  timeout = 7000
} = {}) => new Promise((resolve, reject) => {
  const url = new URL(endpoint);
  const payload = body === null || body === undefined ? '' : JSON.stringify(body);
  const reqHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...headers,
  };
  if (payload) reqHeaders['Content-Length'] = Buffer.byteLength(payload);
  const req = https.request(url, { method, headers: reqHeaders, timeout }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', chunk => { raw += chunk; });
    res.on('end', () => {
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
      resolve({
        status: res.statusCode || 0,
        ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
        data,
        raw,
      });
    });
  });
  req.on('timeout', () => req.destroy(new Error('GHSV timeout')));
  req.on('error', reject);
  if (payload) req.write(payload);
  req.end();
});

const ghsvAddressCache = new Map();
const cacheGet = (key, maxAgeMs = 12 * 60 * 60 * 1000) => {
  const x = ghsvAddressCache.get(key);
  return x && (Date.now() - x.at) < maxAgeMs ? x.value : null;
};
const cacheSet = (key, value) => { ghsvAddressCache.set(key, { at: Date.now(), value }); return value; };

const fetchGhsvProvinces = async () => {
  const key = 'provinces';
  const cached = cacheGet(key);
  if (cached) return cached;
  const r = await jsonHttpRequest(GHSV_PROVINCES_URL, { method: 'GET' });
  if (!r.ok || r.data?.success !== true || !Array.isArray(r.data?.provinces)) {
    throw new Error(r.data?.msg || `Không lấy được danh sách tỉnh GHSV (HTTP ${r.status})`);
  }
  return cacheSet(key, r.data.provinces);
};

const fetchGhsvDistricts = async provinceCode => {
  const code = String(provinceCode || '').trim();
  if (!code) return [];
  const key = `districts:${code}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const r = await jsonHttpRequest(GHSV_DISTRICTS_URL, { method: 'GET', body: { province_code: code } });
  if (!r.ok || r.data?.success !== true || !Array.isArray(r.data?.districts)) {
    throw new Error(r.data?.msg || `Không lấy được danh sách quận/huyện GHSV (HTTP ${r.status})`);
  }
  return cacheSet(key, r.data.districts);
};

const fetchGhsvWards = async districtCode => {
  const code = String(districtCode || '').trim();
  if (!code) return [];
  const key = `wards:${code}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const r = await jsonHttpRequest(GHSV_WARDS_URL, { method: 'GET', body: { district_code: code } });
  if (!r.ok || r.data?.success !== true || !Array.isArray(r.data?.wards)) {
    throw new Error(r.data?.msg || `Không lấy được danh sách phường/xã GHSV (HTTP ${r.status})`);
  }
  return cacheSet(key, r.data.wards);
};

// V63: đồng bộ danh sách cửa hàng chính thức từ GHSV để tự lấy shop_id.
const fetchGhsvShops = async (provinceCode = '', tokenOverride = '') => {
  const token = String(tokenOverride || GHSV_TOKEN || '').trim();
  if (!token) throw new Error('Chưa có token GHSV để lấy danh sách cửa hàng.');
  const code = String(provinceCode || '').trim();
  const r = await jsonHttpRequest(GHSV_SHOP_LIST_URL, {
    method: 'GET',
    headers: { Token: token },
    body: code ? { province_code: code } : null,
    timeout: 10000,
  });
  if (!r.ok || r.data?.success !== true || !Array.isArray(r.data?.shops)) {
    throw new Error(String(r.data?.msg || r.data?.message || `Không lấy được danh sách cửa hàng GHSV (HTTP ${r.status})`).trim());
  }
  return r.data.shops;
};

const initWebPush = async () => {
  let publicKey = await db.getSetting('webpush_public_key');
  let privateKey = await db.getSetting('webpush_private_key');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await db.setSetting('webpush_public_key', publicKey);
    await db.setSetting('webpush_private_key', privateKey);
  }
  WEB_PUSH_PUBLIC_KEY = publicKey;
  WEB_PUSH_PRIVATE_KEY = privateKey;
  webpush.setVapidDetails(WEB_PUSH_SUBJECT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
};

const warehousePublicUrl = (req, warehouse) => {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${proto}://${req.get('host')}/kho/${warehouse.access_token}`;
};

const sendWarehousePush = async (warehouseId, orderId, warehouseUrl='') => {
  if (!WEB_PUSH_PUBLIC_KEY || !warehouseId) return { sent:0, failed:0 };
  const [subs, order] = await Promise.all([db.listWarehousePushSubscriptions(warehouseId), db.findOrderById(orderId)]);
  if (!order || !subs.length) return { sent:0, failed:0 };
  const item = Array.isArray(order.items) && order.items.length ? order.items[0] : order;
  const title = 'Bee Kho • Có đơn cần check';
  const body = `${item.product_name || order.product_name || 'Sản phẩm'}${item.product_variant?` • ${item.product_variant}`:''}${item.size?` • Size ${item.size}`:''} • SL ${Number(item.quantity||order.quantity||1)}`;
  const payload = JSON.stringify({
    title, body,
    url: warehouseUrl ? `${warehouseUrl}?order=${encodeURIComponent(order.id)}#order-${order.id}` : '/',
    tag: `bee-kho-${order.id}`,
    orderId: order.id
  });
  let sent=0, failed=0;
  for (const sub of subs) {
    const subscription = { endpoint:sub.endpoint, expirationTime:sub.expiration_time || null, keys:{p256dh:sub.p256dh,auth:sub.auth} };
    try {
      await webpush.sendNotification(subscription,payload,{TTL:3600,urgency:'high'});
      sent++;
    } catch (e) {
      failed++;
      if ([404,410].includes(Number(e.statusCode))) await db.deleteWarehousePushSubscriptionByEndpoint(sub.endpoint);
      else console.error(`[PUSH] warehouse ${warehouseId}`, e.message);
    }
  }
  return {sent,failed};
};

const notifyCurrentWarehouse = async (req, orderId) => {
  const selected = await db.getSelectedWarehouse(orderId);
  if (!selected?.warehouse_id) return { sent:0,failed:0 };
  const warehouses = await db.listWarehouses();
  const warehouse = warehouses.find(w=>Number(w.id)===Number(selected.warehouse_id));
  return sendWarehousePush(selected.warehouse_id, orderId, warehouse?.access_token ? warehousePublicUrl(req,warehouse) : '');
};

const ghsvWeightForPairs = quantity => {
  const q = Math.max(1, Number(quantity) || 1);
  if (q === 1) return 1000;
  if (q === 2 || q === 3) return 2000;
  return (q - 1) * 1000;
};

const ghsvProductDescription = order => {
  const items = Array.isArray(order?.items) && order.items.length ? order.items : [{
    product_name: order?.product_name,
    product_variant: order?.product_variant,
    size: order?.size,
    quantity: order?.quantity,
  }];
  return items.map(it => {
    const bits = [it.product_name, it.product_variant, it.size ? `Size ${it.size}` : '', `SL ${Number(it.quantity || 1)}`].filter(Boolean);
    return bits.join(' - ');
  }).join('; ').slice(0, 500);
};

const getCtvGhsvToken = async ctvId => {
  if (!ctvId) return { token:'', credential:null };
  const credential = await db.getCtvGhsvCredential(ctvId);
  if (!credential?.ghsv_token_enc) return { token:'', credential };
  return { token: decryptCtvGhsvToken(credential.ghsv_token_enc), credential };
};

// Tạo đơn: nếu CTV có kết nối GHSV riêng thì bắt buộc dùng token + shop_id đã map của CTV đó.
// Nếu CTV chưa kết nối riêng thì giữ luồng cũ dùng tài khoản GHSV chính của shop.
const resolveGhsvCreateContext = async (order, warehouse) => {
  const ctvId = Number(order?.ctv_id || 0) || null;
  if (ctvId) {
    const { token, credential } = await getCtvGhsvToken(ctvId);
    if (token) {
      const mapped = await db.getCtvGhsvShopForWarehouse(ctvId, warehouse?.warehouse_id);
      const shopId = Number(mapped?.ghsv_shop_id || 0);
      if (!shopId) {
        throw new Error(`CTV ${credential?.full_name || '#'+ctvId} đã kết nối GHSV riêng nhưng kho ${warehouse?.name || warehouse?.warehouse_name || ''} chưa được map với cửa hàng GHSV của CTV. Vào Quản lý tài khoản → GHSV của CTV để map kho.`);
      }
      return { token, shopId, ownerCtvId:ctvId, source:'ctv', accountName:credential?.full_name || `CTV #${ctvId}` };
    }
  }
  if (!GHSV_TOKEN) throw new Error('CTV chưa có token GHSV riêng và shop cũng chưa cấu hình GHSV_TOKEN.');
  const shopId = Number(warehouse?.ghsv_warehouse_id || 0);
  if (!shopId) throw new Error('Kho đang chọn chưa có Shop ID GHSV của tài khoản shop.');
  return { token:GHSV_TOKEN, shopId, ownerCtvId:null, source:'shop', accountName:'GHSV shop chính' };
};

// Tra cứu/đồng bộ: đơn đã tạo bằng CTV nào thì luôn quay lại đúng token CTV đó.
// Đơn V74 trở về trước không có ghsv_owner_ctv_id vẫn tiếp tục dùng token shop để tránh đổi tài khoản giữa chừng.
const resolveGhsvLookupContext = async order => {
  const ownerCtvId = Number(order?.ghsv_owner_ctv_id || 0) || null;
  if (ownerCtvId) {
    const { token, credential } = await getCtvGhsvToken(ownerCtvId);
    if (!token) throw new Error(`Đơn này thuộc tài khoản GHSV của ${credential?.full_name || 'CTV'} nhưng token hiện không còn được kết nối.`);
    return { token, ownerCtvId, source:'ctv', accountName:credential?.full_name || `CTV #${ownerCtvId}` };
  }
  if (order?.ghsv_created_at) {
    if (!GHSV_TOKEN) throw new Error('Đơn cũ này được tạo bằng tài khoản GHSV shop nhưng GHSV_TOKEN hiện chưa cấu hình.');
    return { token:GHSV_TOKEN, ownerCtvId:null, source:'shop', accountName:'GHSV shop chính' };
  }
  // Đơn chưa tạo tự động: nếu CTV đã kết nối riêng thì tra bằng token của họ trước.
  const ctvId = Number(order?.ctv_id || 0) || null;
  if (ctvId) {
    const { token, credential } = await getCtvGhsvToken(ctvId);
    if (token) return { token, ownerCtvId:ctvId, source:'ctv', accountName:credential?.full_name || `CTV #${ctvId}` };
  }
  if (!GHSV_TOKEN) throw new Error('Chưa có token GHSV phù hợp cho đơn này.');
  return { token:GHSV_TOKEN, ownerCtvId:null, source:'shop', accountName:'GHSV shop chính' };
};

const createGhsvOrderForBee = async (orderId, actorUserId = null) => {
  const order = await db.findOrderById(orderId);
  if (!order) throw new Error('Không tìm thấy đơn Bee.');
  if (order.ghsv_created_at || order.ghsv_required_code) {
    return { alreadyCreated: true, order };
  }
  if (Array.isArray(order.items) && order.items.length > 1) {
    throw new Error('Đơn có nhiều sản phẩm. Bản này chưa tự tách nhiều kho/vận đơn GHSV.');
  }
  const warehouse = await db.getSelectedWarehouse(orderId);
  if (!warehouse?.warehouse_id) {
    throw new Error('Đơn chưa có kho đã chọn. Hãy gán kho ưu tiên cho sản phẩm trước.');
  }
  const ghsvContext = await resolveGhsvCreateContext(order, warehouse);
  const shopId = ghsvContext.shopId;
  if (order.warehouse_status !== 'Đã xác nhận') {
    throw new Error('Hãy xác nhận kho CÓ/CÒN trước khi tạo đơn GHSV.');
  }
  const clientCode = String(order.tracking_code || beeInternalCode(order.id)).trim();
  if (!/^BEE\d{4,}$/i.test(clientCode)) {
    throw new Error('Đơn này chưa có client_code Bee hợp lệ để tạo GHSV.');
  }
  const phone = normalizePhone(order.phone);
  if (!phone) throw new Error('SĐT người nhận không hợp lệ.');

  const province = String(order.ghsv_to_province || '').trim();
  const district = String(order.ghsv_to_district || '').trim();
  const ward = String(order.ghsv_to_ward || '').trim();
  if (!province || !district || !ward) {
    throw new Error('Đơn chưa có đủ Tỉnh/Thành, Quận/Huyện, Phường/Xã theo GHSV. CTV cần tạo/sửa đơn với địa chỉ GHSV đầy đủ.');
  }

  const body = {
    shop_id: shopId,
    config_delivery: 1,
    value: Number(order.base_cod || order.cod || 0),
    price: Number(order.cod || 0),
    weight: ghsvWeightForPairs(order.quantity),
    product: ghsvProductDescription(order),
    to_name: String(order.customer_name || '').trim(),
    note: String(order.note || '').trim(),
    client_code: clientCode,
    is_return: false,
    config_collect: 1,
    to_district: district,
    to_province: province,
    to_address: String(order.address || '').trim(),
    to_phone: phone,
    to_ward: ward,
  };

  const r = await jsonHttpRequest(GHSV_CREATE_ORDER_URL, {
    method: 'POST',
    headers: { Token: ghsvContext.token },
    body,
    timeout: 10000,
  });
  if (!r.ok || r.data?.success !== true) {
    const message = String(r.data?.msg || r.data?.message || `HTTP ${r.status}`).trim();
    await db.markGhsvCreateError(orderId, message);
    throw new Error(`GHSV tạo đơn thất bại: ${message}`);
  }
  const payload = r.data?.order || r.data?.data || {};
  const requiredCode = String(payload.required_code || payload.order_code || '').trim();
  const orderCode = String(payload.order_code || payload.required_code || '').trim();
  const fee = Number(payload.fee || 0) || 0;
  if (!requiredCode && !orderCode) {
    await db.markGhsvCreateError(orderId, 'GHSV báo thành công nhưng không trả mã đơn.');
    throw new Error('GHSV báo thành công nhưng không trả mã đơn.');
  }
  const updated = await db.markGhsvCreateResult(orderId, {
    requiredCode: requiredCode || orderCode,
    orderCode: orderCode || requiredCode,
    fee,
    ownerCtvId: ghsvContext.ownerCtvId,
    shopIdUsed: String(shopId)
  });
  await db.upsertGhsvCodeMap({ clientCode, requiredCode: requiredCode || orderCode, createdBy: actorUserId });
  return { alreadyCreated: false, order: updated, response: payload, ghsvContext:{source:ghsvContext.source,accountName:ghsvContext.accountName,shopId} };
};

const ghsvCodeFields = trackingCode => {
  const code = String(trackingCode || '').trim();
  const looksLikeRequired = /\.|^[A-Z]{2,6}\.\d+/i.test(code);
  return looksLikeRequired ? ['required_code','client_code'] : ['client_code','required_code'];
};

const ghsvHttpRequest = (endpoint, trackingCode, {
  method = 'GET',
  useBody = true,
  tracking = false,
  codeField = 'required_code',
  token = GHSV_TOKEN
} = {}) => new Promise((resolve, reject) => {
  const url = new URL(endpoint);
  if (!useBody) url.searchParams.set(codeField, trackingCode);
  const payload = JSON.stringify({ [codeField]: trackingCode });
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    // GHSV info API documents Token, tracking API documents client_code as
    // the token header. Send the documented header first; Token is also sent
    // on tracking for compatibility with environments that accept it.
    ...(tracking ? { 'client_code': token, 'Token': token } : { 'Token': token })
  };
  if (useBody) headers['Content-Length'] = Buffer.byteLength(payload);

  const req = https.request(url, { method, headers, timeout: 5000 }, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', chunk => { raw += chunk; });
    res.on('end', () => {
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : {}; } catch (_) { parsed = { raw }; }
      resolve({
        status: res.statusCode || 0,
        ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
        data: parsed,
        raw,
        endpoint,
        method,
        codeField,
        useBody
      });
    });
  });
  req.on('timeout', () => req.destroy(new Error('GHSV timeout')));
  req.on('error', reject);
  if (useBody) req.write(payload);
  req.end();
});

const ghsvMessage = r => String(r?.data?.msg || r?.data?.message || r?.data?.error?.message || '').trim();
const ghsvNotFound = r => {
  const msg = ghsvMessage(r).toLowerCase();
  return msg.includes('không tìm thấy') || msg.includes('không tồn tại') || msg.includes('not found') || msg.includes('chưa có đơn');
};
const ghsvSuccess = r => Boolean(r?.ok && r?.data && r.data.success === true);

const ghsvLookupInfo = async (trackingCode, preferredField = '', tokenOverride = '') => {
  const token = String(tokenOverride || GHSV_TOKEN || '').trim();
  if (!token) throw new Error('Chưa có token GHSV phù hợp');
  const code = String(trackingCode || '').trim();
  if (!code) throw new Error('Thiếu mã tra cứu GHSV');
  const fields = preferredField ? [preferredField] : ghsvCodeFields(code);
  let last = null;
  // V51: API info chính thức của GHSV dùng GET + JSON body. Chỉ gọi đúng kiểu tài liệu
  // để tránh một lần bấm tra cứu phải chờ nhiều request fallback nối tiếp nhau.
  for (const codeField of fields) {
    const r = await ghsvHttpRequest(GHSV_ORDER_INFO_URL, code, { method:'GET', useBody:true, codeField, tracking:false, token });
    last = r;
    const msg = ghsvMessage(r).slice(0,240);
    console.log(`[GHSV] info GET body ${codeField} -> HTTP ${r.status}${msg?` | ${msg}`:''}`);
    if (ghsvSuccess(r)) return r.data;
    if (r.ok && ghsvNotFound(r)) continue;
    throw new Error(`GHSV info: ${ghsvMessage(r) || `HTTP ${r.status}`}`);
  }
  const detail = ghsvMessage(last) || String(last?.raw || '').replace(/\s+/g,' ').slice(0,260);
  throw new Error(detail || `GHSV info HTTP ${last?.status || 0}`);
};

const ghsvLookupTracking = async (trackingCode, preferredField = '', tokenOverride = '') => {
  const token = String(tokenOverride || GHSV_TOKEN || '').trim();
  if (!token) throw new Error('Chưa có token GHSV phù hợp');
  const code = String(trackingCode || '').trim();
  if (!code) throw new Error('Thiếu mã hành trình GHSV');
  const endpoints = [...new Set([GHSV_TRACKING_URL, GHSV_TRACKING_ALT_URL].filter(Boolean))];
  const fields = preferredField ? [preferredField] : ghsvCodeFields(code);
  let last = null;
  // V51: ưu tiên GET + JSON body; chỉ thử endpoint thay thế nếu endpoint chính không dùng được.
  for (const endpoint of endpoints) {
    for (const codeField of fields) {
      const r = await ghsvHttpRequest(endpoint, code, { method:'GET', useBody:true, codeField, tracking:true, token });
      last = r;
      const msg = ghsvMessage(r).slice(0,240);
      console.log(`[GHSV] tracking GET body ${codeField} ${new URL(endpoint).pathname} -> HTTP ${r.status}${msg?` | ${msg}`:''}`);
      if (ghsvSuccess(r)) return r.data;
      if (r.ok && ghsvNotFound(r)) continue;
      if (![404,405].includes(r.status)) throw new Error(`GHSV tracking: ${ghsvMessage(r) || `HTTP ${r.status}`}`);
    }
  }
  const detail = ghsvMessage(last) || String(last?.raw || '').replace(/\s+/g,' ').slice(0,260);
  throw new Error(detail || `GHSV tracking HTTP ${last?.status || 0}`);
};

const normalizeGhsvInfo = payload => {
  const x = payload?.data || payload?.order || payload?.result || payload || {};
  return {
    status: firstDefined(x.status_name, x.status, x.order_status, x.current_status, ''),
    cod: firstDefined(x.cod, x.cod_amount, x.collect_amount, null),
    fee: firstDefined(x.fee, x.shipping_fee, x.total_fee, null),
    required_code: firstDefined(x.required_code, x.order_code, x.tracking_code, ''),
    shipper_name: firstDefined(x.shipper_name, x.driver_name, x.delivery_name, x.employee_name, x.shipper?.name, x.driver?.name, ''),
    shipper_phone: firstDefined(x.shipper_phone, x.driver_phone, x.delivery_phone, x.employee_phone, x.shipper?.phone, x.driver?.phone, '')
  };
};
const normalizeGhsvTracking = payload => {
  const rows = payload?.tracking || payload?.data?.tracking || payload?.data || payload?.result || [];
  if (!Array.isArray(rows)) return [];
  return rows.slice(0,100).map(x => ({
    time: firstDefined(x.time, x.created_at, x.created, x.date, x.updated_at, ''),
    status: firstDefined(x.status_name, x.status, x.action, x.title, ''),
    note: firstDefined(
      x.note,
      x.description,
      x.content,
      x.message,
      x.detail,
      x.reason,
      x.status_description,
      x.action_text,
      ''
    ),
    // Giữ raw để có thể tìm shipper trong các field lồng nhau mà API GHSV
    // không ghi đúng vào note/description.
    _raw: x
  }));
};

const collectTextDeep = value => {
  const out = [];
  const walk = (v, depth = 0) => {
    if (depth > 5 || v == null) return;
    if (typeof v === 'string' || typeof v === 'number') {
      const t = String(v).trim();
      if (t) out.push(t);
      return;
    }
    if (Array.isArray(v)) {
      v.slice(0,50).forEach(x => walk(x, depth + 1));
      return;
    }
    if (typeof v === 'object') {
      Object.values(v).slice(0,80).forEach(x => walk(x, depth + 1));
    }
  };
  walk(value);
  return out;
};

const parseShipperFromText = value => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Dạng GHSV thực tế:
  // "Đơn hàng được giao cho shipper: Lương Thị Hà (0356628773)"
  let m = text.match(/(?:giao\s+cho\s+shipper|shipper)\s*[:：-]?\s*([^()]{2,100}?)\s*\((0\d{8,10})\)/i);
  if (m) return { name: m[1].trim().replace(/^[\-–—: ]+|[\-–—: ]+$/g,''), phone: m[2] };

  // Một số response có thể bỏ chữ "shipper" nhưng vẫn có tên + SĐT trong ngoặc.
  m = text.match(/([^()\n]{2,100}?)\s*\((0\d{8,10})\)/);
  if (m) {
    let name = m[1].trim();
    // Bỏ phần thời gian / mô tả đứng trước nếu có.
    name = name.replace(/^.*?(?:giao\s+cho\s+shipper|shipper)\s*[:：-]?\s*/i, '').trim();
    if (name && !/^0\d+$/.test(name)) return { name, phone: m[2] };
  }

  // Dạng "Lương Thị Hà gọi điện cho người nhận..." giúp lấy được tên
  // ngay cả khi API public chưa trả SĐT shipper.
  m = text.match(/(?:^|[|.;:-]\s*)([A-ZÀ-ỸĐ][^|.;:()]{2,80}?)\s+(?:gọi điện|goi dien)\s+cho\s+người nhận/i);
  if (m) return { name: m[1].trim(), phone: '' };

  return null;
};

const extractShipper = tracking => {
  if (!Array.isArray(tracking) || !tracking.length) return { name:'', phone:'' };

  // Tracking của GHSV thường mới -> cũ. Ưu tiên bản ghi mới nhất có
  // "giao cho shipper". Nếu thứ tự bị đảo, timestamp không ổn định thì
  // vẫn quét toàn bộ và lấy match đầu tiên theo thứ tự API trả về.
  let fallbackName = '';
  let fallbackPhone = '';
  for (const row of tracking) {
    const candidates = [
      row?.note,
      row?.status,
      ...collectTextDeep(row?._raw)
    ].filter(Boolean);
    for (const candidate of candidates) {
      const parsed = parseShipperFromText(candidate);
      if (parsed?.name && parsed?.phone) return parsed;
      if (parsed?.name && !fallbackName) fallbackName = parsed.name;
      if (parsed?.phone && !fallbackPhone) fallbackPhone = parsed.phone;
    }
  }

  // Nếu name và phone nằm ở hai field khác nhau trong cùng payload,
  // cố tìm số điện thoại shipper riêng nhưng chỉ trong các row có dấu hiệu shipper.
  for (const row of tracking) {
    const rawText = [row?.note, row?.status, ...collectTextDeep(row?._raw)].join(' | ');
    if (!/(shipper|giao\s+cho\s+shipper|gọi điện cho người nhận|goi dien cho nguoi nhan)/i.test(rawText)) continue;
    const phone = rawText.match(/\b(0\d{8,10})\b/);
    if (phone && !fallbackPhone) fallbackPhone = phone[1];
  }

  return { name:fallbackName, phone:fallbackPhone };
};

// V81: API GHSV có thể đổi tên/nesting field shipper theo từng endpoint/tài khoản.
// Quét raw response theo ngữ cảnh shipper/driver/courier để tự tìm name + phone,
// nhưng KHÔNG lấy nhầm SĐT khách hàng chỉ vì thấy một field phone chung chung.
const SHIPPER_HINT_RE = /(shipper|driver|rider|courier|delivery[_\s-]*(?:staff|man|person|employee|driver|courier)|nguoi[_\s-]*giao|nhan[_\s-]*vien[_\s-]*giao)/i;
const PHONE_KEY_RE = /(phone|mobile|telephone|tel|sdt|so[_\s-]*dien[_\s-]*thoai)/i;
const NAME_KEY_RE = /(^|[_\s-])(name|full[_\s-]*name|ten)($|[_\s-])/i;
const DIRECT_SHIPPER_PHONE_KEY_RE = /(shipper|driver|rider|courier|delivery|employee|staff).*(phone|mobile|tel|sdt)|(phone|mobile|tel|sdt).*(shipper|driver|rider|courier|delivery|employee|staff)/i;
const DIRECT_SHIPPER_NAME_KEY_RE = /(shipper|driver|rider|courier|delivery|employee|staff).*(name|ten)|(name|ten).*(shipper|driver|rider|courier|delivery|employee|staff)/i;

const normalizePossiblePhone = value => {
  const raw = String(value ?? '').trim();
  const m = raw.match(/(?:\+?84|0)[ .-]?(?:\d[ .-]?){8,10}/);
  if (!m) return '';
  let digits = m[0].replace(/\D/g,'');
  if (digits.startsWith('84')) digits = `0${digits.slice(2)}`;
  return /^0\d{8,10}$/.test(digits) ? digits : '';
};

const extractShipperFromPayload = payload => {
  let name = '';
  let phone = '';
  const seen = new Set();

  const inspectObject = (obj, pathParts) => {
    const entries = Object.entries(obj || {});
    const pathText = pathParts.join('.');
    const keysText = entries.map(([k])=>k).join(' ');
    const shipperContext = SHIPPER_HINT_RE.test(`${pathText} ${keysText}`);

    // Field trực tiếp kiểu shipper_phone / driver_name dù object cha tên gì.
    for (const [key,val] of entries) {
      if (!phone && DIRECT_SHIPPER_PHONE_KEY_RE.test(key)) phone = normalizePossiblePhone(val);
      if (!name && DIRECT_SHIPPER_NAME_KEY_RE.test(key) && typeof val !== 'object') {
        const t=String(val ?? '').trim();
        if (t && !normalizePossiblePhone(t)) name=t.slice(0,120);
      }
    }

    // Object có ngữ cảnh shipper: {shipper:{name,phone}} hoặc {driver_info:{...}}.
    if (shipperContext) {
      for (const [key,val] of entries) {
        if (!phone && PHONE_KEY_RE.test(key) && typeof val !== 'object') phone=normalizePossiblePhone(val);
        if (!name && NAME_KEY_RE.test(key) && typeof val !== 'object') {
          const t=String(val ?? '').trim();
          if (t && !normalizePossiblePhone(t)) name=t.slice(0,120);
        }
      }
      // Có API nhét cả tên/SĐT vào một chuỗi mô tả bên trong object shipper.
      for (const [,val] of entries) {
        if (typeof val !== 'string') continue;
        const parsed=parseShipperFromText(val);
        if (parsed?.name && !name) name=parsed.name;
        if (parsed?.phone && !phone) phone=parsed.phone;
      }
    }
  };

  const walk = (value, pathParts=[], depth=0) => {
    if (depth > 7 || value == null || (name && phone)) return;
    if (typeof value === 'string') {
      // Chỉ parse text tự do nếu chính path hoặc nội dung nói về shipper.
      const pathText=pathParts.join('.');
      if (SHIPPER_HINT_RE.test(`${pathText} ${value}`)) {
        const parsed=parseShipperFromText(value);
        if (parsed?.name && !name) name=parsed.name;
        if (parsed?.phone && !phone) phone=parsed.phone;
      }
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.slice(0,100).forEach((v,i)=>walk(v,[...pathParts,String(i)],depth+1));
      return;
    }
    inspectObject(value,pathParts);
    for (const [key,val] of Object.entries(value).slice(0,120)) walk(val,[...pathParts,key],depth+1);
  };
  walk(payload);
  return {name,phone};
};

const maskPhoneForDebug = value => {
  const phone=normalizePossiblePhone(value);
  if (!phone) return String(value ?? '');
  return `${phone.slice(0,3)}***${phone.slice(-3)}`;
};
const maskTextPhonesForDebug = value => String(value ?? '').replace(/(?:\+?84|0)[ .-]?(?:\d[ .-]?){8,10}/g,m=>maskPhoneForDebug(m));

const sanitizeGhsvDebug = (value, pathParts=[], depth=0) => {
  if (depth > 7) return '[depth-limit]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  const pathText=pathParts.join('.');
  if (typeof value === 'string') {
    const trimmed=value.length>800?`${value.slice(0,800)}…`:value;
    // Cho admin thấy field/path của shipper nhưng vẫn che bớt số trong khối debug.
    return maskTextPhonesForDebug(trimmed);
  }
  if (Array.isArray(value)) return value.slice(0,20).map((v,i)=>sanitizeGhsvDebug(v,[...pathParts,String(i)],depth+1));
  if (typeof value !== 'object') return String(value);
  const out={};
  for (const [key,val] of Object.entries(value).slice(0,100)) {
    const lower=String(key).toLowerCase();
    if (/(token|authorization|auth_token|access_token|secret|password|api[_-]?key)/i.test(lower)) {
      out[key]='[HIDDEN]';
      continue;
    }
    const childPath=[...pathParts,key];
    const childPathText=childPath.join('.');
    // Thông tin người nhận/người gửi chỉ cần biết cấu trúc field, không cần lộ giá trị.
    if (/(customer|receiver|recipient|sender|pickup|address)/i.test(childPathText) && !SHIPPER_HINT_RE.test(childPathText)) {
      if (val && typeof val === 'object') out[key]=sanitizeGhsvDebug(val,childPath,depth+1);
      else out[key]='[REDACTED]';
      continue;
    }
    out[key]=sanitizeGhsvDebug(val,childPath,depth+1);
  }
  return out;
};

const collectGhsvShipperDebugCandidates = payload => {
  const rows=[];
  const seen=new Set();
  const walk=(value,pathParts=[],depth=0)=>{
    if(depth>7||value==null)return;
    if(typeof value!=='object')return;
    if(seen.has(value))return;
    seen.add(value);
    if(Array.isArray(value)) { value.slice(0,100).forEach((v,i)=>walk(v,[...pathParts,String(i)],depth+1)); return; }
    for(const [key,val] of Object.entries(value).slice(0,120)){
      const path=[...pathParts,key].join('.');
      const shipperKey=SHIPPER_HINT_RE.test(path)||DIRECT_SHIPPER_PHONE_KEY_RE.test(key)||DIRECT_SHIPPER_NAME_KEY_RE.test(key);
      if(shipperKey && (typeof val==='string'||typeof val==='number')) {
        rows.push({path,value:maskTextPhonesForDebug(String(val).slice(0,240))});
      }
      if(shipperKey && val && typeof val==='object') {
        rows.push({path,value:Array.isArray(val)?`[array ${val.length}]`:'{object}'});
      }
      walk(val,[...pathParts,key],depth+1);
    }
  };
  walk(payload);
  return rows.slice(0,80);
};

const buildGhsvDebug = (infoRaw,trackingRaw,roomRaw=null) => {
  const detected=extractShipperFromPayload({infoRaw,trackingRaw,roomRaw});
  return {
  note:'V82 debug admin: token/auth + thông tin khách đã che; số điện thoại trong debug chỉ hiện dạng 09x***xxx.',
  auto_detected_shipper: {name:detected.name||'',phone:detected.phone?maskPhoneForDebug(detected.phone):''},
  shipper_candidate_paths: [
    ...collectGhsvShipperDebugCandidates(infoRaw).map(x=>({source:'info',...x})),
    ...collectGhsvShipperDebugCandidates(trackingRaw).map(x=>({source:'tracking',...x})),
    ...collectGhsvShipperDebugCandidates(roomRaw).map(x=>({source:'room_detail',...x}))
  ].slice(0,120),
  info_response: sanitizeGhsvDebug(infoRaw),
  tracking_response: sanitizeGhsvDebug(trackingRaw),
  room_detail_response: sanitizeGhsvDebug(roomRaw)
  };
};
// V82: GHSV web hien thi shipper trong /v1/room/detail?customer_code=...,
// thuong nam trong note_public, vi du:
// "Don hang duoc giao cho shipper: Le Thanh Binh (0393374588)".
// Endpoint nay dung Authorization: Bearer, khac voi open-api dung header Token.
const deepFindFirstValueByKey = (payload, wantedKeys) => {
  const wanted = new Set((wantedKeys || []).map(x=>String(x).toLowerCase()));
  const seen = new Set();
  let found = '';
  const walk = (v, depth=0) => {
    if(found || v == null || depth > 8 || typeof v !== 'object') return;
    if(seen.has(v)) return;
    seen.add(v);
    if(Array.isArray(v)) { v.slice(0,150).forEach(x=>walk(x,depth+1)); return; }
    for(const [k,val] of Object.entries(v).slice(0,160)) {
      if(wanted.has(String(k).toLowerCase()) && (typeof val === 'string' || typeof val === 'number')) {
        const t=String(val).trim();
        if(t) { found=t; return; }
      }
    }
    for(const val of Object.values(v).slice(0,160)) walk(val,depth+1);
  };
  walk(payload);
  return found;
};

const customerCodeFromRequiredCode = value => {
  const code=String(value||'').trim().toUpperCase();
  if(!code) return '';
  // Ma thuc te da xac nhan: B57BRYK0020969 -> BRYK.
  // Chap nhan branch 1 chu + 2 so, customer code chu cai 2-12 ky tu, sau do la day so.
  const m=code.match(/^[A-Z]\d{2}([A-Z]{2,12})\d{5,}$/);
  return m ? m[1] : '';
};

const resolveGhsvCustomerCode = ({infoRaw,trackingRaw,resolvedCode,storedCode,order,allowEnv=false}={}) => {
  const fromPayload=deepFindFirstValueByKey({infoRaw,trackingRaw},['customer_code','customerCode']);
  if(fromPayload) return String(fromPayload).trim().toUpperCase();
  if(allowEnv && GHSV_CUSTOMER_CODE) return GHSV_CUSTOMER_CODE;
  for(const code of [order?.ghsv_required_code,order?.ghsv_order_code,resolvedCode,storedCode]) {
    const parsed=customerCodeFromRequiredCode(code);
    if(parsed) return parsed;
  }
  return '';
};

const ghsvLookupRoomDetail = async (customerCode, tokenOverride='') => {
  const customerCodeClean=String(customerCode||'').trim().toUpperCase();
  if(!customerCodeClean) return null;
  let token=String(tokenOverride || GHSV_ROOM_BEARER || '').trim();
  if(!token) return null;
  token=token.replace(/^Bearer\s+/i,'').trim();
  const url=new URL(GHSV_ROOM_DETAIL_URL);
  url.searchParams.set('customer_code',customerCodeClean);
  try {
    const r=await jsonHttpRequest(url.toString(),{
      method:'GET',
      headers:{ Authorization:`Bearer ${token}` },
      timeout:7000
    });
    if(!r.ok) {
      console.log(`[GHSV][V82] room/detail customer_code=${customerCodeClean} -> HTTP ${r.status}`);
      return null;
    }
    console.log(`[GHSV][V82] room/detail customer_code=${customerCodeClean} -> HTTP ${r.status}`);
    return r.data || null;
  } catch(e) {
    console.log(`[GHSV][V82] room/detail customer_code=${customerCodeClean} failed: ${e.message}`);
    return null;
  }
};

const extractTargetedShipperFromRoom = (payload, targetCodes=[]) => {
  if(!payload) return {name:'',phone:''};
  const codes=[...new Set((targetCodes||[]).map(x=>String(x||'').trim().toUpperCase()).filter(Boolean))];
  const seen=new Set();
  const matches=[];
  const walk=(v,depth=0)=>{
    if(v==null||depth>8||typeof v!=='object'||seen.has(v)) return;
    seen.add(v);
    if(Array.isArray(v)) { v.slice(0,150).forEach(x=>walk(x,depth+1)); return; }
    const texts=collectTextDeep(v);
    const joined=texts.join(' | ');
    const parsed=extractShipperFromPayload(v);
    const hasShipper=Boolean(parsed.name||parsed.phone||/giao\s+cho\s+shipper|shipper\s*:/i.test(joined));
    const hasCode=!codes.length || codes.some(c=>joined.toUpperCase().includes(c));
    if(hasShipper && hasCode) matches.push({parsed,size:texts.length,depth});
    for(const child of Object.values(v).slice(0,160)) walk(child,depth+1);
  };
  walk(payload);
  matches.sort((a,b)=>a.size-b.size || b.depth-a.depth);
  const best=matches.find(x=>x.parsed.name||x.parsed.phone);
  if(best) return best.parsed;
  return extractShipperFromPayload(payload);
};

const canAccessOrder = (req, order) => Boolean(order && (req.session.user?.role === 'admin' || Number(order.ctv_id) === Number(req.session.user?.id)));


// V45: đồng bộ trạng thái GHSV -> Bee Sneaker.
// Render Free có thể sleep, vì vậy hệ thống vừa đồng bộ định kỳ khi service đang thức,
// vừa kích hoạt đồng bộ nền khi người dùng mở Dashboard/Đơn hàng.
const normalizeStatusText = value => String(value || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/đ/g,'d').replace(/\s+/g,' ').trim();

const mapGhsvStatusToLocal = ghsvStatus => {
  const s = normalizeStatusText(ghsvStatus);
  if (!s) return '';
  // V49: map trạng thái chính thức GHSV về trạng thái Bee.
  // Terminal states first để tránh nhầm "hoàn giao hàng" với "giao hàng".
  if (/(giao thanh cong|giao hang thanh cong|da giao thanh cong|da giao hang toan bo|phat thanh cong)/.test(s)) return 'Hoàn thành';
  if (/(hoan giao hang|hoan hang|dang hoan|da hoan hang|tra hang|chuyen hoan|hoan ve|hang hoan|tra ve)/.test(s)) return 'Hoàn';
  if (/(huy don|da huy|don huy|huy giao|da huy don)/.test(s)) return 'Hủy';
  if (/(dang giao|dang van chuyen|da lay hang|da nhap kho|dang xu ly|dang luan chuyen|dang phat|dang trung chuyen)/.test(s)) return 'Đang giao';
  if (/(cho lay hang|doi lay hang|cho lay|doi lay|cho xac nhan|cho tiep nhan)/.test(s)) return 'Đã xác nhận';
  return '';
};


const looksLikeBeeClientCode = value => /^BEE\d{4,}$/i.test(String(value || '').trim());
const looksLikeLegacyMvd = value => /^B57[A-Z0-9]+$/i.test(String(value || '').trim());
const latestTrackingStatus = tracking => {
  if (!Array.isArray(tracking) || !tracking.length) return '';
  // API thường trả mới nhất trước; nếu không, trạng thái terminal bên dưới vẫn được ưu tiên.
  const terminal = tracking.find(x => mapGhsvStatusToLocal(x?.status) && ['Hoàn thành','Hoàn','Hủy'].includes(mapGhsvStatusToLocal(x?.status)));
  return String((terminal || tracking[0])?.status || '').trim();
};

let ghsvSyncRunning = false;
let lastGhsvSyncStartedAt = 0;
const syncGhsvOrders = async ({ limit = 40, reason = 'timer' } = {}) => {
  if (ghsvSyncRunning) return { skipped: true };
  ghsvSyncRunning = true;
  lastGhsvSyncStartedAt = Date.now();
  let checked = 0, changed = 0, failed = 0, autoLinked = 0;
  try {
    const orders = await db.listGhsvSyncCandidates(limit);
    for (const order of orders) {
      checked++;
      try {
        let map = await db.getGhsvCodeMap(order.tracking_code);
        const storedCode = String(order.tracking_code || '').trim();
        if (!storedCode) continue;
        const ghsvContext = await resolveGhsvLookupContext(order);

        let ghsvStatus = '';
        if (looksLikeBeeClientCode(storedCode)) {
          // Đơn mới V50+: client_code BEE... được dán vào GHSV.
          const raw = await ghsvLookupInfo(storedCode, 'client_code', ghsvContext.token);
          const info = normalizeGhsvInfo(raw);
          ghsvStatus = info.status || '';
          const returnedRequired = String(info.required_code || '').trim();
          const returnedClient = String(raw?.order?.client_code || raw?.data?.client_code || storedCode).trim();
          if (returnedRequired && returnedClient && returnedClient.toUpperCase() !== returnedRequired.toUpperCase()) {
            map = await db.upsertGhsvCodeMap({ clientCode: returnedClient, requiredCode: returnedRequired, createdBy: null });
            autoLinked++;
          }
        } else {
          // Đơn cũ: tracking_code có thể là B57/MVD hoặc mã cũ đã liên kết. Không ép nó thành client_code.
          const legacyCode = String(map?.required_code || storedCode).trim();
          const trackingRaw = await ghsvLookupTracking(legacyCode, 'required_code', ghsvContext.token);
          const tracking = normalizeGhsvTracking(trackingRaw);
          ghsvStatus = latestTrackingStatus(tracking);
        }

        await db.updateGhsvSnapshot(order.id, ghsvStatus || '');
        const localStatus = mapGhsvStatusToLocal(ghsvStatus);
        if (!localStatus || localStatus === order.status) continue;
        if (order.ctv_paid || order.ctv_debt_paid) {
          console.log(`[GHSV-SYNC] #${order.id} GHSV=${ghsvStatus} -> ${localStatus}, bỏ qua đổi trạng thái vì đơn đã được đối soát tiền.`);
          continue;
        }
        if (order.status === 'Hủy') continue;
        await db.updateOrderStatus(order.id, localStatus);
        changed++;
        console.log(`[GHSV-SYNC] #${order.id}: ${order.status} -> ${localStatus} (${ghsvStatus})`);
      } catch (e) {
        failed++;
        console.warn(`[GHSV-SYNC] #${order.id} lỗi: ${e.message}`);
      }
    }
    console.log(`[GHSV-SYNC] ${reason}: checked=${checked}, changed=${changed}, linked=${autoLinked}, failed=${failed}`);
    return { checked, changed, autoLinked, failed };
  } finally {
    ghsvSyncRunning = false;
  }
};

const kickGhsvSync = (reason='page') => {
  if (ghsvSyncRunning) return;
  // V73: page view chỉ kick một batch nhỏ và tối đa 1 lần/2 phút.
  if (Date.now() - lastGhsvSyncStartedAt < 120_000) return;
  setImmediate(() => syncGhsvOrders({ limit: 10, reason }).catch(e => console.error('[GHSV-SYNC]', e.message)));
};

app.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));
app.get('/login', (req, res) => res.render('login', { title: 'Đăng nhập' }));
app.get('/register', (req, res) => res.render('register', { title: 'Đăng ký CTV' }));

// V32: đăng ký không cần OTP; tài khoản mới chỉ được sử dụng sau khi chủ shop duyệt.
app.post('/register', registerLimiter, safe(async (req, res) => {
  const fullName = text(req.body.full_name, 150);
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirm_password || '');
  if (fullName.length < 2 || !phone || !passwordStrongEnough(password) || password !== confirmPassword) {
    req.session.message = { type: 'error', text: 'Kiểm tra họ tên, SĐT Việt Nam và mật khẩu (ít nhất 8 ký tự, có chữ và số).' };
    return res.redirect('/register');
  }
  if (await db.phoneOrUsernameExists(phone)) {
    req.session.message = { type: 'error', text: 'Số điện thoại này đã đăng ký. Vui lòng liên hệ chủ shop nếu cần hỗ trợ.' };
    return res.redirect('/register');
  }
  try {
    const u = await db.createPendingCtv({ phone, fullName, passwordHash: await bcrypt.hash(password, 11) });
    await audit(req, 'ctv_registration_pending', 'user', u.id, { phone_suffix: phone.slice(-4) });
    req.session.message = { type: 'success', text: 'Đã gửi yêu cầu! Chủ shop sẽ xem xét và duyệt tài khoản trước khi bạn đăng nhập.' };
    return res.redirect('/login');
  } catch (err) {
    if (err.code === '23505') {
      req.session.message = { type: 'error', text: 'Số điện thoại này đã đăng ký.' };
      return res.redirect('/register');
    }
    throw err;
  }
}));

app.post('/login', loginLimiter, safe(async (req, res) => {
  const username = text(req.body.username, 100);
  const password = String(req.body.password || '').slice(0, 200);
  const u = await db.findUserByUsername(username);
  const now = Date.now();
  if (u?.locked_until && new Date(u.locked_until).getTime() > now) {
    await audit(req, 'login_blocked', 'user', u.id, { reason: 'temporary_lock' });
    req.session.message = { type: 'error', text: 'Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau khoảng 15 phút.' };
    return res.redirect('/login');
  }
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    if (u) await db.recordLoginFailure(u.id);
    await audit(req, 'login_failed', 'user', u?.id || '', { identifier_suffix: username.slice(-4) });
    req.session.message = { type: 'error', text: 'Tài khoản hoặc mật khẩu không đúng.' };
    return res.redirect('/login');
  }
  if (u.approval_status !== 'approved' && u.role !== 'admin') {
    await audit(req, 'login_approval_blocked', 'user', u.id, { approval_status: u.approval_status });
    req.session.message = { type: 'error', text: u.approval_status === 'rejected' ? 'Yêu cầu đăng ký đã bị từ chối. Liên hệ chủ shop để được hỗ trợ.' : 'Tài khoản đang chờ chủ shop duyệt. Vui lòng quay lại sau.' };
    return res.redirect('/login');
  }
  await db.resetLoginFailures(u.id);
  await regenSession(req);
  req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  req.session.user = { id: u.id, username: u.username, phone: u.phone || '', full_name: u.full_name, role: u.role };
  await audit(req, 'login_success', 'user', u.id);
  res.redirect('/dashboard');
}));
app.post('/logout', safe(async (req, res) => { await audit(req, 'logout', 'user', req.session.user?.id || ''); req.session.destroy(() => res.redirect('/login')); }));

app.get('/dashboard', login, safe(async (req, res) => {
  kickGhsvSync('dashboard');
  if (req.session.user.role === 'admin') {
    return res.render('dashboard-admin', { title: 'Tổng quan', stats: await db.adminStats(), latest: await db.latestOrders(6) });
  }
  res.render('dashboard-ctv', { title: 'Trang CTV', stats: await db.ctvStats(req.session.user.id), latest: (await db.listOrdersByCtv(req.session.user.id)).slice(0, 6) });
}));

// V57: quản lý kho và thứ tự ưu tiên theo từng sản phẩm/size.
// V66: Bee Kho - web app riêng cho từng kho, nhận push và trả lời CÒN/HẾT.
app.get('/manifest.webmanifest', (req,res)=>{
  res.type('application/manifest+json').send({
    name:'Bee Kho', short_name:'Bee Kho', start_url:'/', display:'standalone', background_color:'#ffffff', theme_color:'#111827',
    icons:[{src:'/bee-kho-192.png',sizes:'192x192',type:'image/png'},{src:'/bee-kho-512.png',sizes:'512x512',type:'image/png'}]
  });
});
app.get('/kho/:token/manifest.webmanifest', safe(async (req,res)=>{
  const warehouse = await db.findWarehouseByAccessToken(req.params.token);
  if (!warehouse) return res.status(404).end();
  res.type('application/manifest+json').send({
    name:`Bee Kho - ${warehouse.name}`, short_name:'Bee Kho', start_url:`/kho/${warehouse.access_token}`, scope:`/kho/${warehouse.access_token}`, display:'standalone', background_color:'#ffffff', theme_color:'#111827',
    icons:[{src:'/bee-kho-192.png',sizes:'192x192',type:'image/png'},{src:'/bee-kho-512.png',sizes:'512x512',type:'image/png'}]
  });
}));
app.get('/sw.js', (req,res)=>{
  res.type('application/javascript');
  res.setHeader('Cache-Control','no-cache');
  res.send(`
self.addEventListener('push',event=>{
  let data={}; try{ data=event.data?event.data.json():{} }catch{}
  const show=self.registration.showNotification(data.title||'Bee Kho',{body:data.body||'Có đơn cần kiểm tra kho',tag:data.tag||'bee-kho',renotify:true,data:{url:data.url||'/'},icon:'/bee-kho-192.png',badge:'/bee-kho-192.png'});
  const wake=clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>Promise.all(list.map(c=>c.postMessage({type:'BEE_KHO_NEW_ORDER',orderId:data.orderId||null,url:data.url||'/'}))));
  event.waitUntil(Promise.all([show,wake]));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=event.notification.data?.url||'/';
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c){c.navigate(url);return c.focus();}} return clients.openWindow(url);}));
});
`);
});

app.get('/kho/:token', safe(async (req,res)=>{
  const warehouse = await db.findWarehouseByAccessToken(req.params.token);
  if (!warehouse) return res.status(404).send('Link kho không hợp lệ hoặc đã bị đổi.');
  let pending = await db.listWarehousePendingOrders(warehouse.id);
  const requestedOrderId = Number(req.query.order || 0);
  // V69: nếu mở từ push, ưu tiên đơn vừa được báo lên đầu danh sách.
  if (requestedOrderId) pending = pending.sort((a,b)=>Number(b.id===requestedOrderId)-Number(a.id===requestedOrderId));
  const khoMessage = String(req.query.msg || '').slice(0,500);
  const khoMessageType = String(req.query.type || '') === 'error' ? 'error' : 'success';
  res.render('warehouse-check',{title:`Bee Kho • ${warehouse.name}`,warehouse,pending,vapidPublicKey:WEB_PUSH_PUBLIC_KEY,khoMessage,khoMessageType,requestedOrderId});
}));

app.get('/kho/:token/pending', safe(async (req,res)=>{
  const warehouse = await db.findWarehouseByAccessToken(req.params.token);
  if (!warehouse) return res.status(404).json({ok:false});
  const pending = await db.listWarehousePendingOrders(warehouse.id);
  res.json({ok:true,pending});
}));

app.post('/kho/:token/push-subscribe', writeLimiter, safe(async (req,res)=>{
  const warehouse = await db.findWarehouseByAccessToken(req.params.token);
  if (!warehouse) return res.status(404).json({ok:false,message:'Kho không hợp lệ.'});
  await db.upsertWarehousePushSubscription(warehouse.id, req.body.subscription, req.get('user-agent')||'');
  res.json({ok:true});
}));

app.post('/kho/:token/orders/:id/reply', writeLimiter, safe(async (req,res)=>{
  const wantsJson = req.is('application/json') || String(req.get('accept')||'').includes('application/json');
  const finish = (status, payload, message, type='success') => {
    if (wantsJson) return res.status(status).json(payload);
    const q = new URLSearchParams({ msg: String(message||''), type }).toString();
    return res.redirect(`/kho/${encodeURIComponent(req.params.token)}?${q}`);
  };

  const warehouse = await db.findWarehouseByAccessToken(req.params.token);
  if (!warehouse) return finish(404,{ok:false,message:'Kho không hợp lệ.'},'Kho không hợp lệ hoặc link đã bị đổi.','error');
  const selected = await db.getSelectedWarehouse(req.params.id);
  if (!selected || Number(selected.warehouse_id)!==Number(warehouse.id) || selected.warehouse_status!=='Đang hỏi kho') {
    return finish(409,{ok:false,message:'Đơn này không còn chờ kho của bạn xác nhận.'},'Đơn này đã được xử lý hoặc không còn chờ kho này xác nhận.','error');
  }
  const answer = String(req.body.answer||'').toLowerCase();
  const positive = ['co','có','con','còn','yes'].includes(answer);
  const negative = ['khong','không','het','hết','no'].includes(answer);
  if (!positive && !negative) return finish(400,{ok:false,message:'Phản hồi không hợp lệ.'},'Phản hồi không hợp lệ. Hãy bấm CÒN HÀNG hoặc HẾT HẲN.','error');

  const result = await db.handleWarehouseReply(req.params.id, positive);
  if (!result?.ok) return finish(404,{ok:false,message:'Không tìm thấy đơn.'},'Không tìm thấy đơn cần xử lý.','error');

  let ghsv = null;
  if (positive) {
    try {
      const created = await createGhsvOrderForBee(req.params.id, null);
      const code = created.response?.required_code||created.response?.order_code||created.order?.ghsv_required_code||'';
      ghsv = {ok:true,alreadyCreated:!!created.alreadyCreated,code};
      const message = created.alreadyCreated
        ? `✅ Đã xác nhận CÒN. Đơn GHSV đã được tạo trước đó${code?` (${code})`:''}.`
        : `✅ Đã xác nhận CÒN. Bee đã tự tạo đơn GHSV${code?` (${code})`:''}.`;
      return finish(200,{ok:true,positive:true,exhausted:false,moved:false,next:'',ghsv},message,'success');
    } catch(e) {
      console.error(`[${req.id}] Bee Kho auto GHSV`,e.message);
      ghsv = {ok:false,error:e.message};
      return finish(200,{ok:true,positive:true,exhausted:false,moved:false,next:'',ghsv},`✅ Kho đã xác nhận CÒN nhưng GHSV chưa tạo được: ${e.message}`,'error');
    }
  }

  if (result.moved) {
    await notifyCurrentWarehouse(req, req.params.id);
    return finish(200,{ok:true,positive:false,exhausted:false,moved:true,next:result.next?.name||'',ghsv:null},`❌ Đã xác nhận HẾT HẲN. Bee đã khóa kho này cho mẫu/phân loại hiện tại và chuyển sang ${result.next?.name||'kho ưu tiên tiếp theo'} để check.`,'success');
  }
  return finish(200,{ok:true,positive:false,exhausted:!!result.exhausted,moved:false,next:'',ghsv:null},'❌ Đã xác nhận HẾT HẲN. Tất cả kho ưu tiên của phân loại này đều đã hết; Bee đã báo CTV.','success');
}));

app.get('/warehouses', admin, safe(async (req,res)=>{
  res.render('warehouses',{ title:'Kho hàng', warehouses:await db.listWarehouses(), ghsvConfigured:ghsvConfigured(), baseUrl:`${req.get('x-forwarded-proto')||req.protocol}://${req.get('host')}` });
}));

// V63: lấy shop_id + tên/địa chỉ cửa hàng trực tiếp từ API chính thức của GHSV.
app.post('/warehouses/sync-ghsv', admin, writeLimiter, safe(async (req,res)=>{
  try {
    const shops = await fetchGhsvShops(text(req.body.province_code,30));
    const result = await db.syncGhsvShops(shops);
    req.session.message={type:'success',text:`Đã đồng bộ ${result.total} cửa hàng GHSV: ${result.created} mới, ${result.updated} cập nhật.`};
    await audit(req,'ghsv_shop_sync','warehouse','',{total:result.total,created:result.created,updated:result.updated});
  } catch (err) {
    req.session.message={type:'error',text:`Không đồng bộ được cửa hàng GHSV: ${err.message}`};
  }
  res.redirect('/warehouses');
}));

// V61: proxy danh mục địa chỉ GHSV để form CTV dùng đúng tên/code chính thức.
app.get('/api/ghsv-address/provinces', login, safe(async (req,res)=>{
  res.json({ success:true, provinces:await fetchGhsvProvinces() });
}));
app.get('/api/ghsv-address/districts', login, safe(async (req,res)=>{
  const provinceCode=text(req.query.province_code,30);
  if(!provinceCode) return res.status(400).json({success:false,msg:'Thiếu province_code'});
  res.json({ success:true, districts:await fetchGhsvDistricts(provinceCode) });
}));
app.get('/api/ghsv-address/wards', login, safe(async (req,res)=>{
  const districtCode=text(req.query.district_code,30);
  if(!districtCode) return res.status(400).json({success:false,msg:'Thiếu district_code'});
  res.json({ success:true, wards:await fetchGhsvWards(districtCode) });
}));
app.post('/warehouses', admin, writeLimiter, safe(async (req,res)=>{
  const name=text(req.body.name,120);
  if(!name){ req.session.message={type:'error',text:'Vui lòng nhập tên kho.'}; return res.redirect('/warehouses'); }
  await db.createWarehouse({name,zalo_phone:text(req.body.zalo_phone,30).replace(/[^0-9+]/g,''),ghsv_warehouse_id:text(req.body.ghsv_warehouse_id,80)});
  req.session.message={type:'success',text:'Đã thêm kho.'}; res.redirect('/warehouses');
}));
app.post('/warehouses/:id', admin, writeLimiter, safe(async (req,res)=>{
  const name=text(req.body.name,120);
  await db.updateWarehouse(req.params.id,{name,zalo_phone:text(req.body.zalo_phone,30).replace(/[^0-9+]/g,''),ghsv_warehouse_id:text(req.body.ghsv_warehouse_id,80),is_active:req.body.is_active==='on'});
  req.session.message={type:'success',text:'Đã cập nhật kho.'}; res.redirect('/warehouses');
}));
app.post('/warehouses/:id/rotate-link', admin, writeLimiter, safe(async (req,res)=>{
  const w = await db.rotateWarehouseAccessToken(req.params.id);
  req.session.message = w ? {type:'success',text:`Đã đổi link Bee Kho cho ${w.name}. Link cũ không còn dùng được.`} : {type:'error',text:'Không tìm thấy kho.'};
  res.redirect('/warehouses');
}));

app.post('/warehouses/:id/delete', admin, writeLimiter, safe(async (req,res)=>{
  await db.deleteWarehouse(req.params.id); req.session.message={type:'success',text:'Đã xóa kho.'}; res.redirect('/warehouses');
}));
app.get('/products/:id/warehouses', admin, safe(async (req,res)=>{
  const product=await db.findProductById(req.params.id); if(!product) return res.status(404).send('Không tìm thấy sản phẩm.');
  res.render('product-warehouses',{ title:'Gán kho ưu tiên', product, warehouses:await db.listWarehouses(), rules:await db.listProductWarehouseRules(req.params.id) });
}));
app.post('/products/:id/warehouses', admin, writeLimiter, safe(async (req,res)=>{
  const product=await db.findProductById(req.params.id); if(!product) return res.status(404).send('Không tìm thấy sản phẩm.');
  const rawIds=Array.isArray(req.body.warehouse_id)?req.body.warehouse_id:[req.body.warehouse_id].filter(Boolean);
  const rawVariants=Array.isArray(req.body.rule_variant)?req.body.rule_variant:[req.body.rule_variant].filter(Boolean);
  const rawPriorities=Array.isArray(req.body.priority)?req.body.priority:[req.body.priority].filter(Boolean);
  const rawExhausted=Array.isArray(req.body.rule_exhausted)?req.body.rule_exhausted:[req.body.rule_exhausted].filter(v=>v!==undefined);
  const rules=[];
  for(let i=0;i<rawIds.length;i++){
    const wid=Number(rawIds[i]); if(!wid) continue;
    const variant=text(rawVariants[i]||'',80); if(!variant || variant==='*') continue;
    rules.push({warehouse_id:wid,variant,priority:positiveInt(rawPriorities[i],i+1,999),is_exhausted:String(rawExhausted[i]||'0')==='1'});
  }
  await db.replaceProductWarehouseRules(req.params.id,rules);
  req.session.message={type:'success',text:'Đã lưu thứ tự kho RIÊNG cho từng phân loại. Bee chỉ chuyển kho khi kho trước HẾT HẲN mẫu/phân loại đó.'}; res.redirect(`/products/${req.params.id}/edit#warehouse-priority`);
}));

app.get('/products', login, safe(async (req, res) => {
  const q = text(req.query.q, 100);
  res.render('products', { title: 'Sản phẩm', products: await db.listProducts(q), q });
}));
app.get('/products/new', admin, (req, res) => res.render('product-form', { title: 'Thêm sản phẩm', product: null, gallery: [], warehouses: [], warehouseRules: [] }));
app.get('/products/:id/image', safe(async (req, res) => {
  const img = await db.getProductImage(req.params.id);
  if (!img?.image_data) return res.status(404).end();
  res.set('Content-Type', img.image_mime || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(img.image_data);
}));
app.get('/products/images/:imageId', safe(async (req, res) => {
  const img = await db.getGalleryImage(req.params.imageId);
  if (!img?.image_data) return res.status(404).end();
  res.set('Content-Type', img.image_mime || 'image/jpeg');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(img.image_data);
}));

function imageExtension(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('gif')) return 'gif';
  return 'jpg';
}

// CTV/Admin đã đăng nhập đều có thể tải ảnh sản phẩm về thiết bị.
app.get('/products/:id/image/download', login, safe(async (req, res) => {
  const img = await db.getProductImage(req.params.id);
  if (!img?.image_data) return res.status(404).send('Không tìm thấy ảnh.');
  const ext = imageExtension(img.image_mime);
  res.set('Content-Type', img.image_mime || 'image/jpeg');
  res.set('Content-Disposition', `attachment; filename=bee-sneaker-${req.params.id}.${ext}`);
  res.set('Cache-Control', 'private, max-age=0');
  res.send(img.image_data);
}));

app.get('/products/images/:imageId/download', login, safe(async (req, res) => {
  const img = await db.getGalleryImage(req.params.imageId);
  if (!img?.image_data) return res.status(404).send('Không tìm thấy ảnh.');
  const ext = imageExtension(img.image_mime);
  res.set('Content-Type', img.image_mime || 'image/jpeg');
  res.set('Content-Disposition', `attachment; filename=bee-sneaker-detail-${req.params.imageId}.${ext}`);
  res.set('Cache-Control', 'private, max-age=0');
  res.send(img.image_data);
}));
app.get('/products/:id', login, safe(async (req, res) => {
  const product = await db.findProductById(req.params.id);
  if (!product) return res.status(404).send('Không tìm thấy sản phẩm.');
  const gallery = await db.listProductImages(req.params.id);
  const warehouseRules = req.session.user.role === 'admin' ? await db.listProductWarehouseRules(req.params.id) : [];
  const warehouses = req.session.user.role === 'admin' ? await db.listWarehouses() : [];
  res.render('product-detail', { title: product.name, product, gallery, warehouseRules, warehouses });
}));
app.post('/products', admin, writeLimiter, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'detail_images', maxCount: 8 }]), safe(async (req, res) => {
  const variants = variantPricesFromBody(req.body);
  if (!Object.values(variants).some(v => v > 0)) {
    req.session.message = { type: 'error', text: 'Hãy nhập giá cho ít nhất một phân loại: Loại A, Siêu Cấp hoặc Best.' };
    return res.redirect('/products/new');
  }
  const created = await db.createProduct({
    name: text(req.body.name, 255),
    sku: text(req.body.sku, 100) || null,
    price: legacyPriceFromVariants(variants),
    variant_prices: variants,
    size: text(req.body.size, 150),
    size_stock: sizeStockFromBody(req.body, text(req.body.size,150)),
    quantity: Object.values(sizeStockFromBody(req.body, text(req.body.size,150))).reduce((n,v)=>n+Number(v||0),0),
    image_data: req.files?.image?.[0]?.buffer || null,
    image_mime: req.files?.image?.[0]?.mimetype || null,
    note: text(req.body.note, 2000),
    product_group: text(req.body.product_group, 120)
  });
  const galleryFiles = req.files?.detail_images || [];
  if (galleryFiles.length) {
    await db.addProductImages(created.id, galleryFiles.map(f => ({ image_data: f.buffer, image_mime: f.mimetype })));
  }
  await audit(req, 'product_create', 'product', created.id, { name: created.name, sku: created.sku || '' });
  res.redirect(`/products/${created.id}`);
}));

app.get('/products/:id/edit', admin, safe(async (req, res) => {
  const product = await db.findProductById(req.params.id);
  if (!product) return res.status(404).send('Không tìm thấy sản phẩm.');
  const [gallery, warehouses, warehouseRules] = await Promise.all([
    db.listProductImages(req.params.id),
    db.listWarehouses(),
    db.listProductWarehouseRules(req.params.id)
  ]);
  res.render('product-form', { title: 'Sửa sản phẩm', product, gallery, warehouses, warehouseRules });
}));

app.post('/products/:id', admin, writeLimiter, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'detail_images', maxCount: 8 }]), safe(async (req, res) => {
  const variants = variantPricesFromBody(req.body);
  if (!Object.values(variants).some(v => v > 0)) {
    req.session.message = { type: 'error', text: 'Hãy nhập giá cho ít nhất một phân loại: Loại A, Siêu Cấp hoặc Best.' };
    return res.redirect(`/products/${req.params.id}/edit`);
  }
  await db.updateProduct(req.params.id, {
    name: text(req.body.name, 255),
    sku: text(req.body.sku, 100) || null,
    price: legacyPriceFromVariants(variants),
    variant_prices: variants,
    size: text(req.body.size, 150),
    size_stock: sizeStockFromBody(req.body, text(req.body.size,150)),
    quantity: Object.values(sizeStockFromBody(req.body, text(req.body.size,150))).reduce((n,v)=>n+Number(v||0),0),
    image_data: req.files?.image?.[0]?.buffer || null,
    image_mime: req.files?.image?.[0]?.mimetype || null,
    note: text(req.body.note, 2000),
    product_group: text(req.body.product_group, 120)
  });
  const galleryFiles = req.files?.detail_images || [];
  if (galleryFiles.length) {
    await db.addProductImages(req.params.id, galleryFiles.map(f => ({ image_data: f.buffer, image_mime: f.mimetype })));
  }
  await audit(req, 'product_update', 'product', req.params.id, { name: text(req.body.name,255), sku: text(req.body.sku,100) });
  res.redirect(`/products/${req.params.id}`);
}));

app.post('/products/:id/gallery/:imageId/delete', admin, writeLimiter, safe(async (req, res) => {
  await db.deleteProductImage(req.params.id, req.params.imageId);
  await audit(req, 'product_image_delete', 'product', req.params.id, { image_id: req.params.imageId });
  res.redirect(`/products/${req.params.id}/edit`);
}));

app.post('/products/:id/delete', admin, writeLimiter, safe(async (req, res) => {
  const deleted = await db.deleteProduct(req.params.id);
  await audit(req, 'product_delete', 'product', req.params.id, { name: deleted?.name || '' });
  res.redirect('/products');
}));

app.get('/orders/new', login, (req,res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const productId = String(req.query.product_id||'').trim();
  return productId ? res.redirect(`/cart/add?product_id=${encodeURIComponent(productId)}`) : res.redirect('/cart');
});

app.get('/cart/add', login, ctvOnly, safe(async (req,res)=>{
  const product = await db.findProductById(req.query.product_id);
  if (!product) return res.redirect('/products');
  res.render('cart-item-form',{ title:'Thêm vào giỏ hàng', product, sizeOptions: availableSizes(product) });
}));
app.post('/cart/add', login, ctvOnly, writeLimiter, safe(async (req,res)=>{
  const p = await db.findProductById(req.body.product_id);
  if (!p) { req.session.message={type:'error',text:'Sản phẩm không tồn tại.'}; return res.redirect('/products'); }
  const variant=text(req.body.product_variant,80); const unitPrice=money((p.variant_prices||{})[variant]);
  const size=text(req.body.size,50); const quantity=Math.max(1,positiveInt(req.body.quantity,1,20));
  const available=availableForSize(p,size);
  if (!variant || unitPrice<=0 || !size) { req.session.message={type:'error',text:'Vui lòng chọn phân loại và size hợp lệ.'}; return res.redirect(`/cart/add?product_id=${p.id}`); }
  if (available<=0) { req.session.message={type:'error',text:`Size ${size} đã hết hàng.`}; return res.redirect(`/cart/add?product_id=${p.id}`); }
  const cart=cartOf(req); const idx=cart.findIndex(x=>String(x.product_id)===String(p.id)&&x.product_variant===variant&&x.size===size);
  const current=idx>=0?Number(cart[idx].quantity||0):0;
  if(current+quantity>available){ req.session.message={type:'error',text:`Size ${size} chỉ còn ${available} đôi.`}; return res.redirect(`/cart/add?product_id=${p.id}`); }
  if(idx>=0){ cart[idx].quantity=current+quantity; cart[idx].selected=true; }
  else cart.push({ product_id:p.id, product_name:p.name, sku:p.sku||'', image:p.image||'', product_variant:variant, unit_price:unitPrice, size, quantity, selected:true });
  req.session.message={type:'success',text:'Đã thêm sản phẩm vào giỏ hàng.'};
  res.redirect('/cart');
}));
app.get('/cart', login, ctvOnly, (req,res)=>{
  const cart=cartOf(req); res.render('cart',{title:'Giỏ hàng',cart,totals:cartTotals(cart)});
});
app.post('/cart/:index/select', login, ctvOnly, writeLimiter, (req,res)=>{
  const cart=cartOf(req), i=Number.parseInt(req.params.index,10);
  if(Number.isInteger(i)&&cart[i]) cart[i].selected = req.body.selected === '1';
  res.redirect('/cart');
});
app.post('/cart/:index/quantity', login, ctvOnly, writeLimiter, safe(async (req,res)=>{
  const cart=cartOf(req), i=Number.parseInt(req.params.index,10);
  if(!Number.isInteger(i)||!cart[i]) return res.redirect('/cart');
  const item=cart[i], p=await db.findProductById(item.product_id);
  if(!p){ cart.splice(i,1); return res.redirect('/cart'); }
  const available=availableForSize(p,item.size);
  const delta=req.body.action==='minus'?-1:1;
  const next=Math.max(1,Number(item.quantity||1)+delta);
  if(next>available){ req.session.message={type:'error',text:`Size ${item.size} chỉ còn ${available} đôi.`}; return res.redirect('/cart'); }
  item.quantity=next;
  res.redirect('/cart');
}));
app.post('/cart/:index/update', login, ctvOnly, writeLimiter, safe(async (req,res)=>{
  const cart=cartOf(req), i=Number.parseInt(req.params.index,10);
  if(Number.isInteger(i)&&cart[i]){
    const p=await db.findProductById(cart[i].product_id); const available=p?availableForSize(p,cart[i].size):0;
    cart[i].quantity=Math.max(1,Math.min(available||1,positiveInt(req.body.quantity,1,100)));
  }
  res.redirect('/cart');
}));
app.post('/cart/:index/delete', login, ctvOnly, writeLimiter, (req,res)=>{
  const cart=cartOf(req), i=Number.parseInt(req.params.index,10); if(Number.isInteger(i)&&cart[i]) cart.splice(i,1); res.redirect('/cart');
});
app.post('/cart/clear', login, ctvOnly, writeLimiter, (req,res)=>{ req.session.cart=[]; res.redirect('/cart'); });
app.get('/checkout', login, ctvOnly, safe(async (req,res)=>{
  const cart=cartOf(req); const chosen=cartSelected(cart); if(!chosen.length){ req.session.message={type:'error',text:'Hãy tích chọn ít nhất một sản phẩm để đặt đơn.'}; return res.redirect('/cart'); }
  // Refresh giá và tồn kho trước khi checkout.
  const fresh=[];
  for(const item of chosen){ const p=await db.findProductById(item.product_id); if(!p) continue; const price=money((p.variant_prices||{})[item.product_variant]); const available=availableForSize(p,item.size); if(price<=0||available<Number(item.quantity||1)) continue; fresh.push({...item,product_name:p.name,image:p.image||'',unit_price:price,selected:true}); }
  if(!fresh.length){ req.session.message={type:'error',text:'Các sản phẩm đã chọn hiện không còn đủ tồn kho.'}; return res.redirect('/cart'); }
  res.render('checkout',{title:'Đặt đơn',cart:fresh,totals:cartTotals(fresh),shippingFee:shippingFeeForQuantity(cartTotals(fresh).totalQuantity)});
}));
app.post('/checkout', login, ctvOnly, orderIpLimiter, orderUserLimiter, writeLimiter, safe(async (req,res)=>{
  const cart=cartOf(req); const chosen=cartSelected(cart); if(!chosen.length) return res.redirect('/cart');
  const customerName=text(req.body.customer_name,150), phone=text(req.body.phone,30), address=text(req.body.address,1000);
  const ghsvProvince=text(req.body.ghsv_to_province,150), ghsvDistrict=text(req.body.ghsv_to_district,150), ghsvWard=text(req.body.ghsv_to_ward,150);
  const ghsvProvinceCode=text(req.body.ghsv_province_code,30), ghsvDistrictCode=text(req.body.ghsv_district_code,30), ghsvWardCode=text(req.body.ghsv_ward_code,30);
  if(!customerName||!phone||!address||!ghsvProvince||!ghsvDistrict||!ghsvWard){ req.session.message={type:'error',text:'Vui lòng nhập đủ tên khách, SĐT, địa chỉ và chọn Tỉnh/Quận/Phường theo GHSV.'}; return res.redirect('/checkout'); }
  const fresh=[];
  for(const item of chosen){ const p=await db.findProductById(item.product_id); if(!p) continue; const unit=money((p.variant_prices||{})[item.product_variant]); const q=Math.max(1,Math.min(100,Number(item.quantity)||1)); const available=availableForSize(p,item.size); if(unit<=0||available<q) continue; fresh.push({product_id:p.id,product_name:p.name,product_variant:item.product_variant,variant_unit_price:unit,size:item.size,quantity:q,line_total:unit*q}); }
  if(!fresh.length){ req.session.message={type:'error',text:'Giỏ hàng không còn sản phẩm hợp lệ.'}; req.session.cart=[]; return res.redirect('/cart'); }
  const totalQuantity=fresh.reduce((n,x)=>n+x.quantity,0), productCost=fresh.reduce((n,x)=>n+x.line_total,0);
  const baseCod=money(req.body.base_cod), shippingType=req.body.shipping_type==='customer_pay'?'customer_pay':'freeship', shippingFee=shippingFeeForQuantity(totalQuantity);
  const cod=baseCod+(shippingType==='customer_pay'?shippingFee:0), taxAmount=Math.round(cod*0.015), ctvProfit=cod-productCost-taxAmount-(shippingType==='freeship'?shippingFee:0);
  try {
    const createdOrder = await db.createCartOrder({ctv_id:req.session.user.id,ctv_name:req.session.user.full_name,customer_name:customerName,phone,address,product_name:fresh.length===1?fresh[0].product_name:`${fresh.length} sản phẩm`,quantity:totalQuantity,base_cod:baseCod,shipping_type:shippingType,shipping_fee:shippingFee,product_cost:productCost,tax_amount:taxAmount,cod,ctv_profit:ctvProfit,note:text(req.body.note,2000),ghsv_to_province:ghsvProvince,ghsv_to_district:ghsvDistrict,ghsv_to_ward:ghsvWard,ghsv_province_code:ghsvProvinceCode,ghsv_district_code:ghsvDistrictCode,ghsv_ward_code:ghsvWardCode},fresh);
    // Đơn đã được COMMIT ở createCartOrder. Các tác vụ phụ phía sau không được làm
    // request báo lỗi/khuyến khích CTV tạo lại đơn (dễ sinh đơn trùng).
    try {
      await audit(req, 'order_create', 'order', createdOrder.id, { quantity: totalQuantity, cod, item_count: fresh.length });
    } catch (sideErr) {
      console.error(`[${req.id}] order_create audit warning`, sideErr);
    }
    try {
      const assigned = await db.assignInitialWarehouse(createdOrder.id);
      if (assigned?.candidate) await notifyCurrentWarehouse(req, createdOrder.id);
    } catch (sideErr) {
      console.error(`[${req.id}] initial warehouse assignment warning for order ${createdOrder.id}`, sideErr);
      // Không fail việc tạo đơn: Admin vẫn có thể gán kho lại sau.
    }
  } catch (e) {
    console.error('POST /checkout stock error:', e);
    req.session.message = { type:'error', text: e?.message || 'Không thể tạo đơn. Vui lòng kiểm tra lại tồn kho.' };
    return res.redirect('/cart');
  }
  req.session.cart=cart.filter(x=>x.selected===false); req.session.message={type:'success',text:'Đã đặt đơn từ các sản phẩm được chọn.'}; res.redirect('/my-orders');
}));

app.post('/orders', login, ctvOnly, orderIpLimiter, orderUserLimiter, writeLimiter, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const p = await db.findProductById(req.body.product_id);
  if (!p) {
    req.session.message = { type: 'error', text: 'Sản phẩm không tồn tại.' };
    return res.redirect('/orders/new');
  }
  const customerName = text(req.body.customer_name, 150);
  const phone = text(req.body.phone, 30);
  const address = text(req.body.address, 1000);
  const ghsvProvince = text(req.body.ghsv_to_province, 150);
  const ghsvDistrict = text(req.body.ghsv_to_district, 150);
  const ghsvWard = text(req.body.ghsv_to_ward, 150);
  const ghsvProvinceCode = text(req.body.ghsv_province_code, 30);
  const ghsvDistrictCode = text(req.body.ghsv_district_code, 30);
  const ghsvWardCode = text(req.body.ghsv_ward_code, 30);
  const size = text(req.body.size, 50);
  if (!customerName || !phone || !address || !size || !ghsvProvince || !ghsvDistrict || !ghsvWard) {
    req.session.message = { type: 'error', text: 'Vui lòng nhập đủ tên khách, SĐT, địa chỉ, Tỉnh/Quận/Phường GHSV và size.' };
    return res.redirect('/orders/new');
  }
  const variant = text(req.body.product_variant, 80);
  const variantPrices = p.variant_prices || {};
  const unitPrice = money(variantPrices[variant]);
  if (!variant || unitPrice <= 0) {
    req.session.message = { type: 'error', text: 'Vui lòng chọn phân loại hàng hợp lệ.' };
    return res.redirect('/orders/new');
  }
  const quantity = Math.max(1, positiveInt(req.body.quantity, 1, 100));
  const baseCod = money(req.body.base_cod);
  const shippingType = req.body.shipping_type === 'customer_pay' ? 'customer_pay' : 'freeship';
  const shippingFee = shippingFeeForQuantity(quantity);
  const cod = baseCod + (shippingType === 'customer_pay' ? shippingFee : 0);
  const productCost = unitPrice * quantity;
  const taxAmount = Math.round(cod * 0.015);
  const ctvProfit = cod - productCost - taxAmount - (shippingType === 'freeship' ? shippingFee : 0);
  const createdOrder = await db.createOrder({
    ctv_id: req.session.user.id,
    ctv_name: req.session.user.full_name,
    customer_name: customerName,
    phone,
    address,
    product_id: p.id,
    product_name: p.name,
    product_variant: variant,
    variant_unit_price: unitPrice,
    size,
    quantity,
    base_cod: baseCod,
    shipping_type: shippingType,
    shipping_fee: shippingFee,
    product_cost: productCost,
    tax_amount: taxAmount,
    cod,
    ctv_profit: ctvProfit,
    tracking_code: '',
    note: text(req.body.note, 2000),
    ghsv_to_province: ghsvProvince,
    ghsv_to_district: ghsvDistrict,
    ghsv_to_ward: ghsvWard,
    ghsv_province_code: ghsvProvinceCode,
    ghsv_district_code: ghsvDistrictCode,
    ghsv_ward_code: ghsvWardCode
  });
  // Đơn đã được tạo xong. Không để audit/gán kho lỗi làm trình duyệt nhận 500
  // rồi CTV bấm lại và tạo đơn trùng.
  try {
    await audit(req, 'order_create_legacy', 'order', createdOrder.id, { quantity, cod });
  } catch (sideErr) {
    console.error(`[${req.id}] order_create_legacy audit warning`, sideErr);
  }
  try {
    await db.assignInitialWarehouse(createdOrder.id);
  } catch (sideErr) {
    console.error(`[${req.id}] initial warehouse assignment warning for order ${createdOrder.id}`, sideErr);
  }
  req.session.message = { type: 'success', text: 'Đã tạo đơn thành công.' };
  res.redirect('/my-orders');
}));
app.get('/my-orders', login, safe(async (req, res) => {
  kickGhsvSync('my-orders');
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const orders = await db.listOrdersByCtv(req.session.user.id);
  // Giữ cờ chưa xem trong dữ liệu render để CTV thấy dấu 🔔 ở lần mở đầu tiên,
  // sau đó đánh dấu đã xem để badge menu biến mất ở lần tải tiếp theo.
  await db.markStockNoticesSeenByCtv(req.session.user.id);
  res.render('orders', { title: 'Đơn của tôi', orders, adminView: false });
}));

app.get('/my-orders/:id/edit-customer', login, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const order = await db.findOrderById(req.params.id);
  if (!order || Number(order.ctv_id) !== Number(req.session.user.id)) {
    req.session.message = { type: 'error', text: 'Bạn không có quyền sửa đơn này.' };
    return res.redirect('/my-orders');
  }
  res.render('order-customer-edit', { title: 'Sửa thông tin khách hàng', order });
}));

app.post('/my-orders/:id/edit-customer', login, writeLimiter, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const customerName = text(req.body.customer_name, 150);
  const phone = text(req.body.phone, 30);
  const address = text(req.body.address, 1000);
  const note = text(req.body.note, 2000);
  const ghsvProvince = text(req.body.ghsv_to_province, 150);
  const ghsvDistrict = text(req.body.ghsv_to_district, 150);
  const ghsvWard = text(req.body.ghsv_to_ward, 150);
  const ghsvProvinceCode = text(req.body.ghsv_province_code, 30);
  const ghsvDistrictCode = text(req.body.ghsv_district_code, 30);
  const ghsvWardCode = text(req.body.ghsv_ward_code, 30);
  if (!customerName || !phone || !address || !ghsvProvince || !ghsvDistrict || !ghsvWard) {
    req.session.message = { type: 'error', text: 'Vui lòng nhập đủ tên khách, SĐT, địa chỉ và Tỉnh/Quận/Phường GHSV.' };
    return res.redirect(`/my-orders/${req.params.id}/edit-customer`);
  }
  const updated = await db.updateOrderCustomerByCtv(req.params.id, req.session.user.id, {
    customer_name: customerName, phone, address, note,
    ghsv_to_province: ghsvProvince,
    ghsv_to_district: ghsvDistrict,
    ghsv_to_ward: ghsvWard,
    ghsv_province_code: ghsvProvinceCode,
    ghsv_district_code: ghsvDistrictCode,
    ghsv_ward_code: ghsvWardCode
  });
  if (!updated) {
    req.session.message = { type: 'error', text: 'Không tìm thấy đơn hoặc bạn không có quyền sửa.' };
    return res.redirect('/my-orders');
  }
  await audit(req, 'order_customer_update', 'order', req.params.id);
  req.session.message = { type: 'success', text: 'Đã cập nhật thông tin khách hàng.' };
  res.redirect('/my-orders');
}));
app.get('/my-orders/:id/cancel', login, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const order = await db.findOrderById(req.params.id);
  if (!order || Number(order.ctv_id) !== Number(req.session.user.id)) {
    req.session.message = { type: 'error', text: 'Bạn không có quyền hủy đơn này.' };
    return res.redirect('/my-orders');
  }
  if (!['Mới','Chờ xác nhận'].includes(order.status)) {
    req.session.message = { type: 'error', text: 'Đơn này không còn ở trạng thái có thể hủy.' };
    return res.redirect('/my-orders');
  }
  res.render('order-cancel', { title: 'Hủy đơn', order });
}));

app.post('/my-orders/:id/cancel', login, writeLimiter, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const reason = text(req.body.cancel_reason, 1000);
  if (!reason) {
    req.session.message = { type: 'error', text: 'Vui lòng nhập lý do hủy đơn.' };
    return res.redirect(`/my-orders/${req.params.id}/cancel`);
  }
  const cancelled = await db.cancelOrderByCtv(req.params.id, req.session.user.id, reason);
  if (!cancelled) {
    req.session.message = { type: 'error', text: 'Không thể hủy đơn này. Có thể đơn đã được xử lý.' };
    return res.redirect('/my-orders');
  }
  await audit(req, 'order_cancel_ctv', 'order', req.params.id, { reason: reason.slice(0,200) });
  req.session.message = { type: 'success', text: 'Đã hủy đơn. Chủ shop vẫn có thể xem đơn và lý do hủy.' };
  res.redirect('/my-orders');
}));

app.get('/orders', admin, safe(async (req, res) => { kickGhsvSync('orders'); await db.markOrdersSeenByAdmin(); res.locals.adminBadges.newOrders=0; res.render('orders', { title: 'Đơn hàng', orders: await db.listOrders(), adminView: true }); }));
app.post('/orders/:id/status', admin, writeLimiter, safe(async (req, res) => {
  const allowed = ['Mới', 'Đã xác nhận', 'Đang giao', 'Hoàn thành', 'Hoàn', 'Hủy'];
  const status = allowed.includes(req.body.status) ? req.body.status : 'Mới';
  const oldOrder = await db.findOrderById(req.params.id);
  const updated = await db.updateOrderStatus(req.params.id, status);
  if (!updated) {
    req.session.message = { type: 'error', text: 'Không tìm thấy đơn hàng để cập nhật.' };
    return res.redirect('/orders');
  }
  await audit(req, 'order_status_update', 'order', req.params.id, { from: oldOrder?.status || '', to: status });
  req.session.message = { type: 'success', text: `Đã cập nhật trạng thái đơn #${req.params.id}: ${status}.` };
  res.redirect('/orders');
}));
app.post('/orders/:id/stock-note', admin, writeLimiter, safe(async (req, res) => {
  const stockStatus = text(req.body.variant_stock_status, 30);
  const availableVariants = text(req.body.available_variants, 500);
  const replacementVariant = text(req.body.replacement_variant, 80);
  try {
    const updated = await db.updateOrderStockNotice(req.params.id, stockStatus, availableVariants, replacementVariant);
    if (!updated) {
      req.session.message = { type:'error', text:'Không tìm thấy đơn hàng.' };
      return res.redirect('/orders');
    }
    await audit(req, 'order_stock_notice_update', 'order', req.params.id, {
      variant_stock_status: stockStatus,
      available_variants: availableVariants,
      replacement_variant: replacementVariant,
      price_changed: !!updated.price_changed,
      old_variant: updated.old_variant || '',
      new_variant: updated.product_variant || '',
      old_product_cost: Number(updated.old_product_cost || 0),
      new_product_cost: Number(updated.product_cost || 0),
      new_ctv_profit: Number(updated.ctv_profit || 0)
    });
    let warehouseMsg = '';
    if (updated.price_changed && !updated.ghsv_required_code && !updated.ghsv_order_code) {
      try {
        const assigned = await db.assignInitialWarehouse(req.params.id);
        if (assigned?.candidate) {
          await notifyCurrentWarehouse(req, req.params.id);
          warehouseMsg = ` Đã tự chuyển sang chuỗi kho của phân loại ${updated.product_variant}: ${assigned.candidate.name}.`;
        } else {
          warehouseMsg = ` Phân loại ${updated.product_variant} chưa có kho ưu tiên phù hợp.`;
        }
      } catch (warehouseErr) {
        console.error(`[${req.id}] variant warehouse reassign warning`, warehouseErr);
        warehouseMsg = ' Chưa thể tự gán lại kho; Admin có thể bấm tự chọn kho sau.';
      }
    }
    const priceMsg = updated.price_changed
      ? ` Đã đổi sang ${updated.product_variant}, giá gốc mới ${Number(updated.product_cost||0).toLocaleString('vi-VN')}đ và tính lại lãi CTV.`
      : '';
    req.session.message = { type:'success', text:`Đã cập nhật tình trạng phân loại cho đơn #${req.params.id}.${priceMsg}${warehouseMsg} CTV sẽ thấy thông báo.` };
    res.redirect('/orders');
  } catch (e) {
    req.session.message = { type:'error', text:e?.message || 'Không thể cập nhật phân loại/giá gốc.' };
    res.redirect('/orders');
  }
}));

app.post('/orders/:id/admin-update', admin, writeLimiter, safe(async (req, res) => {
  await db.updateOrderAdmin(req.params.id, { tracking_code: text(req.body.tracking_code, 120) });
  await audit(req, 'order_tracking_update', 'order', req.params.id);
  req.session.message = { type: 'success', text: 'Đã cập nhật client_code GHSV của đơn.' };
  res.redirect('/orders');
}));
app.post('/orders/:id/warehouse-auto-assign', admin, writeLimiter, safe(async (req,res)=>{
  const result=await db.assignInitialWarehouse(req.params.id);
  if(result.candidate) {
    await notifyCurrentWarehouse(req, req.params.id);
    req.session.message={type:'success',text:`Đã tự chọn kho ưu tiên cho đơn #${req.params.id}: ${result.candidate.name} và gửi thông báo Bee Kho.`};
  }
  else req.session.message={type:'error',text:result.reason==='multi'?'Đơn có nhiều sản phẩm: bản test V57 chưa tự tách nhiều kho, hãy xử lý thủ công.':'Chưa gán kho ưu tiên phù hợp cho sản phẩm/size này.'};
  res.redirect('/orders');
}));

app.post('/orders/:id/warehouse-contact', admin, writeLimiter, safe(async (req, res) => {
  const warehouseName = text(req.body.warehouse_name, 120);
  const warehousePhone = text(req.body.warehouse_zalo_phone, 30).replace(/[^0-9+]/g, '');
  const updated = await db.updateOrderWarehouseContact(req.params.id, {
    warehouse_name: warehouseName,
    warehouse_zalo_phone: warehousePhone
  });
  if (!updated) {
    req.session.message = { type:'error', text:'Không tìm thấy đơn hàng.' };
    return res.redirect('/orders');
  }
  await audit(req, 'order_warehouse_contact_update', 'order', req.params.id, { warehouse_name: warehouseName, phone_tail: warehousePhone.slice(-4) });
  req.session.message = { type:'success', text:`Đã lưu đầu mối kho cho đơn #${req.params.id}.` };
  res.redirect('/orders');
}));

app.post('/orders/:id/warehouse-reply', admin, writeLimiter, safe(async (req, res) => {
  const answer = text(req.body.answer, 20).toLowerCase();
  const positive = ['co','có','con','còn','yes'].includes(answer);
  const negative = ['khong','không','het','hết','no'].includes(answer);
  if (!positive && !negative) {
    req.session.message = { type:'error', text:'Phản hồi kho không hợp lệ.' };
    return res.redirect('/orders');
  }
  const result = await db.handleWarehouseReply(req.params.id, positive);
  if (!result?.ok) {
    req.session.message={type:'error',text:'Không tìm thấy đơn hàng.'};
    return res.redirect('/orders');
  }
  await audit(req,'order_warehouse_reply_manual','order',req.params.id,{answer,warehouse_status:result.order?.warehouse_status||''});
  if (positive) {
    try {
      const created = await createGhsvOrderForBee(req.params.id, req.session.user.id);
      if (created.alreadyCreated) {
        req.session.message={type:'success',text:`Kho ${result.order.warehouse_name||''} báo CÓ/CÒN. Đơn GHSV đã được tạo trước đó.`};
      } else {
        const code = created.response?.required_code || created.response?.order_code || created.order?.ghsv_required_code || '';
        req.session.message={type:'success',text:`Kho ${result.order.warehouse_name||''} báo CÓ/CÒN. Bee đã tự tạo đơn GHSV${code?` (${code})`:''} và báo CTV.`};
        await audit(req,'ghsv_order_auto_create','order',req.params.id,{required_code_suffix:String(code).slice(-8),warehouse:result.order.warehouse_name||''});
      }
    } catch(e) {
      console.error(`[${req.id}] auto create GHSV`, e.message);
      req.session.message={type:'error',text:`Kho đã xác nhận CÓ/CÒN nhưng chưa tạo được GHSV: ${e.message}`};
    }
  } else if (result.moved) {
    await notifyCurrentWarehouse(req, req.params.id);
    req.session.message={type:'success',text:`Kho trước báo HẾT. Bee đã tự chuyển đơn #${req.params.id} sang kho ưu tiên tiếp theo: ${result.next.name} và gửi push.`};
  } else {
    req.session.message={type:'error',text:`Tất cả kho ưu tiên của đơn #${req.params.id} đều đã báo HẾT. Bee đã báo CTV hết hàng.`};
  }
  res.redirect('/orders');
}));

app.post('/orders/:id/ghsv/create', admin, writeLimiter, safe(async (req,res)=>{
  try {
    const result = await createGhsvOrderForBee(req.params.id, req.session.user.id);
    if (result.alreadyCreated) {
      req.session.message={type:'success',text:`Đơn #${req.params.id} đã có đơn GHSV rồi, Bee không tạo trùng.`};
    } else {
      const code=result.response?.required_code || result.response?.order_code || result.order?.ghsv_required_code || '';
      req.session.message={type:'success',text:`Đã tạo đơn GHSV cho #${req.params.id}${code?`: ${code}`:''}.`};
      await audit(req,'ghsv_order_manual_create','order',req.params.id,{required_code_suffix:String(code).slice(-8)});
    }
  } catch(e) {
    console.error(`[${req.id}] manual create GHSV`,e.message);
    req.session.message={type:'error',text:e.message};
  }
  res.redirect('/orders');
}));
app.post('/orders/:id/delete', admin, writeLimiter, safe(async (req, res) => {
  const existing = await db.findOrderById(req.params.id);
  if (!existing) {
    req.session.message = { type:'error', text:'Không tìm thấy đơn hàng.' };
    return res.redirect('/orders');
  }
  if (existing.status !== 'Hủy') {
    req.session.message = { type:'error', text:'Chỉ được xóa đơn đã Hủy. Hãy chuyển trạng thái đơn sang Hủy trước.' };
    return res.redirect('/orders');
  }
  const result = await db.deleteCancelledOrder(req.params.id);
  if (!result?.ok) {
    req.session.message = { type:'error', text:'Không thể xóa đơn này.' };
    return res.redirect('/orders');
  }
  await audit(req, 'order_delete_cancelled', 'order', req.params.id, {
    customer_name: existing.customer_name,
    phone: existing.phone,
    ctv_name: existing.ctv_name,
    cod: Number(existing.cod || 0),
    status: existing.status
  });
  req.session.message = { type:'success', text:`Đã xóa vĩnh viễn đơn #${req.params.id}.` };
  res.redirect('/orders');
}));

app.get('/ctv', admin, safe(async (req, res) => res.render('ctv', { title: 'CTV', rows: await db.revenueByCtv() })));
app.post('/ctv/:id/delete', admin, writeLimiter, safe(async (req,res)=>{
  const deleted = await db.deleteCtv(req.params.id);
  if (deleted) {
    await audit(req, 'ctv_delete', 'user', req.params.id, { full_name: deleted.full_name, phone: deleted.phone || deleted.username });
    req.session.message = { type:'success', text:`Đã xóa CTV ${deleted.full_name}. Các đơn cũ vẫn được giữ để tra cứu.` };
  } else req.session.message = { type:'error', text:'Không tìm thấy CTV để xóa.' };
  res.redirect('/ctv');
}));
app.get('/ctv/:id/revenue', admin, safe(async (req,res)=>{ const detail=await db.ctvRevenueDetail(req.params.id); if(!detail) return res.status(404).send('Không tìm thấy CTV'); res.render('ctv-detail',{title:'Đối soát CTV',...detail}); }));
app.post('/ctv/:id/settle-selected', admin, writeLimiter, safe(async (req,res)=>{
  const raw = Array.isArray(req.body.order_ids) ? req.body.order_ids : (req.body.order_ids ? [req.body.order_ids] : []);
  const result = await db.settleCtvOrders(req.params.id, raw);
  if (result?.orders?.length) await audit(req, 'ctv_settle_selected', 'user', req.params.id, { settlement_code: result.code, orders: result.orders.map(x=>x.id) });
  if (!result || !result.orders.length) req.session.message = { type:'error', text:'Không có đơn đủ điều kiện để đánh dấu đã trả. Chỉ đơn Hoàn thành/Hoàn mới được đối soát.' };
  else req.session.message = { type:'success', text:`Đã đánh dấu ${result.orders.length} đơn là đã trả. Mã đợt: ${result.code}` };
  res.redirect(`/ctv/${req.params.id}/revenue`);
}));
app.post('/ctv/:id/settle-all', admin, writeLimiter, safe(async (req,res)=>{
  const result = await db.settleAllCtvOrders(req.params.id);
  if (result?.orders?.length) await audit(req, 'ctv_settle_all', 'user', req.params.id, { settlement_code: result.code, order_count: result.orders.length });
  if (!result.orders.length) req.session.message = { type:'error', text:'CTV này chưa có đơn Hoàn thành/Hoàn nào đang chờ thanh toán.' };
  else req.session.message = { type:'success', text:`Đã trả hết ${result.orders.length} đơn đang chờ. Mã đợt: ${result.code}` };
  res.redirect(`/ctv/${req.params.id}/revenue`);
}));
app.post('/ctv/:ctvId/orders/:orderId/profit-status', admin, writeLimiter, safe(async (req,res)=>{
  const success = String(req.body.profit_status||'') === 'success';
  const updated = await db.setCtvProfitStatus(req.params.ctvId, req.params.orderId, success);
  if (!updated) req.session.message = { type:'error', text:'Chỉ đơn Hoàn thành hoặc Hoàn mới có thể cập nhật trạng thái lãi.' };
  else {
    await audit(req, 'ctv_profit_status', 'order', req.params.orderId, { ctv_id:req.params.ctvId, status:success?'success':'pending' });
    req.session.message = { type:'success', text: success ? 'Đã đánh dấu Lãi thành công.' : 'Đã chuyển về Chưa lãi thành công.' };
  }
  res.redirect(`/ctv/${req.params.ctvId}/revenue`);
}));

// V79: CTV tự bắn trên GHSV riêng -> Hoàn -20k; CTV gửi thông tin để shop/Bee lên đơn -> Hoàn -45k.
app.get('/debt', admin, safe(async (req,res)=>{
  const rows=await db.ctvDebtSummary();
  const totals=rows.reduce((a,r)=>{a.total+=Number(r.debt_total||0);a.paid+=Number(r.debt_paid||0);a.outstanding+=Number(r.debt_outstanding||0);return a;},{total:0,paid:0,outstanding:0});
  res.render('debt',{title:'Công nợ CTV Drop',rows,totals});
}));
app.get('/debt/:id', admin, safe(async (req,res)=>{
  const detail=await db.ctvDebtDetail(req.params.id);
  if(!detail) return res.status(404).send('Không tìm thấy CTV');
  res.render('debt-detail',{title:'Chi tiết công nợ',...detail});
}));
app.post('/debt/:id/settle-selected', admin, writeLimiter, safe(async (req,res)=>{
  const raw=Array.isArray(req.body.order_ids)?req.body.order_ids:(req.body.order_ids?[req.body.order_ids]:[]);
  const result=await db.settleCtvDebtOrders(req.params.id,raw);
  if(result?.orders?.length) await audit(req,'ctv_debt_settle_selected','user',req.params.id,{settlement_code:result.code,orders:result.orders.map(x=>x.id)});
  req.session.message=!result||!result.orders.length
    ? {type:'error',text:'Không có đơn công nợ đủ điều kiện. Chỉ đơn CTV tự bắn trên GHSV riêng, đã Hoàn thành/Hoàn và chưa thu mới được chọn.'}
    : {type:'success',text:`Đã thu công nợ ${result.orders.length} đơn. Mã đợt: ${result.code}`};
  res.redirect(`/debt/${req.params.id}`);
}));
app.post('/debt/:id/settle-all', admin, writeLimiter, safe(async (req,res)=>{
  const result=await db.settleAllCtvDebt(req.params.id);
  if(result?.orders?.length) await audit(req,'ctv_debt_settle_all','user',req.params.id,{settlement_code:result.code,order_count:result.orders.length});
  req.session.message=!result?.orders?.length
    ? {type:'error',text:'CTV này chưa có công nợ từ đơn tự bắn đang chờ thu.'}
    : {type:'success',text:`Đã thu toàn bộ ${result.orders.length} đơn công nợ đang chờ. Mã đợt: ${result.code}`};
  res.redirect(`/debt/${req.params.id}`);
}));
app.post('/debt/:ctvId/orders/:orderId/status', admin, writeLimiter, safe(async (req,res)=>{
  const paid=String(req.body.debt_status||'')==='paid';
  const updated=await db.setCtvDebtStatus(req.params.ctvId,req.params.orderId,paid);
  if(!updated) req.session.message={type:'error',text:'Chỉ đơn CTV tự bắn trên GHSV riêng ở trạng thái Hoàn thành hoặc Hoàn mới cập nhật công nợ được.'};
  else {
    await audit(req,'ctv_debt_status','order',req.params.orderId,{ctv_id:req.params.ctvId,status:paid?'paid':'unpaid'});
    req.session.message={type:'success',text:paid?'Đã đánh dấu ĐÃ THU công nợ.':'Đã chuyển về CHƯA THU công nợ.'};
  }
  res.redirect(`/debt/${req.params.ctvId}`);
}));

// V34: CSKH + tra cứu GHSV. Token GHSV chỉ dùng ở server, không bao giờ gửi xuống trình duyệt.
app.get('/support', login, safe(async (req,res)=>{
  const tickets = req.session.user.role === 'admin' ? await db.listSupportTickets() : await db.listSupportTicketsForCtv(req.session.user.id);
  res.render('support',{title:'Chăm sóc khách hàng',tickets});
}));
app.get('/support/new', login, safe(async (req,res)=>{
  const order = await db.findOrderById(req.query.order_id);
  if (!canAccessOrder(req,order)) return res.status(403).send('Bạn không có quyền tạo yêu cầu cho đơn này.');
  res.render('support-form',{title:'Yêu cầu CSKH',order});
}));
app.post('/support/new', login, writeLimiter, safe(async (req,res)=>{
  const order = await db.findOrderById(req.body.order_id);
  if (!canAccessOrder(req,order)) return res.status(403).send('Bạn không có quyền tạo yêu cầu cho đơn này.');
  const allowed = ['Hối lấy hàng','Hối giao','Giao lại','Khách hẹn ngày','Khách không nghe máy','Sai địa chỉ','Yêu cầu hoàn','Khác'];
  const requestType = allowed.includes(req.body.request_type) ? req.body.request_type : 'Khác';
  const ticket = await db.createSupportTicket({ order_id: order.id, ctv_id: order.ctv_id, request_type: requestType, note: text(req.body.note,2000) });
  await audit(req,'support_ticket_create','support_ticket',ticket.id,{order_id:order.id,request_type:requestType});
  req.session.message={type:'success',text:`Đã gửi yêu cầu CSKH #${ticket.id} cho đơn #${order.id}.`};
  res.redirect('/support');
}));
app.post('/support/:id/update', admin, writeLimiter, safe(async (req,res)=>{
  const allowed=['Mới','Đang xử lý','Đã xử lý'];
  const status=allowed.includes(req.body.status)?req.body.status:'Mới';
  const updated=await db.updateSupportTicket(req.params.id,{status,admin_note:text(req.body.admin_note,2000)});
  if(updated) await audit(req,'support_ticket_update','support_ticket',updated.id,{status});
  req.session.message=updated?{type:'success',text:'Đã cập nhật yêu cầu CSKH.'}:{type:'error',text:'Không tìm thấy yêu cầu CSKH.'};
  res.redirect('/support');
}));
// V39: CTV may keep using the shop's internal GHSV code (MDT/client_code).
// If GHSV can resolve it, cache the MDT -> MVD(required_code) mapping. If the
// production API does not resolve MDT for this token, admin can link the MVD
// once; afterwards CTV still only needs the internal MDT stored on the order.
app.post('/orders/:id/ghsv/link', admin, writeLimiter, safe(async (req,res)=>{
  const order=await db.findOrderById(req.params.id);
  if(!order) return res.status(404).send('Không tìm thấy đơn.');
  const requiredCode=text(req.body.required_code,120).trim();
  if(!requiredCode) { req.session.message={type:'error',text:'Hãy nhập mã vận đơn GHSV (MVD).'}; return res.redirect(`/orders/${order.id}/ghsv`); }
  await db.upsertGhsvCodeMap({clientCode:order.tracking_code,requiredCode,createdBy:req.session.user.id});
  await audit(req,'ghsv_code_link','order',order.id,{client_code_suffix:String(order.tracking_code).slice(-6),required_code_suffix:requiredCode.slice(-6)});
  req.session.message={type:'success',text:`Đã liên kết mã nội bộ ${order.tracking_code} với MVD GHSV ${requiredCode}.`};
  res.redirect(`/orders/${order.id}/ghsv`);
}));


// V52: CTV/Admin có thể tra GHSV bằng mã nội bộ Bee (BEE000123).
// Mã này chỉ xác định đơn trong Bee; backend vẫn dùng client_code/required_code/B57 đã lưu để gọi GHSV.
app.get('/ghsv-lookup', login, safe(async (req,res)=>{
  const raw = text(req.query.code, 40).trim().toUpperCase();
  if (!raw) return res.render('ghsv-lookup', { title:'Tra cứu GHSV', lookupCode:'', lookupError:'' });
  const m = raw.match(/^BEE(\d{1,9})$/i);
  if (!m) return res.render('ghsv-lookup', { title:'Tra cứu GHSV', lookupCode:raw, lookupError:'Mã nội bộ không đúng định dạng. Ví dụ: BEE000018.' });
  const orderId = Number(m[1]);
  const order = await db.findOrderById(orderId);
  if (!order || !canAccessOrder(req, order)) {
    return res.render('ghsv-lookup', { title:'Tra cứu GHSV', lookupCode:raw, lookupError:'Không tìm thấy đơn này hoặc bạn không có quyền xem.' });
  }
  return res.redirect(`/orders/${order.id}/ghsv`);
}));

app.get('/orders/:id/ghsv', login, safe(async (req,res)=>{
  const order=await db.findOrderById(req.params.id);
  if(!canAccessOrder(req,order)) return res.status(403).send('Bạn không có quyền tra cứu đơn này.');
  if(!order.tracking_code) { req.session.message={type:'error',text:'Đơn này chưa có mã GHSV/client_code.'}; return res.redirect(req.session.user.role==='admin'?'/orders':'/my-orders'); }

  let info={},tracking=[],shipper={name:'',phone:''},error='',trackingError='',codeMap=null,ghsvDebug=null;
  const storedCode=String(order.tracking_code||'').trim();
  const legacyMode=!looksLikeBeeClientCode(storedCode);
  let resolvedCode=storedCode;
  let lookupConfigured=false, ghsvAccountName='', ghsvContext=null;
  try {
    ghsvContext=await resolveGhsvLookupContext(order);
    lookupConfigured=Boolean(ghsvContext?.token);
    ghsvAccountName=ghsvContext?.accountName||'';
  } catch(e) {
    error=e.message;
  }

  if(lookupConfigured) {
    let infoRaw=null, trackingRaw=null, roomRaw=null;
    codeMap=await db.getGhsvCodeMap(storedCode);

    if (!legacyMode) {
      // Đơn mới: BEE... là client_code chính thức, tra info trước.
      try {
        infoRaw=await ghsvLookupInfo(storedCode, 'client_code', ghsvContext.token);
        info=normalizeGhsvInfo(infoRaw);
        const returnedRequired=String(info.required_code||'').trim();
        const returnedClient=String(infoRaw?.order?.client_code || infoRaw?.data?.client_code || storedCode).trim();
        if(returnedRequired) {
          if(returnedClient && returnedClient.toUpperCase() !== returnedRequired.toUpperCase()) {
            codeMap=await db.upsertGhsvCodeMap({clientCode:returnedClient,requiredCode:returnedRequired,createdBy:req.session.user.id});
            await audit(req,'ghsv_code_auto_link','order',order.id,{client_code_suffix:returnedClient.slice(-6),required_code_suffix:returnedRequired.slice(-6)});
          }
          resolvedCode=returnedRequired;
        }
      } catch(e) {
        console.error(`[${req.id}] GHSV info lookup failed`,e.message);
        error=`GHSV chưa trả thông tin cho client_code ${storedCode}. Kiểm tra khi tạo đơn GHSV đã dán đúng mã Bee này vào ô Mã đơn tùy chỉnh/client_code chưa.`;
      }
    } else {
      // V71 - đơn cũ: ưu tiên mọi mã GHSV từng lưu trên đơn trước khi rơi về mã tracking cũ.
      // Nhờ vậy các đơn cũ B57 / GY... / mã đã từng liên kết vẫn có thể đọc hành trình
      // và tách tên + SĐT shipper mà không cần sửa tay từng đơn.
      resolvedCode=String(
        order.ghsv_required_code ||
        order.ghsv_order_code ||
        codeMap?.required_code ||
        storedCode
      ).trim();
    }

    if(resolvedCode) {
      try {
        if (legacyMode) {
          const candidates = [];
          const addCandidate = (code, field='') => {
            code=String(code||'').trim();
            if(!code || candidates.some(x=>x.code.toUpperCase()===code.toUpperCase())) return;
            candidates.push({code,field});
          };
          addCandidate(order.ghsv_required_code, 'required_code');
          addCandidate(order.ghsv_order_code, 'required_code');
          addCandidate(codeMap?.required_code, 'required_code');
          // B57 là MVD/required_code. Các mã GY... cũ có thể cần thử cả client_code + required_code,
          // nên không ép field để ghsvLookupTracking tự thử các biến thể tương thích.
          addCandidate(storedCode, looksLikeLegacyMvd(storedCode) ? 'required_code' : '');

          let lastErr=null;
          for (const candidate of candidates) {
            try {
              trackingRaw=await ghsvLookupTracking(candidate.code, candidate.field, ghsvContext.token);
              tracking=normalizeGhsvTracking(trackingRaw);
              if (tracking.length) {
                resolvedCode=candidate.code;
                break;
              }
            } catch(err) {
              lastErr=err;
            }
          }
          if(!tracking.length && lastErr) throw lastErr;
        } else {
          trackingRaw=await ghsvLookupTracking(resolvedCode, 'required_code', ghsvContext.token);
          tracking=normalizeGhsvTracking(trackingRaw);
        }

        // Nếu info không có (đơn cũ), lấy trạng thái hiện tại từ hành trình để vẫn cập nhật Bee.
        if(!info.status && tracking.length) {
          info.status=latestTrackingStatus(tracking);
        }
      } catch(e) {
        console.error(`[${req.id}] GHSV tracking lookup failed`,e.message);
        trackingError=legacyMode
          ? `Chưa lấy được hành trình của đơn cũ bằng các mã GHSV đã lưu.`
          : 'Chưa lấy được hành trình GHSV; thông tin trạng thái chính vẫn có thể dùng nếu API info đã trả về.';
      }
    }

    const currentGhsvStatus=String(info.status||'').trim();
    if(currentGhsvStatus) {
      await db.updateGhsvSnapshot(order.id,currentGhsvStatus);
      const localStatus=mapGhsvStatusToLocal(currentGhsvStatus);
      if(localStatus && localStatus!==order.status && !order.ctv_paid && !order.ctv_debt_paid && order.status!=='Hủy') {
        await db.updateOrderStatus(order.id,localStatus);
        order.status=localStatus;
      }
    }

    const trackedShipper=extractShipper(tracking);
    const rawShipper=extractShipperFromPayload({infoRaw,trackingRaw});

    // V82: neu open-api chua tra shipper, thu endpoint web room/detail da xac nhan
    // tu DevTools GHSV. customer_code duoc lay tu payload, env hoac suy ra tu MVD B57BRYK...
    let roomShipper={name:'',phone:''};
    if(!(info.shipper_name&&info.shipper_phone) && !(trackedShipper.name&&trackedShipper.phone) && !(rawShipper.name&&rawShipper.phone)) {
      const customerCode=resolveGhsvCustomerCode({
        infoRaw,trackingRaw,resolvedCode,storedCode,order,
        allowEnv:ghsvContext?.source==='shop'
      });
      if(customerCode) {
        const roomToken=(ghsvContext?.source==='shop' && GHSV_ROOM_BEARER) ? GHSV_ROOM_BEARER : ghsvContext.token;
        roomRaw=await ghsvLookupRoomDetail(customerCode,roomToken);
        if(roomRaw) {
          roomShipper=extractTargetedShipperFromRoom(roomRaw,[
            resolvedCode,storedCode,order.ghsv_required_code,order.ghsv_order_code,codeMap?.required_code
          ]);
        }
      }
    }

    shipper={
      name:info.shipper_name||trackedShipper.name||rawShipper.name||roomShipper.name||'',
      phone:info.shipper_phone||trackedShipper.phone||rawShipper.phone||roomShipper.phone||''
    };

    // Chỉ Admin nhận debug đã làm sạch. Không gửi token, auth hoặc dữ liệu khách thô xuống browser.
    if (req.session.user.role === 'admin' && (infoRaw || trackingRaw || roomRaw)) {
      ghsvDebug=buildGhsvDebug(infoRaw,trackingRaw,roomRaw);
      const infoKeys=infoRaw&&typeof infoRaw==='object'?Object.keys(infoRaw).slice(0,30):[];
      const trackingKeys=trackingRaw&&typeof trackingRaw==='object'&&!Array.isArray(trackingRaw)?Object.keys(trackingRaw).slice(0,30):[];
      const roomKeys=roomRaw&&typeof roomRaw==='object'&&!Array.isArray(roomRaw)?Object.keys(roomRaw).slice(0,30):[];
      console.log(`[GHSV][V82 DEBUG][${req.id}] info keys=${infoKeys.join(',')||'-'} | tracking keys=${trackingKeys.join(',')||'-'} | room keys=${roomKeys.join(',')||'-'} | shipper candidates=${ghsvDebug.shipper_candidate_paths.map(x=>x.path).slice(0,20).join(',')||'-'}`);
    }
    if(infoRaw || trackingRaw) await audit(req,'ghsv_lookup','order',order.id,{tracking_code_suffix:storedCode.slice(-6)});
  }

  const ghsvFee = req.session.user.role === 'admin' ? info.fee : null;
  if (req.session.user.role !== 'admin' && Object.prototype.hasOwnProperty.call(info, 'fee')) {
    info = { ...info };
    delete info.fee;
  }
  res.render('ghsv',{title:'Tra cứu GHSV',order,beeCode:beeInternalCode(order.id),configured:lookupConfigured,ghsvAccountName,info,ghsvFee,tracking,shipper,error,trackingError,codeMap,resolvedCode,legacyMode,ghsvDebug});
}));

app.post('/ghsv/sync-now', admin, writeLimiter, safe(async (req,res)=>{
  const result = await syncGhsvOrders({ limit: 100, reason: 'manual' });
  req.session.message = result?.skipped
    ? {type:'error', text:'Đồng bộ GHSV đang chạy.'}
    : {type:'success', text:`Đã kiểm tra ${result.checked} đơn; tự cập nhật ${result.changed} trạng thái; lỗi ${result.failed}.`};
  res.redirect(req.get('referer') || '/orders');
}));

app.get('/audit', admin, safe(async (req, res) => res.render('audit', { title: 'Nhật ký bảo mật', logs: await db.listAuditLogs(300) })));
app.get('/revenue', admin, safe(async (req, res) => res.render('revenue', { title: 'Doanh thu', rows: await db.revenueByCtv(), total: (await db.adminStats()).revenue })));
app.get('/users', admin, safe(async (req, res) => res.render('users', { title: 'Quản lý tài khoản', users: await db.listUsers() })));

// V75: kết nối GHSV riêng cho từng CTV. Token chỉ được nhập ở Admin, mã hóa trước khi lưu DB và không bao giờ render ngược ra trình duyệt.
app.get('/users/:id/ghsv', admin, safe(async (req,res)=>{
  const ctv=await db.findUserById(req.params.id);
  if(!ctv || ctv.role!=='ctv') return res.status(404).send('Không tìm thấy CTV.');
  const [shops,warehouses]=await Promise.all([db.listCtvGhsvShops(ctv.id),db.listWarehouses()]);
  res.render('ctv-ghsv',{title:`GHSV • ${ctv.full_name}`,ctv,shops,warehouses,connected:Boolean(ctv.ghsv_token_enc)});
}));

app.post('/users/:id/ghsv/token', admin, writeLimiter, safe(async (req,res)=>{
  const ctv=await db.findUserById(req.params.id);
  if(!ctv || ctv.role!=='ctv') return res.status(404).send('Không tìm thấy CTV.');
  const token=String(req.body.ghsv_token||'').trim();
  if(!token){ req.session.message={type:'error',text:'Hãy nhập token GHSV của CTV.'}; return res.redirect(`/users/${ctv.id}/ghsv`); }
  try {
    const shops=await fetchGhsvShops('',token);
    await db.saveCtvGhsvToken(ctv.id,encryptCtvGhsvToken(token));
    const result=await db.syncCtvGhsvShops(ctv.id,shops);
    await audit(req,'ctv_ghsv_connect','user',ctv.id,{shops:result.total});
    req.session.message={type:'success',text:`Đã kết nối GHSV riêng cho ${ctv.full_name} và đồng bộ ${result.total} cửa hàng. Token đã được mã hóa trong DB.`};
  } catch(e){
    req.session.message={type:'error',text:`Token GHSV chưa dùng được: ${e.message}`};
  }
  res.redirect(`/users/${ctv.id}/ghsv`);
}));

app.post('/users/:id/ghsv/sync', admin, writeLimiter, safe(async (req,res)=>{
  const ctv=await db.getCtvGhsvCredential(req.params.id);
  if(!ctv) return res.status(404).send('Không tìm thấy CTV.');
  try {
    const token=decryptCtvGhsvToken(ctv.ghsv_token_enc);
    if(!token) throw new Error('CTV chưa có token GHSV riêng.');
    const shops=await fetchGhsvShops('',token);
    const result=await db.syncCtvGhsvShops(ctv.id,shops);
    req.session.message={type:'success',text:`Đã đồng bộ ${result.total} cửa hàng GHSV của ${ctv.full_name}.`};
  } catch(e){ req.session.message={type:'error',text:e.message}; }
  res.redirect(`/users/${req.params.id}/ghsv`);
}));

app.post('/users/:id/ghsv/shops/:shopRowId/map', admin, writeLimiter, safe(async (req,res)=>{
  const ctv=await db.findUserById(req.params.id);
  if(!ctv || ctv.role!=='ctv') return res.status(404).send('Không tìm thấy CTV.');
  const warehouseId=String(req.body.warehouse_id||'').trim();
  const mapped=await db.mapCtvGhsvShop(ctv.id,req.params.shopRowId,warehouseId||null);
  if(!mapped) req.session.message={type:'error',text:'Không tìm thấy cửa hàng GHSV để map.'};
  else {
    await audit(req,'ctv_ghsv_shop_map','user',ctv.id,{ghsv_shop_id_suffix:String(mapped.ghsv_shop_id).slice(-6),warehouse_id:mapped.warehouse_id||null});
    req.session.message={type:'success',text:'Đã map cửa hàng GHSV của CTV với Bee Kho dùng chung.'};
  }
  res.redirect(`/users/${ctv.id}/ghsv`);
}));

app.post('/users/:id/ghsv/disconnect', admin, writeLimiter, safe(async (req,res)=>{
  const ctv=await db.clearCtvGhsvToken(req.params.id);
  if(ctv){
    await audit(req,'ctv_ghsv_disconnect','user',ctv.id,{});
    req.session.message={type:'success',text:`Đã ngắt kết nối GHSV riêng của ${ctv.full_name}. Các đơn đã tạo bằng tài khoản CTV sẽ không tra được cho tới khi kết nối lại token.`};
  } else req.session.message={type:'error',text:'Không tìm thấy CTV.'};
  res.redirect('/users');
}));
app.post('/users/:id/approval', admin, writeLimiter, safe(async (req,res) => {
  const decision = String(req.body.decision || '');
  if (!['approved','rejected'].includes(decision)) return res.status(400).send('Quyết định không hợp lệ.');
  const updated = await db.reviewCtv(req.params.id, decision, req.session.user.id);
  req.session.message = updated
    ? {type:'success',text:decision==='approved'?'Đã duyệt CTV. Tài khoản có thể đăng nhập.':'Đã từ chối đăng ký CTV.'}
    : {type:'error',text:'Không tìm thấy yêu cầu chờ duyệt phù hợp.'};
  if(updated) await audit(req, 'ctv_approval_'+decision, 'user', updated.id, {phone_suffix:(updated.phone||'').slice(-4)});
  res.redirect('/users');
}));
app.post('/users/:id/delete', admin, writeLimiter, safe(async (req, res) => {
  if (+req.params.id !== req.session.user.id) { await db.deleteUser(req.params.id); await audit(req, 'user_delete', 'user', req.params.id); }
  res.redirect('/users');
}));

app.get('/change-password', login, (req, res) => res.render('change-password', { title: 'Đổi mật khẩu' }));
app.post('/change-password', login, authLimiter, safe(async (req, res) => {
  const u = await db.findUserById(req.session.user.id);
  const newPassword = String(req.body.new_password || '');
  const oldPassword = String(req.body.old_password || '');
  const confirmPassword = String(req.body.confirm_password || '');
  if (u && await bcrypt.compare(oldPassword, u.password_hash) && passwordStrongEnough(newPassword) && newPassword === confirmPassword) {
    await db.updatePassword(u.id, await bcrypt.hash(newPassword, 11));
    await audit(req, 'password_change', 'user', u.id);
    req.session.message = { type: 'success', text: 'Đổi mật khẩu thành công.' };
  } else {
    req.session.message = { type: 'error', text: 'Thông tin mật khẩu chưa đúng. Mật khẩu mới cần ít nhất 8 ký tự, có chữ và số.' };
  }
  res.redirect('/change-password');
}));

app.use((req, res) => res.status(404).send('Không tìm thấy trang.'));

app.use((err, req, res, next) => {
  console.error(`[${req.id || 'no-id'}] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError || err?.message?.startsWith('Chỉ chấp nhận ảnh')) {
    if (req.session) req.session.message = { type: 'error', text: err.message || 'Ảnh tải lên không hợp lệ.' };
    return res.status(400).redirect(req.get('referer') || '/products');
  }
  if (req.session) req.session.message = { type: 'error', text: 'Có lỗi xảy ra. Vui lòng thử lại.' };
  res.status(500).redirect(req.get('referer') || '/dashboard');
});

let server;
async function shutdown(signal) {
  console.log(`${signal}: đang đóng server an toàn...`);
  const forceTimer = setTimeout(() => process.exit(1), 10000);
  forceTimer.unref();
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  await db.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM').catch(err => { console.error(err); process.exit(1); }));
process.on('SIGINT', () => shutdown('SIGINT').catch(err => { console.error(err); process.exit(1); }));
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

(async () => {
  // V73: bind PORT ngay. Render không phải chờ DB migration hay GHSV sync mới thấy service online.
  server = app.listen(PORT, '0.0.0.0', () => console.log(`Bee Sneaker V78 đang chạy trên cổng ${PORT}`));
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 30000;

  try {
    await db.init();
    await initWebPush();
    databaseReady = true;
    console.log('[STARTUP] Database + Web Push sẵn sàng.');

    // Đồng bộ GHSV chạy nền, batch nhỏ. Không bao giờ chặn startup/deploy.
    const syncTimer = setInterval(() => {
      setImmediate(() => syncGhsvOrders({ limit: 20, reason: '15min' }).catch(e => console.error('[GHSV-SYNC]', e.message)));
    }, 15 * 60 * 1000);
    syncTimer.unref();

    // Đợi 2 phút sau khi service online mới sync batch đầu tiên để Render health check ổn định trước.
    setTimeout(() => {
      setImmediate(() => syncGhsvOrders({ limit: 10, reason: 'startup-bg' }).catch(e => console.error('[GHSV-SYNC]', e.message)));
    }, 120 * 1000).unref();
  } catch (err) {
    console.error('Không thể khởi tạo database:', err);
    databaseReady = false;
    // Process đã bind PORT để log dễ đọc, nhưng DB lỗi thật thì thoát để Render restart sạch.
    setTimeout(() => process.exit(1), 1000).unref();
  }
})();

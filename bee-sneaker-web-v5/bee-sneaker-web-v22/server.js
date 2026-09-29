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
const db = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto
  .createHash('sha256')
  .update(`${process.env.DATABASE_URL || 'local'}:bee-sneaker-session-v8`)
  .digest('hex');

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
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
  skip: req => req.path === '/healthz'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: 'Có quá nhiều lần đăng nhập/đăng ký. Vui lòng thử lại sau 15 phút.'
});

const writeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Có quá nhiều thao tác cập nhật. Vui lòng thử lại sau ít phút.'
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
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.urlencoded({ extended: true, limit: '100kb', parameterLimit: 100 }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1h' : 0, etag: true }));
app.use(globalLimiter);

// Health check cho Render/Uptime monitor. Không tạo session để giảm tải.
app.get('/healthz', async (req, res) => {
  try {
    await db.ping();
    res.status(200).json({ ok: true, service: 'bee-sneaker-v18' });
  } catch (err) {
    console.error(`[${req.id}] healthz failed`, err.message);
    res.status(503).json({ ok: false });
  }
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
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
  }
}));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.cartCount = Array.isArray(req.session.cart) ? req.session.cart.reduce((n,x)=>n+(Number(x.quantity)||0),0) : 0;
  res.locals.message = req.session.message || null;
  delete req.session.message;
  next();
});

const login = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const admin = (req, res, next) => req.session.user?.role === 'admin' ? next() : res.redirect('/dashboard');
const safe = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
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

app.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));
app.get('/login', (req, res) => res.render('login', { title: 'Đăng nhập' }));
app.get('/register', (req, res) => res.render('register', { title: 'Đăng ký CTV' }));

app.post('/register', authLimiter, safe(async (req, res) => {
  const fullName = text(req.body.full_name, 150);
  const username = text(req.body.username, 100);
  const password = String(req.body.password || '');
  const confirmPassword = String(req.body.confirm_password || '');
  if (fullName.length < 2 || username.length < 3 || password.length < 8 || password !== confirmPassword) {
    req.session.message = { type: 'error', text: 'Vui lòng kiểm tra thông tin. Tài khoản từ 3 ký tự, mật khẩu từ 8 ký tự.' };
    return res.redirect('/register');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    req.session.message = { type: 'error', text: 'Tên đăng nhập chỉ nên dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.' };
    return res.redirect('/register');
  }
  try {
    const passwordHash = await bcrypt.hash(password, 11);
    const u = await db.createUser({ username, password_hash: passwordHash, full_name: fullName, role: 'ctv' });
    req.session.user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role };
    res.redirect('/dashboard');
  } catch (e) {
    req.session.message = { type: 'error', text: e.code === '23505' ? 'Tên đăng nhập đã tồn tại.' : 'Không thể đăng ký tài khoản.' };
    res.redirect('/register');
  }
}));

app.post('/login', authLimiter, safe(async (req, res) => {
  const username = text(req.body.username, 100);
  const password = String(req.body.password || '').slice(0, 200);
  const u = await db.findUserByUsername(username);
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    req.session.message = { type: 'error', text: 'Tài khoản hoặc mật khẩu không đúng.' };
    return res.redirect('/login');
  }
  req.session.user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role };
  res.redirect('/dashboard');
}));
app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/dashboard', login, safe(async (req, res) => {
  if (req.session.user.role === 'admin') {
    return res.render('dashboard-admin', { title: 'Tổng quan', stats: await db.adminStats(), latest: await db.latestOrders(6) });
  }
  res.render('dashboard-ctv', { title: 'Trang CTV', stats: await db.ctvStats(req.session.user.id), latest: (await db.listOrdersByCtv(req.session.user.id)).slice(0, 6) });
}));

app.get('/products', login, safe(async (req, res) => {
  const q = text(req.query.q, 100);
  res.render('products', { title: 'Sản phẩm', products: await db.listProducts(q), q });
}));
app.get('/products/new', admin, (req, res) => res.render('product-form', { title: 'Thêm sản phẩm', product: null, gallery: [] }));
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
  res.render('product-detail', { title: product.name, product, gallery });
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
    note: text(req.body.note, 2000)
  });
  const galleryFiles = req.files?.detail_images || [];
  if (galleryFiles.length) {
    await db.addProductImages(created.id, galleryFiles.map(f => ({ image_data: f.buffer, image_mime: f.mimetype })));
  }
  res.redirect(`/products/${created.id}`);
}));

app.get('/products/:id/edit', admin, safe(async (req, res) => {
  const product = await db.findProductById(req.params.id);
  const gallery = product ? await db.listProductImages(req.params.id) : [];
  res.render('product-form', { title: 'Sửa sản phẩm', product, gallery });
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
    note: text(req.body.note, 2000)
  });
  const galleryFiles = req.files?.detail_images || [];
  if (galleryFiles.length) {
    await db.addProductImages(req.params.id, galleryFiles.map(f => ({ image_data: f.buffer, image_mime: f.mimetype })));
  }
  res.redirect(`/products/${req.params.id}`);
}));

app.post('/products/:id/gallery/:imageId/delete', admin, writeLimiter, safe(async (req, res) => {
  await db.deleteProductImage(req.params.id, req.params.imageId);
  res.redirect(`/products/${req.params.id}/edit`);
}));

app.post('/products/:id/delete', admin, writeLimiter, safe(async (req, res) => {
  await db.deleteProduct(req.params.id);
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
app.post('/checkout', login, ctvOnly, writeLimiter, safe(async (req,res)=>{
  const cart=cartOf(req); const chosen=cartSelected(cart); if(!chosen.length) return res.redirect('/cart');
  const customerName=text(req.body.customer_name,150), phone=text(req.body.phone,30), address=text(req.body.address,1000);
  if(!customerName||!phone||!address){ req.session.message={type:'error',text:'Vui lòng nhập đủ tên khách, SĐT và địa chỉ.'}; return res.redirect('/checkout'); }
  const fresh=[];
  for(const item of chosen){ const p=await db.findProductById(item.product_id); if(!p) continue; const unit=money((p.variant_prices||{})[item.product_variant]); const q=Math.max(1,Math.min(100,Number(item.quantity)||1)); const available=availableForSize(p,item.size); if(unit<=0||available<q) continue; fresh.push({product_id:p.id,product_name:p.name,product_variant:item.product_variant,variant_unit_price:unit,size:item.size,quantity:q,line_total:unit*q}); }
  if(!fresh.length){ req.session.message={type:'error',text:'Giỏ hàng không còn sản phẩm hợp lệ.'}; req.session.cart=[]; return res.redirect('/cart'); }
  const totalQuantity=fresh.reduce((n,x)=>n+x.quantity,0), productCost=fresh.reduce((n,x)=>n+x.line_total,0);
  const baseCod=money(req.body.base_cod), shippingType=req.body.shipping_type==='customer_pay'?'customer_pay':'freeship', shippingFee=shippingFeeForQuantity(totalQuantity);
  const cod=baseCod+(shippingType==='customer_pay'?shippingFee:0), taxAmount=Math.round(cod*0.015), ctvProfit=cod-productCost-taxAmount;
  try {
    await db.createCartOrder({ctv_id:req.session.user.id,ctv_name:req.session.user.full_name,customer_name:customerName,phone,address,product_name:fresh.length===1?fresh[0].product_name:`${fresh.length} sản phẩm`,quantity:totalQuantity,base_cod:baseCod,shipping_type:shippingType,shipping_fee:shippingFee,product_cost:productCost,tax_amount:taxAmount,cod,ctv_profit:ctvProfit,note:text(req.body.note,2000)},fresh);
  } catch (e) {
    console.error('POST /checkout stock error:', e);
    req.session.message = { type:'error', text: e?.message || 'Không thể tạo đơn. Vui lòng kiểm tra lại tồn kho.' };
    return res.redirect('/cart');
  }
  req.session.cart=cart.filter(x=>x.selected===false); req.session.message={type:'success',text:'Đã đặt đơn từ các sản phẩm được chọn.'}; res.redirect('/my-orders');
}));

app.post('/orders', login, writeLimiter, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  const p = await db.findProductById(req.body.product_id);
  if (!p) {
    req.session.message = { type: 'error', text: 'Sản phẩm không tồn tại.' };
    return res.redirect('/orders/new');
  }
  const customerName = text(req.body.customer_name, 150);
  const phone = text(req.body.phone, 30);
  const address = text(req.body.address, 1000);
  const size = text(req.body.size, 50);
  if (!customerName || !phone || !address || !size) {
    req.session.message = { type: 'error', text: 'Vui lòng nhập đủ tên khách, SĐT, địa chỉ và size.' };
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
  const ctvProfit = cod - productCost - taxAmount;
  await db.createOrder({
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
    note: text(req.body.note, 2000)
  });
  req.session.message = { type: 'success', text: 'Đã tạo đơn thành công.' };
  res.redirect('/my-orders');
}));
app.get('/my-orders', login, safe(async (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/orders');
  res.render('orders', { title: 'Đơn của tôi', orders: await db.listOrdersByCtv(req.session.user.id), adminView: false });
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
  if (!customerName || !phone || !address) {
    req.session.message = { type: 'error', text: 'Vui lòng nhập đủ tên khách, SĐT và địa chỉ.' };
    return res.redirect(`/my-orders/${req.params.id}/edit-customer`);
  }
  const updated = await db.updateOrderCustomerByCtv(req.params.id, req.session.user.id, {
    customer_name: customerName, phone, address, note
  });
  if (!updated) {
    req.session.message = { type: 'error', text: 'Không tìm thấy đơn hoặc bạn không có quyền sửa.' };
    return res.redirect('/my-orders');
  }
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
  req.session.message = { type: 'success', text: 'Đã hủy đơn. Chủ shop vẫn có thể xem đơn và lý do hủy.' };
  res.redirect('/my-orders');
}));

app.get('/orders', admin, safe(async (req, res) => res.render('orders', { title: 'Đơn hàng', orders: await db.listOrders(), adminView: true })));
app.post('/orders/:id/status', admin, writeLimiter, safe(async (req, res) => {
  const allowed = ['Mới', 'Đã xác nhận', 'Đang giao', 'Hoàn thành', 'Hủy'];
  const status = allowed.includes(req.body.status) ? req.body.status : 'Mới';
  await db.updateOrderStatus(req.params.id, status);
  res.redirect('/orders');
}));
app.post('/orders/:id/admin-update', admin, writeLimiter, safe(async (req, res) => {
  await db.updateOrderAdmin(req.params.id, { tracking_code: text(req.body.tracking_code, 120) });
  req.session.message = { type: 'success', text: 'Đã cập nhật mã vận đơn.' };
  res.redirect('/orders');
}));

app.get('/ctv', admin, safe(async (req, res) => res.render('ctv', { title: 'CTV', rows: await db.revenueByCtv() })));
app.get('/revenue', admin, safe(async (req, res) => res.render('revenue', { title: 'Doanh thu', rows: await db.revenueByCtv(), total: (await db.adminStats()).revenue })));
app.get('/users', admin, safe(async (req, res) => res.render('users', { title: 'Quản lý tài khoản', users: await db.listUsers() })));
app.post('/users/:id/delete', admin, writeLimiter, safe(async (req, res) => {
  if (+req.params.id !== req.session.user.id) await db.deleteUser(req.params.id);
  res.redirect('/users');
}));

app.get('/change-password', login, (req, res) => res.render('change-password', { title: 'Đổi mật khẩu' }));
app.post('/change-password', login, authLimiter, safe(async (req, res) => {
  const u = await db.findUserById(req.session.user.id);
  const newPassword = String(req.body.new_password || '');
  const oldPassword = String(req.body.old_password || '');
  const confirmPassword = String(req.body.confirm_password || '');
  if (u && await bcrypt.compare(oldPassword, u.password_hash) && newPassword.length >= 8 && newPassword === confirmPassword) {
    await db.updatePassword(u.id, await bcrypt.hash(newPassword, 11));
    req.session.message = { type: 'success', text: 'Đổi mật khẩu thành công.' };
  } else {
    req.session.message = { type: 'error', text: 'Thông tin mật khẩu chưa đúng. Mật khẩu mới cần ít nhất 8 ký tự.' };
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
  try {
    await db.init();
    server = app.listen(PORT, '0.0.0.0', () => console.log(`Bee Sneaker V22 đang chạy trên cổng ${PORT}`));
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 30000;
  } catch (err) {
    console.error('Không thể kết nối database:', err);
    process.exit(1);
  }
})();

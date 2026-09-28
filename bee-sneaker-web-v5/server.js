const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const db = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF.'));
  }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  store: new pgSession({ pool: db.pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'bee-sneaker-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use((req,res,next)=>{
  res.locals.user = req.session.user || null;
  res.locals.message = req.session.message || null;
  delete req.session.message;
  next();
});

const login = (req,res,next)=> req.session.user ? next() : res.redirect('/login');
const admin = (req,res,next)=> req.session.user?.role === 'admin' ? next() : res.redirect('/dashboard');
const safe = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

app.get('/', (req,res)=>res.redirect(req.session.user?'/dashboard':'/login'));
app.get('/login', (req,res)=>res.render('login',{title:'Đăng nhập'}));
app.get('/register', (req,res)=>res.render('register',{title:'Đăng ký CTV'}));

app.post('/register', safe(async (req,res)=>{
  const {full_name,username,password,confirm_password}=req.body;
  if(!full_name||!username||!password||password!==confirm_password||password.length<6){
    req.session.message={type:'error',text:'Vui lòng kiểm tra thông tin. Mật khẩu cần ít nhất 6 ký tự.'};
    return res.redirect('/register');
  }
  try {
    const u=await db.createUser({username:username.trim(),password_hash:bcrypt.hashSync(password,10),full_name:full_name.trim(),role:'ctv'});
    req.session.user={id:u.id,username:u.username,full_name:u.full_name,role:u.role};
    res.redirect('/dashboard');
  } catch(e) {
    req.session.message={type:'error',text:e.code==='23505'?'Tên đăng nhập đã tồn tại.':'Không thể đăng ký tài khoản.'};
    res.redirect('/register');
  }
}));

app.post('/login', safe(async (req,res)=>{
  const u=await db.findUserByUsername((req.body.username||'').trim());
  if(!u||!bcrypt.compareSync(req.body.password||'',u.password_hash)){
    req.session.message={type:'error',text:'Tài khoản hoặc mật khẩu không đúng.'};
    return res.redirect('/login');
  }
  req.session.user={id:u.id,username:u.username,full_name:u.full_name,role:u.role};
  res.redirect('/dashboard');
}));
app.post('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/login')));

app.get('/dashboard', login, safe(async (req,res)=>{
  if(req.session.user.role==='admin'){
    return res.render('dashboard-admin',{title:'Tổng quan',stats:await db.adminStats(),latest:await db.latestOrders(6)});
  }
  res.render('dashboard-ctv',{title:'Trang CTV',stats:await db.ctvStats(req.session.user.id),latest:(await db.listOrdersByCtv(req.session.user.id)).slice(0,6)});
}));

app.get('/products',login,safe(async(req,res)=>res.render('products',{title:'Sản phẩm',products:await db.listProducts((req.query.q||'').trim()),q:(req.query.q||'').trim()})));
app.get('/products/new',admin,(req,res)=>res.render('product-form',{title:'Thêm sản phẩm',product:null}));
app.get('/products/:id/image', safe(async(req,res)=>{
  const img=await db.getProductImage(req.params.id);
  if(!img?.image_data) return res.status(404).end();
  res.set('Content-Type',img.image_mime||'image/jpeg');
  res.set('Cache-Control','public, max-age=86400');
  res.send(img.image_data);
}));
app.post('/products',admin,upload.single('image'),safe(async(req,res)=>{
  await db.createProduct({name:req.body.name.trim(),sku:req.body.sku.trim()||null,price:+req.body.price||0,size:req.body.size.trim(),quantity:+req.body.quantity||0,image_data:req.file?.buffer||null,image_mime:req.file?.mimetype||null,note:req.body.note.trim()});
  res.redirect('/products');
}));
app.get('/products/:id/edit',admin,safe(async(req,res)=>res.render('product-form',{title:'Sửa sản phẩm',product:await db.findProductById(req.params.id)})));
app.post('/products/:id',admin,upload.single('image'),safe(async(req,res)=>{
  await db.updateProduct(req.params.id,{name:req.body.name.trim(),sku:req.body.sku.trim()||null,price:+req.body.price||0,size:req.body.size.trim(),quantity:+req.body.quantity||0,image_data:req.file?.buffer||null,image_mime:req.file?.mimetype||null,note:req.body.note.trim()});
  res.redirect('/products');
}));
app.post('/products/:id/delete',admin,safe(async(req,res)=>{await db.deleteProduct(req.params.id);res.redirect('/products');}));

app.get('/orders/new',login,safe(async(req,res)=>{
  if(req.session.user.role==='admin') return res.redirect('/orders');
  res.render('order-form',{title:'Tạo đơn mới',products:await db.listProducts()});
}));
app.post('/orders',login,safe(async(req,res)=>{
  if(req.session.user.role==='admin') return res.redirect('/orders');
  const p=await db.findProductById(req.body.product_id);
  if(!p){req.session.message={type:'error',text:'Sản phẩm không tồn tại.'};return res.redirect('/orders/new');}
  await db.createOrder({ctv_id:req.session.user.id,ctv_name:req.session.user.full_name,customer_name:req.body.customer_name.trim(),phone:req.body.phone.trim(),address:req.body.address.trim(),product_id:p.id,product_name:p.name,size:req.body.size.trim(),quantity:+req.body.quantity||1,cod:+req.body.cod||0,note:(req.body.note||'').trim()});
  req.session.message={type:'success',text:'Đã tạo đơn thành công.'};
  res.redirect('/my-orders');
}));
app.get('/my-orders',login,safe(async(req,res)=>{
  if(req.session.user.role==='admin') return res.redirect('/orders');
  res.render('orders',{title:'Đơn của tôi',orders:await db.listOrdersByCtv(req.session.user.id),adminView:false});
}));
app.get('/orders',admin,safe(async(req,res)=>res.render('orders',{title:'Đơn hàng',orders:await db.listOrders(),adminView:true})));
app.post('/orders/:id/status',admin,safe(async(req,res)=>{await db.updateOrderStatus(req.params.id,req.body.status);res.redirect('/orders');}));

app.get('/ctv',admin,safe(async(req,res)=>res.render('ctv',{title:'CTV',rows:await db.revenueByCtv()})));
app.get('/revenue',admin,safe(async(req,res)=>res.render('revenue',{title:'Doanh thu',rows:await db.revenueByCtv(),total:(await db.adminStats()).revenue})));
app.get('/users',admin,safe(async(req,res)=>res.render('users',{title:'Quản lý tài khoản',users:await db.listUsers()})));
app.post('/users/:id/delete',admin,safe(async(req,res)=>{if(+req.params.id!==req.session.user.id)await db.deleteUser(req.params.id);res.redirect('/users');}));

app.get('/change-password',login,(req,res)=>res.render('change-password',{title:'Đổi mật khẩu'}));
app.post('/change-password',login,safe(async(req,res)=>{
  const u=await db.findUserById(req.session.user.id);
  if(u&&bcrypt.compareSync(req.body.old_password||'',u.password_hash)&&req.body.new_password?.length>=6&&req.body.new_password===req.body.confirm_password){
    await db.updatePassword(u.id,bcrypt.hashSync(req.body.new_password,10));
    req.session.message={type:'success',text:'Đổi mật khẩu thành công.'};
  } else req.session.message={type:'error',text:'Thông tin mật khẩu chưa đúng.'};
  res.redirect('/change-password');
}));

app.use((err,req,res,next)=>{
  console.error(err);
  req.session.message={type:'error',text:'Có lỗi xảy ra. Vui lòng thử lại.'};
  res.status(500).redirect(req.get('referer')||'/dashboard');
});

(async()=>{
  try {
    await db.init();
    app.listen(PORT,'0.0.0.0',()=>console.log(`Bee Sneaker V5 đang chạy trên cổng ${PORT}`));
  } catch(err) {
    console.error('Không thể kết nối database:',err);
    process.exit(1);
  }
})();

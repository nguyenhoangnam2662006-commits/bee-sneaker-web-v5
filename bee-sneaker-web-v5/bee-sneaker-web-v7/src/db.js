const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL. Hãy tạo PostgreSQL trên Render và thêm DATABASE_URL vào Environment.');
}

const isLocal = (process.env.DATABASE_URL || '').includes('localhost') || (process.env.DATABASE_URL || '').includes('127.0.0.1');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'ctv' CHECK (role IN ('admin','ctv')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      sku VARCHAR(100) UNIQUE,
      price BIGINT NOT NULL DEFAULT 0,
      size TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      image_data BYTEA,
      image_mime VARCHAR(100),
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      ctv_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ctv_name VARCHAR(150) NOT NULL,
      customer_name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      address TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255) NOT NULL,
      size VARCHAR(50) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      base_cod BIGINT NOT NULL DEFAULT 0,
      shipping_type VARCHAR(20) NOT NULL DEFAULT 'freeship',
      shipping_fee BIGINT NOT NULL DEFAULT 0,
      product_cost BIGINT NOT NULL DEFAULT 0,
      tax_amount BIGINT NOT NULL DEFAULT 0,
      cod BIGINT NOT NULL DEFAULT 0,
      ctv_profit BIGINT NOT NULL DEFAULT 0,
      tracking_code VARCHAR(120) NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'Mới',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Migrate older V5 databases without deleting existing data
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ctv_profit BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(120) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_cod BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_type VARCHAR(20) NOT NULL DEFAULT 'freeship'`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_cost BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount BIGINT NOT NULL DEFAULT 0`);

  const admin = await pool.query('SELECT id FROM users WHERE username=$1', ['admin']);
  if (!admin.rowCount) {
    await pool.query(
      `INSERT INTO users(username,password_hash,full_name,role) VALUES($1,$2,$3,'admin')`,
      ['admin', bcrypt.hashSync('123456', 10), 'Chủ shop']
    );
  }

  const products = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if (products.rows[0].count === 0) {
    await pool.query(
      `INSERT INTO products(name,sku,price,size,quantity,note) VALUES
       ('Nike Air Force 1','AF1-WHITE',1250000,'38, 39, 40, 41, 42',12,'Sản phẩm mẫu'),
       ('Adidas Samba','SAMBA-BW',1450000,'39, 40, 41, 42',8,'Sản phẩm mẫu')`
    );
  }
}

function publicProduct(row) {
  if (!row) return null;
  const p = { ...row };
  p.image = p.image_data ? `/products/${p.id}/image` : null;
  delete p.image_data;
  delete p.image_mime;
  return p;
}

module.exports = {
  pool,
  init,

  async findUserByUsername(username) {
    const r = await pool.query('SELECT * FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1', [username]);
    return r.rows[0] || null;
  },
  async findUserById(id) {
    const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    return r.rows[0] || null;
  },
  async createUser(o) {
    const r = await pool.query(
      `INSERT INTO users(username,password_hash,full_name,role) VALUES($1,$2,$3,$4) RETURNING *`,
      [o.username, o.password_hash, o.full_name, o.role]
    );
    return r.rows[0];
  },
  async listUsers() {
    return (await pool.query('SELECT id,username,full_name,role,created_at FROM users ORDER BY id DESC')).rows;
  },
  async listCtvs() {
    return (await pool.query("SELECT id,username,full_name,created_at FROM users WHERE role='ctv' ORDER BY id DESC")).rows;
  },
  async deleteUser(id) {
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
  },
  async updatePassword(id, hash) {
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]);
  },

  async listProducts(q='') {
    const term = `%${q}%`;
    const r = q
      ? await pool.query(`SELECT id,name,sku,price,size,quantity,note,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products WHERE name ILIKE $1 OR COALESCE(sku,'') ILIKE $1 OR size ILIKE $1 ORDER BY id DESC`, [term])
      : await pool.query(`SELECT id,name,sku,price,size,quantity,note,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products ORDER BY id DESC`);
    return r.rows.map(p => ({...p, image: p.has_image ? `/products/${p.id}/image` : null}));
  },
  async findProductById(id) {
    const r = await pool.query(`SELECT id,name,sku,price,size,quantity,note,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products WHERE id=$1`, [id]);
    const p = r.rows[0];
    return p ? {...p, image: p.has_image ? `/products/${p.id}/image` : null} : null;
  },
  async getProductImage(id) {
    const r = await pool.query('SELECT image_data,image_mime FROM products WHERE id=$1', [id]);
    return r.rows[0] || null;
  },
  async createProduct(o) {
    const r = await pool.query(
      `INSERT INTO products(name,sku,price,size,quantity,image_data,image_mime,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [o.name, o.sku || null, o.price || 0, o.size || '', o.quantity || 0, o.image_data || null, o.image_mime || null, o.note || '']
    );
    return this.findProductById(r.rows[0].id);
  },
  async updateProduct(id, o) {
    if (o.image_data) {
      await pool.query(
        `UPDATE products SET name=$1,sku=$2,price=$3,size=$4,quantity=$5,image_data=$6,image_mime=$7,note=$8,updated_at=NOW() WHERE id=$9`,
        [o.name, o.sku || null, o.price || 0, o.size || '', o.quantity || 0, o.image_data, o.image_mime, o.note || '', id]
      );
    } else {
      await pool.query(
        `UPDATE products SET name=$1,sku=$2,price=$3,size=$4,quantity=$5,note=$6,updated_at=NOW() WHERE id=$7`,
        [o.name, o.sku || null, o.price || 0, o.size || '', o.quantity || 0, o.note || '', id]
      );
    }
    return this.findProductById(id);
  },
  async deleteProduct(id) {
    const old = await this.findProductById(id);
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    return old;
  },

  async createOrder(o) {
    const r = await pool.query(
      `INSERT INTO orders(ctv_id,ctv_name,customer_name,phone,address,product_id,product_name,size,quantity,base_cod,shipping_type,shipping_fee,product_cost,tax_amount,cod,ctv_profit,tracking_code,note,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'Mới') RETURNING *`,
      [o.ctv_id,o.ctv_name,o.customer_name,o.phone,o.address,o.product_id,o.product_name,o.size,o.quantity||1,o.base_cod||0,o.shipping_type||'freeship',o.shipping_fee||0,o.product_cost||0,o.tax_amount||0,o.cod||0,o.ctv_profit||0,o.tracking_code||'',o.note||'']
    );
    return r.rows[0];
  },
  async listOrders() {
    return (await pool.query('SELECT * FROM orders ORDER BY id DESC')).rows;
  },
  async listOrdersByCtv(id) {
    return (await pool.query('SELECT * FROM orders WHERE ctv_id=$1 ORDER BY id DESC', [id])).rows;
  },
  async findOrderById(id) {
    return (await pool.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0] || null;
  },
  async updateOrderStatus(id, status) {
    return (await pool.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [status,id])).rows[0] || null;
  },
  async updateOrderAdmin(id, { tracking_code }) {
    return (await pool.query(
      'UPDATE orders SET tracking_code=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [(tracking_code||'').trim(), id]
    )).rows[0] || null;
  },

  async adminStats() {
    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM products) AS products,
        (SELECT COALESCE(SUM(quantity),0)::bigint FROM products) AS quantity,
        (SELECT COUNT(*)::int FROM orders) AS orders,
        (SELECT COUNT(*)::int FROM users WHERE role='ctv') AS ctvs,
        (SELECT COALESCE(SUM(cod),0)::bigint FROM orders) AS revenue,
        (SELECT COALESCE(SUM(ctv_profit),0)::bigint FROM orders) AS ctv_profit
    `);
    const x = r.rows[0];
    return {products:+x.products,quantity:+x.quantity,orders:+x.orders,ctvs:+x.ctvs,revenue:+x.revenue,ctv_profit:+x.ctv_profit};
  },
  async ctvStats(id) {
    const r = await pool.query('SELECT COUNT(*)::int AS orders,COALESCE(SUM(cod),0)::bigint AS revenue,COALESCE(SUM(ctv_profit),0)::bigint AS profit FROM orders WHERE ctv_id=$1', [id]);
    return {orders:+r.rows[0].orders,revenue:+r.rows[0].revenue,profit:+r.rows[0].profit};
  },
  async latestProducts(n=5) {
    const r = await pool.query(`SELECT id,name,sku,price,size,quantity,note,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products ORDER BY id DESC LIMIT $1`, [n]);
    return r.rows.map(p=>({...p,image:p.has_image?`/products/${p.id}/image`:null}));
  },
  async latestOrders(n=5) {
    return (await pool.query('SELECT * FROM orders ORDER BY id DESC LIMIT $1', [n])).rows;
  },
  async revenueByCtv() {
    const r = await pool.query(`
      SELECT u.id,u.full_name,u.username,COUNT(o.id)::int AS orders,COALESCE(SUM(o.cod),0)::bigint AS revenue,COALESCE(SUM(o.ctv_profit),0)::bigint AS profit
      FROM users u LEFT JOIN orders o ON o.ctv_id=u.id
      WHERE u.role='ctv'
      GROUP BY u.id,u.full_name,u.username
      ORDER BY revenue DESC,u.id DESC
    `);
    return r.rows.map(x=>({...x,revenue:+x.revenue,profit:+x.profit}));
  }
};

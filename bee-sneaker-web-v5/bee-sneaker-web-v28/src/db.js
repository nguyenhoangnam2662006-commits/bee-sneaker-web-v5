const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

if (!process.env.DATABASE_URL) {
  console.error('Thiếu DATABASE_URL. Hãy tạo PostgreSQL trên Render và thêm DATABASE_URL vào Environment.');
}

const isLocal = (process.env.DATABASE_URL || '').includes('localhost') || (process.env.DATABASE_URL || '').includes('127.0.0.1');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  query_timeout: 15000,
  statement_timeout: 15000,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(30) UNIQUE,
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
      variant_prices JSONB NOT NULL DEFAULT '{}'::jsonb,
      size TEXT NOT NULL DEFAULT '',
      size_stock JSONB NOT NULL DEFAULT '{}'::jsonb,
      quantity INTEGER NOT NULL DEFAULT 0,
      image_data BYTEA,
      image_mime VARCHAR(100),
      note TEXT NOT NULL DEFAULT '',
      product_group VARCHAR(120) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      image_data BYTEA NOT NULL,
      image_mime VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id);

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      ctv_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ctv_name VARCHAR(150) NOT NULL,
      customer_name VARCHAR(150) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      address TEXT NOT NULL,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255) NOT NULL,
      product_variant VARCHAR(80) NOT NULL DEFAULT '',
      variant_unit_price BIGINT NOT NULL DEFAULT 0,
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
      cancel_reason TEXT NOT NULL DEFAULT '',
      cancelled_at TIMESTAMPTZ,
      ctv_paid BOOLEAN NOT NULL DEFAULT FALSE,
      ctv_paid_at TIMESTAMPTZ,
      settlement_code VARCHAR(80) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name VARCHAR(255) NOT NULL,
      product_variant VARCHAR(80) NOT NULL DEFAULT '',
      variant_unit_price BIGINT NOT NULL DEFAULT 0,
      size VARCHAR(50) NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      line_total BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name VARCHAR(150) NOT NULL DEFAULT '',
      actor_role VARCHAR(30) NOT NULL DEFAULT '',
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(60) NOT NULL DEFAULT '',
      entity_id VARCHAR(100) NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip VARCHAR(100) NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC);
  `);

  // Migrate older V5 databases without deleting existing data
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ctv_profit BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code VARCHAR(120) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_failed_login_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL AND phone <> ''`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ctv_paid BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ctv_paid_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_code VARCHAR(80) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS base_cod BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_type VARCHAR(20) NOT NULL DEFAULT 'freeship'`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_cost BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_prices JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS size_stock JSONB NOT NULL DEFAULT '{}'::jsonb`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_group VARCHAR(120) NOT NULL DEFAULT ''`);
  await pool.query(`UPDATE products SET product_group='Samba' WHERE COALESCE(product_group,'')='' AND name ILIKE '%samba%'`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_variant VARCHAR(80) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_unit_price BIGINT NOT NULL DEFAULT 0`);
  await pool.query(`UPDATE products SET variant_prices=jsonb_build_object('Best', price) WHERE (variant_prices='{}'::jsonb OR variant_prices IS NULL) AND price>0`);

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
  async ping() {
    await pool.query('SELECT 1');
    return true;
  },
  async close() {
    await pool.end();
  },

  async findUserByUsername(username) {
    const value = String(username || '').trim();
    const r = await pool.query('SELECT * FROM users WHERE LOWER(username)=LOWER($1) OR phone=$1 LIMIT 1', [value]);
    return r.rows[0] || null;
  },
  async findUserById(id) {
    const r = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    return r.rows[0] || null;
  },
  async createUser(o) {
    const r = await pool.query(
      `INSERT INTO users(username,phone,password_hash,full_name,role) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [o.username, o.phone || null, o.password_hash, o.full_name, o.role]
    );
    return r.rows[0];
  },
  async listUsers() {
    return (await pool.query('SELECT id,username,phone,full_name,role,failed_login_count,locked_until,last_login_at,created_at FROM users ORDER BY id DESC')).rows;
  },
  async listCtvs() {
    return (await pool.query("SELECT id,username,phone,full_name,created_at FROM users WHERE role='ctv' ORDER BY id DESC")).rows;
  },
  async deleteUser(id) {
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
  },
  async deleteCtv(id) {
    const r = await pool.query("DELETE FROM users WHERE id=$1 AND role='ctv' RETURNING id,full_name,username,phone", [id]);
    return r.rows[0] || null;
  },
  async updatePassword(id, hash) {
    await pool.query('UPDATE users SET password_hash=$1,failed_login_count=0,first_failed_login_at=NULL,locked_until=NULL WHERE id=$2', [hash, id]);
  },

  async recordLoginFailure(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query('SELECT id,failed_login_count,first_failed_login_at,locked_until FROM users WHERE id=$1 FOR UPDATE', [id]);
      const u = r.rows[0];
      if (!u) { await client.query('ROLLBACK'); return null; }
      const now = new Date();
      const windowMs = 15 * 60 * 1000;
      const first = u.first_failed_login_at ? new Date(u.first_failed_login_at) : null;
      let count = (!first || now - first > windowMs) ? 1 : Number(u.failed_login_count || 0) + 1;
      let firstAt = (!first || now - first > windowMs) ? now : first;
      let lockedUntil = u.locked_until && new Date(u.locked_until) > now ? new Date(u.locked_until) : null;
      if (count >= 5) {
        lockedUntil = new Date(now.getTime() + 15 * 60 * 1000);
        count = 5;
      }
      await client.query('UPDATE users SET failed_login_count=$1,first_failed_login_at=$2,locked_until=$3 WHERE id=$4', [count, firstAt, lockedUntil, id]);
      await client.query('COMMIT');
      return { failed_login_count: count, locked_until: lockedUntil };
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally { client.release(); }
  },
  async resetLoginFailures(id) {
    await pool.query('UPDATE users SET failed_login_count=0,first_failed_login_at=NULL,locked_until=NULL,last_login_at=NOW() WHERE id=$1', [id]);
  },
  async addAuditLog(entry={}) {
    await pool.query(
      `INSERT INTO audit_logs(actor_user_id,actor_name,actor_role,action,entity_type,entity_id,details,ip,user_agent)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [entry.actor_user_id || null, entry.actor_name || '', entry.actor_role || '', entry.action || 'unknown', entry.entity_type || '', String(entry.entity_id || ''), JSON.stringify(entry.details || {}), entry.ip || '', entry.user_agent || '']
    );
  },
  async listAuditLogs(limit=300) {
    const n = Math.max(1, Math.min(1000, Number(limit) || 300));
    return (await pool.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT $1', [n])).rows;
  },

  async listProducts(q='') {
    const term = `%${q}%`;
    const r = q
      ? await pool.query(`SELECT id,name,sku,price,variant_prices,size,size_stock,quantity,note,product_group,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products WHERE name ILIKE $1 OR COALESCE(sku,'') ILIKE $1 OR size ILIKE $1 OR COALESCE(product_group,'') ILIKE $1 ORDER BY product_group ASC,name ASC,id DESC`, [term])
      : await pool.query(`SELECT id,name,sku,price,variant_prices,size,size_stock,quantity,note,product_group,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products ORDER BY product_group ASC,name ASC,id DESC`);
    return r.rows.map(p => ({...p, image: p.has_image ? `/products/${p.id}/image` : null}));
  },
  async findProductById(id) {
    const r = await pool.query(`SELECT id,name,sku,price,variant_prices,size,size_stock,quantity,note,product_group,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products WHERE id=$1`, [id]);
    const p = r.rows[0];
    return p ? {...p, image: p.has_image ? `/products/${p.id}/image` : null} : null;
  },
  async getProductImage(id) {
    const r = await pool.query('SELECT image_data,image_mime FROM products WHERE id=$1', [id]);
    return r.rows[0] || null;
  },
  async listProductImages(productId) {
    const r = await pool.query('SELECT id,product_id,image_mime,sort_order,created_at FROM product_images WHERE product_id=$1 ORDER BY sort_order ASC,id ASC', [productId]);
    return r.rows.map(x => ({ ...x, url: `/products/images/${x.id}` }));
  },
  async getGalleryImage(imageId) {
    const r = await pool.query('SELECT image_data,image_mime FROM product_images WHERE id=$1', [imageId]);
    return r.rows[0] || null;
  },
  async addProductImages(productId, images=[]) {
    if (!images.length) return [];
    const current = await pool.query('SELECT COALESCE(MAX(sort_order),-1)::int AS max FROM product_images WHERE product_id=$1', [productId]);
    let sort = Number(current.rows[0]?.max || -1) + 1;
    const added = [];
    for (const img of images.slice(0, 8)) {
      const r = await pool.query(
        'INSERT INTO product_images(product_id,image_data,image_mime,sort_order) VALUES($1,$2,$3,$4) RETURNING id,product_id,image_mime,sort_order,created_at',
        [productId, img.image_data, img.image_mime || 'image/jpeg', sort++]
      );
      added.push({ ...r.rows[0], url: `/products/images/${r.rows[0].id}` });
    }
    return added;
  },
  async deleteProductImage(productId, imageId) {
    await pool.query('DELETE FROM product_images WHERE id=$1 AND product_id=$2', [imageId, productId]);
  },
  async createProduct(o) {
    const r = await pool.query(
      `INSERT INTO products(name,sku,price,variant_prices,size,size_stock,quantity,image_data,image_mime,note,product_group) VALUES($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id`,
      [o.name, o.sku || null, o.price || 0, JSON.stringify(o.variant_prices || {}), o.size || '', JSON.stringify(o.size_stock || {}), o.quantity || 0, o.image_data || null, o.image_mime || null, o.note || '', o.product_group || '']
    );
    return this.findProductById(r.rows[0].id);
  },
  async updateProduct(id, o) {
    if (o.image_data) {
      await pool.query(
        `UPDATE products SET name=$1,sku=$2,price=$3,variant_prices=$4::jsonb,size=$5,size_stock=$6::jsonb,quantity=$7,image_data=$8,image_mime=$9,note=$10,product_group=$11,updated_at=NOW() WHERE id=$12`,
        [o.name, o.sku || null, o.price || 0, JSON.stringify(o.variant_prices || {}), o.size || '', JSON.stringify(o.size_stock || {}), o.quantity || 0, o.image_data, o.image_mime, o.note || '', o.product_group || '', id]
      );
    } else {
      await pool.query(
        `UPDATE products SET name=$1,sku=$2,price=$3,variant_prices=$4::jsonb,size=$5,size_stock=$6::jsonb,quantity=$7,note=$8,product_group=$9,updated_at=NOW() WHERE id=$10`,
        [o.name, o.sku || null, o.price || 0, JSON.stringify(o.variant_prices || {}), o.size || '', JSON.stringify(o.size_stock || {}), o.quantity || 0, o.note || '', o.product_group || '', id]
      );
    }
    return this.findProductById(id);
  },
  async deleteProduct(id) {
    const old = await this.findProductById(id);
    await pool.query('DELETE FROM products WHERE id=$1', [id]);
    return old;
  },

  async createCartOrder(o, items=[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Khóa và trừ tồn kho theo size để tránh hai CTV mua cùng một đôi cuối cùng.
      for (const item of items) {
        const pr = await client.query('SELECT id,size,size_stock,quantity FROM products WHERE id=$1 FOR UPDATE', [item.product_id]);
        const product = pr.rows[0];
        if (!product) throw new Error(`Sản phẩm ${item.product_name} không còn tồn tại.`);
        const rawStock = product.size_stock && Object.keys(product.size_stock).length ? { ...product.size_stock } : null;
        const qty = Number(item.quantity || 1);
        const stockValues = rawStock ? Object.values(rawStock).map(v => Number(v) || 0) : [];
        const hasPositiveSizeStock = stockValues.some(v => v > 0);
        // Tương thích dữ liệu cũ: nếu size_stock chỉ toàn 0 nhưng quantity cũ vẫn > 0,
        // coi sản phẩm là chưa được chia tồn theo size và tiếp tục dùng tồn tổng.
        const usePerSizeStock = !!rawStock && (hasPositiveSizeStock || Number(product.quantity || 0) <= 0);
        if (usePerSizeStock) {
          const available = Number(rawStock[item.size] || 0);
          if (available < qty) throw new Error(`Size ${item.size} của ${item.product_name} chỉ còn ${available} đôi.`);
          rawStock[item.size] = available - qty;
          const total = Object.values(rawStock).reduce((n,v)=>n+(Number(v)||0),0);
          await client.query('UPDATE products SET size_stock=$1::jsonb,quantity=$2,updated_at=NOW() WHERE id=$3',[JSON.stringify(rawStock), total, item.product_id]);
        } else {
          const available = Number(product.quantity||0);
          if (available < qty) throw new Error(`${item.product_name} chỉ còn ${available} đôi.`);
          await client.query('UPDATE products SET quantity=quantity-$1,updated_at=NOW() WHERE id=$2',[qty,item.product_id]);
        }
      }
      const r = await client.query(
        `INSERT INTO orders(ctv_id,ctv_name,customer_name,phone,address,product_id,product_name,product_variant,variant_unit_price,size,quantity,base_cod,shipping_type,shipping_fee,product_cost,tax_amount,cod,ctv_profit,tracking_code,note,status)
         VALUES($1,$2,$3,$4,$5,NULL,$6,'',0,'',$7,$8,$9,$10,$11,$12,$13,$14,'',$15,'Mới') RETURNING *`,
        [o.ctv_id,o.ctv_name,o.customer_name,o.phone,o.address,o.product_name||`${items.length} sản phẩm`,o.quantity||0,o.base_cod||0,o.shipping_type||'freeship',o.shipping_fee||0,o.product_cost||0,o.tax_amount||0,o.cod||0,o.ctv_profit||0,o.note||'']
      );
      const order = r.rows[0];
      for (const item of items) {
        await client.query(
          `INSERT INTO order_items(order_id,product_id,product_name,product_variant,variant_unit_price,size,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [order.id,item.product_id,item.product_name,item.product_variant||'',item.variant_unit_price||0,item.size||'',item.quantity||1,item.line_total||0]
        );
      }
      await client.query('COMMIT');
      return { ...order, items };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  },

  async listOrderItems(orderId) {
    return (await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id ASC',[orderId])).rows;
  },

  async attachOrderItems(rows) {
    if (!rows.length) return rows;
    const ids = rows.map(x=>x.id);
    const r = await pool.query('SELECT * FROM order_items WHERE order_id = ANY($1::int[]) ORDER BY id ASC',[ids]);
    const by = {};
    for (const item of r.rows) (by[item.order_id] ||= []).push(item);
    return rows.map(o=>({ ...o, items: by[o.id] || [] }));
  },

  async createOrder(o) {
    const r = await pool.query(
      `INSERT INTO orders(ctv_id,ctv_name,customer_name,phone,address,product_id,product_name,product_variant,variant_unit_price,size,quantity,base_cod,shipping_type,shipping_fee,product_cost,tax_amount,cod,ctv_profit,tracking_code,note,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'Mới') RETURNING *`,
      [o.ctv_id,o.ctv_name,o.customer_name,o.phone,o.address,o.product_id,o.product_name,o.product_variant||'',o.variant_unit_price||0,o.size,o.quantity||1,o.base_cod||0,o.shipping_type||'freeship',o.shipping_fee||0,o.product_cost||0,o.tax_amount||0,o.cod||0,o.ctv_profit||0,o.tracking_code||'',o.note||'']
    );
    return r.rows[0];
  },
  async listOrders() {
    return this.attachOrderItems((await pool.query('SELECT * FROM orders ORDER BY id DESC')).rows);
  },
  async listOrdersByCtv(id) {
    return this.attachOrderItems((await pool.query('SELECT * FROM orders WHERE ctv_id=$1 ORDER BY id DESC', [id])).rows);
  },
  async findOrderById(id) {
    const row=(await pool.query('SELECT * FROM orders WHERE id=$1', [id])).rows[0] || null;
    if (!row) return null;
    row.items = await this.listOrderItems(id);
    return row;
  },
  async updateOrderStatus(id, status) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = (await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!current) { await client.query('ROLLBACK'); return null; }

      const oldStatus = current.status;
      const newStatus = String(status || '').trim();
      const wasCancelled = oldStatus === 'Hủy';
      const willCancel = newStatus === 'Hủy';

      let items = (await client.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id ASC', [id])).rows;
      // Hỗ trợ các đơn cũ trước khi có order_items.
      if (!items.length && current.product_id) {
        items = [{
          product_id: current.product_id,
          product_name: current.product_name,
          size: current.size,
          quantity: current.quantity || 1,
        }];
      }

      const adjustStock = async (direction) => {
        for (const item of items) {
          if (!item.product_id) continue;
          const pr = await client.query('SELECT id,size_stock,quantity FROM products WHERE id=$1 FOR UPDATE', [item.product_id]);
          const product = pr.rows[0];
          if (!product) continue;
          const qty = Number(item.quantity || 1);
          const stock = product.size_stock && Object.keys(product.size_stock).length ? { ...product.size_stock } : null;
          const stockValues = stock ? Object.values(stock).map(v => Number(v) || 0) : [];
          const usePerSizeStock = !!stock && (stockValues.some(v => v > 0) || Number(product.quantity || 0) <= 0);
          if (usePerSizeStock) {
            const cur = Number(stock[item.size] || 0);
            if (direction < 0 && cur < qty) {
              throw new Error(`Không đủ tồn kho size ${item.size} của ${item.product_name} để mở lại đơn.`);
            }
            stock[item.size] = cur + direction * qty;
            const total = Object.values(stock).reduce((n,v)=>n+(Number(v)||0),0);
            await client.query('UPDATE products SET size_stock=$1::jsonb,quantity=$2,updated_at=NOW() WHERE id=$3', [JSON.stringify(stock), total, item.product_id]);
          } else {
            if (direction < 0 && Number(product.quantity || 0) < qty) {
              throw new Error(`Không đủ tồn kho của ${item.product_name} để mở lại đơn.`);
            }
            await client.query('UPDATE products SET quantity=quantity+$1,updated_at=NOW() WHERE id=$2', [direction * qty, item.product_id]);
          }
        }
      };

      // Chỉ hoàn kho đúng 1 lần khi chuyển từ trạng thái khác sang Hủy.
      if (!wasCancelled && willCancel) await adjustStock(1);
      // Nếu admin mở lại đơn đã hủy, phải giữ kho lại và kiểm tra tồn trước.
      if (wasCancelled && !willCancel) await adjustStock(-1);

      const updated = (await client.query(
        `UPDATE orders
         SET status=$1::varchar,
             cancel_reason=CASE WHEN $1::varchar='Hủy'::varchar THEN cancel_reason ELSE '' END,
             cancelled_at=CASE WHEN $1::varchar='Hủy'::varchar THEN COALESCE(cancelled_at,NOW()) ELSE NULL END,
             updated_at=NOW()
         WHERE id=$2
         RETURNING *`,
        [newStatus, id]
      )).rows[0] || null;

      await client.query('COMMIT');
      return updated;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async cancelOrderByCtv(id, ctvId, reason) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const allowed = ['Mới','Chờ xác nhận'];
      const r = await client.query(
        `UPDATE orders SET status='Hủy', cancel_reason=$1, cancelled_at=NOW(), updated_at=NOW()
         WHERE id=$2 AND ctv_id=$3 AND status = ANY($4::text[]) RETURNING *`,
        [(reason||'').trim(), id, ctvId, allowed]
      );
      const order = r.rows[0];
      if (!order) { await client.query('ROLLBACK'); return null; }
      const items = (await client.query('SELECT * FROM order_items WHERE order_id=$1',[id])).rows;
      for (const item of items) {
        if (!item.product_id) continue;
        const pr = await client.query('SELECT id,size_stock,quantity FROM products WHERE id=$1 FOR UPDATE',[item.product_id]);
        const product = pr.rows[0]; if (!product) continue;
        const qty = Number(item.quantity||1);
        const stock = product.size_stock && Object.keys(product.size_stock).length ? { ...product.size_stock } : null;
        if (stock) {
          stock[item.size] = Number(stock[item.size]||0) + qty;
          const total = Object.values(stock).reduce((n,v)=>n+(Number(v)||0),0);
          await client.query('UPDATE products SET size_stock=$1::jsonb,quantity=$2,updated_at=NOW() WHERE id=$3',[JSON.stringify(stock),total,item.product_id]);
        } else {
          await client.query('UPDATE products SET quantity=quantity+$1,updated_at=NOW() WHERE id=$2',[qty,item.product_id]);
        }
      }
      await client.query('COMMIT');
      return order;
    } catch(e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },
  async deleteCancelledOrder(id) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = (await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0] || null;
      if (!order) { await client.query('ROLLBACK'); return { ok:false, reason:'not_found' }; }
      if (order.status !== 'Hủy') { await client.query('ROLLBACK'); return { ok:false, reason:'not_cancelled', order }; }
      // Đơn đã hủy đã được hoàn kho khi chuyển sang trạng thái Hủy.
      // Xóa ở đây KHÔNG tác động tồn kho lần nữa để tránh cộng kho hai lần.
      await client.query('DELETE FROM orders WHERE id=$1', [id]);
      await client.query('COMMIT');
      return { ok:true, order };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async updateOrderAdmin(id, { tracking_code }) {
    return (await pool.query(
      'UPDATE orders SET tracking_code=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [(tracking_code||'').trim(), id]
    )).rows[0] || null;
  },

  async updateOrderCustomerByCtv(id, ctvId, { customer_name, phone, address, note }) {
    return (await pool.query(
      `UPDATE orders
       SET customer_name=$1, phone=$2, address=$3, note=$4, updated_at=NOW()
       WHERE id=$5 AND ctv_id=$6
       RETURNING *`,
      [customer_name, phone, address, note || '', id, ctvId]
    )).rows[0] || null;
  },

  async adminStats() {
    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM products) AS products,
        (SELECT COALESCE(SUM(quantity),0)::bigint FROM products) AS quantity,
        (SELECT COUNT(*)::int FROM orders WHERE status <> 'Hủy') AS orders,
        (SELECT COUNT(*)::int FROM users WHERE role='ctv') AS ctvs,
        (SELECT COALESCE(SUM(cod),0)::bigint FROM orders WHERE status NOT IN ('Hủy','Hoàn')) AS revenue,
        (SELECT COALESCE(SUM(CASE WHEN status='Hoàn' THEN -45000 WHEN status='Hủy' THEN 0 ELSE ctv_profit END),0)::bigint FROM orders) AS ctv_profit
    `);
    const x = r.rows[0];
    return {products:+x.products,quantity:+x.quantity,orders:+x.orders,ctvs:+x.ctvs,revenue:+x.revenue,ctv_profit:+x.ctv_profit};
  },
  async ctvStats(id) {
    const r = await pool.query(`SELECT COUNT(*) FILTER (WHERE status <> 'Hủy')::int AS orders,COALESCE(SUM(cod) FILTER (WHERE status NOT IN ('Hủy','Hoàn')),0)::bigint AS revenue,COALESCE(SUM(CASE WHEN status='Hoàn' THEN -45000 WHEN status='Hủy' THEN 0 ELSE ctv_profit END),0)::bigint AS profit FROM orders WHERE ctv_id=$1`, [id]);
    return {orders:+r.rows[0].orders,revenue:+r.rows[0].revenue,profit:+r.rows[0].profit};
  },
  async latestProducts(n=5) {
    const r = await pool.query(`SELECT id,name,sku,price,variant_prices,size,size_stock,quantity,note,product_group,created_at,updated_at,(image_data IS NOT NULL) AS has_image FROM products ORDER BY product_group ASC,name ASC,id DESC LIMIT $1`, [n]);
    return r.rows.map(p=>({...p,image:p.has_image?`/products/${p.id}/image`:null}));
  },
  async latestOrders(n=5) {
    return this.attachOrderItems((await pool.query("SELECT * FROM orders WHERE status <> 'Hủy' ORDER BY id DESC LIMIT $1", [n])).rows);
  },
  async revenueByCtv() {
    const r = await pool.query(`
      SELECT
        u.id,u.full_name,u.username,u.phone,
        COUNT(o.id)::int AS total_orders,
        COUNT(o.id) FILTER (WHERE o.status='Hoàn thành')::int AS completed_orders,
        COUNT(o.id) FILTER (WHERE o.status='Hoàn')::int AS returned_orders,
        COUNT(o.id) FILTER (WHERE o.status='Hủy')::int AS cancelled_orders,
        COALESCE(SUM(o.cod) FILTER (WHERE o.status NOT IN ('Hủy','Hoàn')),0)::bigint AS revenue,
        COALESCE(SUM(o.ctv_profit) FILTER (WHERE o.status NOT IN ('Hủy','Hoàn')),0)::bigint AS sales_profit,
        (COUNT(o.id) FILTER (WHERE o.status='Hoàn') * 45000)::bigint AS return_fee,
        COALESCE(SUM(CASE WHEN o.status='Hoàn' THEN -45000 WHEN o.status='Hủy' THEN 0 ELSE o.ctv_profit END),0)::bigint AS profit
      FROM users u LEFT JOIN orders o ON o.ctv_id=u.id
      WHERE u.role='ctv'
      GROUP BY u.id,u.full_name,u.username,u.phone
      ORDER BY profit DESC,u.id DESC
    `);
    return r.rows.map(x=>({
      ...x,
      total_orders:+x.total_orders, completed_orders:+x.completed_orders, returned_orders:+x.returned_orders,
      cancelled_orders:+x.cancelled_orders, revenue:+x.revenue, sales_profit:+x.sales_profit,
      return_fee:+x.return_fee, profit:+x.profit
    }));
  },

  async ctvRevenueDetail(id) {
    const user = (await pool.query("SELECT id,full_name,username,phone FROM users WHERE id=$1 AND role='ctv'", [id])).rows[0] || null;
    if (!user) return null;
    const orders = await this.attachOrderItems((await pool.query(`
      SELECT *,
        CASE WHEN status='Hoàn' THEN -45000 WHEN status='Hủy' THEN 0 ELSE ctv_profit END AS reconciled_profit
      FROM orders WHERE ctv_id=$1 ORDER BY id DESC
    `,[id])).rows);
    const summary = orders.reduce((a,o)=>{
      a.total_orders++;
      if(o.status==='Hoàn thành') a.completed_orders++;
      if(o.status==='Hoàn') a.returned_orders++;
      if(o.status==='Hủy') a.cancelled_orders++;
      if(!['Hủy','Hoàn'].includes(o.status)) { a.revenue += Number(o.cod||0); a.sales_profit += Number(o.ctv_profit||0); }
      if(o.status==='Hoàn') a.return_fee += 45000;
      a.profit += Number(o.reconciled_profit||0);
      return a;
    },{total_orders:0,completed_orders:0,returned_orders:0,cancelled_orders:0,revenue:0,sales_profit:0,return_fee:0,profit:0});
    summary.unpaid_profit = orders.reduce((n,o)=> n + ((!o.ctv_paid && ['Hoàn thành','Hoàn'].includes(o.status)) ? Number(o.reconciled_profit||0) : 0), 0);
    summary.paid_profit = orders.reduce((n,o)=> n + ((o.ctv_paid && ['Hoàn thành','Hoàn'].includes(o.status)) ? Number(o.reconciled_profit||0) : 0), 0);
    summary.unpaid_orders = orders.filter(o=>!o.ctv_paid && ['Hoàn thành','Hoàn'].includes(o.status)).length;
    summary.paid_orders = orders.filter(o=>o.ctv_paid && ['Hoàn thành','Hoàn'].includes(o.status)).length;
    return { user, summary, orders };
  },

  async settleCtvOrders(ctvId, orderIds=[]) {
    const ids = [...new Set((orderIds||[]).map(x=>Number(x)).filter(Number.isInteger))];
    if (!ids.length) return null;
    const code = `DS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(ctvId).padStart(3,'0')}-${Date.now().toString().slice(-6)}`;
    const r = await pool.query(`
      UPDATE orders SET ctv_paid=TRUE, ctv_paid_at=NOW(), settlement_code=$1, updated_at=NOW()
      WHERE ctv_id=$2 AND id = ANY($3::int[]) AND ctv_paid=FALSE AND status IN ('Hoàn thành','Hoàn')
      RETURNING id,ctv_profit,status,ctv_paid_at,settlement_code`, [code, ctvId, ids]);
    return { code, orders: r.rows };
  },

  async settleAllCtvOrders(ctvId) {
    const code = `DS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(ctvId).padStart(3,'0')}-${Date.now().toString().slice(-6)}`;
    const r = await pool.query(`
      UPDATE orders SET ctv_paid=TRUE, ctv_paid_at=NOW(), settlement_code=$1, updated_at=NOW()
      WHERE ctv_id=$2 AND ctv_paid=FALSE AND status IN ('Hoàn thành','Hoàn')
      RETURNING id,ctv_profit,status,ctv_paid_at,settlement_code`, [code, ctvId]);
    return { code, orders: r.rows };
  },
  async setCtvProfitStatus(ctvId, orderId, success) {
    if (success) {
      const code = `DS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(ctvId).padStart(3,'0')}-${Date.now().toString().slice(-6)}`;
      const r = await pool.query(`
        UPDATE orders
        SET ctv_paid=TRUE, ctv_paid_at=NOW(),
            settlement_code=CASE WHEN settlement_code='' THEN $1 ELSE settlement_code END, updated_at=NOW()
        WHERE id=$2 AND ctv_id=$3 AND status IN ('Hoàn thành','Hoàn')
        RETURNING *`, [code, orderId, ctvId]);
      return r.rows[0] || null;
    }
    const r = await pool.query(`
      UPDATE orders SET ctv_paid=FALSE, ctv_paid_at=NULL, settlement_code='', updated_at=NOW()
      WHERE id=$1 AND ctv_id=$2 AND status IN ('Hoàn thành','Hoàn')
      RETURNING *`, [orderId, ctvId]);
    return r.rows[0] || null;
  }
};

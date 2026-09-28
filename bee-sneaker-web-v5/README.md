# Bee Sneaker V5 — PostgreSQL Online

Bản V5 dành cho deploy Render. Dữ liệu tài khoản, sản phẩm, đơn hàng, CTV, COD/doanh thu và ảnh sản phẩm đều được lưu trong PostgreSQL nên không mất khi Web Service restart/deploy lại.

## Tài khoản chủ shop mặc định
- Username: `admin`
- Password: `123456`

**Hãy đổi mật khẩu ngay sau lần đăng nhập đầu tiên.**

## Chạy local
V5 cần PostgreSQL. Tạo file `.env` hoặc đặt biến môi trường:

- `DATABASE_URL=postgresql://...`
- `SESSION_SECRET=mot-chuoi-bi-mat-dai`

Sau đó:

```bash
npm install
npm start
```

## Deploy lên Render

### 1. Upload source lên GitHub
Upload toàn bộ file của V5 lên repository. Không upload `node_modules`.

### 2. Tạo PostgreSQL trên Render
- Dashboard Render → New → PostgreSQL
- Tạo database (ví dụ `bee-sneaker-db`)
- Sau khi tạo xong, lấy **Internal Database URL** hoặc kết nối database với Web Service qua Environment.

### 3. Tạo Web Service
- New → Web Service
- Chọn repository GitHub chứa V5
- Runtime/Language: Node
- Build Command: `npm install`
- Start Command: `npm start`

### 4. Environment Variables
Thêm:

- `DATABASE_URL` = URL PostgreSQL từ Render
- `SESSION_SECRET` = chuỗi bí mật dài, ví dụ tự tạo 30–60 ký tự
- `NODE_ENV` = `production`

### 5. Deploy
Sau khi deploy thành công, Render cấp URL dạng:

`https://ten-web-cua-ban.onrender.com`

CTV có thể mở link này bằng điện thoại/4G/Wi-Fi bất kỳ để đăng ký và tạo đơn.

## Điểm khác V4
- Không còn lưu dữ liệu bằng JSON local.
- Session đăng nhập được lưu trong PostgreSQL.
- Ảnh sản phẩm lưu trong PostgreSQL thay vì thư mục `uploads`.
- Server bind `0.0.0.0` và dùng `process.env.PORT`, phù hợp Render.

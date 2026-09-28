# Bee Sneaker V8 — Hardened / ổn định hơn

V8 giữ nguyên PostgreSQL và chức năng V7, nhưng thêm các lớp bảo vệ để giảm nguy cơ web bị treo do spam hoặc lỗi vận hành.

## Các thay đổi chính

- Global rate limit: giới hạn số request/IP trong 15 phút.
- Rate limit riêng cho đăng nhập, đăng ký và đổi mật khẩu.
- Rate limit riêng cho thao tác ghi dữ liệu (tạo đơn, sửa đơn, sản phẩm, tài khoản).
- Helmet security headers.
- Compression giảm băng thông.
- Giới hạn body 100 KB và ảnh tối đa 5 MB.
- Validation/giới hạn độ dài dữ liệu đầu vào.
- Session cookie an toàn hơn; session rolling 8 giờ.
- Session store PostgreSQL tự dọn session cũ.
- PostgreSQL pool giới hạn kết nối và timeout query để tránh treo dài.
- `/healthz` để Render/Uptime monitor kiểm tra web + database.
- Graceful shutdown khi Render restart/deploy.
- Request ID trong log để dễ tìm lỗi.
- 404 và error handler an toàn hơn.

## Biến môi trường nên có trên Render

- `DATABASE_URL` — đã có.
- `NODE_ENV=production` — đã có.
- `SESSION_SECRET` — **nên thêm** một chuỗi ngẫu nhiên dài, ví dụ 48–64 ký tự.
- `DB_POOL_MAX=10` — tùy chọn, mặc định 10.

## Render Health Check

Nếu Render cho nhập Health Check Path, đặt:

`/healthz`

## Lưu ý

Không có web nào “không thể sập”. V8 chủ yếu giúp giảm rủi ro spam, request quá lớn, query treo, brute-force đăng nhập và restart không sạch. Gói Render Free vẫn có giới hạn CPU/RAM và có thể sleep khi không hoạt động.

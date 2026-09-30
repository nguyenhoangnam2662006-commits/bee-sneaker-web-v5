# Bee Sneaker V32 — Chủ shop duyệt CTV (không cần OTP)

Kế thừa V30/V31, giữ nguyên sản phẩm, đơn, giỏ hàng, đối soát và PostgreSQL.

## Đăng ký mới
1. CTV nhập họ tên, SĐT Việt Nam, mật khẩu ít nhất 8 ký tự có chữ và số.
2. Hệ thống tạo tài khoản ở trạng thái **pending/chờ duyệt**, không cho đăng nhập hay lên đơn.
3. Chủ shop mở **Quản lý tài khoản → CTV chờ duyệt**, chọn **Duyệt** hoặc **Từ chối**.
4. Chỉ sau khi duyệt CTV mới đăng nhập được. Từ chối/xóa tài khoản sẽ cắt quyền phiên CTV còn mở. Tài khoản cũ tự giữ trạng thái approved khi database migrate.
5. Mỗi SĐT chỉ có một tài khoản; đăng ký giới hạn 5 lần/giờ/IP theo cấu hình sẵn.

**Không cần eSMS hoặc OTP, không tốn SMS.** SĐT không được xác minh quyền sở hữu tự động: chủ shop nên gọi điện hoặc xác nhận qua Zalo trước khi duyệt. Tài khoản bị từ chối vẫn giữ SĐT để tránh tái đăng ký hàng loạt; admin có thể xóa tài khoản đó nếu cần.

## Deploy Render
- Backup database trước khi update.
- Upload `bee-sneaker-web-v32` vào GitHub.
- Root Directory: `bee-sneaker-web-v5/bee-sneaker-web-v32/`
- Build: `npm install`, Start: `npm start`.
- Giữ `DATABASE_URL`, `SESSION_SECRET` ổn định và `NODE_ENV=production`.
- Có thể xóa các biến `ESMS_*` trên Render vì V32 không sử dụng nữa.
- Test đăng ký CTV mới → login thấy chờ duyệt → Admin duyệt → login CTV → tạo đơn. Test từ chối và khóa phiên.

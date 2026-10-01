# Bee Sneaker V34 — CSKH + tra cứu GHSV theo quyền

V34 dựa trên V33 và giữ nguyên PostgreSQL hiện tại.

## Tính năng mới
- CTV tạo yêu cầu CSKH gắn trực tiếp với **đơn hàng**: Hối lấy hàng, Hối giao, Giao lại, Khách hẹn ngày, Khách không nghe máy, Sai địa chỉ, Yêu cầu hoàn, Khác.
- Chủ shop có trang **CSKH** xem toàn bộ ticket, cập nhật `Mới / Đang xử lý / Đã xử lý` và phản hồi.
- CTV chỉ xem/tạo ticket cho **đơn của chính mình**. Admin xem được tất cả.
- Tra mã vận đơn GHSV ngay trong Bee Sneaker. Server chỉ trả các trường cần thiết: trạng thái, COD, phí ship, hành trình, tên/SĐT shipper nếu response tracking có cung cấp.
- `GHSV_TOKEN` và `GHSV_SHOP_ID` chỉ nằm trong Render Environment, không được gửi xuống trình duyệt.

## Render Environment
Giữ nguyên:
- `DATABASE_URL`
- `SESSION_SECRET`
- `NODE_ENV=production`

Thêm:
- `GHSV_TOKEN` = token API GHSV của shop
- `GHSV_SHOP_ID` = shop_id GHSV

Tùy chọn (chỉ cần đổi nếu tài liệu/tài khoản GHSV của bạn dùng URL/param khác):
- `GHSV_ORDER_INFO_URL` (mặc định `https://api.svexpress.vn/v1/open-api/order/info`)
- `GHSV_TRACKING_URL` (mặc định `https://api.svexpress.vn/v1/order/open-api/tracking`)
- `GHSV_CODE_PARAM` (mặc định `required_code`)

**Không đưa token GHSV lên GitHub hoặc gửi token trong chat.**

## Deploy
Upload thư mục `bee-sneaker-web-v34` vào GitHub rồi đặt Render Root Directory:

`bee-sneaker-web-v5/bee-sneaker-web-v34/`

Build: `npm install`  
Start: `npm start`

## Lưu ý GHSV
Phần kết nối được viết theo cấu trúc endpoint đã trao đổi. Vì môi trường tạo file không có Token/shop_id của shop nên chưa thể thực hiện một request GHSV thật. Nếu tài khoản GHSV của bạn dùng endpoint hoặc tên query param khác, chỉ cần chỉnh các Environment Variable tùy chọn ở trên, không cần sửa code.

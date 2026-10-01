# Bee Sneaker V37

V37 sửa tích hợp GHSV theo tài liệu chính thức:

- Chỉ cần `GHSV_TOKEN` trên Render.
- API thông tin đơn: `GET https://api.svexpress.vn/v1/open-api/order/info`.
- API tracking: `GET https://api.svexpress.vn/v1/order/open-api/tracking`.
- Hỗ trợ kiểu GET + JSON body mà tài liệu GHSV mô tả, đồng thời fallback sang query parameter.
- Tracking gửi cả header `Token` và header tương thích `client_code` vì tài liệu GHSV ghi token ở mục header `client_code`.
- Log Render ghi rõ endpoint info/tracking, kiểu request, HTTP status và thông báo GHSV (không log token).
- Giữ toàn bộ chức năng của V36/V35.

Render Root Directory:
`bee-sneaker-web-v5/bee-sneaker-web-v37/`

Environment cần có:
- `DATABASE_URL`
- `SESSION_SECRET`
- `NODE_ENV=production`
- `GHSV_TOKEN`

Không đưa token lên GitHub.

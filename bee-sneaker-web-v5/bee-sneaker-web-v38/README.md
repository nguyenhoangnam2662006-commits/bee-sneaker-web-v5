# Bee Sneaker V38

V38 sửa tra cứu GHSV dựa trên log thực tế và tài liệu chính thức.

- Tự nhận diện mã ngắn như `GYRPPH9Y` và thử `client_code` trước.
- Với mã dạng GHSV như `YCCL.1400000004`, thử `required_code` trước.
- API info thử cả `client_code` và `required_code`.
- API tracking dùng header `client_code` chứa token theo tài liệu GHSV.
- Tracking thử endpoint chính thức `/v1/order/open-api/tracking` và fallback `/v1/open-api/order/tracking`.
- Tracking thử GET body, POST body và query fallback.
- Nếu tracking lỗi nhưng info thành công, web vẫn hiển thị trạng thái/COD/phí thay vì làm hỏng toàn bộ trang.
- Log chi tiết từng kiểu request nhưng không log token.
- Chỉ cần `GHSV_TOKEN`; không cần `shop_id` cho tra cứu.

Render Root Directory:
`bee-sneaker-web-v5/bee-sneaker-web-v38/`

Environment:
- `DATABASE_URL`
- `SESSION_SECRET`
- `NODE_ENV=production`
- `GHSV_TOKEN`

Không đưa token lên GitHub.

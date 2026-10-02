# Bee Sneaker V50

V50 đổi luồng GHSV sang `client_code` do Bee tự sinh cho mỗi đơn mới.

## Cách dùng
1. CTV tạo đơn Bee như bình thường. Bee tự tạo mã kiểu `BEE000123`.
2. Admin mở danh sách đơn, bấm **Copy** ở cột **Client code GHSV**.
3. Khi Admin tạo đơn trên GHSV, dán đúng mã đó vào ô **Mã đơn tùy chỉnh / client_code**.
4. Bee dùng `GET https://api.svexpress.vn/v1/open-api/order/info` với `client_code` để tự đọc trạng thái.
5. Trạng thái GHSV được map về Bee để hỗ trợ tính lãi / phí hoàn.

Không cần nhập B57 để đồng bộ trạng thái. `required_code` nếu API trả về chỉ được lưu làm tham chiếu.

## Render
Giữ biến môi trường `GHSV_TOKEN`. Không đưa token vào GitHub hoặc giao diện CTV.

## Lưu ý đơn cũ
Các đơn cũ dùng mã GY hoặc mã khác có thể không tra được bằng API public. Admin có thể sửa cột Client code GHSV của đơn cũ nếu đã có `client_code` tương ứng trên GHSV.

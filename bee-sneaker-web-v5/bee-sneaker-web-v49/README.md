# Bee Sneaker V49

V49 đồng bộ GHSV trực tiếp bằng `client_code` (mã đơn Bee/GY), theo tài liệu chính thức GHSV.

- Không cần nhập B57/required_code để tra trạng thái.
- Endpoint: `GET https://api.svexpress.vn/v1/open-api/order/info` với JSON body `{ "client_code": "GY..." }`.
- Token chỉ đọc từ `GHSV_TOKEN` trong Render Environment.
- Tự lưu `required_code` nếu GHSV trả về, nhưng không phụ thuộc mã này để đồng bộ.
- Tự map trạng thái GHSV về Bee: chờ lấy -> Đã xác nhận; đang giao -> Đang giao; giao thành công -> Hoàn thành; hoàn giao hàng -> Hoàn; hủy -> Hủy.
- Giữ nguyên quy tắc không tự đổi trạng thái các đơn CTV đã được đối soát/đã trả tiền.
- Giữ nguyên quy tắc phí hoàn V46.

## Render
Chỉ cần giữ biến môi trường `GHSV_TOKEN` hiện tại. Không cần `GHSV_SHOP_ID`.

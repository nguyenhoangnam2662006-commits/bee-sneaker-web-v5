# Bee Sneaker V62

## Điểm mới
- Đồng bộ danh sách cửa hàng GHSV bằng API chính thức `GET /v1/open-api/shop/list`.
- Tự lấy `shop_id`, tên, SĐT và địa chỉ GHSV; không cần nhập từng Shop ID thủ công.
- Giữ nguyên kho đã gán cho sản phẩm; đồng bộ lại chỉ cập nhật thông tin cửa hàng theo Shop ID.
- Sau khi đồng bộ, Admin gán sản phẩm/size theo thứ tự ưu tiên kho như V61.
- Khi kho được xác nhận còn hàng, luồng tự tạo đơn GHSV của V61 dùng đúng `shop_id` đã đồng bộ.

## Cấu hình
- `GHSV_TOKEN` trong Render Environment.
- Tùy chọn: `GHSV_SHOP_LIST_URL` nếu GHSV đổi endpoint.

## Test nhanh
1. Vào **Kho & ưu tiên**.
2. Bấm **Đồng bộ cửa hàng GHSV** (để trống mã tỉnh để lấy tất cả).
3. Kiểm tra tên kho + Shop ID + địa chỉ hiện đúng.
4. Vào sản phẩm → gán kho ưu tiên.
5. Test một đơn và xác nhận kho có hàng để tạo đơn GHSV.

# Bee Sneaker V63

V63 sửa logic kho đúng theo từng mẫu sản phẩm:

- Trang `Kho hàng` chỉ còn là danh sách cửa hàng GHSV dùng chung để đồng bộ `shop_id` + địa chỉ.
- Mỗi sản phẩm có riêng mục **Địa chỉ lấy hàng / Kho ưu tiên** ngay trong trang **Sửa sản phẩm**.
- Có thể gán Kho 1 → Kho 2 → Kho 3 khác nhau cho từng mẫu.
- Có thể gán chung mọi size bằng `*` hoặc gán riêng từng size.
- Select kho hiển thị tên kho + Shop ID + địa chỉ để tránh chọn nhầm.
- Trang chi tiết sản phẩm (Admin) hiển thị thứ tự kho hiện tại.
- Nút danh sách sản phẩm đổi thành `Sửa + Kho` để vào thẳng chỗ cấu hình.
- Giữ nguyên API GHSV, đồng bộ shop_id, tạo đơn, trạng thái và lãi từ V62.

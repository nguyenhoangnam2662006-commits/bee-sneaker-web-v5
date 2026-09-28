# Bee Sneaker V11 — Thư viện ảnh & chi tiết sản phẩm

V11 kế thừa V10 và thêm trang chi tiết cho từng mẫu giày.

## Điểm mới
- Mỗi sản phẩm có **1 ảnh đại diện** và tối đa **8 ảnh chi tiết mỗi lần upload**.
- Bấm vào **ảnh, tên sản phẩm hoặc nút Chi tiết** trong danh sách để mở trang riêng của mẫu.
- Trang chi tiết có ảnh lớn + thumbnail để chuyển ảnh.
- Hiển thị SKU, size, tồn kho, phân loại **Like Auth / Siêu Cấp / Best** và giá từng loại.
- Khi sửa sản phẩm, chủ shop có thể thêm ảnh chi tiết mới hoặc xóa từng ảnh cũ.
- Ảnh được lưu trong PostgreSQL nên không mất khi Render restart/deploy lại.
- Database cũ được tự nâng cấp; không xóa sản phẩm/đơn hàng hiện có.

## Deploy từ V10
Upload thư mục `bee-sneaker-web-v11` lên repo GitHub hiện tại, sau đó đổi Render **Root Directory** sang thư mục V11 và deploy latest commit. Giữ nguyên `DATABASE_URL`, `SESSION_SECRET`, Build Command `npm install`, Start Command `npm start`.

# Bee Sneaker V21

Sửa lỗi danh sách size bị gộp thành một lựa chọn khi nhập kiểu `36 37 38 39 40`.

- Hỗ trợ nhập size bằng dấu cách, dấu phẩy, dấu chấm phẩy hoặc xuống dòng.
- Dropdown CTV hiển thị từng size riêng: 36, 37, 38...
- Mỗi size có tồn kho riêng sau khi chủ shop vào **Sửa sản phẩm** và nhập số lượng cho từng size.
- Dữ liệu cũ đang chỉ có tồn chung vẫn tiếp tục dùng được và được đánh dấu `(tồn chung)` cho đến khi chủ shop tách tồn theo size.
- Giữ nguyên dữ liệu PostgreSQL hiện tại.

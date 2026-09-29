# Bee Sneaker V22

Sửa lỗi CTV checkout khi sản phẩm cũ có `size_stock` toàn 0 nhưng vẫn còn `quantity` tổng.

## Điểm sửa
- Sản phẩm cũ chưa nhập tồn riêng từng size sẽ tạm dùng tồn tổng cũ để CTV vẫn đặt đơn được.
- Khi chủ shop nhập tồn riêng từng size, hệ thống tự chuyển sang kiểm soát tồn theo size.
- Checkout báo lỗi tồn kho cụ thể ngay trên web thay vì chỉ hiện “Có lỗi xảy ra”.
- Giữ nguyên dữ liệu PostgreSQL hiện tại.

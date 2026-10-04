# Bee Sneaker V65

V65 sửa lỗi `SyntaxError: Invalid or unexpected token` tại `views/orders.ejs` khi mở trang Đơn hàng.

Nguyên nhân: đoạn JavaScript/EJS của nút Copy ảnh có chuỗi escape không hợp lệ.

V65 giữ nguyên toàn bộ logic V64, chỉ sửa phần template để trang `/orders` render bình thường.

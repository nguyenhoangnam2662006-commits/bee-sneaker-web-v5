# Bee Sneaker V19

Sửa lỗi cập nhật trạng thái PostgreSQL `42P08 inconsistent types deduced for parameter $1`.

Ngoài ra, khi Admin chuyển đơn sang **Hủy**, tồn kho theo đúng size được hoàn lại đúng một lần. Nếu mở lại đơn đã hủy, hệ thống kiểm tra tồn kho rồi mới giữ kho lại.

Dữ liệu PostgreSQL cũ được giữ nguyên.

# Bee Sneaker V79

Điều chỉnh quy tắc đơn hoàn:

- **Drop tự tạo đơn bằng tài khoản GHSV riêng của CTV**: đơn Hoàn chỉ tính **20.000đ phí đóng hàng**. Phí ship GHSV đã được trừ trên tài khoản GHSV của CTV nên Bee không trừ lại.
- **Bắn đơn / đơn dùng luồng GHSV của shop**: đơn Hoàn trừ **45.000đ** vào lãi CTV.
- Đơn Drop Hoàn thành vẫn phát sinh công nợ bằng **tiền gốc sản phẩm**.
- Giữ nguyên kho ưu tiên theo **Sản phẩm + Phân loại + Size**, Bee Kho, push/realtime, tự tạo GHSV và đồng bộ trạng thái.


## V79 - sửa lỗi khởi động database

- Sửa lỗi PostgreSQL `column \"variant\" does not exist` trên database cũ.
- Index dùng cột `variant` chỉ được tạo sau khi migration đã thêm cột này.
- Không xóa dữ liệu cũ.

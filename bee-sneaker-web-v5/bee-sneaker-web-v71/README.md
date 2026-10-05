# Bee Sneaker V71

V71 mở rộng phần đọc shipper cho **cả đơn mới và đơn cũ**.

- Đơn mới BEE...: tiếp tục tra bằng client_code/required_code như V70.
- Đơn cũ: Bee tự thử các mã đã từng lưu trên đơn, gồm `ghsv_required_code`, `ghsv_order_code`, mã map đã liên kết và `tracking_code` cũ (B57/GY...).
- Khi hành trình có dòng dạng `Đơn hàng được giao cho shipper: Tên (0xxxxxxxxx)`, Bee tự tách tên + SĐT shipper.
- Nếu chỉ có dòng `Tên gọi điện cho người nhận...`, Bee vẫn lấy được tên shipper.
- Không cần nhập lại mã cho từng đơn cũ nếu đơn đã có một mã GHSV usable trong dữ liệu hiện tại.

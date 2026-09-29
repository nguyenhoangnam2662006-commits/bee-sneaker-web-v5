# Bee Sneaker V20

V20 cập nhật cách xử lý đơn hủy:

- Đơn trạng thái **Hủy** vẫn được giữ trong trang Đơn hàng để tra cứu lịch sử.
- Dòng đơn Hủy được tô đỏ nhạt và badge Hủy màu đỏ.
- Đơn Hủy không xuất hiện trong phần **Đơn mới nhất** trên Tổng quan.
- Số **Đơn đang tính**, Tổng COD và Tổng lãi CTV trên dashboard không tính đơn Hủy.
- Dữ liệu PostgreSQL cũ được giữ nguyên, không cần tạo database mới.

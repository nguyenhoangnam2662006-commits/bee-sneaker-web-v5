# Bee Sneaker V103 — Kiểm tra quyền token lấy SĐT shipper

- Kế thừa V102, giữ nguyên các API tra hành trình V101/V102, phân quyền CTV, CSKH, Web Push, COD và database.
- Admin vào **Đơn #49 → Tra cứu GHSV**, bấm **Kiểm tra token hiện tại**.
- Máy chủ thử dùng **GHSV_TOKEN** đã cấu hình ở Render làm Bearer để gọi API `GET /v1/order/list-order-of-customer` đúng mã GY và khoảng ngày của đơn.
- Chỉ báo kết quả: bị từ chối 401/403; API trả kết quả nhưng không có đơn khớp; đúng đơn nhưng không có shipper; hoặc tìm được SĐT shipper. **Không gửi hoặc hiển thị token, raw notes, tên, SĐT, cookie** trong kết quả thử.
- Đây là bài kiểm tra quyền truy cập **theo yêu cầu chủ shop** và không tự động chuyển token đang dùng sang phương thức mới. Nếu API trả đúng số và quyền cho phép tích hợp, bước kế tiếp mới kích hoạt đọc tự động. GHSV có thể yêu cầu token khác.
- Không thêm/sửa biến Environment, không thay đổi token. Giải nén ZIP lên GitHub, trên Render chọn Manual Deploy → Deploy latest commit.
- Kết quả cần kiểm tra trực tiếp; trong môi trường tạo bản này không có quyền dùng token của shop để gọi API GHSV thật.

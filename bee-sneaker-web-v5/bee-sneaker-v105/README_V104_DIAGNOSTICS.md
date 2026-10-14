# Bee Sneaker V104 — Chẩn đoán lỗi lấy SĐT shipper

## Thay đổi
- Kế thừa mã V103, giữ nguyên kết nối hành trình V101, CSKH, Web Push, COD, database và các quyền truy cập hiện tại.
- **Chỉ Admin** thấy nút **Kiểm tra token hiện tại** trong **Tra cứu GHSV**, sử dụng `GHSV_TOKEN` của Render để thử API website chỉ khi bấm nút. Không tạo, lưu, thay thế token hoặc thay đổi đơn.
- Báo chính xác mã HTTP và phân loại: 401, 403, 404, 429, 5xx, những lỗi HTTP khác, lỗi mạng/timeout; HTTP 200 nhưng body không phải JSON, báo lỗi nghiệp vụ, danh sách rỗng, không tìm thấy mã GY hoặc đúng đơn nhưng không có SĐT shipper; và nếu có số shipper.
- Mọi kết quả gửi đến trình duyệt chỉ là **trạng thái và thông báo chung**; không trả raw JSON, token, số điện thoại, tên hoặc ghi chú shipper. Giới hạn 6 lần / 15 phút, chỉ Admin gọi qua POST có bảo vệ CSRF. Kết nối thử giới hạn hostname `api.svexpress.vn` và HTTPS.

## Cách dùng
1. Đưa nội dung bên trong ZIP lên GitHub như các bản trước, deploy Render. Giữ nguyên mọi biến Environment.
2. Mở **Bee → Đơn #49 → Tra cứu GHSV** và kéo xuống **Kiểm tra lỗi API lấy SĐT shipper (V104)**.
3. Bấm **Kiểm tra token hiện tại**. Chụp **chỉ dòng kết quả** và gửi để xác định bước tiếp theo, không gửi token hoặc phần Headers.

**Lưu ý:** HTTP 200 chưa đồng nghĩa với được phép tái sử dụng token đăng nhập website trong hệ thống bên ngoài. Nếu kết quả 401/403 cần xin quyền tích hợp hợp lệ từ GHSV. V104 là bản chẩn đoán, chưa bảo đảm số shipper tự hiện; chưa được kiểm tra với tài khoản thật.

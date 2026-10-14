# Bee Sneaker V97 – SĐT shipper từ GHSV

Bản này kế thừa V96 (liên kết CSKH ↔ đơn) và giữ Web Push V95.

- CSKH có thêm nút **📞 SĐT shipper** theo đúng order_id.
- Chi tiết đơn có khung **Liên hệ shipper GHSV**, bấm lấy trực tiếp số theo đơn, nếu có thì hiển thị nút gọi điện.
- Nếu GHSV chưa phân công hoặc API không trả số, hiện rõ thông báo, tuyệt đối không tự chế số.
- Trang Tra cứu GHSV chuyển SĐT nhận được thành đường dẫn `tel:` để bấm gọi.
- Backend trả JSON thông qua route tra cứu hiện có `/orders/:id/ghsv?format=shipper`; giữ quyền admin/CTV theo đơn và không gửi token/raw GHSV về trình duyệt.
- Tránh gọi API GHSV khi chỉ mở bảng CSKH (chỉ gọi khi ấn nút hoặc mở link có #order-shipper).

## Cập nhật trên Render

Upload nội dung ZIP lên GitHub theo cấu trúc như V96. Giữ nguyên Root Directory, Build Command, Start Command và toàn bộ các biến môi trường GHSV/PostgreSQL/Cloudinary/Web Push đang dùng. Không cần DB migration.

**Giới hạn:** Không xác minh được dữ liệu API GHSV thực tế hoặc trạng thái gán shipper từ môi trường làm việc; vui lòng thử với một đơn đã gán shipper trên GHSV.

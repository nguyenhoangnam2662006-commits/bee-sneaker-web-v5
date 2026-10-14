# Bee Sneaker V98 — sửa tra cứu hành trình đơn cũ GHSV

Kế thừa bản V97, giữ Web Push V95 và CSKH liên kết hai chiều.

- Đơn cũ đang lưu mã GY...: nếu chưa có mã B57, Bee thử API info theo client_code để tự nhận mã vận đơn.
- Khi nhận được mã vận đơn B57 hợp lệ, lưu ánh xạ GY... → B57 vào bảng ghsv_code_map và thử tra hành trình bằng B57.
- Nếu GHSV chưa trả B57, Admin có biểu mẫu **Liên kết đơn cũ với mã vận đơn GHSV** ngay dưới trang tra cứu. Tìm mã B57 trên GHSV rồi dán vào một lần; CTV không cần nhập.
- Thông báo lỗi rõ hơn khi API từ chối quyền hoặc không tìm thấy mã.
- Không thay đổi dữ liệu đơn, COD, status hay phí ship khi thao tác liên kết. Không tạo thêm vận đơn.
- Giữ toàn bộ công năng V97, kể cả hiển thị SĐT shipper nếu API GHSV cung cấp.

**Quan trọng:** Không thể xác thực kết nối GHSV/Render thực tế trong môi trường này. Nếu GHSV không cung cấp lịch sử cho token hiện tại, liên kết B57 cũng chưa đảm bảo có hành trình. Kiểm tra xem đơn thuộc tài khoản GHSV shop chính hay tài khoản CTV. Không chia sẻ token hay Bearer.

## Deploy

Chép tất cả nội dung ZIP lên gốc repository GitHub (hoặc giữ Root Directory cũ nếu mã nguồn nằm trong thư mục con). Build `npm install`, Start `npm start`. Giữ nguyên DATABASE_URL, GHSV_TOKEN, GHSV_ROOM_BEARER và các biến Cloudinary/Web Push. Không cần tạo database mới.

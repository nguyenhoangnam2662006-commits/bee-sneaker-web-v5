# Bee Sneaker V102 — Tự kiểm tra và hiển thị shipper GHSV

- Trang `/orders/:id/ghsv` tự cập nhật ô **Shipper** mỗi 3 phút khi trang đang mở, và khi quay lại tab; có nút kiểm tra thủ công.
- Mỗi lần kiểm tra gọi API cùng quyền truy cập của người dùng; CTV không được xem đơn của CTV khác. Số hiện dưới dạng `tel:` khi GHSV thật sự trả dữ liệu.
- Chỉ đọc SĐT shipper từ trường/ghi chú có dấu hiệu shipper, tránh lấy nhầm SĐT khách từ note thường.
- Với shop chính, không tự dùng `GHSV_TOKEN` (Open API) như bearer cho API giao diện; chỉ sử dụng `GHSV_ROOM_BEARER` khi đã được cấu hình hợp lệ.
- Nếu thiếu quyền web hoặc GHSV không trả số, Bee ghi rõ chưa có; không sinh số giả. Không có thay đổi database.
- Giữ nguyên tra cứu hành trình V101, CSKH và Web Push.

## Lưu ý quan trọng
API chính thức GHSV ghi nhận trạng thái/hành trình nhưng không công bố API riêng cho SĐT shipper. Giao diện GHSV có thể hiện số trong `note_public`; không thể đảm bảo endpoint chính thức trả cùng dữ liệu hoặc bearer giao diện còn hợp lệ. Liên hệ hỗ trợ GHSV để xin quyền/API ổn định cho số shipper. KHÔNG gửi token qua chat.

## Deploy
Giải nén và upload file bên trong lên thư mục gốc GitHub đang dùng, sau đó Render → Manual Deploy → Deploy latest commit; giữ nguyên cấu hình. Không cần thay DB. Nếu sau khi thử đơn **đã giao** mà số vẫn trống, cần xác nhận dữ liệu API GHSV trả về và quyền truy cập, không nên tự nhập số ngẫu nhiên.

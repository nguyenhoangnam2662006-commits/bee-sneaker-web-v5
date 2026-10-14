# Bee Sneaker V106 — SĐT shipper từ hành trình GHSV chính thức

## Đã cập nhật

- Giữ nguyên toàn bộ nghiệp vụ của bản ZIP người dùng gửi (`bee-sneaker-v105.zip`; `package.json` bên trong thực tế là 10.4.0).
- Ưu tiên lấy tên và số shipper từ **API hành trình chính thức** của GHSV (`tracking[].note`, hoặc các trường shipper/driver riêng nằm trong một sự kiện).
- Nhận dạng các sự kiện nói rõ `Đơn hàng được giao cho shipper: Tên (SĐT)` hoặc `Shipper: Tên (SĐT)`.
- Không coi số người nhận, số trên ghi chú gọi khách hoặc số của người xác nhận giao thành công là SĐT shipper nếu không có bằng chứng rõ.
- Nếu GHSV phân công người giao **mới** mà chưa có số, Bee không lấy số của người giao **cũ** để hiển thị. Khi cùng một người được phân công lại, có thể dùng số đã được xác nhận trước đó trong hành trình cùng đơn.
- Ưu tiên sự kiện mới nhất theo thời gian nếu GHSV trả timestamp; nếu không có timestamp, dùng thứ tự các bản ghi GHSV.
- Hiển thị nguồn lấy số ở ô Shipper. CTV có thể bấm gọi nếu API thực sự trả SĐT hợp lệ. Tự kiểm tra khi mở/đổi về tab và mỗi 3 phút nếu trang vẫn mở; nút kiểm tra thủ công giữ nguyên.
- Không thay đổi token, database, phí ship, COD, lãi CTV, phân quyền, CSKH, Cloudinary hoặc Web Push.

## Giới hạn thực tế

GHSV chính thức có trường `tracking[].note` nhưng **không cam kết trường này luôn chứa số shipper**. Trên website GHSV, `note_public` có thể có số trong khi token API tích hợp chỉ trả hành trình không có số. V106 sẽ báo chưa có số thay vì lấy nhầm SĐT khách hàng. Lỗi quyền HTTP 401/500 khi dùng API web riêng **chưa được giải quyết** bằng việc đọc ghi chú chính thức.

## Triển khai Render (không cần thêm Environment)

1. Giải nén ZIP, tải các **file và thư mục bên trong** lên thư mục gốc repository đang dùng.
2. Trong Render, chỉ để Root Directory trống **nếu** `package.json` nằm ngay thư mục chính GitHub. Nếu nằm trong thư mục con, đặt Root Directory đúng tên thư mục chứa `package.json`.
3. Build Command: `npm install`. Start Command: `npm start`. Giữ nguyên các biến Environment và PostgreSQL.
4. Manual Deploy → Deploy latest commit. Đợi trạng thái Live.
5. Vào đơn có mã GHSV và mở Tra cứu GHSV. Kiểm tra ô Shipper và Nguồn; bấm `↻ Kiểm tra shipper` nếu cần.

Kiểm thử cục bộ: `node --test test/*.test.js`. Các bài kiểm thử mô phỏng không thay thế kiểm thử với dữ liệu/token GHSV thật của shop.

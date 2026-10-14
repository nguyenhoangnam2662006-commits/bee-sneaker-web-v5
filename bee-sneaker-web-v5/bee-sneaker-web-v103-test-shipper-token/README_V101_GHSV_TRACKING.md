# Bee Sneaker V101 — khôi phục khả năng tra hành trình cũ

## Vì sao
V99 mặc định gọi `https://api.svexpress.vn/v1/open-api/order/tracking`.
V100 đổi mặc định thành `/v1/order/open-api/tracking` theo tài liệu GHSV,
nhưng khi không cấu hình `GHSV_TRACKING_ALT_URL`, đường dẫn V99 không còn được thử.
Một số đơn đang tra được bằng V99 có thể mất hành trình sau khi deploy V100.

## V101 đã sửa
- Khôi phục endpoint V99 làm mặc định; sau đó tự thử endpoint được ghi trên tài liệu GHSV.
- Nếu có cấu hình `GHSV_TRACKING_URL`/`GHSV_TRACKING_ALT_URL` thì vẫn sử dụng.
- Nếu API trả `success: true, tracking: []`, Bee tiếp tục thử endpoint và loại mã
  `required_code` / `client_code` còn lại, thay vì dừng ngay ở kết quả rỗng.
- Không xóa/sửa hành trình trên GHSV, không can thiệp dữ liệu COD, công nợ,
  đơn hàng, cấu hình Web Push, token hoặc database.
- Các bản V95–V100 vẫn được kế thừa.

## Cài đặt
1. Upload toàn bộ mã nguồn V101 vào thư mục gốc repo GitHub, deploy trên Render.
2. **Không cần thêm biến môi trường mới.** Giữ nguyên cấu hình Render hiện có.
3. Sau khi Live, kiểm tra đơn #61 (trước đây có hành trình) rồi tới đơn #49.
4. Nếu đơn #61 có lại hành trình nhưng đơn #49 vẫn trống, kiểm tra biểu mẫu
   `Liên kết đơn cũ với mã vận đơn GHSV` ở cuối trang đơn #49:
   GYRHYPKM ↔ B57BRYK0021153. Nếu đã liên kết đúng mà vẫn trống, mở Render Logs
   tìm `[GHSV][V101] tracking` và báo lại *mã HTTP, pathname, codeField*;
   không gửi token, header hoặc dữ liệu khách hàng.

## Giới hạn
Chỉ xác minh cú pháp và bài kiểm thử mô phỏng. Không có API key GHSV thực tế,
không thể khẳng định tất cả đơn cũ hoặc SĐT shipper sẽ hiện trước khi chạy thực tế.

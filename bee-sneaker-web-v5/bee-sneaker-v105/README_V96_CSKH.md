# Bee Sneaker V96 — Liên kết CSKH với đơn hàng

Bản này được chỉnh từ file **V95 Push Notifications** mà bạn cung cấp.

## Tính năng mới

1. Trong **Chăm sóc khách hàng**, mỗi yêu cầu có nút **👁 Xem đơn**. Bấm sẽ mở đúng đơn tương ứng (không cuộn qua bảng đơn dài).
2. Trang **Chi tiết đơn** riêng: mã Bee, người nhận, địa chỉ nhận, sản phẩm/size/số lượng, COD, trạng thái đơn, tình trạng kho, thông tin kho lấy hàng (chỉ Admin) và GHSV đã lưu.
3. Yêu cầu vừa chọn được nổi bật trên trang chi tiết; dưới trang hiện tất cả yêu cầu CSKH của đơn và phản hồi.
4. Từ trang **Đơn hàng**, có thêm **👁 Xem chi tiết đơn**. Từ trang chi tiết có nút quay về CSKH, xem GHSV, tạo yêu cầu mới.
5. Bảo mật: CTV chỉ có quyền truy cập đơn thuộc tài khoản mình. Tên/địa chỉ/Zalo kho và mã vận đơn GHSV thật chỉ được hiển thị cho Admin.

## Deploy Render

- Cập nhật toàn bộ nội dung ZIP này vào thư mục gốc repository như các phiên bản trước (server.js, package.json, views/, public/, src/).
- Giữ **Root Directory** và các Environment Variables/DB đã dùng ở V95, không cần tạo DB mới.
- Sau khi deploy thành công: vào **CSKH → Xem đơn**, hoặc **Đơn hàng → Xem chi tiết đơn**.
- Chức năng Web Push của V95 được giữ nguyên, không cần cấu hình mới.

**Lưu ý:** Trang chi tiết hiển thị thông tin đã lưu trên Bee, không tự xác nhận rằng shipper đã đến lấy; bấm Tra cứu GHSV để lấy hành trình khi API khả dụng. Nếu trước đó đơn chưa gán kho hoặc chưa có mã GHSV, giao diện sẽ ghi rõ. Không cần migration thủ công vì CSKH đã có `order_id` liên kết với đơn.

# Bee Sneaker V72

V72 tập trung sửa deploy Render bị timeout:

- Bind PORT ngay khi process khởi động để Render health check không phải chờ DB/GHSV.
- `/healthz` trả lời ngay và hiển thị `ready` để kiểm tra DB đã sẵn sàng hay chưa.
- GHSV startup sync chạy nền sau 2 phút, không chặn deploy.
- Background sync chỉ quét đơn đang hoạt động (`Mới`, `Chờ xác nhận`, `Đã xác nhận`, `Đang giao`).
- Batch sync nhỏ hơn; page kick tối đa 10 đơn và throttle 2 phút.
- Bỏ endpoint tracking mặc định cũ `/v1/order/open-api/tracking` vốn trả 404; dùng `/v1/open-api/order/tracking`.
- Giữ nguyên Bee Kho, push, tự tạo GHSV, tra shipper cho đơn mới/cũ của V71.

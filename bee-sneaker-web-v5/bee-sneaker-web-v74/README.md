# Bee Sneaker V74

V74 bổ sung chế độ fallback realtime cho Bee Kho:

- Thiết bị hỗ trợ Web Push: vẫn nhận push như V73.
- Thiết bị không hỗ trợ Push: Bee Kho vẫn tự kiểm tra đơn mới mỗi 5 giây khi trang/app đang mở.
- Nút “Bật thông báo / realtime” luôn bật được chế độ realtime, không bị chặn chỉ vì Push không hỗ trợ.
- Khi phát hiện đơn mới lúc Bee Kho đang mở: rung (nếu hỗ trợ), phát tiếng báo (sau khi người dùng đã bật realtime), hiện banner và tự reload để hiện sản phẩm + nút CÒN/HẾT.
- Cố dùng Screen Wake Lock nếu thiết bị hỗ trợ để giảm nguy cơ màn hình ngủ khi kho muốn để Bee Kho mở liên tục.
- Giữ nguyên toàn bộ logic V73: kho ưu tiên, CÒN/HẾT, tự tạo GHSV, trạng thái/lãi, shipper.

Lưu ý: không có cách web nào đảm bảo thông báo nền 24/24 trên mọi thiết bị nếu hệ điều hành không hỗ trợ Web Push hoặc app bị đóng. Fallback realtime hoạt động khi Bee Kho đang mở.

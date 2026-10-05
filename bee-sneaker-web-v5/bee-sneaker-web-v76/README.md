# Bee Sneaker V76

V76 mở rộng V75 với **Công nợ CTV Drop** dành cho các đơn được Bee tạo bằng tài khoản GHSV riêng của CTV.

## Công nợ được tính thế nào
- Chỉ tính khi `ghsv_owner_ctv_id = ctv_id` (đơn dùng GHSV riêng của CTV).
- `Hoàn thành`: công nợ = **tiền gốc / product_cost** phải trả Bee.
- `Hoàn`: công nợ = **phí hoàn Bee**:
  - 1 đôi: 45.000đ
  - 2–3 đôi: 55.000đ
  - 4+ đôi: 65.000đ
- `Hủy` hoặc đơn chưa chốt: chưa phát sinh công nợ.

## Giao diện mới
- Menu Admin: **💳 Công nợ CTV Drop**.
- Tổng hợp theo CTV: phát sinh, đã thu, còn nợ, số đơn chưa thu.
- Chi tiết từng CTV: tích nhiều đơn và đánh dấu **Đã thu**, hoặc thu toàn bộ.
- Có thể bật/tắt trạng thái **Đã thu / Chưa thu** từng đơn.
- Mã đợt thu công nợ có dạng `CN-...` để tra lịch sử.

## An toàn đối soát
- Công nợ tách riêng hoàn toàn khỏi trạng thái `Lãi thành công` (`ctv_paid`).
- Đơn đã thu công nợ sẽ không tự đổi trạng thái GHSV sau đó để tránh lệch tiền.
- Đơn đã đối soát tiền không cho đổi phân loại/giá gốc.

## Render
Nếu repo vẫn có cấu trúc 2 lớp như các bản trước:

`bee-sneaker-web-v5/bee-sneaker-web-v76`

Giữ nguyên các Environment Variables của V75, đặc biệt `DATABASE_URL`, `SESSION_SECRET`, `GHSV_TOKEN` và cấu hình Web Push nếu đang dùng Bee Kho.

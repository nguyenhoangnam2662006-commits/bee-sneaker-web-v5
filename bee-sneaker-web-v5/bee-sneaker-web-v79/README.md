# Bee Sneaker V79

Chốt đúng 2 luồng đơn của CTV:

- **CTV tự bắn đơn trên tài khoản GHSV riêng của họ** (`ghsv_owner_ctv_id = ctv_id`): nếu đơn **Hoàn** thì lãi CTV = **-20.000đ**. Đây là phí đóng hàng; phí ship GHSV đã trừ trên tài khoản GHSV của CTV nên Bee không trừ lại.
- **CTV chỉ gửi thông tin để shop/Bee lên đơn bằng tài khoản GHSV của shop**: nếu đơn **Hoàn** thì lãi CTV = **-45.000đ**.
- **Đơn Hoàn thành** vẫn tính lãi/công nợ theo luồng hiện tại. Với đơn dùng GHSV riêng của CTV, công nợ Drop = tiền gốc sản phẩm; nếu Hoàn thì công nợ chỉ 20.000đ.
- **Hủy** không tính lãi/công nợ.

Giữ nguyên toàn bộ tính năng V78: GHSV theo từng CTV, Bee Kho dùng chung, push/realtime, tự tạo GHSV, kho ưu tiên theo Sản phẩm + Phân loại + Size, đồng bộ trạng thái và shipper.

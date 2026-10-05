# Bee Sneaker V80

V80 thay đổi logic kho ưu tiên:
- BEST, SIÊU CẤP, Loại A có chuỗi kho ưu tiên riêng.
- Không còn ưu tiên kho theo size.
- Chỉ khi kho hiện tại xác nhận HẾT HẲN mẫu/phân loại đó thì Bee mới chuyển sang kho kế tiếp.
- Khi bấm HẾT HẲN, rule kho được đánh dấu hết và các đơn sau của cùng mẫu/phân loại sẽ bỏ qua kho đó. Admin có thể đổi trạng thái về Đang dùng khi nhập hàng lại.

# Bee Sneaker V79

Chốt đúng 2 luồng đơn của CTV:

- **CTV tự bắn đơn trên tài khoản GHSV riêng của họ** (`ghsv_owner_ctv_id = ctv_id`): nếu đơn **Hoàn** thì lãi CTV = **-20.000đ**. Đây là phí đóng hàng; phí ship GHSV đã trừ trên tài khoản GHSV của CTV nên Bee không trừ lại.
- **CTV chỉ gửi thông tin để shop/Bee lên đơn bằng tài khoản GHSV của shop**: nếu đơn **Hoàn** thì lãi CTV = **-45.000đ**.
- **Đơn Hoàn thành** vẫn tính lãi/công nợ theo luồng hiện tại. Với đơn dùng GHSV riêng của CTV, công nợ Drop = tiền gốc sản phẩm; nếu Hoàn thì công nợ chỉ 20.000đ.
- **Hủy** không tính lãi/công nợ.

Giữ nguyên toàn bộ tính năng V78: GHSV theo từng CTV, Bee Kho dùng chung, push/realtime, tự tạo GHSV, kho ưu tiên theo Sản phẩm + Phân loại + Size, đồng bộ trạng thái và shipper.

## V81 - GHSV shipper debug
- Tự quét sâu raw response GHSV để tìm tên/SĐT shipper ở field lồng nhau như shipper/driver/courier/delivery.
- Admin có khối `V81 Debug GHSV` ngay dưới trang tra cứu đơn; token/auth và thông tin khách được che, SĐT trong JSON debug được rút gọn.
- Render log chỉ ghi tên các field/candidate path, không ghi token.
- Giữ nguyên toàn bộ logic kho ưu tiên V80.


## V82 - Shipper phone via GHSV room/detail
- Bee first uses the existing official open-api info/tracking flow.
- If shipper is missing, it can call `GET /v1/room/detail?customer_code=...` and parse `note_public` such as `... shipper: Name (09...)`.
- `GHSV_ROOM_BEARER` is optional. If unset, Bee tries the current per-account `GHSV_TOKEN` as a Bearer value. Do not put browser tokens in source code.
- `GHSV_CUSTOMER_CODE` is optional for the main shop (example `BRYK`) if the code cannot be inferred automatically from the response/MVD.

# Bee Sneaker V99 – tự liên kết đơn GY → B57 và dữ liệu shipper

Kế thừa V98, giữ chức năng CSKH V96, nút số shipper V97 và Web Push V95.

## Thay đổi
- Đơn cũ GY...: tìm đúng bản ghi theo **mã GY khớp hoàn toàn** qua endpoint GHSV web list-order-of-customer (khi có Bearer hợp lệ). Nếu bản ghi có một mã B57 duy nhất, tự lưu ánh xạ rồi gọi Open API tracking bằng B57. Không chọn mã của đơn khác.
- Dùng mốc ngày tạo đơn ±30 ngày thay vì chỉ tìm 30 ngày gần nhất.
- Nếu response web có hành trình chuẩn (mảng events/tracking/history), hiển thị những sự kiện thật; không tự tạo hành trình giả. Nếu web chỉ trả trạng thái, có thể dùng trạng thái đó; vẫn cần endpoint tracking trả nhật ký để có đủ hành trình.
- Đọc SĐT shipper từ đúng record hoặc ghi chú "giao cho shipper: ... (0...)" của record đó; không quét SĐT ở những đơn không liên quan.
- Vẫn hỗ trợ nút liên kết mã B57 bằng tay khi GHSV từ chối API hoặc không tìm ra mã.

## Triển khai
Giải nén ZIP, đưa nội dung vào root code trên GitHub và deploy latest commit tại Render. Không xóa dữ liệu PostgreSQL. Giữ nguyên các biến Environment và cấu hình Root Directory hiện tại. Chạy Node.js >=20, Build `npm install`, Start `npm start`.

`GHSV_ROOM_BEARER` (chỉ đặt ở Render Environment) cần hợp lệ để Bee dùng dữ liệu giao diện web GHSV. `GHSV_TOKEN` (Open API) **khác** Bearer web. Không cung cấp token trong chat và không đưa vào GitHub. Nếu GHSV web thay API hoặc Bearer không hợp lệ, chức năng tự liên kết có thể thất bại; xem log Render và dùng form liên kết thủ công.

## Giới hạn
Chưa thử trực tiếp được với tài khoản/endpoint GHSV thật. Các test mô phỏng kiểm tra parser đúng mã, tránh ánh xạ nhầm, không đọc shipper của đơn khác; không thể bảo đảm API đã trả hành trình/số shipper. Với một số đơn đã giao, API có thể chỉ trả trạng thái, không có log hành trình.

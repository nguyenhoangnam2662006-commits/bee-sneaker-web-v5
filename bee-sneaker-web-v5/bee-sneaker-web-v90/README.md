# Bee Sneaker V90

Bản V87 giữ toàn bộ chức năng V86 và bổ sung cho CTV sửa COD ngay trong màn hình **Sửa thông tin khách hàng**.

## Điểm mới V87

- CTV có thể sửa **COD cuối** của đơn do chính mình tạo.
- Khi COD thay đổi, Bee tự tính lại `base_cod`, thuế 1,5% và lãi CTV theo đúng kiểu ship hiện tại.
- Không cho đổi COD nếu đơn đã tạo vận đơn GHSV hoặc đã đối soát/trả tiền CTV, tránh lệch công nợ.

- Ảnh sản phẩm mới và ảnh chi tiết mới được upload thẳng lên Cloudinary khi đã cấu hình.
- Database chỉ lưu URL + public ID của ảnh Cloudinary; không đẩy bytes ảnh qua Render khi CTV xem ảnh.
- CTV vẫn xem ảnh, copy ảnh, mở ảnh lớn, thêm giỏ và tạo đơn như cũ.
- Route ảnh cũ vẫn tương thích; nếu ảnh đã ở Cloudinary thì Bee redirect thẳng sang CDN.
- Có nút `☁️ Chuyển ảnh cũ` trong trang Sản phẩm của Admin. Mỗi lần chuyển tối đa 5 ảnh BYTEA cũ sang Cloudinary, sau đó xóa bytes cũ trong PostgreSQL.
- Nếu chưa cấu hình Cloudinary, Bee vẫn dùng cơ chế ảnh cũ để web không bị hỏng.

## Render Environment cần thêm

Tạo tài khoản Cloudinary, vào Dashboard / API Keys và thêm 3 biến sau vào Render:

```text
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Tuỳ chọn:

```text
CLOUDINARY_FOLDER=bee-sneaker
```

Sau khi Save Environment và deploy lại, vào **Sản phẩm**. Nếu thấy `☁️ Cloudinary đã kết nối` là đúng.

Nếu còn ảnh cũ, bấm **☁️ Chuyển ảnh cũ (X)** nhiều lần tới khi X về 0. Trong quá trình chuyển, không xóa sản phẩm hay tắt service.

## Render

Nếu upload đúng ZIP V90 này:

```text
Root Directory: bee-sneaker-web-v90
Build Command: npm install
Start Command: npm start
```

## Lưu ý bandwidth

Sau khi ảnh cũ đã chuyển hết, trình duyệt CTV tải ảnh từ `res.cloudinary.com`, nên phần lớn dung lượng ảnh không còn đi qua Render. Render vẫn dùng bandwidth cho HTML/API/JSON và các file tĩnh nhỏ của Bee.


## V88
- CTV được hủy đơn khi trạng thái Mới / Chờ xác nhận / Đã xác nhận (miễn chưa sang Đang giao). Xác nhận còn hàng không còn khóa nút hủy.
- Sửa đối soát lãi: chỉ đơn Hoàn thành mới cộng lãi bán hàng; đơn Hoàn trừ 20.000đ nếu CTV tự bắn GHSV riêng, hoặc 45.000đ nếu shop/Bee lên đơn; đơn Hủy và đơn đang xử lý chưa tính vào lãi thực nhận.
- Checkbox Lãi thành công/Chưa lãi thành công vẫn chỉ áp dụng cho đơn Hoàn thành hoặc Hoàn.


## V89
- Thêm mục **➕ Tạo đơn** vào menu CTV, dùng lại luồng tạo đơn hiện có.
- Không thay đổi cơ chế GHSV riêng: mỗi CTV vẫn dùng token + shop_id đã map của chính CTV đó.

## V90
- CTV không thể nhập hoặc sửa phí ship trên form tạo đơn/checkout.
- Backend luôn tự tính phí ship bằng bảng phí hiện tại; không tin `shipping_fee` gửi từ trình duyệt.
- Giữ nguyên cách tính COD, freeship/khách trả ship và luồng tạo đơn GHSV riêng của từng CTV.
- Thư mục gốc của bản này là `bee-sneaker-web-v90`.

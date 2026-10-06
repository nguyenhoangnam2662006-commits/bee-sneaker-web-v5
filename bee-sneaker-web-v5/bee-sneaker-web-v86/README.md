# Bee Sneaker V86

Bản V86 giữ nguyên luồng CTV tạo đơn / giỏ hàng / kho ưu tiên / GHSV của V85 và chuyển phần ảnh sản phẩm sang Cloudinary để giảm bandwidth Render.

## Điểm mới V86

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

Nếu upload đúng ZIP V86 này:

```text
Root Directory: bee-sneaker-web-v86
Build Command: npm install
Start Command: npm start
```

## Lưu ý bandwidth

Sau khi ảnh cũ đã chuyển hết, trình duyệt CTV tải ảnh từ `res.cloudinary.com`, nên phần lớn dung lượng ảnh không còn đi qua Render. Render vẫn dùng bandwidth cho HTML/API/JSON và các file tĩnh nhỏ của Bee.

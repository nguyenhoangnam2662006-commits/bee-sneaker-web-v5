# Bee Sneaker V100 — sửa tra hành trình GHSV cho đơn đã liên kết B57

## Lỗi được xác định từ V99

Trong V99, `GHSV_TRACKING_URL` mặc định là:
`https://api.svexpress.vn/v1/open-api/order/tracking`

Tài liệu API chính thức của GHSV lại ghi:
`https://api.svexpress.vn/v1/order/open-api/tracking`

Nguồn: https://developer.svexpress.vn/api/don-hang (mục "Lấy hành trình đơn hàng").

V100 đổi mặc định sang đường dẫn theo tài liệu và tự giữ đường dẫn chính thức làm dự phòng khi Render còn cấu hình URL cũ. Với các API trả 404/405, Bee chuyển thử sang đường dẫn dự phòng; với lỗi xác thực/token thì vẫn báo lỗi để tránh che mất nguyên nhân.

## Chẩn đoán đơn cũ đã gắn mã B57

- Mã đã liên kết được hiển thị rõ là "Đã lưu liên kết".
- Nếu mã có trong Bee nhưng không có hành trình, Bee thử tra API `order/info` theo mã B57 để phân biệt: mã được API nhận diện nhưng không có nhật ký; token tài khoản bị từ chối; hoặc không tìm thấy vận đơn.
- Thông báo kết quả an toàn chỉ chủ shop thấy; không đưa token hay phản hồi chứa dữ liệu khách vào thông báo.
- Không tự tạo thêm đơn, không thay đổi COD, phí, tồn kho và thông tin tài khoản GHSV.

## Cập nhật Render

1. Đưa nội dung ZIP vào thư mục code gốc trên GitHub, deploy Render như cũ.
2. Giữ nguyên DATABASE_URL, GHSV_TOKEN, GHSV_ROOM_BEARER, SESSION_SECRET và các biến khác.
3. Nếu **đang có** biến `GHSV_TRACKING_URL` trong Render, nên đặt giá trị:
   `https://api.svexpress.vn/v1/order/open-api/tracking`
   Nếu **không có**, có thể để nguyên; V100 đã dùng đường dẫn chính thức mặc định.
4. Mở `/orders/49/ghsv`, kiểm tra dòng "Đã lưu liên kết" có B57 chính xác, và dòng xác minh GHSV mới.

## Giới hạn

Đã kiểm tra cú pháp mã Node và 6 bài kiểm thử parser; chưa chạy thử với API GHSV/tài khoản Render thật. Nếu bản web GHSV hiển thị hành trình nhưng API không cấp dữ liệu cho token, bản này sẽ báo rõ hơn chứ không thể buộc GHSV trả về số shipper hay hành trình.

# Bee Sneaker V12 — Gallery khung vuông + CTV lưu ảnh

V12 kế thừa V11 và bổ sung:

- Ảnh chính trên trang chi tiết được giới hạn trong khung vuông tối đa 620×620 px.
- Ảnh dùng `object-fit: contain`, không bị crop và không phóng kín màn hình.
- Thumbnail vẫn dùng để đổi ảnh đang xem.
- Nút **Lưu ảnh** cho cả Admin và CTV đã đăng nhập.
- Khi đổi thumbnail, nút Lưu ảnh tự trỏ sang đúng ảnh đang xem.
- Download trả ảnh bằng `Content-Disposition: attachment`, thuận tiện trên desktop và mobile.
- Dữ liệu/database cũ không cần tạo lại.

Deploy: upload thư mục `bee-sneaker-web-v12` vào repo hiện tại rồi đổi Render Root Directory sang thư mục này.

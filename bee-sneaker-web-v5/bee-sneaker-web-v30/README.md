# Bee Sneaker V30 — sửa công thức lãi CTV

Kế thừa V29 và toàn bộ tính năng trước đó.

- Freeship: COD = tiền thu hộ tiền hàng; thuế = làm tròn (COD × 1,5%); **lãi CTV = COD − gốc − thuế − phí ship**.
- Khách trả ship: COD cuối = tiền hàng thu hộ + phí ship; thuế = làm tròn (COD cuối × 1,5%); **lãi CTV = COD cuối − gốc − thuế**, theo quy tắc shop đã chốt.
- Xem phí ship do CTV chịu ngay trong phần Tạm tính. Form giỏ hàng và form tạo đơn cũ đều có cùng cách tính với server.
- Khi startup, tự tính lại những đơn Freeship **chưa đánh dấu đã trả CTV**, đang giữ đúng công thức cũ, có gốc và phí ship. Những khoản đã trả không tự thay đổi để tránh sửa lịch sử đối soát; cần kiểm tra thủ công nếu cần điều chỉnh.
- Không tạo database mới, không xóa đơn, không đổi giá các phân loại.

Kiểm tra ví dụ: COD 530.000đ, gốc 410.000đ, ship 35.000đ, thuế 7.950đ → lãi Freeship 77.050đ.

Deploy: upload thư mục `bee-sneaker-web-v30` vào repo rồi đặt Render Root Directory = `bee-sneaker-web-v5/bee-sneaker-web-v30/`; giữ nguyên DATABASE_URL. Nên sao lưu dữ liệu trước khi deploy.

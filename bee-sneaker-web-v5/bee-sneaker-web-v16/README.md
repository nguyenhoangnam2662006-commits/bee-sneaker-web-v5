# Bee Sneaker V16

Bản V16 giữ nguyên chức năng V15, với thay đổi giao diện/nhãn:

- Không hiển thị tài khoản/mật khẩu Admin mặc định ở trang đăng nhập.
- Không dùng nhãn “Like Auth/Auth/Chính hãng” cho hàng replica. Phân loại cũ “Like Auth” được hiển thị trung tính là “Loại A” để tương thích dữ liệu cũ.
- Dữ liệu PostgreSQL cũ không cần migrate và không bị mất.

# Bee Sneaker V16 — Giỏ hàng CTV

Luồng mới: Sản phẩm → Thêm vào giỏ → Giỏ hàng → Đặt đơn.

- Giỏ hàng lưu trong session của từng CTV.
- Có tổng số lượng và tổng tiền.
- Có cập nhật số lượng, xóa từng sản phẩm, xóa toàn bộ giỏ.
- Checkout một lần cho nhiều sản phẩm cùng một khách.
- PostgreSQL tự thêm bảng order_items, không xóa dữ liệu đơn cũ.
- Phí ship vẫn tự tính 35k cho 1 đôi, tăng 10k mỗi đôi tiếp theo.
- Thuế = 1.5% COD, lãi CTV = COD - tổng giá gốc - thuế.

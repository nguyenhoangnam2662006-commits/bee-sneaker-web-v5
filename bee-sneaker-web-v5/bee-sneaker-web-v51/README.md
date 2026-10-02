# Bee Sneaker V51

V51 hỗ trợ song song đơn GHSV cũ và đơn mới.

- Đơn mới: Bee tự sinh `client_code` dạng `BEE000123`; chủ shop dán mã này vào ô Mã đơn tùy chỉnh/client_code khi tạo đơn trên GHSV.
- Đơn cũ: nếu đang lưu mã GHSV/MVD (ví dụ B57...), Bee không ép mã đó thành client_code nữa; Bee dùng mã cũ để lấy hành trình.
- Nếu API info của đơn mới trả `required_code`, Bee tự lưu mapping.
- Nếu đơn cũ chỉ lấy được hành trình, Bee lấy trạng thái mới nhất/terminal từ hành trình và tự cập nhật Bee (Đang giao / Hoàn thành / Hoàn / Hủy).
- Timeout GHSV giảm còn 5 giây và bỏ chuỗi fallback dài để nút Tra cứu đỡ quay lâu.
- Đơn đã đối soát CTV không tự đổi trạng thái để tránh làm sai lịch sử thanh toán.

Render cần `GHSV_TOKEN`.

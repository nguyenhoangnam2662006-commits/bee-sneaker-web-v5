# Bee Sneaker V28

V28 bổ sung quản lý đơn hủy cho chủ shop:

- Đơn chuyển sang **Hủy** được tô nền đỏ nhạt và trạng thái đỏ để dễ nhận biết.
- Chủ shop có nút **Xóa đơn** chỉ khi đơn đã ở trạng thái Hủy.
- Xóa đơn có hộp xác nhận và là xóa vĩnh viễn.
- Xóa đơn Hủy **không cộng/trừ tồn kho lần nữa** vì tồn đã được hoàn khi chuyển trạng thái sang Hủy.
- Thao tác xóa được ghi vào **Nhật ký bảo mật / audit log**.
- Không cho xóa đơn còn Mới / Đang giao / Hoàn thành / Hoàn. Muốn xóa phải Hủy trước.

Giữ nguyên toàn bộ database và chức năng V27.

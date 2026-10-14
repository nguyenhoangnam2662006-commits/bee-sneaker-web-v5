# Bee Sneaker V95 – Admin Web Push

- Admin mở Bee → bấm **🔔 Bật thông báo** → cho phép thông báo hệ thống.
- Nếu iPhone/iPad: mở bằng Safari → Chia sẻ → Thêm vào Màn hình chính → mở Bee từ biểu tượng → bấm Bật thông báo.
- Có đơn CTV mới từ cả form đơn lẻ và giỏ hàng, máy chủ gửi Web Push tới trình duyệt Admin đã đăng ký.
- Render vẫn dùng cấu hình cũ; dùng PostgreSQL cũ (bổ sung bảng admin_push_subscriptions lúc khởi chạy).
- Yêu cầu HTTPS và Render hoạt động liên tục. Trình duyệt/hệ điều hành có thể trì hoãn thông báo; không đảm bảo nhận tức thì trong mọi chế độ tiết kiệm pin.
- Không gửi tên, số điện thoại hay địa chỉ khách qua thông báo khóa màn hình.
- Trên thiết bị dùng chung, hãy quản lý quyền thông báo và đăng xuất phù hợp.

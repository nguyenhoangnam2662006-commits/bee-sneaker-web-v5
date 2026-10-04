# Bee Sneaker V66

V66 thêm **Bee Kho PWA + push notification** để check size nhanh 24/24:

- Mỗi kho có một link Bee Kho riêng, không cần tài khoản Zalo/Telegram.
- Trên điện thoại kho: mở link một lần → **Bật thông báo** → có thể thêm ra màn hình chính.
- CTV tạo đơn → Bee tự chọn kho ưu tiên của đúng sản phẩm/size → gửi push cho điện thoại kho.
- Kho chỉ bấm **CÒN** hoặc **HẾT**.
- HẾT → Bee tự chuyển kho ưu tiên kế tiếp và gửi push cho kho đó.
- CÒN → Bee báo CTV và **tự tạo đơn GHSV** bằng shop_id của kho vừa xác nhận.
- Admin vào **Kho & ưu tiên** để Copy link Bee Kho cho từng kho; có thể đổi link nếu bị lộ.
- Web Push dùng VAPID key tự sinh và lưu trong PostgreSQL, không cần thêm secret mới vào Render.

## Test nhanh
1. Deploy V66 và vào **Kho & ưu tiên**.
2. Copy link Bee Kho của Kho A, mở trên Android Chrome (hoặc iPhone đã Add to Home Screen).
3. Bấm **Bật thông báo trên máy này** và Allow.
4. Gán sản phẩm/size: Kho A ưu tiên 1, Kho B ưu tiên 2.
5. CTV tạo đơn sản phẩm đó. Kho A phải nhận push.
6. Bấm HẾT → Bee chuyển Kho B và gửi push. Bấm CÒN ở Kho B → Bee tự tạo GHSV.

> Lưu ý: Render Free có thể ngủ. Khi CTV tạo đơn, request sẽ đánh thức service nhưng có thể trễ vài chục giây. Muốn phản hồi gần như tức thời 24/24 nên dùng instance không sleep.

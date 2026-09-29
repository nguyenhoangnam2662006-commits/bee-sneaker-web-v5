# Bee Sneaker V18

V18 kế thừa toàn bộ V17 và bổ sung quản lý tồn kho theo từng size + giỏ hàng chọn từng dòng.

## Điểm mới

- Admin nhập **tồn kho riêng cho từng size** khi thêm/sửa sản phẩm.
- Size có tồn = 0 sẽ hiện **Hết size** và CTV không thể chọn.
- Khi tất cả size đều hết, sản phẩm hiện **Hết hàng** và nút Thêm giỏ bị khóa.
- Khi đặt đơn, tồn kho được **trừ tự động theo đúng size** trong transaction PostgreSQL.
- Khi CTV hủy đơn ở trạng thái cho phép, tồn kho của các sản phẩm trong đơn được **cộng trả lại**.
- Giỏ hàng có **checkbox từng dòng**. Chỉ các dòng được tích mới đi sang checkout.
- Tổng số lượng và tổng tiền trong giỏ chỉ tính các dòng đang tích.
- Số lượng trong giỏ đổi bằng nút **− / +** thay vì nhập tay.
- Backend kiểm tra tồn kho lại trước checkout và lúc ghi đơn để hạn chế oversell.

## Nâng cấp database

Không cần tạo database mới. V18 tự thêm cột `products.size_stock` dạng JSONB và giữ dữ liệu cũ.

Sản phẩm cũ chưa có tồn theo size vẫn hoạt động theo tồn tổng cũ. Khi bạn sửa sản phẩm đó, hãy nhập số lượng cho từng size để chuyển sang quản lý tồn theo size.

## Deploy Render

Upload thư mục `bee-sneaker-web-v18` vào repo GitHub hiện tại rồi đổi Root Directory của Render thành:

`bee-sneaker-web-v5/bee-sneaker-web-v18/`

Build Command: `npm install`

Start Command: `npm start`

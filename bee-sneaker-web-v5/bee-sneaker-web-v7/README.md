# Bee Sneaker V7

V7 bổ sung cách tính ship, thuế và lãi CTV tự động.

## Công thức
- CTV nhập **Tiền thu hộ tiền hàng**.
- Nếu chọn **Freeship cho khách**: `COD cuối = tiền thu hộ tiền hàng`.
- Nếu chọn **Khách trả ship**: `COD cuối = tiền thu hộ tiền hàng + phí ship`.
- `Tiền gốc = giá sản phẩm trong kho × số lượng`.
- `Thuế = 1,5% × COD cuối`.
- `Lãi CTV = COD cuối − tiền gốc − thuế`.

V7 không yêu cầu CTV tự nhập lãi nữa. Server tự tính lại để tránh sửa số ở trình duyệt.

## Nâng cấp từ V5/V6
Không cần tạo database mới. Khi V7 chạy, nó tự thêm các cột còn thiếu bằng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, giữ nguyên tài khoản, sản phẩm và đơn cũ.

Các cột mới của đơn hàng: `base_cod`, `shipping_type`, `shipping_fee`, `product_cost`, `tax_amount`.

## Deploy Render
Upload các file V7 vào đúng thư mục repo hiện tại đang được Render deploy. Render tự deploy lại. Giữ nguyên `DATABASE_URL` và `NODE_ENV=production`.

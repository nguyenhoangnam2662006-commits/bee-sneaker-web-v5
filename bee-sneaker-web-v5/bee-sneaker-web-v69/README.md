# Bee Sneaker V69

V69 sửa lỗi push đến điện thoại nhưng Bee Kho mở ra không thấy sản phẩm:
- lưu trực tiếp `warehouse_id` trên đơn, không còn phụ thuộc hoàn toàn vào `product_warehouse_rules` sau khi đơn đã được gán;
- danh sách Bee Kho dùng `orders.warehouse_id` làm nguồn chính, fallback rule cũ cho dữ liệu cũ;
- khi chuyển Kho 1 -> Kho 2 cũng cập nhật `warehouse_id` trực tiếp;
- notification mở đúng URL có `?order=<id>` và ưu tiên đơn vừa báo lên đầu;
- nếu push tới nhưng đơn vẫn không có trong hàng chờ, Bee Kho hiện cảnh báo cụ thể thay vì im lặng.

Giữ nguyên push notification, CÒN/HẾT, tự tạo GHSV, đồng bộ trạng thái/lãi.

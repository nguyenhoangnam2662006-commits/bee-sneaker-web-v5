# Bee Sneaker V39

V39 cải thiện tra cứu GHSV bằng mã nội bộ (MDT/client_code).

- CTV vẫn dùng mã nội bộ đang lưu trên đơn.
- Nếu API GHSV tự trả về MVD (`required_code`), hệ thống tự ghi nhớ ánh xạ MDT → MVD.
- Nếu GHSV production không tra được MDT bằng API, chủ shop có thể nhập MVD một lần ở trang tra cứu. Sau đó CTV tiếp tục chỉ dùng MDT.
- Tracking ưu tiên MVD để lấy trạng thái/hành trình/shipper.
- Token GHSV chỉ nằm ở Render Environment (`GHSV_TOKEN`).
- Không cần `GHSV_SHOP_ID` cho tra cứu.

Render Root Directory:
`bee-sneaker-web-v5/bee-sneaker-web-v39/`

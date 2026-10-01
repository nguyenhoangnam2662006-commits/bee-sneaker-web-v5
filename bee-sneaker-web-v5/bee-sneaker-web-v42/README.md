# Bee Sneaker V42

Thay đổi chính: CTV không nhận/không nhìn thấy phí vận chuyển thực tế do GHSV trả về. CTV chỉ thấy phí ship Bee Sneaker lưu trên đơn. Admin thấy riêng cả phí ship Bee Sneaker và phí GHSV thực tế.

# Bee Sneaker V41

Sửa lỗi GHSV của V40: `firstDefined is not defined`.

- Giữ luồng mã nội bộ -> MVD GHSV đã liên kết.
- Sửa parser thông tin đơn và tracking sau khi GHSV trả HTTP 200.
- Không thay đổi DATABASE_URL hoặc dữ liệu PostgreSQL.
- Chỉ cần GHSV_TOKEN trong Render Environment cho phần tra cứu.

# Bee Sneaker V40

Sửa lỗi tra GHSV khi đã liên kết mã nội bộ (MDT) với MVD GHSV.

- CTV vẫn chỉ dùng mã nội bộ, ví dụ `GYRPPH9Y`.
- Nếu admin đã liên kết `GYRPPH9Y -> B57BRYK0020982`, backend sẽ **bắt buộc ưu tiên MVD** khi gọi GHSV.
- MVD chỉ hiển thị cho admin; CTV không cần biết MVD.
- Log Render ghi rõ web đang dùng mã nội bộ hay MVD đã liên kết, nhưng không log token.
- Giữ nguyên dữ liệu PostgreSQL hiện tại.

Render Root Directory: `bee-sneaker-web-v5/bee-sneaker-web-v40/`

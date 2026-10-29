# 01 · Tổng quan

## Bối cảnh

Công ty có nhiều dự án, mỗi dự án có nhiều môi trường (dev, uat, staging, prod…). Mỗi môi trường cần lưu trữ:

- thông tin đăng nhập (username/password), API key, token, SSH key/cert;
- link tài liệu, ghi chú vận hành.

Một số item **dùng chung giữa nhiều môi trường**. Ví dụ, đối tác cấp một tài khoản dùng cho cả UAT và Staging. Khi đối tác đổi mật khẩu, chỉ cần sửa **một chỗ** là mọi môi trường liên quan nhận giá trị mới.

Công ty có thể triển khai Vaultwarden nhưng chưa có thời điểm. KeyMesh là công cụ **cá nhân** dùng trong lúc chờ, và phải chuyển sang Vaultwarden/Bitwarden dễ dàng khi cần.

## Mục tiêu

| # | Mục tiêu |
|---|---|
| G1 | Tổ chức secret theo **Project → Environment**; một item gán được cho nhiều env, kể cả khác project |
| G2 | Sửa một lần, mọi env được gán thấy ngay giá trị mới; có lịch sử phiên bản để khôi phục |
| G3 | Dùng được trên **máy tính, Android và iPhone**, có cả chế độ offline |
| G4 | **Mã hoá đầu-cuối**: server và nhà cung cấp hạ tầng không đọc được dữ liệu |
| G5 | **Không cần server chạy liên tục** do mình quản lý, chi phí 0đ |
| G6 | Export được sang định dạng Bitwarden để chuyển lên Vaultwarden |

## Ngoài phạm vi (giai đoạn hiện tại)

- **Chia sẻ cho nhiều người dùng** theo phân quyền project+env. Mô hình dữ liệu được thiết kế để không cản trở việc này, nhưng phần mật mã cho chia sẻ (khoá theo env, khoá công khai cho từng thành viên) để sang giai đoạn sau, hoặc giao hẳn cho Vaultwarden. Xem [08-roadmap.md](08-roadmap.md).
- Tự động điền (autofill) vào trình duyệt hoặc app.
- Quản lý secret cho ứng dụng (inject env var vào CI/CD), vốn là việc của Infisical, Doppler hay Vault.

## Ràng buộc

- Không có server riêng chạy 24/7. Chỉ dùng dịch vụ serverless hoặc static ở gói miễn phí.
- Trên iOS không có File System Access API, và OAuth trong PWA standalone kém ổn định, nên **không phụ thuộc vào file cục bộ hay OAuth bên thứ ba** cho luồng chính.
- Dữ liệu cá nhân nhỏ, ước tính dưới 1 MB sau mã hoá.

## Quyết định chính

| Mã | Quyết định | Lý do | Phương án đã loại |
|---|---|---|---|
| D1 | Host trên **Cloudflare Pages + Pages Functions + D1** | Chạy được trên cả iOS lẫn Android, không cần OAuth, cùng origin, miễn phí, D1 nhất quán mạnh nên phát hiện được xung đột | Google Drive: OAuth trong PWA trên iOS hay lỗi, token chỉ sống khoảng 1 giờ. Dropbox: tương tự. R2: cần thẻ thanh toán |
| D2 | **Đồng bộ cả vault dưới dạng một blob mã hoá**, gộp dữ liệu ở client theo từng item | Đơn giản, server không biết cấu trúc dữ liệu, kích thước nhỏ | Mỗi item một dòng trong DB: lộ số lượng item và thời điểm sửa, phức tạp hơn mà chưa cần |
| D3 | **Khoá phân tầng**: `vaultKey` ngẫu nhiên, được bọc bởi khoá dẫn xuất từ mật khẩu hoặc từ passkey | Đổi mật khẩu không phải mã hoá lại dữ liệu; mở khoá bằng vân tay | Mã hoá trực tiếp bằng khoá từ mật khẩu như v1 |
| D4 | Xác thực theo mô hình Bitwarden: `masterKey → HKDF → encKey + authKey`, server chỉ lưu `SHA-256(authKey)` | Server không bao giờ thấy mật khẩu hay khoá giải mã | OAuth, magic link |
| D5 | **PWA vanilla JS, không có bước build** | Dễ đọc, dễ audit, ít phụ thuộc chuỗi cung ứng | React/Vue cùng bundler |
| D6 | Gộp **ba chiều theo từng item** (base, local, remote); khi cả hai phía cùng sửa thì bản mới hơn thắng, bản thua được lưu vào lịch sử | Không bao giờ mất dữ liệu âm thầm | Ghi đè cả file theo kiểu bản ghi sau thắng |

## Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Vault** | Toàn bộ dữ liệu của một người dùng (projects, envs, items) |
| **Project** | Dự án của công ty |
| **Env** | Môi trường thuộc một project |
| **Item** | Một đơn vị thông tin (login, API key, token, SSH, doc, note), gồm nhiều field |
| **Scope** | Danh sách env mà item được gán vào; một item có thể có nhiều scope |
| **Shared item** | Item có từ 2 scope trở lên |
| **Fork** | Tách item ra thành bản riêng cho một env, kèm `forkedFrom` trỏ về bản gốc |
| **Tombstone** | Bản ghi đánh dấu đã xoá (`deletedAt`), giữ lại để việc xoá được đồng bộ đúng |
| **Blob** | Vault sau khi mã hoá, là thứ duy nhất server lưu |
| **Base** | Snapshot vault ở lần đồng bộ thành công gần nhất, dùng cho gộp ba chiều |

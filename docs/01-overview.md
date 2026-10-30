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
| D2 | **Nhiều vault cho mỗi user, mỗi vault đồng bộ dưới dạng một blob mã hoá**, gộp dữ liệu ở client | Đơn giản, server không biết cấu trúc dữ liệu, kích thước nhỏ; tách được vault công việc và cá nhân, và là đơn vị chia sẻ tự nhiên sau này | Mỗi item một dòng trong DB: lộ số lượng item và thời điểm sửa, phức tạp hơn mà chưa cần. Một vault duy nhất: khó mở rộng |
| D3 | **Khoá phân tầng**: `accountKey` ngẫu nhiên được bọc bởi khoá dẫn xuất từ mật khẩu hoặc từ passkey; mỗi vault có `vaultKey` riêng được bọc bởi `accountKey` | Đổi mật khẩu không phải mã hoá lại dữ liệu; mở khoá bằng vân tay; mở một lần là dùng được mọi vault; xoay khoá từng vault độc lập | Mã hoá trực tiếp bằng khoá từ mật khẩu như v1 |
| D4 | Xác thực theo mô hình Bitwarden: `masterKey → HKDF → encKey + authKey`, server chỉ lưu `SHA-256(authKey)` | Server không bao giờ thấy mật khẩu hay khoá giải mã | OAuth, magic link |
| D5 | **PWA vanilla JS, không có bước build** | Dễ đọc, dễ audit, ít phụ thuộc chuỗi cung ứng | React/Vue cùng bundler |
| D6 | Gộp **ba chiều theo từng field** (base, local, remote); sửa hai field khác nhau thì giữ cả hai; chỉ khi cả hai phía cùng sửa một field thì bản mới hơn thắng, bản thua được lưu vào lịch sử | Không bao giờ mất dữ liệu âm thầm, ít xung đột giả | Ghi đè cả file theo kiểu bản ghi sau thắng; gộp theo item (sửa hai field khác nhau vẫn bị tính là xung đột) |
| D7 | **Xoá item vào thùng rác** 30 ngày trước khi xoá trắng | Lấy lại được item lỡ xoá mà không phải khôi phục cả snapshot | Xoá trắng ngay, chỉ dựa vào snapshot |
| D8 | **Không dùng file cục bộ làm nơi lưu**; trên Chromium có bản sao tự động chỉ ghi ra file | Chỉ một luồng dữ liệu (IndexedDB ⇄ server) mà vẫn có bản sao ngoài trình duyệt | Đọc/ghi file như v1: phải gộp ba nguồn, không có compare-and-swap trên file, chỉ chạy trên Chromium |

## Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Vault** | Một tập dữ liệu (projects, envs, items) có khoá riêng, đồng bộ thành một blob. Một người dùng có một hoặc nhiều vault, ví dụ *Công việc* và *Cá nhân* |
| **Account key** | Khoá ngẫu nhiên của tài khoản, mở bằng master password hoặc passkey, dùng để bọc `vaultKey` của từng vault |
| **Project** | Dự án của công ty |
| **Env** | Môi trường thuộc một project |
| **Item** | Một đơn vị thông tin (login, API key, token, SSH, doc, note), gồm nhiều field |
| **Scope** | Danh sách env mà item được gán vào; một item có thể có nhiều scope |
| **Shared item** | Item có từ 2 scope trở lên |
| **Fork** | Tách item ra thành bản riêng cho một env, kèm `forkedFrom` trỏ về bản gốc |
| **Tombstone** | Bản ghi đánh dấu đã xoá (`deletedAt`), giữ lại để việc xoá được đồng bộ đúng |
| **Thùng rác** | Nơi chứa item đã xoá (`deletedAt`) trong 30 ngày, còn đủ nội dung để khôi phục; sau đó item bị xoá trắng (`purgedAt`) |
| **Blob** | Một vault sau khi mã hoá; server lưu một blob cho mỗi vault |
| **Base** | Snapshot vault ở lần đồng bộ thành công gần nhất, dùng cho gộp ba chiều |

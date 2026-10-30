# 04 · Bảo mật

## Nguyên tắc

1. **Zero-knowledge:** server không bao giờ nhận được master password, `masterKey`, `encKey`, `accountKey`, `vaultKey` hay dữ liệu plaintext (kể cả tên vault).
2. **Tách khoá xác thực khỏi khoá giải mã:** lộ `auth_hash` trên server không giúp giải mã được vault.
3. **Dữ liệu chỉ nằm trên đĩa ở dạng đã mã hoá**, cả ở thiết bị lẫn trên server.
4. **Ít phụ thuộc:** không có thư viện bên thứ ba ở frontend, chỉ dùng WebCrypto và WebAuthn của trình duyệt.

## Mật mã

| Mục đích | Thuật toán | Tham số |
|---|---|---|
| Dẫn xuất từ mật khẩu | PBKDF2-HMAC-SHA256 | 600 000 vòng (theo khuyến nghị OWASP 2023), salt 16B ngẫu nhiên cho mỗi user |
| Tách khoá | HKDF-SHA256 | `info` = `keymesh/enc`, `keymesh/auth`, `keymesh/prf` |
| Mã hoá vault và bọc khoá | AES-GCM-256 | IV 12B ngẫu nhiên mỗi lần mã hoá, có AAD (xem [03](03-data-model.md#2-khoá-và-envelope)) |
| Lưu authKey trên server | SHA-256 | `authKey` có 256 bit entropy nên không cần KDF chậm phía server |
| Session token | 32B ngẫu nhiên (base64url) | server lưu `SHA-256(token)` |
| Mở khoá sinh trắc học | WebAuthn PRF extension | salt PRF 32B cố định cho mỗi credential |

> Argon2id tốt hơn PBKDF2 trước tấn công bằng GPU, nhưng WebCrypto chưa hỗ trợ nên phải dùng WASM. Trường `kdf_name` đã được thiết kế sẵn để nâng cấp sau. Xem [08-roadmap.md](08-roadmap.md).

## Vòng đời khoá

| Sự kiện | Hành động |
|---|---|
| Tạo tài khoản | Sinh `salt`, `accountKey` và `vaultKey` (cho vault mặc định) ngẫu nhiên. Client gửi `kdf`, `authKey`, `wrap(encKey, accountKey)` và `wrap(accountKey, vaultKey)` |
| Tạo vault mới | Sinh `vaultKey` ngẫu nhiên, gửi `wrap(accountKey, vaultKey)` cùng blob và meta đã mã hoá |
| Đăng nhập trên thiết bị mới | Lấy `kdf`, dẫn xuất khoá, gửi `authKey`, nhận lại `wrappedAccountKey` và token; danh sách vault kèm từng `wrappedVaultKey` |
| Mở khoá bằng mật khẩu (offline) | Dẫn xuất `encKey` từ `kdf` đang lưu ở `meta.account`, mở `wrappedAccountKey`, rồi mở `wrappedVaultKey` của từng vault cục bộ. **Không cần server** |
| Mở khoá bằng passkey | `navigator.credentials.get({prf})` → `prfKey` → mở `meta.passkey.wrappedAccountKey` → mở các `vaultKey` |
| Khoá app | Xoá `accountKey`, mọi `vaultKey` và vault plaintext khỏi bộ nhớ, render lại màn hình khoá |
| Đổi mật khẩu | Sinh salt mới, dẫn xuất `encKey'` và `authKey'`, bọc lại **cùng** `accountKey`. Server đổi `security_stamp`, nên mọi session khác bị vô hiệu. Không cần mã hoá lại vault nào, passkey vẫn dùng được |
| Nghi bị lộ `vaultKey` của một vault | *Xoay khoá vault*: sinh `vaultKey` mới, mã hoá lại vault và meta, bọc lại khoá, xoá snapshot cũ của vault đó. Các vault khác không bị ảnh hưởng |
| Nghi bị lộ `accountKey` | *Xoay khoá tài khoản*: sinh `accountKey` mới, bọc lại mọi `vaultKey`, đổi `security_stamp`, huỷ mọi passkey. Nên xoay thêm `vaultKey` của từng vault nếu không chắc phạm vi bị lộ |
| Xoá vault | Xoá blob, snapshot và `wrappedVaultKey` trên server; thiết bị khác xoá bản cục bộ ở lần sync sau. Cần nhập lại master password |

## Xác thực và phiên đăng nhập

- **Đăng ký:** chỉ mở khi có biến môi trường `REGISTRATION_TOKEN`. Sau khi tạo xong tài khoản thì xoá biến này để đóng đăng ký.
- **Đăng nhập:** so sánh `SHA-256(authKey)` với `auth_hash` theo kiểu **constant-time**.
- **Rate limit:** 5 lần sai trong 15 phút cho mỗi username, 20 lần mỗi IP, sau đó khoá 15 phút. Mỗi lần sai đều ghi `dt_audit_log`.
- **Prelogin:** trả về `kdf` cho username không tồn tại bằng salt giả, sinh tất định từ `HMAC(secret, username)`, để không lộ username nào có thật.
- **Session:** gửi qua header `Authorization: Bearer <token>`, hạn trượt 30 ngày, kiểm tra `security_stamp` mỗi request. Màn *Thiết bị* cho phép thu hồi từng session.
- **Không dùng cookie**, nên không bị CSRF. Token nằm ở IndexedDB, rủi ro chính là XSS, được giảm bằng CSP chặt (xem bên dưới).
- **Kiểm tra Origin:** server từ chối request có `Origin` ngoài `ALLOWED_ORIGINS`. Danh sách này là cấu hình, nên chuyển từ `pages.dev` sang domain riêng không phải sửa code (xem [02](02-architecture.md#cấu-hình-theo-domain)).
- **Phân quyền theo vault:** mọi truy vấn vault đều lọc theo `user_id` của session. Id vault là 16 hex ngẫu nhiên; đoán được id cũng không truy cập được vault của người khác, và server trả cùng một lỗi `404` cho vault không tồn tại lẫn vault không thuộc mình. Vì id ngẫu nhiên không chứa thông tin gì, không cần băm hay HMAC id trước khi gửi.

## Mở khoá bằng passkey (WebAuthn PRF)

- **Hỗ trợ:** Chrome Android (dùng Google Password Manager), Safari iOS/macOS 18+ (iCloud Keychain), Chrome desktop 132+.
- **Đăng ký:** `navigator.credentials.create({ publicKey: {…, extensions: { prf: { eval: { first: prfSalt } } } } })`. Nếu trả về `prf.enabled !== true` thì báo thiết bị không hỗ trợ.
- Passkey **chỉ dùng để mở khoá cục bộ**, không dùng để xác thực với server ở giai đoạn này. Session token vẫn là thứ dùng để gọi API.
- Passkey là lựa chọn **theo từng thiết bị**. Đổi mật khẩu không ảnh hưởng đến passkey, vì passkey bọc trực tiếp `accountKey`. Xoay khoá của một vault cũng không ảnh hưởng. Chỉ xoay khoá tài khoản thì phải đăng ký lại passkey.
- Passkey gắn với **RP ID** (domain). Chuyển sang domain riêng thì phải đăng ký lại passkey trên domain mới.
- Luôn giữ đường dự phòng bằng master password.

## Bảo vệ trên client

| Biện pháp | Chi tiết |
|---|---|
| **CSP** (qua `_headers`) | `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'` |
| Header khác | `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` tắt các API không dùng |
| Không dùng `innerHTML` với dữ liệu người dùng | Escape mọi nơi như v1, hoặc dùng `textContent` |
| Tự khoá | Desktop mặc định 10 phút không thao tác. Mobile mặc định **khoá sau 60 giây** khi app chuyển sang nền (`visibilitychange`). Cả hai **chỉnh được trong cài đặt** của từng thiết bị |
| Bản sao file | File bản sao tự động là `keymesh-backup` đã mã hoá, an toàn ngang file backup tải về. Lưu ý nếu đặt trong thư mục đồng bộ đám mây thì bên thứ ba có thêm một bản ciphertext để brute-force offline, nên master password càng phải mạnh |
| Clipboard | Tự xoá sau 30 giây nếu nội dung clipboard vẫn là giá trị đã copy (best-effort; trên Android 13+ hệ điều hành cũng tự ẩn bản xem trước) |
| Ẩn secret | Mặc định che, bấm vào để hiện, và tự che lại khi chuyển item |
| Cache API | Service Worker **không** cache `/api/*`, và API trả `Cache-Control: no-store` |

## Mô hình mối đe doạ

| Mối đe doạ | Hậu quả | Giảm thiểu | Rủi ro còn lại |
|---|---|---|---|
| Lộ DB D1 hoặc tài khoản Cloudflare chỉ bị đọc | Lộ blob, `auth_hash`, metadata (số vault, kích thước, thời điểm sửa) | Blob và tên vault mã hoá bằng `vaultKey`; `auth_hash` không giúp giải mã | Kẻ tấn công vẫn có thể brute-force offline master password từ `wrapped_account_key` và `kdf`. **Cần master password mạnh** (≥ 4 từ ngẫu nhiên hoặc ≥ 14 ký tự) |
| Tài khoản Cloudflare bị chiếm quyền ghi | Kẻ tấn công thay JS độc để lấy mật khẩu ở lần mở sau | Bật 2FA/khoá bảo mật cho Cloudflare; dùng API token có quyền hẹp | Đây là rủi ro lớn nhất của mọi web vault. Tuỳ chọn: thêm Cloudflare Access phía trước |
| Mất hoặc bị trộm điện thoại | Truy cập dữ liệu cục bộ | Dữ liệu mã hoá; tự khoá khi chuyển nền; passkey đòi sinh trắc học; thu hồi session từ máy khác | Nếu vault đang mở khi bị giật máy thì lộ đến khi tự khoá |
| XSS | Đọc vault trong bộ nhớ, lấy token | CSP chặt, không có script bên thứ ba, escape output | — |
| Tấn công MITM | — | HTTPS và HSTS từ Cloudflare | — |
| Brute-force đăng nhập online | — | Rate limit và authKey 256 bit | — |
| Xung đột đồng bộ làm mất dữ liệu | — | Gộp ba chiều theo field, lưu bản thua vào `history`, thùng rác 30 ngày, cùng 30 snapshot trên server cho mỗi vault | — |
| Lỡ tay xoá item | — | Thùng rác giữ nguyên nội dung 30 ngày trước khi xoá trắng | Sau khi xoá trắng thì chỉ còn snapshot hoặc file backup |
| Quên master password | Mất toàn bộ dữ liệu | Passkey trên thiết bị đã đăng ký vẫn mở được, dùng để đặt mật khẩu mới; nên tải backup định kỳ | Có thể thêm *recovery key* in ra giấy (xem roadmap) |

## Lưu ý tuân thủ

Đây là credential của công ty và đối tác. Trước khi dùng, nên kiểm tra chính sách nội bộ về việc lưu credential trên thiết bị và dịch vụ cá nhân. Dữ liệu được mã hoá đầu-cuối, nhưng chính sách có thể vẫn cấm.

# 06 · API

- **Base:** `/api`, cùng origin với app.
- **Định dạng:** JSON; với lỗi là `{ "error": "<code>", "message": "<mô tả>" }`.
- **Auth:** `Authorization: Bearer <token>` cho mọi endpoint, trừ các endpoint có đánh dấu 🔓.
- **Header phản hồi:** mọi response có `Cache-Control: no-store`.
- **Body:** tối đa 2 MB.

## Tổng quan

| Method | Path | Mô tả |
|---|---|---|
| GET 🔓 | `/api/prelogin?username=` | Lấy tham số KDF |
| POST 🔓 | `/api/register` | Tạo tài khoản (cần `REGISTRATION_TOKEN`) |
| POST 🔓 | `/api/login` | Đăng nhập, nhận session token |
| POST | `/api/logout` | Huỷ session hiện tại |
| GET | `/api/vault` | Lấy blob (hỗ trợ `?since=`) |
| PUT | `/api/vault` | Ghi blob kèm kiểm tra version |
| GET | `/api/snapshots` | Danh sách snapshot |
| GET | `/api/snapshots/:version` | Lấy một snapshot |
| GET | `/api/sessions` | Danh sách thiết bị/phiên |
| DELETE | `/api/sessions/:id` | Thu hồi một phiên |
| POST | `/api/account/password` | Đổi master password |
| POST | `/api/account/rotate` | Xoay `vaultKey` |
| GET | `/api/audit?limit=` | Nhật ký hoạt động |

## Chi tiết

### `GET /api/prelogin?username=kingfisher` 🔓

```json
200 { "kdf": { "name": "PBKDF2-SHA256", "iter": 600000, "salt": "base64…" } }
```
Username không tồn tại vẫn trả 200 với salt giả sinh tất định.

### `POST /api/register` 🔓

```jsonc
// request
{
  "registrationToken": "…",
  "username": "kingfisher",
  "kdf": { "name": "PBKDF2-SHA256", "iter": 600000, "salt": "base64" },
  "authKey": "base64 32B",
  "wrappedVaultKey": { "iv": "…", "ct": "…" },
  "vault": { "format": "keymesh", "v": 2, "alg": "AES-GCM-256", "iv": "…", "ct": "…" },
  "deviceName": "MacBook · Chrome"
}
// 201
{ "userId": "u_…", "token": "…", "expiresAt": 0, "version": 1 }
```
Lỗi: `403 registration_closed`, `409 username_taken`, `400 invalid_kdf` (khi `iter` < 600000).

### `POST /api/login` 🔓

```jsonc
// request
{ "username": "kingfisher", "authKey": "base64", "deviceName": "Pixel 8 · Chrome" }
// 200
{ "userId": "u_…", "token": "…", "expiresAt": 0, "sessionId": "s_…",
  "kdf": { … }, "wrappedVaultKey": { "iv": "…", "ct": "…" } }
```
Lỗi: `401 invalid_credentials` (không phân biệt sai username hay sai mật khẩu), `429 too_many_attempts` kèm header `Retry-After`.

### `POST /api/logout`

`204`. Xoá session hiện tại. Client cũng xoá `meta.session`, và nếu người dùng chọn "Đăng xuất & xoá dữ liệu trên máy này" thì xoá cả IndexedDB.

### `GET /api/vault?since=<version>`

```jsonc
200 { "version": 8, "updatedAt": 0, "blob": { …envelope… } }
304   // khi since == version hiện tại
```

### `PUT /api/vault`

```jsonc
// request
{ "baseVersion": 8, "blob": { …envelope… } }
// 200
{ "version": 9, "updatedAt": 0 }
// 409 – version đã thay đổi
{ "error": "version_conflict", "version": 10, "updatedAt": 0, "blob": { … } }
```
Lỗi: `413 too_large`, `400 invalid_envelope`. Server kiểm tra định dạng envelope (đúng các trường `format`, `v`, `iv`, `ct`) nhưng không thể kiểm tra nội dung bên trong.

### `GET /api/snapshots`

```json
200 { "items": [ { "version": 8, "createdAt": 0, "size": 12345 } ] }
```

### `GET /api/snapshots/:version`

```json
200 { "version": 8, "createdAt": 0, "blob": { … } }
```

### `GET /api/sessions` · `DELETE /api/sessions/:id`

```json
200 { "items": [ { "id": "s_…", "deviceName": "Pixel 8 · Chrome", "createdAt": 0, "lastSeenAt": 0, "current": true } ] }
```
`DELETE` trả `204`. Nếu xoá chính session hiện tại thì tương đương logout.

### `POST /api/account/password`

```jsonc
// request
{
  "authKey": "base64 – khoá cũ, để xác nhận",
  "newKdf": { "name": "PBKDF2-SHA256", "iter": 600000, "salt": "base64 mới" },
  "newAuthKey": "base64",
  "newWrappedVaultKey": { "iv": "…", "ct": "…" },
  "keepCurrentSession": true
}
// 200
{ "token": "…mới…", "expiresAt": 0 }
```
Server đổi `security_stamp`, nên mọi session khác bị vô hiệu.

### `POST /api/account/rotate`

```jsonc
{ "authKey": "…", "newWrappedVaultKey": { … }, "baseVersion": 9, "blob": { …mã hoá bằng vaultKey mới… } }
```
Thực hiện trong một transaction: ghi khoá mới cùng blob mới, **xoá toàn bộ snapshot cũ** (vì chúng mã hoá bằng khoá cũ), và đổi `security_stamp`.

### `GET /api/audit?limit=50`

```json
200 { "items": [ { "at": 0, "action": "login", "deviceName": "…", "meta": {} } ] }
```

## Mã lỗi chung

| HTTP | `error` | Khi nào |
|---|---|---|
| 400 | `bad_request` | JSON sai hoặc thiếu trường |
| 401 | `unauthorized` | Token thiếu, hết hạn, đã thu hồi, hoặc `security_stamp` đã đổi |
| 404 | `not_found` | |
| 409 | `version_conflict` | Xem PUT `/api/vault` |
| 413 | `too_large` | Body > 2 MB |
| 429 | `too_many_attempts` | Bị rate limit |
| 500 | `internal` | |

Khi nhận 401, client chuyển sang màn đăng nhập nhưng **vẫn giữ dữ liệu cục bộ đã mã hoá**, kể cả các thay đổi đang dirty, và push lại sau khi đăng nhập.

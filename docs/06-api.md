# 06 · API

- **Base:** `/api`, cùng origin với app.
- **Định dạng:** JSON; với lỗi là `{ "error": "<code>", "message": "<mô tả>" }`.
- **Auth:** `Authorization: Bearer <token>` cho mọi endpoint, trừ các endpoint có đánh dấu 🔓.
- **Origin:** server từ chối request có header `Origin` không nằm trong `ALLOWED_ORIGINS` (cấu hình, xem [02](02-architecture.md#cấu-hình-theo-domain)).
- **Header phản hồi:** mọi response có `Cache-Control: no-store`.
- **Body:** tối đa 2 MB.
- **Id vault (`:id`):** 16 hex ngẫu nhiên, không tiền tố. Mọi endpoint `/api/vaults/:id/*` trả `404 not_found` nếu vault không tồn tại **hoặc không thuộc user của session** (không phân biệt hai trường hợp).

## Tổng quan

| Method | Path | Mô tả |
|---|---|---|
| GET 🔓 | `/api/prelogin?username=` | Lấy tham số KDF |
| POST 🔓 | `/api/register` | Tạo tài khoản cùng vault đầu tiên (cần `REGISTRATION_TOKEN`) |
| POST 🔓 | `/api/login` | Đăng nhập, nhận session token |
| POST | `/api/logout` | Huỷ session hiện tại |
| GET | `/api/vaults` | Danh sách vault (không kèm blob) |
| POST | `/api/vaults` | Tạo vault mới |
| GET | `/api/vaults/:id` | Lấy blob của một vault (hỗ trợ `?since=`) |
| PUT | `/api/vaults/:id` | Ghi blob kèm kiểm tra version |
| PATCH | `/api/vaults/:id` | Đổi metadata (tên, màu, thứ tự) đã mã hoá |
| DELETE | `/api/vaults/:id` | Xoá vault cùng mọi snapshot của nó |
| POST | `/api/vaults/:id/rotate` | Xoay `vaultKey` của một vault |
| GET | `/api/vaults/:id/snapshots` | Danh sách snapshot của vault |
| GET | `/api/vaults/:id/snapshots/:version` | Lấy một snapshot |
| GET | `/api/sessions` | Danh sách thiết bị/phiên |
| DELETE | `/api/sessions/:id` | Thu hồi một phiên |
| POST | `/api/account/password` | Đổi master password |
| POST | `/api/account/rotate` | Xoay `accountKey` (bọc lại mọi `vaultKey`) |
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
  "wrappedAccountKey": { "iv": "…", "ct": "…" },
  "vault": {                                   // vault mặc định
    "id": "3f9c1a0b7d2e4c58",
    "wrappedVaultKey": { "by": "account", "iv": "…", "ct": "…" },
    "meta": { "iv": "…", "ct": "…" },
    "blob": { "format": "keymesh", "v": 2, "alg": "AES-GCM-256", "iv": "…", "ct": "…" }
  },
  "deviceName": "MacBook · Chrome"
}
// 201
{ "userId": "u_…", "token": "…", "expiresAt": 0, "vault": { "id": "3f9c…", "version": 1, "metaVersion": 1 } }
```
Lỗi: `403 registration_closed`, `409 username_taken`, `400 invalid_kdf` (khi `iter` < 600000), `400 invalid_id`.

### `POST /api/login` 🔓

```jsonc
// request
{ "username": "kingfisher", "authKey": "base64", "deviceName": "Pixel 8 · Chrome" }
// 200
{ "userId": "u_…", "token": "…", "expiresAt": 0, "sessionId": "s_…",
  "kdf": { … }, "wrappedAccountKey": { "iv": "…", "ct": "…" } }
```
Lỗi: `401 invalid_credentials` (không phân biệt sai username hay sai mật khẩu), `429 too_many_attempts` kèm header `Retry-After`.

### `POST /api/logout`

`204`. Xoá session hiện tại. Client cũng xoá `meta.session`, và nếu người dùng chọn "Đăng xuất & xoá dữ liệu trên máy này" thì xoá cả IndexedDB.

### `GET /api/vaults`

```jsonc
200 {
  "items": [
    { "id": "3f9c1a0b7d2e4c58", "version": 8, "metaVersion": 2, "size": 12345,
      "createdAt": 0, "updatedAt": 0,
      "wrappedVaultKey": { "by": "account", "iv": "…", "ct": "…" },
      "meta": { "iv": "…", "ct": "…" } }
  ]
}
304   // khi If-None-Match khớp ETag hiện tại (ETag tính từ danh sách (id, version, metaVersion))
```
Client gọi endpoint này mỗi 60 giây để biết vault nào có thay đổi, thay vì gọi riêng từng vault.

### `POST /api/vaults`

```jsonc
// request: client tự sinh id và vaultKey
{ "id": "a1b2…", "wrappedVaultKey": { "by": "account", … }, "meta": { … }, "blob": { …envelope… } }
// 201
{ "id": "a1b2…", "version": 1, "metaVersion": 1 }
```
Lỗi: `409 vault_exists` (id đã có), `400 invalid_id`.

### `GET /api/vaults/:id?since=<version>`

```jsonc
200 { "version": 8, "updatedAt": 0, "blob": { …envelope… } }
304   // khi since == version hiện tại
```

### `PUT /api/vaults/:id`

```jsonc
// request
{ "baseVersion": 8, "blob": { …envelope… } }
// 200
{ "version": 9, "updatedAt": 0 }
// 409 – version đã thay đổi
{ "error": "version_conflict", "version": 10, "updatedAt": 0, "blob": { … } }
```
Lỗi: `413 too_large`, `400 invalid_envelope`. Server kiểm tra định dạng envelope (đúng các trường `format`, `v`, `iv`, `ct`) nhưng không thể kiểm tra nội dung bên trong.

### `PATCH /api/vaults/:id`

```jsonc
// request
{ "baseMetaVersion": 2, "meta": { "iv": "…", "ct": "…" } }
// 200
{ "metaVersion": 3 }
// 409
{ "error": "version_conflict", "metaVersion": 4, "meta": { … } }
```

### `DELETE /api/vaults/:id`

```jsonc
// request
{ "authKey": "…" }   // xác nhận lại mật khẩu vì không khôi phục được
```
`204`. Xoá vault và mọi snapshot của nó. Không cho xoá vault cuối cùng của user (`409 last_vault`).

### `POST /api/vaults/:id/rotate`

```jsonc
{ "authKey": "…", "newWrappedVaultKey": { … }, "baseVersion": 9,
  "blob": { …mã hoá bằng vaultKey mới… }, "meta": { …mã hoá bằng vaultKey mới… } }
```
Thực hiện trong một transaction: ghi khoá mới, blob mới và meta mới, rồi **xoá toàn bộ snapshot cũ của vault đó** (vì chúng mã hoá bằng khoá cũ).

### `GET /api/vaults/:id/snapshots`

```json
200 { "items": [ { "version": 8, "createdAt": 0, "size": 12345 } ] }
```

### `GET /api/vaults/:id/snapshots/:version`

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
  "newWrappedAccountKey": { "iv": "…", "ct": "…" },
  "keepCurrentSession": true
}
// 200
{ "token": "…mới…", "expiresAt": 0 }
```
Server đổi `security_stamp`, nên mọi session khác bị vô hiệu. Không vault nào phải mã hoá lại.

### `POST /api/account/rotate`

```jsonc
{
  "authKey": "…",
  "newWrappedAccountKey": { … },
  "vaults": [ { "id": "3f9c…", "newWrappedVaultKey": { "by": "account", … } } ]   // phải đủ mọi vault của user
}
```
Dùng khi nghi lộ `accountKey`. Thực hiện trong một transaction: thay `wrapped_account_key` và `wrapped_vault_key` của mọi vault, đổi `security_stamp`. Blob không đổi vì `vaultKey` giữ nguyên; nếu nghi lộ cả `vaultKey` thì xoay thêm từng vault. Lỗi `400 vault_list_mismatch` nếu danh sách vault không khớp.

### `GET /api/audit?limit=50`

```json
200 { "items": [ { "at": 0, "action": "login", "deviceName": "…", "vaultId": null, "meta": {} } ] }
```

## Mã lỗi chung

| HTTP | `error` | Khi nào |
|---|---|---|
| 400 | `bad_request` | JSON sai hoặc thiếu trường |
| 400 | `invalid_id` | Id vault không đúng dạng 16 hex |
| 401 | `unauthorized` | Token thiếu, hết hạn, đã thu hồi, hoặc `security_stamp` đã đổi |
| 403 | `forbidden_origin` | `Origin` không nằm trong `ALLOWED_ORIGINS` |
| 404 | `not_found` | Kể cả vault không thuộc user hiện tại |
| 409 | `version_conflict` | Xem PUT và PATCH `/api/vaults/:id` |
| 409 | `last_vault` | Xoá vault cuối cùng |
| 413 | `too_large` | Body > 2 MB |
| 429 | `too_many_attempts` | Bị rate limit |
| 500 | `internal` | |

Khi nhận 401, client chuyển sang màn đăng nhập nhưng **vẫn giữ dữ liệu cục bộ đã mã hoá**, kể cả các thay đổi đang dirty, và push lại sau khi đăng nhập.

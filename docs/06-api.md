# 06 · API

- **Base:** `/api`, cùng origin với app.
- **Định dạng:** JSON; với lỗi là `{ "error": "<code>", "message": "<mô tả>" }`.
- **Auth:** `Authorization: Bearer <token>` cho mọi endpoint, trừ các endpoint có đánh dấu 🔓.
- **Origin:** server từ chối request có header `Origin` không nằm trong `ALLOWED_ORIGINS` (cấu hình, xem [02](02-architecture.md#cấu-hình-theo-domain)).
- **Header phản hồi:** mọi response, kể cả `304`, `4xx`, `5xx`, có `Cache-Control: no-store` và `X-Content-Type-Options: nosniff`. Không có header CORS.
- **Body:** tối đa 2 000 000 byte, tính theo số byte thật nhận được. Body trong giới hạn nhưng dòng lưu trữ vượt 2 000 000 byte cũng là `413`.
- **Lỗi:** `message` là câu cố định theo mã lỗi, không chứa giá trị đầu vào, truy vấn hay stack.
- **Username:** 1–64 ký tự, chỉ gồm chữ cái ASCII, chữ số và `.` `_` `-` `@` `+`; khác dạng đó thì `400 bad_request`. Không phân biệt hoa/thường; hoa/thường lúc đăng ký được giữ khi hiển thị.
- **Thao tác chưa giao:** mọi đường dẫn và phương thức API khác trả `404 not_found` dạng JSON, có token hay không cũng vậy.
- **Id vault (`:id`):** 16 hex ngẫu nhiên, không tiền tố. Mọi endpoint `/api/vaults/:id/*` trả `404 not_found` nếu vault không tồn tại **hoặc không thuộc user của session** (không phân biệt hai trường hợp).

## Tổng quan

| Method | Path | Mô tả | Epic |
|---|---|---|---|
| GET 🔓 | `/api/prelogin?username=` | Lấy tham số KDF | KM-005 |
| POST 🔓 | `/api/register` | Tạo tài khoản cùng vault đầu tiên (cần `REGISTRATION_TOKEN`) | KM-005 |
| POST 🔓 | `/api/login` | Đăng nhập, nhận session token | KM-005 |
| POST | `/api/logout` | Huỷ session hiện tại | KM-005 |
| GET | `/api/vaults` | Danh sách vault (không kèm blob) | KM-005 |
| POST | `/api/vaults` | Tạo vault mới | KM-005 |
| GET | `/api/vaults/:id` | Lấy blob của một vault (hỗ trợ `?since=`) | KM-005 |
| PUT | `/api/vaults/:id` | Ghi blob kèm kiểm tra version | KM-005 |
| PATCH | `/api/vaults/:id` | Đổi metadata (tên, màu, thứ tự) đã mã hoá | KM-008 |
| DELETE | `/api/vaults/:id` | Xoá vault cùng mọi snapshot của nó | KM-008 |
| POST | `/api/vaults/:id/rotate` | Xoay `vaultKey` của một vault | KM-008 |
| GET | `/api/vaults/:id/snapshots` | Danh sách snapshot của vault | KM-009 |
| GET | `/api/vaults/:id/snapshots/:version` | Lấy một snapshot | KM-009 |
| GET | `/api/sessions` | Danh sách thiết bị/phiên | KM-009 |
| DELETE | `/api/sessions/:id` | Thu hồi một phiên | KM-009 |
| POST | `/api/account/password` | Đổi master password | KM-009 |
| POST | `/api/account/rotate` | Xoay `accountKey` (bọc lại mọi `vaultKey`) | KM-009 |
| GET | `/api/audit?limit=` | Nhật ký hoạt động | KM-009 |

## Chi tiết

### `GET /api/prelogin?username=kingfisher` 🔓

```json
200 { "kdf": { "name": "PBKDF2-SHA256", "iter": 600000, "salt": "base64…" } }
```
Username không tồn tại vẫn trả 200, cùng hình dạng, `iter` 600000, salt giả 16B sinh tất định và không đổi theo hoa/thường. Thiếu `SERVER_SECRET` thì mọi lần gọi đều `500 internal`.

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
Lỗi: `403 registration_closed` (thiếu, sai, server chưa cấu hình hoặc token cấu hình dưới 32 ký tự; xét trước mọi kiểm tra nội dung, và body không phải JSON cũng là `403` vì token nằm trong body), `409 username_taken`, `409 vault_exists` (id vault đã có), `400 invalid_kdf` (`name` khác PBKDF2-SHA256, `iter` ngoài 600000–6000000, salt khác 16B), `400 invalid_id`, `400 invalid_envelope`. `deviceName` là chuỗi tuỳ chọn, tối đa 100 ký tự. Lỗi ở bất kỳ bước nào thì không có gì được tạo.

### `POST /api/login` 🔓

```jsonc
// request
{ "username": "kingfisher", "authKey": "base64", "deviceName": "Pixel 8 · Chrome" }
// 200
{ "userId": "u_…", "token": "…", "expiresAt": 0, "sessionId": "s_…",
  "kdf": { … }, "wrappedAccountKey": { "iv": "…", "ct": "…" } }
```
Lỗi: `401 invalid_credentials` (không phân biệt sai username hay sai mật khẩu, giống hệt từng byte), `429 too_many_attempts` kèm header `Retry-After` là số giây còn lại, `400 bad_request` (không bị đếm). Thiếu `SERVER_SECRET` thì `500 internal`.

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
Lỗi: `409 vault_exists` (id đã có, của ai cũng vậy: người có phiên hợp lệ biết được id đang dùng, giới hạn đã chấp nhận, xem [04](04-security.md#mô-hình-mối-đe-doạ)), `400 invalid_id`, `400 invalid_envelope`, `400 bad_request` (`wrappedVaultKey`, `meta` sai dạng hoặc thừa trường).

### `GET /api/vaults/:id?since=<version>`

```jsonc
200 { "version": 8, "updatedAt": 0, "blob": { …envelope… } }
304   // khi since == version hiện tại
```
`since` khác version hiện tại, kể cả lớn hơn, thì `200` kèm bản trên server. `since` không phải số nguyên không âm thì `400 bad_request`.

### `PUT /api/vaults/:id`

```jsonc
// request
{ "baseVersion": 8, "blob": { …envelope… } }
// 200
{ "version": 9, "updatedAt": 0 }
// 409 – version đã thay đổi
{ "error": "version_conflict", "version": 10, "updatedAt": 0, "blob": { … } }
```
Lỗi: `413 too_large`, `400 invalid_envelope`. Server kiểm tra định dạng envelope (có đúng và chỉ các trường `format` = `keymesh`, `v` = 2, `alg` = `AES-GCM-256`, `iv` là base64 của 12B, `ct` là base64 không rỗng) nhưng không thể kiểm tra nội dung bên trong. `baseVersion` khác version hiện tại, nhỏ hơn hay lớn hơn, đều là `409`.

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
| 400 | `invalid_id` | Id vault không đúng dạng 16 hex (xét sau token) |
| 400 | `invalid_kdf` | Xem `POST /api/register` |
| 400 | `invalid_envelope` | Blob sai định dạng |
| 401 | `unauthorized` | Token thiếu, hết hạn, đã thu hồi, hoặc `security_stamp` đã đổi |
| 401 | `invalid_credentials` | Xem `POST /api/login` |
| 403 | `registration_closed` | Xem `POST /api/register` |
| 403 | `forbidden_origin` | `Origin` không nằm trong `ALLOWED_ORIGINS`, kể cả `null`; danh sách rỗng thì mọi `Origin` đều bị từ chối. Không có `Origin` thì đi tiếp |
| 404 | `not_found` | Kể cả vault không thuộc user hiện tại |
| 409 | `username_taken`, `vault_exists` | Xem `POST /api/register`, `POST /api/vaults` |
| 409 | `version_conflict` | Xem PUT và PATCH `/api/vaults/:id` |
| 409 | `last_vault` | Xoá vault cuối cùng |
| 413 | `too_large` | Body > 2 000 000 byte, hoặc dòng lưu trữ vượt sức chứa |
| 429 | `too_many_attempts` | Bị rate limit |
| 500 | `internal` | |

Khi nhận 401, client chuyển sang màn đăng nhập nhưng **vẫn giữ dữ liệu cục bộ đã mã hoá**, kể cả các thay đổi đang dirty, và push lại sau khi đăng nhập.

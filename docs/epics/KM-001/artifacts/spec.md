# Spec — Lõi mật mã và model vault v2

**Epic ID:** `KM-001`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-10-30`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-001 tạo ra phần lõi v2 dùng chung cho mọi epic sau. Phần này gồm hai mảng. Mảng mật mã dẫn xuất khoá từ master password, có khoá phân tầng `accountKey` → `vaultKey`, và mã hoá vault cùng metadata vault có gắn ngữ cảnh. Mảng model định nghĩa hình dạng vault v2 cùng các thao tác cơ bản trên nó: tạo, sửa có đồng hồ và lịch sử, tombstone, và kiểm tra tính hợp lệ. Lõi không có giao diện, không lưu trữ, không gọi mạng, và chạy giống nhau trong Node lẫn trong trình duyệt. Spec này phục vụ intent §1 ("không có nền chung đã kiểm chứng để dựa vào") và §5 ("Người làm KM-002, KM-003, KM-005 và KM-007 bắt đầu được epic của mình mà không phải sửa hay định nghĩa lại cách mở khoá vault hay hình dạng dữ liệu vault"). Theo intent §6, việc chuyển dữ liệu v1 sang v2 đã bị bỏ khỏi epic này.

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md` chỉ có cấu hình codegraph, không có quy ước sản phẩm. CLAUDE.md toàn cục yêu cầu dùng ripgrep, không ảnh hưởng đến spec |
| `.aidlc/workspace.yaml` | `artifact_language: vi`; recipe `native-full`; spec có `human_review: true` |
| `docs/epics/KM-001/state.json` | `strict_mode: true` nên làm ở độ sâu đầy đủ. Chưa có feedback hay lần từ chối nào |
| `docs/epics/KM-001/artifacts/intent.md` | Phạm vi, *Not this* (bỏ migrate v1), 3 câu hỏi mở |
| `docs/epics/KM-001/KM-001.md` | Phạm vi F-AUTH-03 (phần lõi), cấu trúc dữ liệu cho F-ITM-01…16, các tiêu chí "Xong khi" |
| `docs/01-overview.md` | D3 (khoá phân tầng), D4 (masterKey → HKDF → encKey + authKey), D5 (vanilla JS, không có bước build), D7 (thùng rác), dữ liệu < 1 MB |
| `docs/03-data-model.md` §1–2 | Schema vault v2, id, `clock`, kiểu field, mẫu field, quy tắc toàn vẹn, các envelope và AAD. Đây là nguồn chuẩn, spec không chép lại mà dẫn chiếu tới |
| `docs/04-security.md` | Nguyên tắc zero-knowledge; bảng thuật toán (PBKDF2 600 000, HKDF `info`, AES-GCM-256, IV 12B, AAD); không có thư viện bên thứ ba; vòng đời khoá |
| `docs/02-architecture.md` | Lõi gồm hai module `crypto` và `model`; test bằng `node --test` |
| `docs/05-sync.md` | Những gì KM-002 sẽ cần từ model: `clock`, `history` (`HISTORY_MAX`), tombstone |
| `docs/08-roadmap.md` | M1; Q2 (thùng rác), Q5 (nhiều vault), Q7 (tiền tố id, chấp nhận cả hai dạng) |
| `docs/epics/KM-002`, `KM-003`, `KM-005`, `KM-007` | Những gì các epic phía sau cần lấy từ lõi (xem FR23, AC20) |
| `envvault.html` | Mã hiện có: PBKDF2 600k dẫn xuất thẳng khoá AES, id là 16 hex trần. Đây là mô hình mà D3 đã bỏ |
| Đo trên máy originator (Node v24.22.1, 2026-10-30) | PBKDF2-SHA256 600 000 vòng mất khoảng 93–117 ms; AES-GCM mã hoá rồi giải mã 1 MB mất khoảng 2 ms. Đây là cơ sở cho NFR06 |

## 3. User scenarios

"Người dùng" của lõi là người làm các epic phía sau (intent §2, vai 1). Trong các kịch bản dưới đây, họ gọi lõi từ code hoặc từ test.

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

1. **Tạo tài khoản và vault mặc định.**
   *Given* một master password,
   *when* người gọi yêu cầu tạo bộ khoá mới,
   *then* họ nhận về tham số `kdf` (PBKDF2-SHA256, 600 000 vòng, salt 16B mới), `authKey`, `wrappedAccountKey`, một vault v2 rỗng có `vaultId` mới, `wrappedVaultKey` của vault đó, envelope của vault và envelope metadata. Mọi giá trị trả về đều là dữ liệu tuần tự hoá được, không chứa khoá ở dạng chưa bọc.
2. **Mở khoá offline bằng master password (phần lõi của F-AUTH-03).**
   *Given* `kdf`, `wrappedAccountKey`, cùng danh sách `{ vaultId, wrappedVaultKey, envelope }` đã lưu,
   *when* người gọi đưa vào đúng master password,
   *then* họ nhận lại vault plaintext của từng vault mà không cần mạng.
3. **Sửa và lưu.**
   *Given* một vault đã mở,
   *when* người gọi tạo project và env, tạo item theo loại rồi sửa field, sau đó mã hoá lại,
   *then* item mang `rev` mới, đồng hồ của đúng giá trị đã đổi được cập nhật, bản trước được đẩy vào `history`, và envelope mới dùng IV khác với lần trước.
4. **Mở bằng khoá passkey (không chặn đường KM-007).**
   *Given* một khối byte đầu ra PRF bất kỳ dài 32B,
   *when* người gọi dẫn xuất `prfKey` rồi bọc chính `accountKey` đang dùng,
   *then* `wrappedAccountKey` mới này mở ra được cùng `accountKey`, và mọi vault mở được y như khi dùng mật khẩu.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

| Tình huống | Kết quả mong đợi |
|---|---|
| Sai master password | Mở `wrappedAccountKey` thất bại với lỗi loại `decrypt-failed`. Không trả về dữ liệu nào |
| Đổi 1 byte bất kỳ trong `iv` hoặc `ct` của bất kỳ envelope nào | `decrypt-failed`; không trả về dữ liệu một phần |
| Blob của vault A được mở dưới `vaultId` của vault B (tráo ngữ cảnh) | `decrypt-failed` |
| `wrappedVaultKey` của vault A được mở dưới `vaultId` của vault B | `decrypt-failed` |
| Envelope metadata được mở như envelope vault, hoặc ngược lại | `decrypt-failed` (AAD khác nhau) |
| `ct` bị cắt ngắn, `iv` sai độ dài, base64 hỏng, JSON hỏng, thiếu trường | Lỗi loại `format`, báo trước khi thử giải mã |
| `format` khác `keymesh`, `v` khác `2`, `alg` khác `AES-GCM-256`, `by` khác `account`, `kdf.name` khác `PBKDF2-SHA256` | Lỗi loại `unsupported`, nói rõ giá trị nào không được hỗ trợ |
| Giải mã đúng nhưng `vaultId` bên trong plaintext khác `vaultId` dùng để mở | Lỗi loại `format`, không trả vault |
| Vault rỗng (không có project, env, item) | Hợp lệ; mã hoá rồi mở lại vẫn ra vault rỗng |
| Item có `scopes = []` | Hợp lệ (mục *Chưa gán*) |
| Item có `scopes` trỏ tới env đã có tombstone | Hợp lệ, giữ nguyên (theo quy tắc toàn vẹn ở 03 §1) |
| Item sửa lần thứ 21 trở lên | `history` giữ đúng 20 bản mới nhất, mới nhất ở đầu |
| Nội dung Unicode (tiếng Việt, emoji), field nhiều dòng 64 KB, vault plaintext khoảng 1 MB | Mã hoá rồi mở lại cho ra đúng giá trị ban đầu |
| Bên gọi bỏ mọi tham chiếu tới khoá ("khoá app") | Lõi không giữ khoá hay plaintext nào ở trạng thái chung; không còn gì để xoá thêm |
| Môi trường chạy thiếu WebCrypto hoặc `CompressionStream` | Lỗi loại `unsupported` nói rõ API nào bị thiếu, không lặng lẽ chạy kém an toàn hơn |

## 4. Functional requirements

Các lỗi trong spec này được chia thành bốn loại: `decrypt-failed`, `format`, `unsupported`, `invalid` (dữ liệu vault sai schema). Cách hiện thực các loại lỗi này do build-plan quyết định. Yêu cầu chỉ là bên gọi phân biệt được loại lỗi.

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-001-FR01` | Dẫn xuất `masterKey` (32B) từ master password bằng PBKDF2-HMAC-SHA256 với salt và số vòng lấy từ tham số `kdf`. Khi tạo `kdf` mới: salt 16B ngẫu nhiên, 600 000 vòng. Khi mở: nhận `kdf` đã lưu có `iter` ≥ 600 000; `iter` nhỏ hơn hoặc `kdf.name` lạ thì báo `unsupported` | Must | intent §1, §4 (D3/D4) |
| `KM-001-FR02` | Từ `masterKey`, dẫn xuất `encKey` và `authKey` bằng HKDF-SHA256 với `info` lần lượt là `keymesh/enc` và `keymesh/auth`. Hai khoá khác nhau và tất định với cùng đầu vào. Bên gọi lấy được `authKey` dưới dạng byte để gửi server (KM-005); `encKey` không bao giờ được trả ra dưới dạng byte | Must | intent §1, §2 (KM-005) |
| `KM-001-FR03` | Từ đầu ra PRF (32B) do bên gọi đưa vào, dẫn xuất `prfKey` bằng HKDF-SHA256 với `info` = `keymesh/prf`. `prfKey` bọc và mở `accountKey` giống hệt `encKey` | Must | intent §6 ("không chặn đường" passkey) |
| `KM-001-FR04` | Sinh `accountKey` và `vaultKey` 32B, cùng `vaultId` gồm 16 hex chữ thường, đều lấy từ nguồn ngẫu nhiên mật mã của nền tảng | Must | intent §1 (D3) |
| `KM-001-FR05` | Bọc và mở `accountKey` bằng `encKey` hoặc `prfKey`: AES-GCM-256, IV 12B mới, AAD `keymesh/v2/account-key`, đầu ra `{ iv, ct }` với `ct` dài 48B. Cùng một `accountKey` bọc được dưới nhiều khoá khác nhau (mật khẩu, passkey, mật khẩu mới), và bản bọc nào cũng mở ra cùng một khoá | Must | intent §1, §2 |
| `KM-001-FR06` | Bọc và mở `vaultKey` bằng `accountKey`: AES-GCM-256, IV 12B mới, AAD `keymesh/v2/vault-key/<vaultId>`, đầu ra `{ by: "account", iv, ct }` | Must | intent §1 |
| `KM-001-FR07` | Mã hoá vault: JSON của vault → gzip → AES-GCM-256 bằng `vaultKey`, IV 12B mới **mỗi lần**, AAD `keymesh/v2/vault/<vaultId>`. Đầu ra `{ format: "keymesh", v: 2, alg: "AES-GCM-256", iv, ct }`, với `iv` và `ct` mã hoá base64 | Must | intent §5 |
| `KM-001-FR08` | Mở envelope vault với `vaultKey` và `vaultId` mong đợi: kiểm tra `format`/`v`/`alg`, giải mã, giải nén, đọc JSON, kiểm tra `vaultId` bên trong khớp với `vaultId` mong đợi, rồi trả về vault | Must | intent §5 |
| `KM-001-FR09` | Mã hoá và mở metadata vault `{ name, color, order }` bằng `vaultKey`, AAD `keymesh/v2/vault-meta/<vaultId>`, đầu ra `{ iv, ct }` | Must | intent §1 (khớp 03 §2) |
| `KM-001-FR10` | Mọi lần giải mã thất bại (sai khoá, sai AAD hoặc ngữ cảnh, sửa bất kỳ byte nào) đều trả về **cùng một** loại lỗi `decrypt-failed`, không trả dữ liệu một phần, không phân biệt "sai mật khẩu" với "bị sửa" | Must | intent §5 ("bị từ chối thay vì trả ra dữ liệu sai") |
| `KM-001-FR11` | Envelope sai cấu trúc trả về lỗi `format`; phiên bản, thuật toán, `by` hoặc KDF không hỗ trợ trả về lỗi `unsupported`. Cả hai được báo trước khi thử giải mã | Must | intent §5 |
| `KM-001-FR12` | Mở khoá trọn chuỗi: từ master password, `kdf`, `wrappedAccountKey` và danh sách vault đã bọc, trả về mọi vault plaintext mà không cần mạng. Vault nào lỗi thì báo lỗi theo `vaultId` của vault đó, các vault còn lại vẫn mở được | Must | intent §2 (KM-003), F-AUTH-03 |
| `KM-001-FR13` | Tạo vault v2 rỗng `{ v: 2, vaultId, projects: [], envs: [], items: [] }`. Mọi thực thể theo đúng schema ở `docs/03-data-model.md` §1: `envs` là mảng phẳng có `projectId`; project và env có `order`; mọi thực thể có `createdAt`, `updatedAt`, `rev`, `deletedAt`; item có thêm `purgedAt`, `conflict`, `forkedFrom`, `fieldOrder`, `tags`, `favorite`, `expires`, `scopes` | Must | intent §5 ("hình dạng dữ liệu vault") |
| `KM-001-FR14` | Sinh id mới cho project, env, item, field và thiết bị theo dạng tiền tố (`p_`, `e_`, `i_`, `f_`, `d_`) + 16 hex chữ thường. Khi kiểm tra dữ liệu: chấp nhận cả id có tiền tố lẫn 16 hex trần, và **không** suy ra loại thực thể từ tiền tố (Q7) | Must | intent §7 câu 1 (xem Concern 2) |
| `KM-001-FR15` | Tạo item theo một trong 9 loại (`login`, `api_key`, `token`, `ssh`, `db`, `server`, `vpn`, `doc`, `note`) với field mặc định đúng bảng *Mẫu field theo loại item* ở 03 §1. Item `vpn` có field *Cấu hình* với `file = "client.ovpn"`; `note` không có field; không mẫu nào có field `otp`. Loại không nằm trong 9 loại trên thì báo `invalid` | Must | F-ITM-01 (KM-001.md) |
| `KM-001-FR16` | Field có `kind` thuộc `text`, `secret`, `url`, `multi`, `secret-multi`, `otp`. Thuộc tính `file` (tên file, chuỗi không rỗng) chỉ hợp lệ khi `kind` là `multi` hoặc `secret-multi` | Must | F-ITM-02, F-ITM-15, F-ITM-16 |
| `KM-001-FR17` | Mỗi thuộc tính sửa được độc lập của project, env và item có một đồng hồ `{ at, dev }`; mỗi field có `at`/`dev` riêng dùng chung cho `label`, `kind`, `v`, `file`. Khi sửa, chỉ đồng hồ của những giá trị thật sự đổi được cập nhật, theo thời gian và `deviceId` mà bên gọi đưa vào | Must | intent §2 (KM-002) |
| `KM-001-FR18` | Mỗi lần lưu thực thể thì `rev` tăng 1 và `updatedAt` cập nhật. Nếu item đổi `title`, `type`, `fields`, `notes`, `expires` hoặc `scopes`, bản trước khi sửa được đẩy vào đầu `history` (`at`, `rev`, `dev`, `reason: "edit"` cùng các thuộc tính đó), rồi `history` bị cắt còn tối đa `HISTORY_MAX = 20` bản. Đổi `favorite`, `order` hoặc `fieldOrder` không tạo bản lịch sử | Must | F-ITM-08 |
| `KM-001-FR19` | Tombstone theo quy tắc toàn vẹn ở 03 §1. Xoá env: đặt `deletedAt` cho env, item vẫn giữ `envId` trong `scopes`. Xoá project: đặt tombstone cho project và mọi env của nó. Xoá item: đặt `deletedAt`, giữ nguyên nội dung. Khôi phục: đặt `deletedAt = null`. Xoá trắng (purge): đặt `purgedAt`, xoá trắng `fields`, `notes`, `history`, `title`, chỉ giữ `id`, `deletedAt`, `purgedAt`. Xoá field: đặt `field.deletedAt` | Must | F-ITM-07, F-ITM-12 (phần dữ liệu), roadmap M1 |
| `KM-001-FR20` | Kiểm tra vault: vault hợp lệ thì trả "hợp lệ"; vault không hợp lệ thì trả **danh sách** vi phạm, mỗi vi phạm có đường dẫn tới chỗ sai. Tối thiểu bắt được: `v ≠ 2`, thiếu trường bắt buộc, sai kiểu dữ liệu, `type` hoặc `kind` lạ, `file` trên `kind` không cho phép, id trùng nhau trong cùng loại thực thể, env có `projectId` không tồn tại, `history` dài hơn 20 | Must | intent §5 |
| `KM-001-FR21` | Mã hoá rồi mở lại một vault cho ra vault bằng sâu (deep-equal) với bản gốc, gồm mọi thực thể, field, đồng hồ, lịch sử, tombstone và chuỗi Unicode | Must | intent §5 |
| `KM-001-FR22` | Lõi không đọc hay ghi bộ lưu trữ nào, không gọi mạng, không dùng DOM, không giữ khoá hay plaintext ở trạng thái chung. Mọi giá trị thời gian và `deviceId` đều do bên gọi đưa vào được, để test cho kết quả tất định | Must | intent §1 ("không phụ thuộc UI"), §6 |
| `KM-001-FR23` | Có một tài liệu hợp đồng công khai liệt kê các thao tác lõi cung cấp, đầu vào và đầu ra của từng thao tác, các loại lỗi, cùng bộ test vector cố định (NFR08). Tài liệu này là thứ KM-002, KM-003, KM-005 và KM-007 dựa vào | Must | intent §5 điểm 1 |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-001-NFR01` | Không phụ thuộc bên thứ ba | 0 package bên thứ ba khi chạy lẫn khi test. Chỉ dùng API có sẵn của nền tảng (WebCrypto, `CompressionStream`/`DecompressionStream`, `TextEncoder`) và trình chạy test có sẵn của Node |
| `KM-001-NFR02` | Tương thích môi trường | Cùng một bộ test pass 100% trên Node ≥ 20 LTS (máy dev hiện là v24.22.1) và trên trình duyệt desktop họ Chromium bản hiện hành. Safari ≥ 16.4 và Firefox ≥ 113 là mục tiêu nhưng xác minh ở epic sau (Concern 6) |
| `KM-001-NFR03` | Chất lượng ngẫu nhiên và IV | Khoá 32B, salt 16B, IV 12B đều lấy từ nguồn ngẫu nhiên mật mã. 10 000 lần mã hoá liên tiếp với cùng một khoá không có IV nào trùng |
| `KM-001-NFR04` | Không rò rỉ bí mật | Thông điệp lỗi, giá trị trả về khi lỗi và đầu ra console không chứa password, byte khoá hay plaintext. Lõi không ghi gì ra console |
| `KM-001-NFR05` | Khoá không thoát ra ngoài | Ngoài `authKey` (FR02), không thao tác công khai nào trả `masterKey`, `encKey`, `prfKey`, `accountKey` hay `vaultKey` ở dạng byte chưa bọc |
| `KM-001-NFR06` | Hiệu năng trên máy dev của originator (Node) | Mở khoá trọn chuỗi gồm PBKDF2 600k, HKDF, mở `accountKey`, mở 1 `vaultKey` và mở vault 200 KB: ≤ 500 ms, trung vị của 5 lần. Mã hoá một vault plaintext 1 MB: ≤ 200 ms. Đường cơ sở đo ngày 2026-10-30: PBKDF2 ≈ 100 ms |
| `KM-001-NFR07` | Hiệu năng trên điện thoại | Chưa có số đo. Không đặt ngưỡng ở epic này (Concern 4). Số vòng PBKDF2 **không** được hạ để đổi lấy tốc độ |
| `KM-001-NFR08` | Định dạng ổn định | Bộ test vector cố định cho toàn chuỗi: password + salt → `encKey`/`authKey`, PRF → `prfKey`, và các envelope tạo với IV cố định. Mọi thay đổi về cách dẫn xuất khoá hay định dạng envelope đều làm vector fail; muốn đổi thì phải ghi lý do (intent §5) |
| `KM-001-NFR09` | Độ phủ test | Mỗi FR có ít nhất 1 test chỉ rõ id FR đó. Cả bộ test chạy xong trong ≤ 60 s trên máy dev |
| `KM-001-NFR10` | Đúng chuẩn | Có known-answer test cho các primitive: HKDF-SHA256 theo RFC 5869 (Test Case 1–3), PBKDF2-HMAC-SHA256 theo vector công khai, AES-GCM-256 theo vector NIST. Tất cả đều pass |

## 6. Acceptance criteria

Mỗi tiêu chí kiểm tra được bằng một lệnh test chạy trong Node. Các tiêu chí AC18 và AC20 kiểm tra trên trình duyệt hoặc bằng cách đọc lại, như ghi ở từng dòng.

| Id | Given / When / Then |
|---|---|
| `KM-001-AC01` | *Given* bộ vector công khai (RFC 5869, PBKDF2-SHA256, NIST AES-GCM) *when* chạy test *then* mọi primitive cho đúng đầu ra mong đợi (NFR10) |
| `KM-001-AC02` | *Given* cùng password, salt và `iter` *when* dẫn xuất hai lần *then* `authKey` giống nhau, và khớp vector cố định của KeyMesh (FR01, FR02, NFR08) |
| `KM-001-AC03` | *Given* một `kdf` có `iter = 599999`, hoặc có `name = "Argon2id"` *when* mở khoá *then* lỗi `unsupported`, chưa thử giải mã (FR01, FR11) |
| `KM-001-AC04` | *Given* bộ khoá vừa tạo *when* mở `wrappedAccountKey` bằng đúng password *then* vault mở được; *when* dùng sai password *then* lỗi `decrypt-failed` và không có dữ liệu trả về (FR05, FR10, FR12) |
| `KM-001-AC05` | *Given* một envelope bất kỳ (vault, meta, `accountKey`, `vaultKey`) *when* lật lần lượt **từng** byte của `iv` và của `ct` (mỗi vị trí một lần thử) *then* mọi lần mở đều trả `decrypt-failed` (FR10) |
| `KM-001-AC06` | *Given* vault A và vault B *when* mở blob của A dưới `vaultId` của B, hoặc mở `wrappedVaultKey` của A dưới `vaultId` của B *then* `decrypt-failed` (FR06, FR08, FR10) |
| `KM-001-AC07` | *Given* envelope metadata của một vault *when* mở nó như envelope vault (cùng `vaultKey`, cùng `vaultId`) *then* `decrypt-failed` (FR09, FR10) |
| `KM-001-AC08` | *Given* envelope có `format: "envvault"`, `v: 1`, `alg` lạ, `by: "password"` *when* mở *then* lỗi `unsupported`; *given* envelope thiếu `ct`, `iv` dài 8B, base64 hỏng *when* mở *then* lỗi `format` (FR11) |
| `KM-001-AC09` | *Given* một `accountKey` *when* bọc nó bằng `encKey` từ password P1, bằng `encKey` từ password P2 và bằng `prfKey` từ một PRF 32B *then* cả ba bản bọc đều mở ra cùng khoá, và cả ba đều mở được cùng một vault (FR03, FR05) |
| `KM-001-AC10` | *Given* 10 000 lần mã hoá cùng một vault bằng cùng `vaultKey` *when* so các `iv` *then* không có hai `iv` nào trùng (FR07, NFR03) |
| `KM-001-AC11` | *Given* một vault có đủ 9 loại item, đủ 6 kiểu field, field `secret-multi` 64 KB có `file`, item đã vào thùng rác, item đã purge, env đã có tombstone, chuỗi tiếng Việt và emoji *when* mã hoá rồi mở lại *then* kết quả bằng sâu với bản gốc (FR21) |
| `KM-001-AC12` | *Given* một envelope mã hoá vault có `vaultId` bên trong là X, nhưng được mã hoá với AAD của Y *when* mở dưới Y *then* lỗi `format`, không trả vault (FR08) |
| `KM-001-AC13` | *Given* 3 vault, trong đó blob của vault thứ 2 bị sửa 1 byte *when* mở khoá trọn chuỗi *then* vault 1 và 3 mở được, vault 2 báo `decrypt-failed` kèm `vaultId` của nó (FR12) |
| `KM-001-AC14` | *Given* mỗi loại trong 9 loại *when* tạo item *then* field mặc định khớp bảng ở 03 §1 về label, kind và thứ tự; `vpn` có `file = "client.ovpn"`; không có field `otp`; *given* loại `wifi` *then* lỗi `invalid` (FR15) |
| `KM-001-AC15` | *Given* một id mới sinh *then* id khớp `^[pefid]_[0-9a-f]{16}$` theo đúng loại, và `vaultId` khớp `^[0-9a-f]{16}$`; *given* một vault dùng id 16 hex trần cho item *when* kiểm tra *then* hợp lệ (FR04, FR14) |
| `KM-001-AC16` | *Given* một item, `deviceId = d_A`, thời gian T *when* chỉ sửa `notes` *then* chỉ `clock.notes` thành `{ at: T, dev: d_A }`, `rev` tăng 1, `history[0]` là bản trước với `reason: "edit"`; *when* chỉ đổi `favorite` *then* `rev` tăng nhưng `history` không đổi; *when* sửa `v` của một field *then* chỉ `at`/`dev` của field đó đổi (FR17, FR18) |
| `KM-001-AC17` | *Given* một item *when* sửa 25 lần, mỗi lần đổi `title` *then* `history` có đúng 20 bản, `history[0]` là bản ngay trước lần sửa cuối, và các bản sắp theo `rev` giảm dần (FR18) |
| `KM-001-AC18` | *Given* trình duyệt desktop họ Chromium bản hiện hành *when* chạy **cùng** bộ test đã pass trên Node *then* 100% pass, không cần cài thêm package nào (NFR01, NFR02) |
| `KM-001-AC19` | *Given* project có 2 env và một item gán vào cả hai *when* xoá project *then* project và 2 env có `deletedAt`, item vẫn giữ 2 `envId` trong `scopes`; *when* xoá item rồi khôi phục *then* nội dung y như trước; *when* purge *then* chỉ còn `id`, `deletedAt`, `purgedAt` có giá trị, còn `fields`, `notes`, `history`, `title` đã trống (FR19) |
| `KM-001-AC20` | *Given* tài liệu hợp đồng (FR23) và các file `KM-002.md`, `KM-003.md`, `KM-005.md`, `KM-007.md` *when* verifier đọc lại lúc đóng KM-001 *then* mỗi thứ mà các epic đó cần từ lõi (clock/history/tombstone cho KM-002; mở khoá offline và tạo item theo loại cho KM-003; `authKey` và các envelope cho KM-005; `prfKey` bọc `accountKey` cho KM-007) đều chỉ ra được ở một thao tác trong hợp đồng (FR23; Concern 3) |
| `KM-001-AC21` | *Given* vault có `v: 1`, item `type: "wifi"`, field `kind: "text"` có `file`, hai item trùng id, env trỏ tới project không tồn tại, `history` dài 21 *when* kiểm tra *then* trả về đủ 6 vi phạm, mỗi vi phạm có đường dẫn tới chỗ sai; *given* một vault hợp lệ *then* trả "hợp lệ" (FR20) |
| `KM-001-AC22` | *Given* mọi test lỗi ở trên, chạy với password và nội dung có đánh dấu riêng *when* thu thông điệp lỗi và đầu ra console *then* không có password, byte khoá hay plaintext nào xuất hiện, và lõi không in gì ra console (NFR04) |
| `KM-001-AC23` | *Given* máy dev của originator *when* chạy phép đo hiệu năng 5 lần *then* trung vị mở khoá trọn chuỗi ≤ 500 ms và mã hoá vault 1 MB ≤ 200 ms (NFR06) |
| `KM-001-AC24` | *Given* bộ test vector cố định của KeyMesh *when* bất kỳ ai đổi cách dẫn xuất khoá hoặc định dạng envelope *then* ít nhất một test vector fail (NFR08) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- **Chuyển dữ liệu v1 sang v2**: đọc file `envvault` v1, import từ `localStorage`, giữ id v1 (intent §6; xem Concern 1). Lõi chỉ chấp nhận id hex trần ở mức kiểm tra dữ liệu (FR14).
- Sửa, chuyển hay thay lõi trong `envvault.html`. v1 giữ nguyên, không chuyển sang `legacy/`.
- Giao diện người dùng, kể cả màn hình mở khoá (KM-003, KM-004).
- Lưu IndexedDB, `meta.account`, bản sao tự động ra file, đồng bộ (KM-003, KM-006).
- Gộp ba chiều; ghi `history` với `reason: "conflict"`; đặt `item.conflict` (KM-002). Model chỉ cần có sẵn các trường này.
- Phía server: lưu `SHA-256(authKey)`, prelogin, session (KM-005).
- Gọi WebAuthn, đăng ký passkey, lưu `meta.passkey` (KM-007). Ở đây chỉ có thao tác dẫn xuất `prfKey` từ byte PRF.
- Đổi mật khẩu, xoay khoá vault hoặc tài khoản như một luồng hoàn chỉnh (KM-008). Lõi chỉ đảm bảo một `accountKey` bọc lại được dưới khoá mới (FR05).
- Dọn thùng rác tự động sau 30 ngày lúc mở khoá, UI thùng rác (KM-009). Model chỉ có thao tác xoá, khôi phục và purge.
- Định dạng file backup `keymesh-backup`, export Bitwarden (epic làm F-DATA-06 và KM-010).
- Tính mã TOTP, phân tích URI `otpauth://`, từ chối `hotp`, quét QR (F-ITM-15, KM-003). Model chỉ biết `kind: "otp"`.
- Giới hạn 64 KB khi đọc file vào field (thuộc lúc nhập ở KM-003). Lõi chỉ cần xử lý đúng nội dung có kích thước đó (AC11).
- Fork, nhân bản, sinh mật khẩu, tìm kiếm, lọc, "Sắp hết hạn" (KM-003).
- Argon2id hay KDF khác ngoài PBKDF2-SHA256.
- Chia sẻ cho nhiều người.

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §6 bỏ migrate v1, nhưng mô tả epic trong `state.json` và `KM-001.md` (F-DATA-02, tiêu chí "Migrate được file v1 thật"), `docs/03-data-model.md` §5, `docs/08-roadmap.md` M1 ("vault v2 cùng migrate v1→v2"), README, và **KM-003** ("import file v1", F-DATA-02 "import v1 qua UI", "Xong khi: import được file v1") vẫn còn nhắc đến nó. Nếu không sửa, KM-003 sẽ cần một bộ đọc v1 mà KM-001 không làm | Originator | **Đã quyết cho KM-001:** không có migrate v1 (Out of scope). **Hoãn, owner: originator, hạn: trước khi bắt đầu spec KM-003.** Việc cần làm là sửa các tài liệu trên cho khớp, và quyết định KM-003 bỏ hẳn import v1 hay tự làm phần đó. Bỏ hẳn là hợp với lý do ở intent §6 |
| 2 | Intent §7 câu 1: bỏ migrate rồi có còn cần chấp nhận id hex trần không? | Originator | **Đã quyết theo Q7 đã chốt ở `docs/08-roadmap.md`:** id mới luôn có tiền tố; khi kiểm tra thì chấp nhận cả hai dạng và không suy ra loại từ tiền tố (FR14, AC15). Chấp nhận như vậy không tốn gì thêm, và để ngỏ đường cho Concern 1. Originator có thể đổi quyết định này lúc duyệt spec |
| 3 | Intent §7 câu 2: ai kiểm "epic sau dùng được ngay", và kiểm lúc nào? | Originator | **Đã quyết làm hai lớp.** (a) Lúc đóng KM-001, verifier đọc lại các file epic KM-002/003/005/007 so với hợp đồng (AC20). (b) Bằng chứng khi chạy thật để originator thu: mỗi epic đó ghi vào artifact của mình nếu phải sửa lõi, kèm lý do (intent §5) |
| 4 | Intent §7 câu 3: chưa có ngưỡng tốc độ mở khoá trên điện thoại cũ, trong khi 600 000 vòng là cố định theo `docs/04-security.md` | Originator (đo trên thiết bị thật) | **Hoãn, owner: originator, lúc: KM-003/KM-004 có màn mở khoá chạy trên iPhone và Android.** KM-001 chỉ đặt ngưỡng trên máy dev (NFR06) và cấm hạ số vòng (NFR07). Nếu điện thoại quá chậm thì sửa `docs/04-security.md`, không sửa lõi một cách lặng lẽ. Tham số `kdf` có `iter` để nâng cấp hoặc điều chỉnh sau |
| 5 | `docs/04-security.md` chỉ nêu `info` của HKDF, không chốt salt hay độ dài đầu ra. Đây là thứ sẽ đóng băng vĩnh viễn khi đã có dữ liệu thật | Engineer (build-plan) | **Hoãn, owner: engineer, lúc: build-plan KM-001.** Build-plan chốt các giá trị này, ghi bổ sung vào `docs/03-data-model.md` §2, rồi đóng băng bằng test vector (NFR08). Spec chỉ yêu cầu chúng cố định và có vector |
| 6 | Intent §5 yêu cầu pass "trong trình duyệt", nhưng máy dev là Windows nên không chạy được Safari/iOS. Mà iPhone là nền tảng chính (G3) | Originator | **Đã quyết cho KM-001:** bắt buộc Node và Chromium desktop (AC18). **Hoãn phần Safari/iOS, owner: originator, lúc: KM-003/KM-004.** Chạy cùng bộ test trên iPhone thật; Firefox chạy nếu có cài. Các API được dùng (WebCrypto, `CompressionStream`) có trên Safari ≥ 16.4 |
| 7 | `docs/03-data-model.md` §2 có định dạng file backup `keymesh-backup`, nằm cạnh các envelope, nhưng mô tả KM-001 không nhắc tới | PO | **Đã quyết:** để ngoài phạm vi; thuộc epic làm F-DATA-06. Mọi thành phần mà backup cần (`kdf`, `wrappedAccountKey`, `wrappedVaultKey`, meta, envelope vault) đã có ở FR01–FR09, nên không có gì cản đường |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

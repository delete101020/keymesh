# Spec — Server: D1, xác thực và API vault

**Epic ID:** `KM-005`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-005 dựng phần server của KeyMesh ở mức đủ cho đồng bộ: 8 trong 18 thao tác của `docs/06-api.md` (lấy tham số KDF, đăng ký, đăng nhập, đăng xuất, liệt kê, tạo, đọc và ghi vault), chạy và được kiểm hoàn toàn trên môi trường cục bộ. Server chỉ cất và trả lại các khối đã mã hoá, không giải mã gì. Spec này phục vụ intent §1 ("người làm đồng bộ không có gì để nối vào") và sáu điểm ở intent §5: đủ cho KM-006, từ chối đúng, không dò được, không thử liên tục được, server không đọc được gì, tài liệu khớp. Hình dạng request và response lấy nguyên từ `docs/06-api.md`; spec chỉ ghi phần 06 chưa chốt, phần mâu thuẫn và phần phải kiểm. Kế thừa từ KM-001, không đổi: cách dẫn xuất khoá, định dạng envelope, hình dạng vault.

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md`: JavaScript thuần, không build, `dependencies` rỗng, `wrangler` là devDependency duy nhất từ KM-005; server chỉ import `core/`, không giải mã; test chỉ dùng `node:test`, server test trên môi trường local của wrangler, không gọi Cloudflare thật; không ghi secret ra `console`, lỗi hay URL; đổi quy ước thì sửa tài liệu nguồn |
| `.aidlc/workspace.yaml`, `state.json` | `artifact_language: vi`; `strict_mode: true`; chưa có feedback hay lần từ chối nào. Không có project skill nào ràng buộc thêm |
| `docs/epics/KM-005/artifacts/intent.md`, `KM-005.md` | Phạm vi 8/18 thao tác, *Not this*, 4 câu hỏi mở, các ngưỡng ở "Done looks like" |
| `docs/epics/KM-001/artifacts/intent.md`, `spec.md` (`inputs.json`: `from_epic`) | Không đổi cách mở khoá và hình dạng dữ liệu. KM-001 giao `authKey` và các envelope cho KM-005 (KM-001 AC20) |
| `docs/06-api.md` | Hợp đồng API: định dạng lỗi, mã lỗi, hình dạng request/response của 8 thao tác |
| `docs/04-security.md` | Nguyên tắc zero-knowledge, `SHA-256(authKey)`, token 32B lưu dạng băm, hạn trượt 30 ngày, `security_stamp`, ngưỡng khoá, salt giả, kiểm Origin, phân quyền theo vault |
| `docs/03-data-model.md` §2, §4 | Hình dạng envelope và khoá đã bọc; tiền tố `dt_`/`sys_`; những gì server được phép biết |
| `docs/05-sync.md` | Compare-and-swap theo version, `since`, `ETag`, nhịp 60 giây: thứ KM-006 sẽ dựa vào |
| `docs/02-architecture.md` | Cấu hình theo domain, cấu trúc repo, giới hạn gói Free |
| `docs/09-core-api.md` | `newKdf`, `KDF_MIN_ITER`/`KDF_MAX_ITER`, dạng `record`; server không gọi thao tác giải mã nào |
| `docs/07-features.md`, `docs/08-roadmap.md` | F-AUTH-01, F-AUTH-02, F-AUTH-08, F-SYNC-01; mốc M3 |
| `docs/epics/KM-003` (Concern 1, AC53), `KM-006`, `KM-008`, `KM-009` | KM-006 đăng ký chính bộ khoá đang có; ranh giới phạm vi với các epic sau |
| `src/`, `package.json`, `test/` (đã đọc, 2026-11-01) | Chưa có phần server; `test/e2e/pwa.e2e.js` kiểm app khi không có server và phải tiếp tục xanh |
| Trả lời của originator (2026-11-01, phiên `/spec`) | Quyết định ở Concern 1, 2 |

## 3. User scenarios

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

"Người dùng" ở đây là người làm KM-006, hoặc bộ test đóng vai hai thiết bị A và B trên server chạy cục bộ (intent §2, §5).

1. **Đăng ký bằng bộ khoá đã có.** *Given* thiết bị A có tài khoản cục bộ từ KM-003 và server đang mở đăng ký, *when* A đăng ký với username, token đăng ký, `kdf`, `authKey`, `wrappedAccountKey` và vault hiện có, *then* A nhận `201`, có phiên làm việc, vault ở version 1, và các khối đã gửi được trả lại đúng giá trị, không phải mã hoá lại.
2. **Đăng nhập trên thiết bị thứ hai.** *Given* tài khoản trên, *when* B lấy tham số KDF theo username rồi đăng nhập bằng `authKey`, *then* B nhận token riêng và `wrappedAccountKey`, và A vẫn dùng được phiên của mình.
3. **Liệt kê, tạo, đọc.** *Given* B đã đăng nhập, *when* B liệt kê vault, tạo thêm một vault rồi đọc blob, *then* danh sách có đủ hai vault kèm `wrappedVaultKey` và `meta` nhưng không có blob; đọc blob thì nhận đúng khối đã lưu; hỏi lại bằng `since` đúng version hiện tại thì nhận `304`.
4. **Ghi và phát hiện xung đột.** *Given* A và B cùng ở version 8, *when* A ghi với `baseVersion: 8` rồi B cũng ghi với `baseVersion: 8`, *then* A nhận `200` với version 9; B nhận `409 version_conflict` kèm version 9 và blob của A, ghi của B không có tác dụng; B ghi lại với `baseVersion: 9` thì nhận version 10.
5. **Đăng xuất.** *Given* A đang đăng nhập, *when* A đăng xuất, *then* A nhận `204`, token của A bị từ chối từ đó, và B vẫn làm việc bình thường.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

| Tình huống | Kết quả mong đợi |
|---|---|
| Có `Origin` lạ, kể cả `null`, ở bất kỳ đường dẫn API nào | `403 forbidden_origin`, không xử lý gì thêm |
| Không có header `Origin` (đọc cùng origin trên trình duyệt, công cụ dòng lệnh) | Đi tiếp; vẫn phải qua kiểm token |
| Chưa cấu hình danh sách origin | Mọi request có `Origin` bị từ chối |
| Token thiếu, sai dạng, sai, hết hạn, đã đăng xuất, hoặc `security_stamp` đã đổi | Cùng một `401 unauthorized` |
| Username không tồn tại, lấy tham số KDF | `200`, cùng hình dạng và số vòng, salt giả ổn định, không đổi theo hoa/thường |
| Đăng nhập username không tồn tại, hoặc sai `authKey` | Cùng một `401 invalid_credentials`, đếm vào bộ đếm như nhau |
| 5 lần sai cho một username, hoặc 20 lần cho một IP, trong 15 phút | Lần sau bị `429 too_many_attempts` kèm `Retry-After`, kể cả khi `authKey` đúng |
| Hết 15 phút khoá | Đăng nhập lại được; bộ đếm tính lại từ đầu |
| Đang bị khoá nhưng thiết bị đã có phiên | Phiên vẫn dùng được, không bị ảnh hưởng |
| Không có token đăng ký hoặc token sai, kể cả khi server đã đóng đăng ký | Cùng một `403 registration_closed`, trước mọi kiểm tra nội dung |
| Username đã có, gửi kèm token đăng ký hợp lệ | `409 username_taken`, không tính hoa/thường |
| Mất kết nối ngay sau khi đăng ký thành công, client gửi lại | `409 username_taken`; client chuyển sang đăng nhập được, không có tài khoản hỏng |
| Vault của người khác, vault không tồn tại | Cùng một `404 not_found`, không có gì bị đổi |
| Id vault sai dạng | `400 invalid_id` (sau khi đã qua kiểm token) |
| Tạo vault trùng id, kể cả id của người khác | `409 vault_exists` (giới hạn đã chấp nhận, Concern 2) |
| `baseVersion` nhỏ hơn hoặc lớn hơn version hiện tại | `409 version_conflict` kèm bản hiện tại |
| Nhiều thiết bị cùng ghi một version một lúc | Đúng một bên thành công, các bên còn lại `409` |
| `since` lớn hơn version trên server | `200` kèm bản trên server |
| Body vượt 2 000 000 byte, hoặc quá sức chứa của kho lưu trữ | `413 too_large`, không phải `500` |
| JSON hỏng hoặc thiếu trường | `400 bad_request`; blob sai định dạng thì `400 invalid_envelope` |
| Thao tác chưa giao (KM-008, KM-009) hoặc đường dẫn API lạ | `404 not_found` dạng JSON, không rơi vào trang tĩnh |
| Tài khoản chưa có vault nào (chỉ xảy ra sau khi có xoá vault ở KM-008) | Liệt kê trả danh sách rỗng, có `ETag` |
| Kho dữ liệu lỗi giữa chừng | `500 internal`, không để lại dữ liệu dở dang, không phát token; thử lại được |
| Thiếu bí mật dùng cho salt giả | Mọi lần lấy tham số KDF trả `500 internal`; không có salt đoán trước được |

## 4. Functional requirements

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-005-FR01` | Giao đúng 8 thao tác của 06: lấy tham số KDF, đăng ký, đăng nhập, đăng xuất, liệt kê vault, tạo vault, đọc vault, ghi vault, với hình dạng request và response như 06. Mọi đường dẫn API và phương thức khác, gồm 10 thao tác của KM-008 và KM-009, trả `404 not_found` dạng JSON, có token hay không cũng vậy | Must | intent §5 Đủ cho KM-006; §6 |
| `KM-005-FR02` | Request có `Origin` không khớp chính xác (scheme, host, port) với một mục trong danh sách cấu hình, kể cả giá trị `null`, bị `403 forbidden_origin` trước mọi xử lý khác. Request không có `Origin` đi tiếp. Danh sách rỗng hoặc chưa cấu hình thì mọi `Origin` đều bị từ chối. Không có header CORS nào được trả ra | Must | intent §5 Từ chối đúng |
| `KM-005-FR03` | Mọi response của API, gồm `304`, `4xx`, `5xx`, có `Cache-Control: no-store` và `X-Content-Type-Options: nosniff`, không dựa vào cấu hình header của trang tĩnh | Must | KM-005.md; 04; Concern 12 |
| `KM-005-FR04` | Mọi lỗi có dạng `{ error, message }` với mã lỗi ở 06. `message` là câu cố định theo mã lỗi: không có stack, truy vấn, giá trị đầu vào hay dữ liệu đã lưu. Riêng `version_conflict` có thêm các trường 06 quy định | Must | intent §1 địa chỉ công khai; `CLAUDE.md` |
| `KM-005-FR05` | Body lớn hơn 2 000 000 byte bị `413 too_large`, tính theo số byte thật nhận được, không tin header khai báo. Body trong giới hạn nhưng vượt sức chứa của kho lưu trữ cũng là `413`, không phải `500` | Must | 06; Concern 11 |
| `KM-005-FR06` | JSON hỏng, thiếu trường, sai kiểu, hoặc khối mã hoá sai dạng (trừ các trường hợp có mã riêng ở FR11, FR27) trả `400 bad_request` | Must | 06 |
| `KM-005-FR07` | Username dài 1–64 ký tự, chỉ gồm chữ cái ASCII, chữ số và `.` `_` `-` `@` `+`; khác dạng đó thì `400 bad_request` ở cả ba thao tác dùng username. Hai username chỉ khác hoa/thường là một; hoa/thường lúc đăng ký được giữ nguyên khi hiển thị | Must | intent §5 Không dò được; Concern 10 |
| `KM-005-FR08` | Lấy tham số KDF cho username có thật trả đúng `kdf` đã lưu | Must | intent §5 Đủ cho KM-006 |
| `KM-005-FR09` | Lấy tham số KDF cho username không tồn tại trả `200`, cùng hình dạng, `name` PBKDF2-SHA256, `iter` 600 000, salt 16B sinh tất định từ bí mật của server và username đã bỏ phân biệt hoa/thường: gọi lại, đổi hoa/thường đều ra cùng salt; hai username khác nhau ra hai salt khác nhau | Must | intent §5 Không dò được; 04; Concern 7 |
| `KM-005-FR10` | Thiếu bí mật dùng cho salt giả thì mọi lần lấy tham số KDF, username có thật hay không, trả `500 internal`. Không có giá trị mặc định | Must | intent §5 Không dò được; Concern 13 |
| `KM-005-FR11` | Đăng ký kiểm tra `kdf`: `name` PBKDF2-SHA256, `iter` trong khoảng 600 000–6 000 000, salt đúng 16B; sai thì `400 invalid_kdf`. Id vault sai dạng thì `400 invalid_id`. Blob sai dạng thì `400 invalid_envelope` | Must | 06; 09 |
| `KM-005-FR12` | Đăng ký chỉ mở khi server có token đăng ký dài ít nhất 32 ký tự và token gửi lên khớp theo so sánh constant-time. Không thoả (thiếu, sai, server không cấu hình, token cấu hình quá ngắn) thì cùng một `403 registration_closed`, xét trước mọi kiểm tra nội dung còn lại | Must | intent §5 Không dò được; 04; Concern 8, 9 |
| `KM-005-FR13` | Đăng ký thành công tạo tài khoản, vault đầu tiên (version 1, metaVersion 1) và phiên trong một thao tác nguyên tử, trả `201` theo 06. Lỗi ở bất kỳ bước nào thì không còn gì sót lại. Username đã có thì `409 username_taken`; id vault đã có thì `409 vault_exists` | Must | intent §5 Đủ cho KM-006; KM-003 Concern 1 |
| `KM-005-FR14` | Bộ khoá tạo từ trước khi đăng ký (`kdf`, `wrappedAccountKey`, `wrappedVaultKey`, `meta`, blob của KM-003) được nhận nguyên, và trả lại đúng giá trị, mở được bằng lõi KM-001 | Must | intent §5 Đủ cho KM-006 |
| `KM-005-FR15` | Đăng nhập đúng trả `200` theo 06 và tạo một phiên mới; một tài khoản có nhiều phiên song song. `deviceName` là chuỗi tuỳ chọn, tối đa 100 ký tự, dài hơn thì `400 bad_request` | Must | F-AUTH-02; intent §5 Đủ cho KM-006 |
| `KM-005-FR16` | `authKey` được so ở dạng `SHA-256` theo kiểu constant-time. Sai `authKey` và username không tồn tại trả cùng một `401 invalid_credentials`, giống hệt từng byte ở phần thân và các header không phụ thuộc thời gian; nhánh username không tồn tại vẫn thực hiện cùng phép băm và so sánh | Must | intent §5 Không dò được; 04 |
| `KM-005-FR17` | Bộ đếm theo username: mỗi lần sai được tính vào cửa sổ 15 phút bắt đầu từ lần sai đầu tiên. Lần sai thứ 5 vẫn nhận `401`; từ lần thử kế tiếp, trong 15 phút tính từ lần sai thứ 5, mọi lần đăng nhập vào username đó nhận `429 too_many_attempts` kèm `Retry-After` là số giây còn lại (≥ 1), kể cả khi `authKey` đúng. Áp dụng như nhau cho username không tồn tại; đổi hoa/thường không tách bộ đếm | Must | intent §5 Không thử liên tục được, Không dò được |
| `KM-005-FR18` | Bộ đếm theo IP: giống FR17, ngưỡng 20 lần sai trong 15 phút trên mọi username từ cùng một IP. IPv6 tính theo khối /64. IP chỉ lấy từ nguồn do nền tảng đặt, client không giả được; không xác định được thì mọi request như vậy dùng chung một bộ đếm | Must | intent §5 Không thử liên tục được; Concern 4 |
| `KM-005-FR19` | Lần thử trong lúc bị khoá không được đếm và không kéo dài khoá. Hết khoá, bộ đếm về 0. Quá 15 phút kể từ lần sai đầu mà chưa tới ngưỡng thì cửa sổ mới bắt đầu | Must | intent §5 Không thử liên tục được |
| `KM-005-FR20` | Đăng nhập đúng xoá bộ đếm của username, không xoá bộ đếm của IP. Request bị `400` không được đếm | Must | intent §5 Không thử liên tục được |
| `KM-005-FR21` | Khoá chỉ chặn thao tác đăng nhập. Phiên đang có, lấy tham số KDF và đăng ký không bị ảnh hưởng | Must | intent §7 câu 1; Concern 1 |
| `KM-005-FR22` | Token phiên là 32B ngẫu nhiên dạng base64url, chỉ được lưu ở dạng `SHA-256`, chỉ xuất hiện đúng một lần trong response đăng ký hoặc đăng nhập | Must | intent §5 Server không đọc được gì; 04 |
| `KM-005-FR23` | Mọi thao tác không có đánh dấu 🔓 ở 06 đều đòi token hợp lệ, xét trước mọi kiểm tra nội dung. Token thiếu, sai dạng, không khớp, hết hạn, đã đăng xuất, hoặc phiên có `security_stamp` khác của tài khoản đều nhận cùng một `401 unauthorized` | Must | intent §5 Từ chối đúng; Concern 3 |
| `KM-005-FR24` | Mỗi lần dùng token hợp lệ, hạn phiên được đặt lại thành thời điểm đó cộng 30 ngày. Tới đúng thời điểm hết hạn là token bị từ chối | Must | 04 |
| `KM-005-FR25` | Đăng xuất trả `204`, chỉ huỷ đúng phiên đang dùng. Dùng lại token đó, kể cả để đăng xuất lần nữa, nhận `401` | Must | F-AUTH-08; intent §5 Đủ cho KM-006 |
| `KM-005-FR26` | Liệt kê trả mọi vault của tài khoản theo hình dạng 06, không có blob và không có vault của ai khác. `size` là số byte UTF-8 của blob đã lưu. Response có `ETag` tính từ danh sách (id, version, metaVersion); `If-None-Match` khớp thì trả `304` không có thân | Must | intent §5 Đủ cho KM-006; 05 |
| `KM-005-FR27` | Tạo vault trả `201` theo 06 với version 1, metaVersion 1. Id sai dạng thì `400 invalid_id`; blob sai dạng thì `400 invalid_envelope`; id đã có, của ai cũng vậy, thì `409 vault_exists` | Must | intent §5 Đủ cho KM-006; Concern 2 |
| `KM-005-FR28` | Blob hợp lệ khi có đúng và chỉ các trường `format` = `keymesh`, `v` = 2, `alg` = `AES-GCM-256`, `iv` là base64 của 12B, `ct` là base64 không rỗng. Server không kiểm được và không kiểm nội dung bên trong. `wrappedAccountKey`, `wrappedVaultKey` (`by` = `account`) và `meta` cũng chỉ có đúng các trường của 03 §2. Giá trị được lưu và trả lại nguyên vẹn | Must | intent §5 Server không đọc được gì; 03 §2; 06 |
| `KM-005-FR29` | Đọc vault trả `200` với `version`, `updatedAt`, `blob`. `since` bằng version hiện tại thì `304` không có thân; `since` khác version hiện tại, kể cả lớn hơn, thì `200`; `since` không phải số nguyên không âm thì `400 bad_request` | Must | intent §5 Đủ cho KM-006; 05; 06 |
| `KM-005-FR30` | Ghi vault với `baseVersion` bằng version hiện tại thì lưu blob, tăng version đúng 1, trả `200` theo 06. Khác version hiện tại thì trả `409 version_conflict` kèm `version`, `updatedAt`, `blob` hiện tại và không đổi gì. So sánh và ghi là một bước nguyên tử | Must | intent §5 Đủ cho KM-006; 05 |
| `KM-005-FR31` | Đọc hoặc ghi vault không tồn tại và vault của người khác trả cùng một `404 not_found`, giống hệt từng byte ở phần thân và các header không phụ thuộc thời gian, với cùng đầu vào, kể cả có `since`, blob sai dạng hay `baseVersion` bất kỳ. Dữ liệu của chủ vault không đổi | Must | intent §5 Từ chối đúng; 04 |
| `KM-005-FR32` | Id vault phải đúng 16 ký tự hex thường, sai thì `400 invalid_id`, không phụ thuộc vào việc vault có tồn tại hay không | Must | 06; Concern 15 |
| `KM-005-FR33` | Có đủ chỗ chứa theo 03 §4 cho bản cũ của vault và nhật ký hoạt động, nhưng không thao tác nào ghi vào đó: sau toàn bộ chuỗi ở mục 3.1 và các lần đăng nhập sai, hai chỗ chứa này rỗng. Đếm lần sai vẫn hoạt động | Must | intent §6; KM-005.md |
| `KM-005-FR34` | Có một bộ test chạy bằng lệnh, đóng vai hai thiết bị đi hết chuỗi ở mục 3.1 trên server cục bộ, không sửa gì ở server. Mỗi thao tác trong 8 thao tác có test cho đường đúng và từng mã lỗi nêu ở spec này | Must | intent §5 Đủ cho KM-006 |
| `KM-005-FR35` | Bản ghi đã hết tác dụng (phiên hết hạn quá 24 giờ, bộ đếm đã quá 24 giờ) được dọn khi có đăng nhập, để người lạ gọi liên tục không làm kho dữ liệu lớn mãi. Dọn thất bại không làm đăng nhập thất bại | Should | intent §1 địa chỉ công khai; Concern 5 |
| `KM-005-FR36` | Sửa `KM-005.md`: "Xong khi" ghi đúng phạm vi mới, không còn "mọi endpoint", và làm rõ "không nhận plaintext hay khoá" theo intent §5; chuyển việc kiểm header thật trên Cloudflare sang `KM-006.md`, cùng các việc hoãn ở Concern 5, 11, 12, 16, 18. `KM-008.md`, `KM-009.md` ghi rõ phần API nhận về; `KM-009.md` ghi thêm việc xem lại ở Concern 7 | Must | intent §5 Tài liệu khớp |
| `KM-005-FR37` | Sửa tài liệu nguồn cho khớp spec: 03 và 04 ghi rằng giữ bản cũ và nhật ký chỉ có từ KM-009; 05 và 02 cùng nội dung đó (Concern 6); 06 ghi mục mới của spec (quy tắc username, đơn vị 2 MB, `vault_exists` khi đăng ký, ý nghĩa `since`, thao tác nào thuộc epic nào); 02 thêm bí mật dùng cho salt giả vào cấu hình; 03 sửa dạng lưu bộ đếm; 04 thêm hai rủi ro còn lại ở Concern 1, 2 và điều kiện xem lại trước khi đưa secret thật lên server (Concern 18) | Must | intent §5 Tài liệu khớp; `CLAUDE.md` |

## 5. Non-functional requirements

Không có giao diện trong epic này nên accessibility không áp dụng. Ghi nhật ký hoạt động thuộc KM-009 (intent §6).

| Id | Requirement | Target |
|---|---|---|
| `KM-005-NFR01` | Server không giữ gì đọc được | Dò toàn bộ dữ liệu đã lưu sau chuỗi ở mục 3.1, với cả dạng gốc, base64 và hex: 0 lần trùng với master password, plaintext vault (chuỗi đánh dấu trong item và tên vault), `encKey`, `accountKey`, `vaultKey`, `authKey`, token phiên, token đăng ký |
| `KM-005-NFR02` | Dấu vết người lạ | Username và IP trong bộ đếm không đọc được và không dò ngược được khi không có bí mật của server: 0 lần trùng với username đã thử hay IP, kể cả khi thử băm thô các giá trị đó |
| `KM-005-NFR03` | Không lộ qua log | Toàn bộ đầu ra `console` của server trong suốt bộ test: 0 lần trùng với các giá trị ở NFR01, không có blob |
| `KM-005-NFR04` | Không phân biệt được từ bên ngoài | Các cặp ở FR09, FR16, FR31 giống nhau từng byte. Không có nhánh nào bỏ qua băm hay truy vấn cho riêng trường hợp "không tồn tại" (reviewer đọc mã). Đo: chênh lệch trung vị giữa hai nhánh của FR16 ≤ 5 ms trên 200 lần mỗi nhánh ở môi trường cục bộ |
| `KM-005-NFR05` | Đồng thời | 10 lần ghi song song cùng `baseVersion`: đúng 1 lần `200`, 9 lần `409`. 20 lần đăng nhập sai song song vào một username: tối đa 5 lần `401`, còn lại `429` |
| `KM-005-NFR06` | Nguyên tử | Lỗi kho dữ liệu ở bất kỳ thao tác nào: `500 internal`, trạng thái đã lưu giữ nguyên như trước thao tác, không phát token |
| `KM-005-NFR07` | Thời gian phản hồi cục bộ | Với blob 200 KB: p95 ≤ 200 ms cho mỗi thao tác trên 100 lần chạy tuần tự, trên máy dev. Không kết luận được cho Cloudflare thật (Concern 5) |
| `KM-005-NFR08` | Chạy độc lập với Cloudflare | Cài đặt và toàn bộ test chạy được không có tài khoản Cloudflare, không gửi request nào tới Cloudflare để kiểm chức năng. Bộ dữ liệu cục bộ được tạo lại từ đầu mỗi lần test, chạy lại nhiều lần vẫn cùng kết quả |
| `KM-005-NFR09` | Phụ thuộc | `dependencies` vẫn rỗng; `wrangler` là devDependency mới duy nhất, ghim phiên bản |
| `KM-005-NFR10` | Không ảnh hưởng phần đã có | `npm test`, `npm run test:browser`, `npm run test:e2e` vẫn xanh; `core/` không đổi hành vi, không sinh lại vector; server không import gì khác ngoài `core/` và không gọi thao tác giải mã |
| `KM-005-NFR11` | Không có cửa sau cho test | Mã chạy thật không có đường dẫn, cờ hay nhánh chỉ dành cho test. Test đổi thời gian hoặc trạng thái bằng cách sửa dữ liệu của kho cục bộ |
| `KM-005-NFR12` | Cấu hình | Origin, token đăng ký và bí mật salt giả đều lấy từ cấu hình, không hard-code domain. Giá trị thật không nằm trong repo; `git status` không hiện tệp bí mật hay dữ liệu cục bộ sau khi chạy test |

## 6. Acceptance criteria

| Id | Given / When / Then |
|---|---|
| `KM-005-AC01` | *Given* server cục bộ đang mở đăng ký và hai thiết bị giả lập *when* chạy chuỗi đăng ký, đăng nhập trên thiết bị thứ hai, liệt kê, tạo, đọc, ghi, xung đột, đăng xuất *then* mọi bước đúng 3.1 mà không sửa server (FR34, FR01) |
| `KM-005-AC02` | *Given* tài khoản và vault do chính lõi KM-001 tạo, lưu bằng dạng của KM-003 *when* đăng ký rồi đọc lại trên thiết bị khác *then* mở được bằng password ban đầu và nội dung vault giống hệt (FR14) |
| `KM-005-AC03` | *Given* một thao tác chưa giao, ví dụ đổi metadata hay danh sách phiên *when* gọi, có và không có token *then* cùng `404 not_found` dạng JSON (FR01) |
| `KM-005-AC04` | *Given* `Origin` ngoài danh sách, `null`, hoặc chỉ khác port *when* gọi bất kỳ thao tác nào, kể cả đường dẫn lạ *then* `403 forbidden_origin` và không có gì đổi (FR02) |
| `KM-005-AC05` | *Given* `Origin` trong danh sách, hoặc không có `Origin` *when* gọi thao tác hợp lệ *then* đi tiếp bình thường và không có header CORS trong response (FR02) |
| `KM-005-AC06` | *Given* danh sách origin rỗng *when* request có `Origin` bất kỳ *then* `403 forbidden_origin` (FR02) |
| `KM-005-AC07` | *Given* mỗi loại response: `200`, `201`, `204`, `304`, `400`, `401`, `403`, `404`, `409`, `413`, `429`, `500` *when* kiểm header *then* đều có `Cache-Control: no-store` và `X-Content-Type-Options: nosniff` (FR03) |
| `KM-005-AC08` | *Given* mọi loại lỗi *when* đọc thân response *then* đúng dạng `{ error, message }` (cộng trường của `version_conflict`), `message` không chứa giá trị đầu vào, stack hay truy vấn (FR04, FR06) |
| `KM-005-AC09` | *Given* body 2 000 001 byte, có và không có header độ dài đúng *when* gửi *then* `413 too_large`, và body 2 000 000 byte không bị từ chối vì giới hạn này (FR05) |
| `KM-005-AC10` | *Given* username có ký tự ngoài bộ cho phép, rỗng, hoặc dài 65 ký tự *when* dùng ở từng thao tác liên quan *then* `400 bad_request`; dài 64 ký tự thì được nhận (FR07) |
| `KM-005-AC11` | *Given* username có thật *when* lấy tham số KDF *then* đúng `kdf` đã lưu, đổi hoa/thường vẫn vậy (FR07, FR08) |
| `KM-005-AC12` | *Given* username không tồn tại *when* lấy tham số KDF nhiều lần và đổi hoa/thường *then* `200`, cùng hình dạng, `iter` 600 000, salt 16B không đổi; username khác ra salt khác (FR09) |
| `KM-005-AC13` | *Given* chưa cấu hình bí mật salt giả *when* lấy tham số KDF cho username có thật và không có thật *then* cả hai `500 internal` (FR10) |
| `KM-005-AC14` | *Given* token đăng ký sai, thiếu, server không cấu hình, hoặc cấu hình dưới 32 ký tự *when* đăng ký, kèm username có thật hoặc nội dung sai *then* cùng `403 registration_closed`, không phân biệt được username đã có hay chưa (FR12) |
| `KM-005-AC15` | *Given* token đăng ký hợp lệ và `iter` 599 999, 6 000 001, `name` lạ, hoặc salt khác 16B *when* đăng ký *then* `400 invalid_kdf`; `iter` 600 000 và 6 000 000 được nhận (FR11) |
| `KM-005-AC16` | *Given* token hợp lệ và username đã có, chỉ khác hoa/thường *when* đăng ký *then* `409 username_taken` và không có gì mới được tạo (FR07, FR13) |
| `KM-005-AC17` | *Given* token hợp lệ và id vault đã có *when* đăng ký *then* `409 vault_exists`, username đó vẫn đăng ký được với id khác: không còn tài khoản dở dang (FR13) |
| `KM-005-AC18` | *Given* kho dữ liệu lỗi giữa lúc đăng ký *when* client gửi lại sau khi kho hoạt động *then* lần đầu `500 internal` không kèm token, lần sau thành công (FR13, NFR06) |
| `KM-005-AC19` | *Given* username không tồn tại và username có thật với `authKey` sai *when* đăng nhập *then* hai response giống từng byte, `401 invalid_credentials` (FR16, NFR04) |
| `KM-005-AC20` | *Given* đúng `authKey` *when* đăng nhập từ hai thiết bị *then* cả hai nhận token khác nhau, `sessionId` khác nhau và đều dùng được (FR15, FR22) |
| `KM-005-AC21` | *Given* một username có 4 lần sai trong cửa sổ *when* sai lần thứ 5 rồi thử lần 6 bằng `authKey` đúng *then* lần 5 nhận `401`, lần 6 nhận `429 too_many_attempts` có `Retry-After` từ 1 tới 900 (FR17) |
| `KM-005-AC22` | *Given* username không tồn tại *when* làm đúng các bước ở AC21 với `authKey` bất kỳ *then* cùng chuỗi mã trả về như AC21, không phân biệt được với username có thật (FR17) |
| `KM-005-AC23` | *Given* 3 lần sai với `user`, 2 lần với `USER` *when* thử lần kế tiếp với `User` *then* `429`: đổi hoa/thường không tách bộ đếm (FR17) |
| `KM-005-AC24` | *Given* 20 lần sai từ một IP trên nhiều username, mỗi username dưới 5 lần *when* đăng nhập đúng một tài khoản khác từ IP đó *then* `429`; cùng lúc IP khác đăng nhập tài khoản đó thành công (FR18) |
| `KM-005-AC25` | *Given* một client tự đặt các header chuyển tiếp IP với giá trị khác nhau mỗi lần *when* sai 20 lần *then* vẫn bị khoá theo IP thật (FR18) |
| `KM-005-AC26` | *Given* hai địa chỉ IPv6 cùng /64 *when* sai 10 lần mỗi địa chỉ *then* lần sau bị `429`; IP không xác định được thì chung một bộ đếm (FR18) |
| `KM-005-AC27` | *Given* đang bị khoá *when* tiếp tục thử nhiều lần rồi tới đúng thời điểm hết khoá ban đầu *then* đăng nhập đúng thành công: lần thử lúc khoá không kéo dài khoá (FR19) |
| `KM-005-AC28` | *Given* đã hết khoá *when* sai 4 lần nữa *then* vẫn nhận `401`: bộ đếm đã về 0 (FR19) |
| `KM-005-AC29` | *Given* 4 lần sai, lần đầu đã quá 15 phút trước *when* sai thêm một lần *then* `401`, không bị khoá ở lần kế tiếp (FR19) |
| `KM-005-AC30` | *Given* 4 lần sai rồi đăng nhập đúng *when* sai 4 lần nữa *then* vẫn nhận `401` (bộ đếm username đã xoá); trong khi bộ đếm IP vẫn tính đủ 8 lần sai đó (FR20) |
| `KM-005-AC31` | *Given* request đăng nhập bị `400` vì thiếu trường *when* gửi 10 lần rồi đăng nhập đúng *then* thành công: không bị đếm (FR20) |
| `KM-005-AC32` | *Given* một username đang bị khoá *when* thiết bị đã đăng nhập liệt kê, đọc, ghi; và ai đó lấy tham số KDF *then* đều hoạt động bình thường (FR21) |
| `KM-005-AC33` | *Given* token thiếu, sai dạng, không khớp, đã đăng xuất, đã hết hạn, hoặc `security_stamp` của tài khoản đã đổi (đặt trực tiếp trong kho cục bộ) *when* gọi thao tác cần xác thực, kèm id vault sai dạng hoặc body hỏng *then* cùng `401 unauthorized` (FR23, Concern 3) |
| `KM-005-AC34` | *Given* phiên còn 1 ngày (đặt trong kho cục bộ) *when* dùng token *then* hạn mới là khoảng 30 ngày kể từ lúc đó; phiên tới đúng thời điểm hết hạn thì bị từ chối (FR24) |
| `KM-005-AC35` | *Given* A và B cùng tài khoản *when* A đăng xuất *then* `204`; token A bị `401`, đăng xuất lại cũng `401`; B vẫn hoạt động (FR25) |
| `KM-005-AC36` | *Given* hai tài khoản có vault *when* liệt kê *then* mỗi bên chỉ thấy vault của mình, không có trường blob, `size` đúng số byte (FR26) |
| `KM-005-AC37` | *Given* `ETag` từ lần liệt kê trước *when* gửi `If-None-Match` lúc danh sách chưa đổi *then* `304` không có thân; sau khi ghi một vault hoặc tạo vault mới thì `200` với `ETag` khác (FR26) |
| `KM-005-AC38` | *Given* tài khoản đã có một vault *when* tạo vault với id mới *then* `201`, version 1, metaVersion 1 và vault hiện trong danh sách trên thiết bị khác (FR27) |
| `KM-005-AC39` | *Given* id trùng vault của mình, và id trùng vault của người khác *when* tạo vault *then* `409 vault_exists` và vault cũ không đổi (FR27, Concern 2) |
| `KM-005-AC40` | *Given* blob thiếu trường, thừa trường, `format`, `v`, `alg` lạ, `iv` không phải 12B, `ct` rỗng *when* tạo vault, ghi vault hoặc đăng ký *then* `400 invalid_envelope` và không có gì đổi (FR28) |
| `KM-005-AC41` | *Given* `meta` hoặc `wrappedVaultKey` thừa trường, hoặc `by` khác `account` *when* tạo vault *then* `400 bad_request` (FR06, FR28) |
| `KM-005-AC42` | *Given* blob hợp lệ đã ghi *when* đọc lại *then* giá trị giống hệt (FR28, FR29) |
| `KM-005-AC43` | *Given* vault ở version 8 *when* đọc với `since=8`, `since=7`, `since=99`, `since=abc`, không `since` *then* lần lượt `304` không có thân, `200`, `200`, `400 bad_request`, `200` (FR29) |
| `KM-005-AC44` | *Given* vault ở version 8 *when* ghi với `baseVersion: 8` *then* `200` với version 9, đọc lại ra blob mới (FR30) |
| `KM-005-AC45` | *Given* vault ở version 9 *when* ghi với `baseVersion: 8` hoặc `10` *then* `409 version_conflict` kèm version 9 và blob hiện tại; vault không đổi (FR30) |
| `KM-005-AC46` | *Given* cùng `baseVersion` *when* 10 lần ghi song song *then* đúng 1 lần `200`, 9 lần `409`, version chỉ tăng 1 (FR30, NFR05) |
| `KM-005-AC47` | *Given* vault của người khác và id không tồn tại *when* đọc (có và không có `since`) và ghi (blob đúng và blob sai) *then* mỗi cặp response giống từng byte, đều `404 not_found`, và vault của chủ không đổi (FR31, NFR04) |
| `KM-005-AC48` | *Given* id sai dạng: 15 ký tự, 17 ký tự, có chữ hoa, có ký tự ngoài hex *when* đã có token hợp lệ, gọi đọc hoặc ghi *then* `400 invalid_id` (FR32) |
| `KM-005-AC49` | *Given* đã chạy chuỗi ở 3.1 kèm nhiều lần đăng nhập sai và nhiều lần ghi đè *when* kiểm kho dữ liệu *then* chỗ chứa bản cũ và nhật ký rỗng, bộ đếm vẫn có dữ liệu (FR33) |
| `KM-005-AC50` | *Given* đã chạy chuỗi ở 3.1 *when* dò toàn bộ dữ liệu đã lưu theo danh sách ở NFR01 *then* 0 lần trùng (NFR01) |
| `KM-005-AC51` | *Given* nhiều lần đăng nhập sai với username không tồn tại từ một IP đã biết *when* dò bộ đếm, gồm cả băm thô của username và IP *then* 0 lần trùng (NFR02) |
| `KM-005-AC52` | *Given* toàn bộ bộ test *when* quét đầu ra `console` của server *then* 0 lần trùng (NFR03) |
| `KM-005-AC53` | *Given* 20 lần đăng nhập sai song song vào một username *when* hoàn tất *then* tối đa 5 lần `401`, còn lại `429` (NFR05) |
| `KM-005-AC54` | *Given* máy không có tài khoản Cloudflare *when* cài đặt rồi chạy bộ test hai lần liên tiếp *then* đều xanh, cùng kết quả, không có request kiểm chức năng nào ra Cloudflare (NFR08) |
| `KM-005-AC55` | *Given* đã xong *when* chạy `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run vectors` *then* đều xanh, `dependencies` rỗng, `git status` không có tệp bí mật hay dữ liệu cục bộ (NFR09, NFR10, NFR12) |
| `KM-005-AC56` | *Given* blob 200 KB trên máy dev *when* chạy mỗi thao tác 100 lần tuần tự *then* p95 ≤ 200 ms, kết quả được ghi vào `implement.md` (NFR07) |
| `KM-005-AC57` | *Given* mã server *when* reviewer đọc *then* không có đường dẫn, cờ hay nhánh chỉ dành cho test, không có import ngoài `core/`, và không có nhánh nào bỏ qua băm cho username không tồn tại (NFR04, NFR10, NFR11) |
| `KM-005-AC58` | *Given* `KM-005.md`, `KM-006.md`, `KM-008.md`, `KM-009.md` và 02, 03, 04, 05, 06 *when* verifier đọc lại *then* đúng các nội dung ở FR36, FR37, không còn câu nào nói KM-005 ghi snapshot hay nhật ký (FR36, FR37) |
| `KM-005-AC59` | *Given* phiên đã hết hạn quá 24 giờ và bộ đếm đã quá 24 giờ (đặt trong kho cục bộ) *when* có một lần đăng nhập *then* các bản ghi đó không còn, phiên và bộ đếm còn hiệu lực vẫn nguyên, và đăng nhập có kết quả như bình thường (FR35) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- 10 thao tác còn lại của 06: đổi metadata, xoá vault, xoay khoá vault (KM-008); đổi mật khẩu, xoay khoá tài khoản, thiết bị, snapshot, nhật ký (KM-009). Hệ quả đã chấp nhận: trước KM-009 không thu hồi được phiên của máy bị mất, không đổi được master password.
- Giữ bản cũ của vault và ghi nhật ký hoạt động (KM-009). Hệ quả đã chấp nhận: lần ghi đè không khôi phục được từ server, lần đăng nhập sai không để lại dấu vết để xem lại.
- Deploy lên Cloudflare, kiểm header và giới hạn nền tảng trên hạ tầng thật (KM-006).
- App nói chuyện với server, sync engine, gộp dữ liệu, thanh trạng thái, màn đăng ký và đăng nhập, nâng cấp tài khoản cục bộ (KM-006).
- Xác thực server bằng passkey; chia sẻ vault giữa nhiều người.
- CORS và gọi API từ origin khác: app và API cùng origin (06).
- Giới hạn số vault hay dung lượng cho mỗi tài khoản; giới hạn tốc độ cho các thao tác khác ngoài đăng nhập. Công cụ cá nhân, thao tác đã có phiên chỉ chủ tài khoản gọi được; lấy tham số KDF chỉ tốn request.
- Mã hoá lại, kiểm tra hay giải mã bất kỳ khối nào ở server; đổi định dạng envelope hay cách dẫn xuất khoá.

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: biết username là khoá được đăng nhập của chủ tài khoản 15 phút, và gọi lại mỗi 15 phút thì khoá mãi. 04 chưa nói thiết bị đã đăng nhập có bị ảnh hưởng không | PO; originator nếu đổi ngưỡng | **Đã chốt (originator, 2026-11-01): chấp nhận, giữ ngưỡng.** Khoá chỉ chặn đăng nhập mới; phiên đang có và mở khoá cục bộ không bị ảnh hưởng (FR21, AC32). Ghi rủi ro còn lại vào bảng mối đe doạ ở 04 (FR37) |
| 2 | Intent §5 hứa vault của người khác và vault không tồn tại "không phân biệt được", nhưng `409 vault_exists` của 06 cho người đã đăng nhập biết một id đang được dùng | Originator | **Đã chốt (originator, 2026-11-01): chấp nhận, ghi rõ.** Lời hứa áp dụng cho đọc và ghi (FR31). Id vẫn duy nhất toàn server, tạo trùng trả `409` (FR27, AC39). Chỉ người có phiên hợp lệ thấy được, id 64 bit ngẫu nhiên, không lộ nội dung. Ghi giới hạn vào 04 và 06 (FR37) |
| 3 | Intent §7 câu 2: "token đã mất hiệu lực" kiểm thế nào khi thao tác đổi `security_stamp` thuộc KM-009? Tương tự, chờ 15 phút hay 30 ngày thật thì test không chạy được | Engineer (`/build-plan`) | **Đã quyết phần hành vi:** phiên có `security_stamp` lệch tài khoản bị `401` (FR23). Test đặt trạng thái trực tiếp trong kho cục bộ (AC33, AC34), không có cửa sau trong mã thật (NFR11). **Hoãn phần cách làm, owner: engineer, lúc: build-plan KM-005** |
| 4 | Intent §7 câu 3: chưa ai chạy thử việc giả lập IP trên môi trường cục bộ, mà AC24, AC25, AC26 cần nó. Đọc IP từ header client tự đặt được thì mất tác dụng trên Cloudflare thật | Engineer (`/build-plan`) | **Hoãn, owner: engineer, lúc: build-plan KM-005, chạy thử trước khi viết mã.** Nếu môi trường cục bộ không tạo được tình huống này thì không được bỏ AC âm thầm: báo originator, kiểm phần logic đếm ở mức thấp hơn và chuyển phần còn lại vào `KM-006.md`. AC25 kiểm được trên Cloudflare thật mới là bằng chứng đủ |
| 5 | Intent §7 câu 4 và G5: chưa có số đo gói Free. Ước lượng trên giấy: 2 thiết bị gọi liệt kê mỗi 60 giây, mỗi lần gia hạn phiên một lần ghi, là 2 880 lần ghi/ngày. 02 chỉ ghi giới hạn đọc, chưa ghi giới hạn ghi và CPU mỗi request. Giới hạn CPU có thể chặt với blob lớn; môi trường cục bộ không đo được | Originator | **Hoãn, owner: originator, lúc: trước và trong KM-006** (xác nhận có tài khoản, đo trên Cloudflare thật). KM-005 ghi việc này vào `KM-006.md`. FR35 giữ kho không lớn mãi ngay từ đầu; nếu CPU không đủ thì đổi ngưỡng body ở 06 |
| 6 | Intent §5 chỉ kể 03 và 04 cần ghi việc hoãn snapshot và nhật ký, nhưng sơ đồ ở 05 ("lưu snapshot v7") và phần vận hành ở 02 ("server giữ 30 snapshot") cũng nói như đã có | PO | **Đã quyết:** sửa cả 05 và 02 (FR37). Không đổi ý intent, chỉ đủ chỗ |
| 7 | 06 và 04 chỉ nói "salt giả tất định", nhưng thế chưa đủ không dò được: username có thật cho cùng salt khi đổi hoa/thường còn username giả có thể không; khoá chỉ áp cho username có thật cũng lộ. Tài khoản có `iter` khác 600 000 cũng tự lộ là có thật | PO | **Đã quyết:** salt giả không phân biệt hoa/thường, 16B, `iter` 600 000 (FR09); bộ đếm và khoá áp dụng cho cả username không tồn tại (FR17, AC22). **Về `iter`:** lõi hiện chỉ tạo 600 000 (`newKdf`) nên chưa lộ. FR11 vẫn nhận tới 6 000 000 cho khớp `KDF_MAX_ITER`; epic nào nâng số vòng (lần đổi mật khẩu ở KM-009 hoặc về sau) phải xem lại điểm này: ghi vào `KM-009.md` |
| 8 | `409 username_taken` là kênh dò username, trái intent §5 "từ bên ngoài" | PO | **Đã quyết:** token đăng ký xét trước (FR12, AC14). Người có token hợp lệ là chủ hệ thống, không phải "bên ngoài" |
| 9 | Rate limit chỉ có cho đăng nhập, còn token đăng ký là chuỗi thử được không giới hạn trên địa chỉ công khai. 04 không nói | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** dựa vào độ dài thay vì đếm lần thử: server coi token dưới 32 ký tự là đóng đăng ký (FR12), và 04 ghi nên xoá token sau khi tạo tài khoản như đã có. Không thêm mã lỗi hay đếm mới cho một thao tác chỉ dùng một lần |
| 10 | 06 và 03 không định nghĩa username hợp lệ, trong khi lưu trữ chỉ bỏ hoa/thường cho ASCII: username Unicode có thể tạo các tài khoản trông giống nhau và bộ đếm lệch nhau | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** FR07 (ASCII, 1–64 ký tự, cho phép dạng email). Ghi vào 06 (FR37). KM-006 kiểm cùng quy tắc ở form đăng ký |
| 11 | 06 ghi body tối đa 2 MB, 03 ghi một dòng D1 tối đa "khoảng 2 MB": body gần 2 MB cộng các cột khác có thể vượt sức chứa và thành `500`. Môi trường cục bộ có thể không áp giới hạn này | PO; engineer kiểm ở build-plan | **Đã quyết:** 2 MB nghĩa là 2 000 000 byte; vượt sức chứa thì `413` (FR05). Client đã được 03 yêu cầu cảnh báo từ 1 MB, vault thường dưới 200 KB nên đây là ca biên. **Hoãn phần kiểm trên hạ tầng thật, owner: engineer KM-006**, ghi vào `KM-006.md` |
| 12 | 04 giao header bảo mật cho `_headers` của trang tĩnh; theo hiểu biết của PO, tệp này không áp dụng cho response của Functions | Engineer (`/build-plan`) | **Đã quyết phía an toàn:** API tự đặt header của mình (FR03) dù điều đó đúng hay sai. **Hoãn phần xác nhận, owner: engineer, lúc: build-plan KM-005 (đọc tài liệu Cloudflare), kiểm thật ở KM-006** |
| 13 | 04 có `HMAC(secret, username)` nhưng bảng cấu hình ở 02 và 03 không nhắc bí mật này. Khác `REGISTRATION_TOKEN`, nó phải tồn tại lâu dài; đổi nó thì salt giả đổi, lộ ra username nào không có thật với ai đã ghi lại salt cũ | PO | **Đã quyết:** thêm vào cấu hình ở 02, ghi "không đổi trừ khi cần" (FR37). Thiếu thì `500`, không dùng mặc định (FR10) |
| 14 | 06 không nói thao tác chưa làm trả gì, trong khi KM-006 và mọi client gọi vào sẽ gặp | PO | **Đã quyết:** `404 not_found` dạng JSON, không phụ thuộc token (FR01, AC03) |
| 15 | 06 dòng đầu viết mọi thao tác trên vault trả `404` nếu vault không có, còn bảng lỗi chung có `400 invalid_id` | PO | **Đã quyết:** không mâu thuẫn. Id sai dạng không thể tồn tại nên `400` chỉ dựa vào chuỗi đã gửi, không lộ gì (FR32). Kiểm sau token (AC33) |
| 16 | 05 cần `304` qua `ETag`, trong khi mọi response là `no-store`: trình duyệt sẽ không tự giữ `ETag` và tự gửi lại | Engineer KM-006 | **Hoãn, owner: engineer KM-006.** Server giữ cả hai (FR03, FR26). Client phải tự lưu `ETag` và tự đặt `If-None-Match`. Ghi vào `KM-006.md` |
| 17 | 03 mô tả khoá bộ đếm là `u:<username>` và `ip:<hash ip>`: username người lạ thử (có thể là mật khẩu gõ nhầm ô) sẽ nằm ở dạng gốc, và băm thô một IP thì dò ngược được. Trái tinh thần intent §5 "kiểm toàn bộ những gì server đã lưu" | PO | **Đã quyết:** cả hai đều không đọc được khi không có bí mật của server (NFR02, AC51). Sửa 03 (FR37) |
| 18 | Intent §6 đặt điều kiện "xem lại trước khi đưa secret thật lên server" nhưng chưa có nơi nào giữ điều kiện đó. KM-006 (M3) đã cho phép đưa dữ liệu lên, còn KM-009 ở M5 | Originator | **Hoãn, owner: originator, lúc: trước lần đầu đưa secret thật lên server.** Ghi điều kiện vào 04 và `KM-006.md` (FR37) để không bị quên: chưa thu hồi được phiên, chưa đổi được mật khẩu, không khôi phục được bản cũ từ server, không có nhật ký |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

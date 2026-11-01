# Spec — App v2 chạy cục bộ

**Epic ID:** `KM-003`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-01`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-003 biến phần lõi của KM-001 thành một app mở được trên trình duyệt: lập tài khoản cục bộ có một vault mặc định, mở khoá bằng master password khi không có mạng, khoá thủ công và tự khoá, quản lý project/env, tạo và dùng item cả 9 loại, gán một item vào nhiều env, fork, lịch sử kèm diff, hết hạn, sinh mật khẩu, field OTP, field từ file, lọc, tìm kiếm và copy tự xoá clipboard. Spec này phục vụ intent §1 ("chưa ai kiểm được bằng tay rằng quy trình thật có đúng hay không") và toàn bộ intent §5, đặc biệt dòng "Làm tiếp được": KM-004, KM-006, KM-010 bắt đầu được mà không phải định nghĩa lại cách giữ dữ liệu trên thiết bị. Epic này kế thừa KM-001, giữ nguyên hình dạng vault và chuỗi khoá; thay đổi duy nhất so với KM-001 là chuẩn hoá Unicode cho master password (Concern 2). Sau epic này vẫn chỉ dùng dữ liệu thử: chỉ có một bản dữ liệu trên một trình duyệt (intent §6).

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md`: JavaScript thuần, không build, không phụ thuộc bên thứ ba (ngoại lệ duy nhất là `wrangler`, từ KM-005); chiều phụ thuộc giữa các lớp; không `innerHTML` với dữ liệu người dùng; không inline script/style; không ghi secret ra `console`, lỗi hay URL; test chỉ dùng `node:test`. `~/.claude/CLAUDE.md`: công cụ tìm kiếm, không ảnh hưởng spec |
| `.aidlc/workspace.yaml`, `state.json` | `artifact_language: vi`; `strict_mode: true`; chưa có feedback hay lần từ chối nào |
| `docs/epics/KM-003/artifacts/intent.md`, `KM-003.md` | Phạm vi, *Not this*, 6 câu hỏi mở, các tiêu chí "Xong khi" |
| `docs/epics/KM-001/artifacts/intent.md`, `spec.md` (`inputs.json`: `from_epic`) | Quy tắc kế thừa. Concern 1 (bỏ v1), 4 (tốc độ trên điện thoại), 6 (Safari/iOS) được hẹn tới KM-003/KM-004 |
| `docs/epics/KM-002/artifacts/spec.md` | Concern 10 (hiển thị env/item sau khi gộp) hẹn tới build-plan KM-003 |
| `docs/07-features.md` | Định nghĩa các mã F-*, bố cục desktop/mobile, tiêu chí chấp nhận 5 |
| `docs/04-security.md` | CSP nguyên văn, tự khoá 10 phút, clipboard 30 giây, che secret, camera khi quét QR, OTP không hiện secret, sự kiện "Khoá app" |
| `docs/03-data-model.md` §1–3 | Schema vault, kiểu field, mẫu field, quy tắc toàn vẹn, dạng lưu cục bộ. Spec dẫn chiếu, không chép lại |
| `docs/09-core-api.md` | Hợp đồng lõi, ý nghĩa các mã lỗi, `updateItem` nộp bản nháp |
| `docs/02-architecture.md`, `docs/08-roadmap.md` | Luồng "khi sửa một item" (mã hoá và ghi ngay), mốc M1, Q5 (nhiều vault), Q8 (không import v1) |
| `docs/epics/KM-004`, `KM-006`, `KM-010`, `KM-011` | Ranh giới phạm vi và thứ các epic đó cần nhận lại |
| `design/` | Bố cục và cách tương tác để tham chiếu. Prototype dùng `style=`, `onclick`, `innerHTML`, nên không được chép nguyên cách hiện thực |
| `envvault.html` | Hành vi v1 của fork (`history` rỗng, `forkedFrom`) và nhân bản (`(bản sao)`, giữ `scopes`). Chỉ tham chiếu |
| Trả lời của originator (2026-11-01, phiên `/spec`) | Quyết định ở Concern 1–7 |

## 3. User scenarios

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

"Người dùng" là originator, dùng dữ liệu thử trên một trình duyệt (intent §2, §5).

1. **Lập tài khoản.** *Given* trình duyệt chưa có dữ liệu KeyMesh, *when* nhập master password hai lần và xác nhận, *then* app tạo tài khoản cục bộ có một vault mặc định và vào màn chính trống.
2. **Khoá rồi mở lại khi không có mạng.** *Given* đã có dữ liệu thử, *when* đóng trình duyệt, ngắt mạng, mở lại app từ máy chạy cục bộ và nhập đúng mật khẩu, *then* thấy lại đủ dữ liệu; nhập sai thì không thấy gì.
3. **Cất secret theo project/env.** *Given* app đã mở khoá, *when* tạo project `Payment GW` với env mặc định, rồi tạo item `login` "Partner X" gán vào `uat` và `staging`, *then* item hiện ở cả hai env và chi tiết có chip dùng chung.
4. **Sửa một lần.** *Given* item trên, *when* đổi Password rồi lưu, *then* mở từ env nào cũng thấy giá trị mới, và lịch sử có bản cũ kèm diff.
5. **Fork.** *Given* item trên, *when* fork cho `staging` rồi sửa bản fork, *then* bản ở `uat` không đổi (tiêu chí chấp nhận 5).
6. **Tìm và copy.** *Given* có nhiều item, *when* bấm Cmd/Ctrl+K, gõ một phần tiêu đề, mở item rồi copy Password, *then* clipboard có giá trị, app báo sẽ xoá sau 30 giây, và sau 30 giây clipboard được xoá.
7. **Khoá.** *Given* app đang mở, *when* bấm Khoá hoặc không thao tác quá 10 phút, *then* về màn khoá và phải nhập lại mật khẩu mới xem được dữ liệu.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

| Tình huống | Kết quả mong đợi |
|---|---|
| Hai lần nhập mật khẩu không khớp, hoặc để trống | Không tạo tài khoản, báo ngay tại form |
| Mật khẩu < 12 ký tự | Có cảnh báo, vẫn cho tiếp tục |
| Đóng tab giữa lúc lập tài khoản | Lần mở sau hoặc có đủ tài khoản, hoặc quay lại màn lập; không có trạng thái nửa vời |
| Quên master password | Không có đường khôi phục; đã báo trước ở màn lập. Muốn làm lại thì tự xoá dữ liệu trình duyệt |
| Sai mật khẩu | Báo "sai mật khẩu hoặc dữ liệu hỏng", không có dữ liệu nào hiện ra, thử lại được, không khoá lượt thử |
| Đúng mật khẩu nhưng vault bị hỏng | Báo lỗi cho vault đó, không hiện dữ liệu, không ghi đè bản đang lưu |
| Trình duyệt thiếu API cần thiết, hoặc không dùng được bộ lưu trữ (ví dụ một số chế độ riêng tư) | Báo rõ không chạy được, không vào màn lập hay màn chính, không chạy kém an toàn hơn |
| Không ghi được khi lưu (hết chỗ, lỗi bộ lưu trữ) | Báo lưu thất bại, giữ nguyên bản nháp để thử lại; không báo "đã lưu"; mở lại app thấy bản đã lưu trước đó |
| Mở app ở tab thứ hai khi tab đầu đang mở khoá | Tab thứ hai không mở khoá được và nói rõ lý do |
| Máy ngủ hoặc tab bị đẩy nền quá 10 phút | Lúc quay lại, app đã khoá trước khi hiện dữ liệu nào |
| Tới giờ tự khoá khi đang sửa item | Bản nháp chưa lưu bị bỏ. Đang gõ vẫn tính là có thao tác nên không rơi vào trường hợp này |
| Khoá khi vẫn còn trong 30 giây đếm xoá clipboard | Thử xoá clipboard ngay lúc khoá, không giữ giá trị đã copy trong bộ nhớ sau khi khoá |
| Vault trống; project không có env; bộ lọc không có kết quả; tìm không thấy | Có thông điệp trạng thái trống kèm việc làm tiếp theo |
| Xoá env hoặc project đang có item | Hỏi xác nhận, báo số item bị ảnh hưởng. Item vẫn còn; không còn env sống nào thì vào *Chưa gán* |
| Item chỉ còn một env sống | Không có nút Fork; không có gì để tách |
| Tiêu đề hoặc giá trị chứa HTML (`<img src=x onerror=…>`) | Hiện đúng như chuỗi văn bản, không chạy gì |
| Field URL có `javascript:` hoặc scheme khác `http`/`https` | Hiện như văn bản, copy được, không có nút mở |
| File > 64 KB, file nhị phân, hoặc không phải UTF-8 hợp lệ | Từ chối, báo lý do, giữ nguyên giá trị cũ |
| Field OTP có URI `otpauth://hotp/…`, base32 hỏng, hoặc tham số ngoài khoảng | Từ chối khi lưu, báo lỗi ngay tại field đó |
| Từ chối quyền camera, không có camera, hoặc trình duyệt không có bộ đọc QR sẵn | Báo lý do và mời nhập secret/URI; nhập tay luôn dùng được |
| QR không phải `otpauth://totp/…`, hoặc ảnh không có QR | Báo không đọc được, field giữ nguyên |
| Đóng dialog quét QR, hoặc app khoá khi đang quét | Camera tắt ngay; không lưu ảnh |
| Trình duyệt từ chối ghi clipboard | Báo copy thất bại, không báo "đã copy" |
| Trình duyệt từ chối đọc clipboard lúc tới hạn | Vẫn ghi đè clipboard; từ chối ghi vì tab không được focus thì thử lại khi tab được focus (Concern 7) |
| Mở lại bản lịch sử có field đã bị xoá sau đó | Khôi phục đưa field đó trở lại |
| Sửa item lần thứ 21 trở lên | Lịch sử giữ 20 bản mới nhất |

## 4. Functional requirements

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-003-FR01` | Trình duyệt chưa có tài khoản thì hiện màn lập tài khoản: nhập master password 2 lần, không hỏi username, không có thanh đo độ mạnh. Để trống hoặc không khớp thì không tạo tài khoản | Must | intent §5 Thiết lập; §7 câu 1 |
| `KM-003-FR02` | Màn lập cảnh báo khi mật khẩu < 12 ký tự mà không chặn, và nói rõ hai điều: không có cách khôi phục khi quên mật khẩu; dữ liệu chỉ nằm trên trình duyệt này, xoá dữ liệu trình duyệt là mất hết | Must | intent §5 Thiết lập; §6 |
| `KM-003-FR03` | Lập tài khoản tạo đúng một vault mặc định tên "Vault mặc định" và một `deviceId` cố định cho trình duyệt này. Việc ghi là tất cả hoặc không có gì | Must | F-VLT-01; intent §5 Thiết lập |
| `KM-003-FR04` | Dữ liệu trên đĩa theo dạng ở 03 §3 và `record` ở 09, gồm trạng thái "có thay đổi chưa đồng bộ" mà KM-006 sẽ đọc. `username`, `userId` để trống cho tới KM-006. `authKey` không được lưu. KM-006 đăng ký được chính bộ khoá này với server, không phải mã hoá lại vault và không mất dữ liệu | Must | intent §5 Làm tiếp được; §7 câu 1 |
| `KM-003-FR05` | Master password được chuẩn hoá Unicode NFC trước khi dẫn xuất khoá, ở mọi đường vào, nên hai cách gõ NFC và NFD của cùng một mật khẩu mở được cùng tài khoản | Must | intent §7 câu 2 |
| `KM-003-FR06` | Đúng mật khẩu thì mở được và thấy đủ dữ liệu của vault mà không gửi hay nhận gì qua mạng | Must | F-AUTH-03; intent §5 Thiết lập |
| `KM-003-FR07` | Sai mật khẩu thì một thông báo duy nhất không phân biệt sai mật khẩu với dữ liệu hỏng, không hiện dữ liệu nào, cho thử lại | Must | F-AUTH-03; intent §5 Thiết lập; 09 § Lỗi |
| `KM-003-FR08` | Vault mở lỗi (`decrypt-failed`, `format`) hoặc nền tảng thiếu API (`unsupported`) thì báo lỗi riêng, không hiện dữ liệu, không ghi đè dữ liệu đang lưu | Must | intent §5 An toàn; 09 § Lỗi |
| `KM-003-FR09` | Tải lại trang hoặc đóng rồi mở lại luôn về màn khoá | Must | F-AUTH-05; intent §5 Khoá |
| `KM-003-FR10` | Có nút Khoá luôn trong tầm thấy ở màn chính, bấm là khoá ngay | Must | F-AUTH-05; intent §5 Khoá |
| `KM-003-FR11` | Không có thao tác (chuột, phím, chạm, cuộn) trong 10 phút thì tự khoá. Thời gian trôi lúc máy ngủ hoặc tab ở nền vẫn được tính. Thời gian này cố định; chỉnh trong cài đặt thuộc KM-004 | Must | F-AUTH-05; intent §5 Khoá; 04 |
| `KM-003-FR12` | Khi khoá: bỏ khoá, vault plaintext, bản nháp và trạng thái hiện secret khỏi bộ nhớ của app; xoá dữ liệu vault khỏi DOM; tắt camera nếu đang bật; thử xoá clipboard nếu còn đang đếm | Must | intent §5 Khoá; 04 sự kiện "Khoá app" |
| `KM-003-FR13` | Tại một thời điểm chỉ một tab của app được mở khoá trên cùng trình duyệt. Tab khác không mở khoá được và nói rõ lý do; tab kia khoá hoặc đóng thì tab này mở khoá lại được | Must | intent §5 Thiết lập (Concern 10) |
| `KM-003-FR14` | Thêm project kèm danh sách env khởi tạo, mặc định `dev, uat, staging, prod`, sửa được trước khi tạo. Tên project trống hoặc trùng (không phân biệt hoa thường) trong vault bị từ chối | Must | F-PRJ-01 |
| `KM-003-FR15` | Đổi tên project. Xoá project thì hỏi xác nhận, nêu số item sống đang gán vào env của project đó | Must | F-PRJ-02 |
| `KM-003-FR16` | Thêm, đổi tên env; tên trống hoặc trùng trong project bị từ chối. Xoá env thì hỏi xác nhận, nêu số item bị ảnh hưởng. Item giữ id env đã xoá trong `scopes` theo 03 nhưng UI bỏ qua env đó | Must | F-PRJ-03; 03 Quy tắc toàn vẹn |
| `KM-003-FR17` | Sắp xếp lại thứ tự project và env, làm được bằng bàn phím hoặc nút, không chỉ kéo thả; thứ tự còn nguyên sau khi khoá rồi mở | Must | F-PRJ-04 |
| `KM-003-FR18` | Đặt hoặc bỏ màu của env, chọn từ một bảng màu cố định có đủ dạng sáng và tối | Must | F-PRJ-05 |
| `KM-003-FR19` | Copy một field của item gán vào env sống tên `prod` (không phân biệt hoa thường) thì thông báo copy có cảnh báo nhẹ. Cảnh báo không chặn việc copy | Must | F-PRJ-05 |
| `KM-003-FR20` | Tạo item qua 2 bước: chọn 1 trong 9 loại trên lưới icon kèm mô tả, rồi điền form có sẵn field mẫu đúng `ITEM_TEMPLATES`. Tiêu đề trống thì không lưu được. Loại không đổi được sau khi tạo | Must | F-ITM-01; intent §5 Một item, nhiều env |
| `KM-003-FR21` | Trong form: thêm, xoá, đổi tên, sắp xếp field và đổi `kind` trong cả 6 kiểu. Đổi sang kiểu không cho phép `file` thì bỏ `file`. Sắp xếp làm được bằng bàn phím hoặc nút | Must | F-ITM-02 |
| `KM-003-FR22` | Gán item vào không, một hoặc nhiều env, kể cả khác project. Lúc tạo item từ bộ lọc một env, env đó được chọn sẵn. Sửa gán không làm mất id env đã xoá trong `scopes` | Must | F-ITM-03; 03 Quy tắc toàn vẹn |
| `KM-003-FR23` | Lưu item: dữ liệu được mã hoá và ghi xong rồi mới báo thành công, và mọi env được gán đều thấy giá trị mới. Ghi thất bại thì báo lỗi, giữ bản nháp, và dữ liệu đang hiện không khác dữ liệu trên đĩa | Must | F-ITM-04; 02 "Khi sửa một item" |
| `KM-003-FR24` | Fork item cho một env (chỉ khi item có ≥ 2 env sống): tạo item mới với giá trị hiện tại, id field mới, `scopes` chỉ có env đó, `forkedFrom` trỏ về bản gốc, lịch sử rỗng; gỡ env đó khỏi bản gốc. Hai item độc lập từ đó về sau. Chi tiết bản fork có liên kết tới bản gốc | Must | F-ITM-05; intent §5 Tiêu chí 5 |
| `KM-003-FR25` | Nhân bản mở form item mới với giá trị hiện tại, tiêu đề thêm " (bản sao)", cùng `scopes`, lịch sử rỗng, `forkedFrom` trống; chỉ thành item khi bấm lưu | Must | F-ITM-06 |
| `KM-003-FR26` | Item có ≥ 2 env sống thì chi tiết có chip dạng "Dùng chung: uat, staging (+1 project khác)": tên env thuộc project đang lọc (không lọc thì project đầu theo thứ tự), rồi số project khác. Danh sách có dấu riêng cho item dùng chung | Must | F-ITM-14 |
| `KM-003-FR27` | Lịch sử liệt kê tối đa 20 bản, mới nhất trước, mỗi bản có thời điểm và lý do, và có diff từng thuộc tính so với bản hiện tại. Diff của `secret`/`secret-multi` mặc định che, bấm mới hiện; diff của `otp` chỉ báo "đã đổi", không bao giờ hiện secret | Must | F-ITM-08; 04 |
| `KM-003-FR28` | Khôi phục một bản lịch sử đặt lại `title`, `fields`, `notes`, `expires` theo bản đó, giữ nguyên gán env hiện tại, và đẩy trạng thái ngay trước đó vào lịch sử với `reason: "restore"` | Must | F-ITM-08; 03 §1 (Concern 9) |
| `KM-003-FR29` | Đặt hoặc bỏ ngày hết hạn. Chi tiết hiện số ngày còn lại hoặc "đã hết hạn" theo lịch địa phương | Must | F-ITM-09 |
| `KM-003-FR30` | Bộ lọc *Sắp hết hạn* gồm item còn ≤ 14 ngày (tính cả ngày thứ 14 và hôm nay) và item đã quá hạn | Must | F-ITM-09; hành vi v1 |
| `KM-003-FR31` | Cạnh field `secret` có bộ sinh chế độ *Ngẫu nhiên*: độ dài 8–64 (mặc định 24), luôn có chữ thường, tuỳ chọn chữ hoa, số, ký tự đặc biệt; mỗi nhóm đã chọn có ít nhất một ký tự; dùng nguồn ngẫu nhiên mật mã, không lệch. Giá trị chỉ vào field khi bấm *Dùng* | Must | F-ITM-10 |
| `KM-003-FR32` | Chế độ *Dễ nhớ*: ghép 3–8 từ (mặc định 5), lấy ngẫu nhiên từ danh sách ≥ 2048 từ khác nhau, nên mặc định đạt ≥ 55 bit | Must | F-ITM-10 (Concern 11) |
| `KM-003-FR33` | Thêm được field `otp` vào item bất kỳ. Nhận secret base32 (bỏ qua hoa thường và khoảng trắng) hoặc URI `otpauth://totp/…` với `digits` 6–8, `period` 1–300, `algorithm` SHA1/SHA256/SHA512; mặc định 6 số, 30 giây, SHA1. Giá trị sai hoặc `hotp` thì không lưu được. Ô nhập mặc định che | Must | F-ITM-15; 03 Kiểu field |
| `KM-003-FR34` | Màn xem field `otp` hiện mã TOTP hiện tại theo RFC 6238 kèm đếm ngược, mã đổi khi sang chu kỳ mới. Copy lấy mã, không lấy secret, và tự xoá như FR40. Màn xem không có cách nào hiện secret | Must | F-ITM-15; 04 |
| `KM-003-FR35` | Đọc QR bằng camera trong dialog quét. Camera chỉ bật khi dialog mở và tắt ngay khi đọc được hoặc đóng dialog; không lưu ảnh. Đọc được `otpauth://totp/…` thì điền vào field | Must | F-ITM-15; 04 Camera |
| `KM-003-FR36` | Đọc QR từ ảnh chụp màn hình do người dùng chọn; ảnh không được lưu | Must | F-ITM-15 |
| `KM-003-FR37` | Trình duyệt không có bộ đọc QR sẵn thì nút quét báo rõ và mời dán secret/URI. Không có thư viện giải mã dự phòng ở epic này | Must | F-ITM-15 (Concern 6) |
| `KM-003-FR38` | Field `multi`/`secret-multi` đọc nội dung từ file văn bản UTF-8 ≤ 65 536 byte và nhớ tên file. File lớn hơn, chứa byte NUL hoặc sai UTF-8 thì bị từ chối, giá trị cũ giữ nguyên | Must | F-ITM-16 |
| `KM-003-FR39` | Field có `file` và có nội dung thì màn xem hiện tên file và kích thước thay cho nội dung (bấm mới hiện), có nút tải lại thành file đúng tên với nội dung trùng từng byte với file gốc nếu chưa sửa. Field `file` còn rỗng (ví dụ mẫu `vpn` mới tạo) không có nút tải | Must | F-ITM-16; 03 §1 |
| `KM-003-FR40` | Copy field đúng theo bảng `kind` ở 03. Sau 30 giây, nếu clipboard vẫn là giá trị đã copy thì xoá; không đọc được clipboard thì vẫn xoá; bị từ chối ghi vì tab mất focus thì xoá khi tab có focus lại. Copy lần mới thay thế lượt đếm cũ | Must | F-VIEW-03; 04 Clipboard (Concern 7) |
| `KM-003-FR41` | `secret` và `secret-multi` mặc định che, bấm để hiện, tự che lại khi chuyển item | Must | F-VIEW-03; 04 Ẩn secret |
| `KM-003-FR42` | Field `url` có scheme `http`/`https` có nút mở tab mới, trang đích không truy cập được app qua `window.opener`. Scheme khác chỉ hiện như văn bản | Must | F-VIEW-04; 04 XSS |
| `KM-003-FR43` | Có các bộ lọc: Tất cả, Chưa gán (không có env sống), Sắp hết hạn, theo Project, theo Env. Item trong thùng rác hay đã purge không hiện ở đâu | Must | F-VIEW-01 |
| `KM-003-FR44` | Tìm kiếm trong vault đang chọn theo tiêu đề, ghi chú và giá trị field `text`/`url`/`multi`, không phân biệt hoa thường và dấu tiếng Việt (`mat khau` khớp `mật khẩu`, `d` khớp `đ`). Không tìm trong `secret`, `secret-multi`, `otp` hay lịch sử. Cmd/Ctrl+K đưa con trỏ vào ô tìm. Chưa tìm theo tag | Must | F-VIEW-02; intent §7 câu 5 |
| `KM-003-FR45` | Giao diện sáng/tối theo cài đặt hệ thống và đổi theo ngay, không cần tải lại. Không có nút chọn chủ đề thủ công | Must | F-PWA-05 |
| `KM-003-FR46` | Từ 900px trở lên hiện 3 cột. Dưới 900px xếp chồng từng màn, có nút quay lại trong app, làm được mọi chức năng của epic | Must | KM-003.md; intent §7 câu 4 |
| `KM-003-FR47` | Không hiện nút hay màn nào của tính năng ngoài phạm vi: xoá item, thùng rác, yêu thích, tag, chọn vault, passkey, đăng nhập/đăng xuất, trạng thái đồng bộ, backup/import/export, đổi mật khẩu, chỉnh thời gian khoá | Must | intent §6 |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-003-NFR01` | CSP | Khi chạy cục bộ, app được phục vụ dưới đúng chuỗi CSP ở 04, kèm header đó ngay từ epic này. Đi qua mọi luồng của FR01–FR47: 0 vi phạm CSP. Không `<script>`/`<style>` inline, không `style="…"`, không `on*="…"`, không `eval` |
| `KM-003-NFR02` | Dữ liệu ở trạng thái nghỉ | Dò toàn bộ dữ liệu app để lại trên máy (IndexedDB, `localStorage`, `sessionStorage`, Cache Storage) với các chuỗi đánh dấu trong tiêu đề, giá trị, ghi chú, tên project/env, master password: 0 kết quả. Không có `accountKey`, `vaultKey` hay `authKey` dạng chưa bọc |
| `KM-003-NFR03` | Không rò rỉ | 0 chuỗi đánh dấu trong `console`, thông điệp lỗi và URL khi đi qua các luồng chính và luồng lỗi. Giới hạn đã biết: JavaScript không xoá được chuỗi trong bộ nhớ theo yêu cầu; "khoá" nghĩa là bỏ mọi tham chiếu, đúng định nghĩa ở 09 |
| `KM-003-NFR04` | Không gọi mạng | Sau khi tải các file của app: 0 request ra ngoài. Tải file của app chỉ tới cùng origin. Mở app khi máy ngắt mạng vẫn chạy được, miễn là chương trình phục vụ cục bộ vẫn chạy |
| `KM-003-NFR05` | Chống chèn mã | Giá trị do người dùng nhập luôn hiện như văn bản; bộ chuỗi chèn HTML/script ở mọi ô nhập không tạo phần tử hay chạy mã nào |
| `KM-003-NFR06` | Phụ thuộc | 0 package bên thứ ba khi chạy và khi test; `dependencies` rỗng; chưa có `wrangler` |
| `KM-003-NFR07` | Trình duyệt | Bắt buộc: Chrome desktop bản hiện hành đạt mọi AC. Safari và Firefox desktop bản hiện hành: chạy test lõi và luồng chính (lập, mở khoá, tạo item, copy), lỗi được ghi vào artifact nhưng không chặn đóng epic. iPhone/Android ở KM-004 |
| `KM-003-NFR08` | Hiệu năng (đo trên máy dev, Chrome, trung vị 5 lần) | Mở khoá với vault 200 KB: ≤ 1,5 s. Lưu một item với vault plaintext ~1 MB: ≤ 500 ms từ lúc bấm tới lúc báo xong. Lọc hoặc gõ tìm với 500 item: ≤ 100 ms mỗi lần. Số vòng PBKDF2 không được hạ. Ngưỡng này đặt trước khi có số đo trên trình duyệt; build-plan đo đường cơ sở, nếu lệch thì sửa spec kèm lý do |
| `KM-003-NFR09` | Giao diện hẹp | Ở rộng 360px và 899px: không cuộn ngang trang; vùng chạm của nút ≥ 44×44 px. Phần hoàn thiện mobile thuộc KM-004 |
| `KM-003-NFR10` | Trợ năng | Luồng 3.1 làm được chỉ bằng bàn phím; mọi ô nhập và nút chỉ có icon đều có tên cho công nghệ hỗ trợ; focus nhìn thấy được; dialog giữ focus bên trong; tương phản chữ ≥ 4,5:1 ở cả hai chủ đề |
| `KM-003-NFR11` | Hợp đồng lõi | `npm test` và `npm run test:browser` xanh. `npm run vectors` không đổi. Mọi thay đổi lõi (dự kiến chỉ Concern 2 và 9) cập nhật 09/03 trong cùng thay đổi và ghi lý do vào artifact (intent §5) |
| `KM-003-NFR12` | Kiểm thử | Mỗi FR có ít nhất một test chỉ rõ id, hoặc một mục kiểm tay trong danh sách của `verify.md` nếu chỉ kiểm được trên trình duyệt thật (camera, clipboard, tự khoá thật). Logic không cần DOM được test bằng `node:test` |

## 6. Acceptance criteria

Các tiêu chí kiểm bằng test tự động hoặc bằng tay trên Chrome desktop, với dữ liệu thử. Phép đo thời gian và ngày có thể dùng đồng hồ giả lập.

| Id | Given / When / Then |
|---|---|
| `KM-003-AC01` | *Given* trình duyệt trống *when* mở app *then* thấy màn lập chỉ có hai ô mật khẩu; *when* hai ô khác nhau hoặc trống *then* không có tài khoản nào được tạo (FR01) |
| `KM-003-AC02` | *Given* màn lập *when* nhập mật khẩu 11 ký tự *then* có cảnh báo, vẫn tạo được; 12 ký tự *then* không cảnh báo; và màn này luôn nói không khôi phục được và dữ liệu chỉ ở trình duyệt này (FR02) |
| `KM-003-AC03` | *Given* vừa lập xong *when* đọc dữ liệu đã lưu *then* có đúng một vault, mở ra tên "Vault mặc định", `deviceId` hợp lệ, đúng dạng 03 §3, không có `authKey`; `username` và `userId` trống (FR03, FR04) |
| `KM-003-AC04` | *Given* lỗi ghi được giả lập giữa lúc lập tài khoản *when* mở lại app *then* về màn lập, không có tài khoản dở dang (FR03) |
| `KM-003-AC05` | *Given* tài khoản lập bằng mật khẩu chứa `ệ` dạng NFC *when* mở khoá bằng cùng mật khẩu dạng NFD *then* mở được; *and* vector cố định của KM-001 vẫn pass (FR05, NFR11) |
| `KM-003-AC06` | *Given* có dữ liệu thử, trình duyệt đã đóng, máy ngắt mạng *when* mở lại và nhập đúng mật khẩu *then* thấy đủ project, env, item; *when* nhập sai *then* không thấy dữ liệu nào và thử lại được (FR06, FR07, FR09) |
| `KM-003-AC07` | *Given* envelope vault đã lưu bị sửa 1 byte *when* mở bằng đúng mật khẩu *then* báo lỗi, không hiện dữ liệu, bản đã lưu không đổi; *given* giả lập thiếu `CompressionStream` *then* báo không hỗ trợ, không vào màn lập (FR08) |
| `KM-003-AC08` | *Given* đang mở khoá *when* bấm Khoá *then* về màn khoá ngay, DOM không còn tiêu đề hay giá trị nào, bản nháp và trạng thái hiện secret bị bỏ (FR10, FR12) |
| `KM-003-AC09` | *Given* đang mở khoá *when* không thao tác 10 phút *then* tự khoá trong ≤ 30 giây sau mốc đó; *when* có một thao tác lúc phút thứ 9 *then* mốc được tính lại từ đó (FR11) |
| `KM-003-AC10` | *Given* đang mở khoá *when* máy ngủ 11 phút rồi thức dậy *then* app đã khoá trước khi hiện dữ liệu nào (FR11) |
| `KM-003-AC11` | *Given* tab A đang mở khoá *when* mở tab B *then* B không mở khoá được và nói rõ lý do; *when* khoá hoặc đóng A *then* B mở khoá được; sửa ở tab đang mở không bị tab kia ghi đè (FR13) |
| `KM-003-AC12` | *Given* vault trống *when* thêm project không sửa danh sách env *then* có 4 env `dev, uat, staging, prod` đúng thứ tự; *when* tên trống hoặc trùng khác hoa thường *then* bị từ chối (FR14, FR16) |
| `KM-003-AC13` | *Given* project có 2 env, 3 item sống gán vào đó, trong đó 1 item còn env của project khác *when* bấm xoá project *then* hộp xác nhận báo 3 item; *when* xác nhận *then* project và env biến mất khỏi điều hướng, 2 item vào *Chưa gán*, 1 item vẫn ở project kia, `scopes` vẫn giữ các id đã xoá (FR15, FR16) |
| `KM-003-AC14` | *Given* vài project và env *when* đổi thứ tự chỉ bằng bàn phím, khoá rồi mở lại *then* thứ tự mới còn nguyên (FR17) |
| `KM-003-AC15` | *Given* env có màu đỏ *then* hiện đúng màu ở cả hai chủ đề mà không vi phạm CSP; *when* copy field của item gán vào env `PROD` *then* có cảnh báo nhẹ và clipboard vẫn có giá trị; item không có env prod thì không cảnh báo (FR18, FR19) |
| `KM-003-AC16` | *Given* mỗi loại trong 9 loại *when* tạo item *then* field mẫu đúng bảng 03 §1 về tên, kiểu, thứ tự; *when* tiêu đề trống *then* không lưu được (FR20) |
| `KM-003-AC17` | *Given* form item *when* thêm field `otp`, xoá một field, đổi thứ tự, đổi field có `file` sang `text` *then* sau khi lưu và mở lại đúng như đã sửa, không còn `file` (FR21) |
| `KM-003-AC18` | *Given* item gán vào `PaymentGW/uat`, `PaymentGW/staging`, `CRM/uat` *when* đổi Password ở env bất kỳ rồi lưu *then* mở từ cả ba env đều thấy giá trị mới; chip hiện "Dùng chung: uat, staging (+1 project khác)" khi đang lọc `PaymentGW` (FR22, FR23, FR26) |
| `KM-003-AC19` | *Given* item đang gán vào một env đã xoá *when* sửa gán env khác rồi lưu *then* `scopes` vẫn giữ id env đã xoá (FR22) |
| `KM-003-AC20` | *Given* bộ lưu trữ giả lập ghi lỗi *when* lưu item *then* báo thất bại, bản nháp còn nguyên, không có thông báo đã lưu; *when* mở lại app *then* thấy bản trước đó (FR23) |
| `KM-003-AC21` | *Given* item gán vào `uat` và `staging` *when* fork cho `staging` *then* có item mới chỉ ở `staging` với `forkedFrom` đúng và lịch sử rỗng, bản gốc chỉ còn `uat`; *when* sửa bản fork *then* bản ở `uat` không đổi; *when* sửa bản gốc *then* bản fork không đổi (FR24, tiêu chí 5 của 07) |
| `KM-003-AC22` | *Given* item chỉ có một env sống *then* không có nút Fork (FR24) |
| `KM-003-AC23` | *Given* một item *when* nhân bản *then* form mở với tiêu đề thêm " (bản sao)"; *when* huỷ *then* không có item mới; *when* lưu *then* item mới có cùng `scopes`, lịch sử rỗng, `forkedFrom` trống, id field mới (FR25) |
| `KM-003-AC24` | *Given* item đã sửa Password và Ghi chú *when* mở lịch sử *then* bản cũ hiện thời điểm, lý do và diff; diff Password bị che tới khi bấm hiện; diff `otp` chỉ báo "đã đổi". *When* sửa 25 lần *then* giữ 20 bản mới nhất (FR27) |
| `KM-003-AC25` | *Given* một item có bản lịch sử cũ và đã đổi gán env *when* khôi phục bản đó *then* tiêu đề, field, ghi chú, hạn về theo bản đó, gán env không đổi, field đã xoá sau đó quay lại, lịch sử có thêm bản `reason: "restore"` (FR28) |
| `KM-003-AC26` | *Given* hôm nay là N *when* các item có hạn N−1, N, N+14, N+15 *then* *Sắp hết hạn* có đúng 3 item đầu, chi tiết hiện đúng "đã hết hạn" hoặc số ngày còn lại (FR29, FR30) |
| `KM-003-AC27` | *Given* bộ sinh ngẫu nhiên *when* sinh 10 000 lần với mỗi tổ hợp tuỳ chọn ở độ dài 8 và 64 *then* đúng độ dài, có đủ các nhóm đã chọn, không có ký tự của nhóm đã tắt, không có hai giá trị trùng; *when* đóng mà không bấm *Dùng* *then* field không đổi (FR31) |
| `KM-003-AC28` | *Given* chế độ *Dễ nhớ* *then* mặc định 5 từ, chỉnh được 3–8; danh sách từ có ≥ 2048 mục khác nhau (FR32) |
| `KM-003-AC29` | *Given* vector RFC 6238 cho SHA1, SHA256, SHA512 *when* tính mã *then* đúng; *given* URI có `digits=8&period=60` *then* đúng theo tham số đó; *when* secret `JBSW Y3dp` có khoảng trắng và chữ thường *then* đọc được (FR33, FR34) |
| `KM-003-AC30` | *Given* URI `otpauth://hotp/…`, base32 sai, `digits=9` hoặc `period=0` *when* lưu *then* không lưu được, báo tại đúng field (FR33) |
| `KM-003-AC31` | *Given* field `otp` trên màn xem *then* có mã và đếm ngược, mã đổi trong ≤ 1 giây sau khi sang chu kỳ mới, không có nút hiện secret; *when* copy *then* clipboard là mã, không phải secret (FR34) |
| `KM-003-AC32` | *Given* Chrome trên macOS có bộ đọc QR sẵn *when* quét QR `otpauth://totp/…` bằng camera *then* field được điền và camera tắt; *when* đóng dialog không quét *then* camera tắt; *when* chọn ảnh chụp màn hình có QR *then* field được điền (FR35, FR36) |
| `KM-003-AC33` | *Given* từ chối quyền camera, hoặc giả lập không có bộ đọc QR *when* bấm quét *then* có thông báo rõ và vẫn dán được secret/URI; *given* QR hay ảnh không hợp lệ *then* báo không đọc được, field giữ nguyên (FR35, FR36, FR37) |
| `KM-003-AC34` | *Given* file UTF-8 đúng 65 536 byte có CRLF *when* chọn vào field `secret-multi` *then* nhận và màn xem hiện tên file; *when* tải lại *then* đúng tên, trùng từng byte. *Given* file 65 537 byte, file có byte NUL, file sai UTF-8 *then* bị từ chối, giá trị cũ giữ nguyên (FR38, FR39) |
| `KM-003-AC35` | *Given* item `vpn` mới tạo, field *Cấu hình* còn rỗng *then* không có nút tải file (FR39) |
| `KM-003-AC36` | *Given* copy một field *when* clipboard không đổi sau 30 giây *then* clipboard bị xoá; *when* đã copy thứ khác ở app khác và đọc được clipboard *then* giữ nguyên thứ đó; *when* không đọc được clipboard *then* vẫn xoá; *when* copy lại trong lúc đếm *then* lượt đếm bắt đầu lại (FR40) |
| `KM-003-AC37` | *Given* đang đếm xoá clipboard *when* khoá app *then* clipboard được xoá ngay nếu trình duyệt cho phép (FR12, FR40) |
| `KM-003-AC38` | *Given* item có secret *then* mặc định che; *when* bấm hiện rồi chuyển sang item khác và quay lại *then* lại che (FR41) |
| `KM-003-AC39` | *Given* field `url` là `https://a.example` *when* bấm mở *then* mở tab mới, `window.opener` ở tab đó là `null`; *given* `javascript:alert(1)` *then* không có nút mở, không chạy gì (FR42, NFR05) |
| `KM-003-AC40` | *Given* các item đủ loại trạng thái gán env *when* bấm từng bộ lọc *then* đúng tập item; item chỉ trỏ tới env đã xoá nằm trong *Chưa gán*; vault trống hoặc bộ lọc rỗng có thông điệp trạng thái trống (FR43) |
| `KM-003-AC41` | *Given* item "Mật khẩu VPN" có field `text` "đà nẵng" và field `secret` "zebra" *when* Cmd/Ctrl+K rồi gõ `mat khau` hoặc `da nang` *then* thấy item; *when* gõ `zebra` *then* không thấy (FR44) |
| `KM-003-AC42` | *Given* app đang mở *when* đổi chế độ sáng/tối của hệ điều hành *then* giao diện đổi theo, không tải lại (FR45) |
| `KM-003-AC43` | *Given* cửa sổ rộng 900px *then* có 3 cột; *given* rộng 899px và 360px *then* xếp chồng, làm trọn luồng 3.1 được, không cuộn ngang, vùng chạm ≥ 44×44 px (FR46, NFR09) |
| `KM-003-AC44` | *Given* mọi màn của app *when* soi giao diện *then* không có nút hay màn nào trong danh sách FR47 (FR47) |
| `KM-003-AC45` | *Given* app được phục vụ dưới đúng CSP ở 04, có bộ đếm vi phạm CSP *when* đi qua mọi luồng, gồm quét QR và tải file *then* 0 vi phạm (NFR01) |
| `KM-003-AC46` | *Given* dữ liệu thử có chuỗi đánh dấu ở mọi ô nhập *when* app đã khoá, dò toàn bộ dữ liệu app để lại trên máy *then* không có chuỗi đánh dấu nào và không có khoá chưa bọc; *and* đầu ra `console`, thông điệp lỗi, URL cũng không có (NFR02, NFR03) |
| `KM-003-AC47` | *Given* mở theo dõi mạng *when* đi qua mọi luồng *then* không có request nào ngoài các file của app cùng origin (NFR04) |
| `KM-003-AC48` | *Given* mỗi ô nhập nhận `<img src=x onerror=alert(1)>` *then* chuỗi hiện nguyên văn, không tạo phần tử, không chạy gì (NFR05) |
| `KM-003-AC49` | *Given* Safari và Firefox desktop bản hiện hành *when* chạy test lõi và luồng chính *then* kết quả được ghi vào artifact của epic, kể cả lỗi (NFR07) |
| `KM-003-AC50` | *Given* máy dev và Chrome *when* đo 5 lần *then* trung vị đạt các ngưỡng ở NFR08, hoặc có sửa đổi spec kèm lý do (NFR08) |
| `KM-003-AC51` | *Given* chỉ dùng bàn phím *when* làm luồng 3.1 *then* làm trọn được, focus luôn nhìn thấy; đo tương phản đạt ≥ 4,5:1 ở cả hai chủ đề (NFR10) |
| `KM-003-AC52` | *Given* repo sau khi implement *when* chạy `npm test`, `npm run test:browser`, `npm run vectors` *then* xanh và vector không đổi; `dependencies` rỗng; mỗi thay đổi lõi có lý do ghi lại, và 09/03 đã cập nhật; mỗi FR chỉ ra được một test hoặc một mục kiểm tay (NFR06, NFR11, NFR12) |
| `KM-003-AC53` | *Given* `KM-004.md`, `KM-006.md`, `KM-010.md` và dữ liệu do KM-003 lưu *when* verifier đọc lại lúc đóng epic *then* mỗi thứ các epic đó cần (dạng lưu, bộ khoá để đăng ký, trạng thái chưa đồng bộ, `record` để backup) đều chỉ ra được mà không phải định nghĩa lại (FR04, intent §5 Làm tiếp được) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- Cất secret thật; mọi cơ chế chống mất dữ liệu khi xoá dữ liệu trình duyệt (intent §6).
- Import file v1 (Q8). Import và export backup v2 (KM-010).
- Xoá item, thùng rác, dọn thùng rác sau 30 ngày (KM-008). Lõi đã có sẵn thao tác nhưng KM-003 không gọi.
- Server, đăng ký, đăng nhập thiết bị mới, đăng xuất, đo độ mạnh mật khẩu, username, đồng bộ, gộp dữ liệu trong app, hiển thị xung đột, thanh trạng thái đồng bộ (KM-005, KM-006).
- Service Worker, cài đặt, mở offline như app đã cài (KM-004). "Offline" ở epic này nghĩa là máy ngắt mạng, còn file của app vẫn được phục vụ từ chính máy đó (Concern 4).
- Tự khoá khi chuyển nền, chỉnh thời gian tự khoá, màn cài đặt, gần đây/yêu thích ở màn chính mobile, điều hướng theo lịch sử trình duyệt, nút Back Android, vuốt từ mép, tab env ngang, lớp che khi chuyển nền, 3 lần chạm tới copy (KM-004).
- Chạy thật trên iPhone/Android; đọc QR trên trình duyệt không có bộ đọc sẵn (KM-004, Concern 6).
- Passkey (KM-007). Đổi mật khẩu, xoay khoá (KM-009). Tạo, đổi tên, đặt màu, chuyển vault (KM-008).
- Tag và yêu thích, kể cả tìm theo tag (KM-011). Item đã có sẵn tag do dữ liệu khác đưa vào thì không hiện và không tìm được ở epic này.
- Chọn chủ đề thủ công; đổi thời gian xoá clipboard.
- Giới hạn số lần thử mật khẩu ở máy cục bộ: kẻ có dữ liệu trên đĩa có thể thử ngoài app, nên không tăng độ an toàn.

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: F-AUTH-01 (username, đo độ mạnh) thuộc KM-006, trong khi 03 §3 có `userId`, `username` trong `meta.account` | Originator | **Đã chốt (originator, 2026-11-01): chỉ cần password.** Nhập 2 lần, cảnh báo < 12 ký tự, không username. KM-006 thêm username và đăng ký chính bộ khoá đang có, giữ dữ liệu (FR01, FR02, FR04). Engineer ghi vào 03 §3 rằng hai trường này trống trước KM-006, và thêm việc nâng cấp vào phạm vi `KM-006.md` |
| 2 | Intent §7 câu 2: 03 §2 và 09 ghi không chuẩn hoá Unicode; intent §1 của KM-003 không cho đổi cách mở khoá nếu không có lý do | Originator | **Đã chốt (originator, 2026-11-01): chuẩn hoá NFC.** Lý do: mật khẩu tiếng Việt có thể gõ ra NFC hoặc NFD tuỳ bàn phím và hệ điều hành, khác dạng là bị khoá ngoài; chưa có dữ liệu thật nên không phải chuyển đổi. Mật khẩu trong vector của KM-001 đã ở dạng NFC (đã kiểm), nên vector phải giữ nguyên; nếu lệch thì dừng và báo. Đây là một thay đổi có lý do được ghi ở lõi; engineer sửa 03 §2 và 09 (FR05, AC05, NFR11) |
| 3 | Intent §7 câu 3 và KM-001 Concern 6: "chạy được" tính trên trình duyệt nào | Originator | **Đã chốt (originator, 2026-11-01):** Chrome desktop đạt mọi AC; Safari và Firefox desktop kiểm test lõi và luồng chính, lỗi ghi lại, không chặn (NFR07, AC49). Máy dev nay là macOS nên kiểm được Safari desktop, khác lúc viết KM-001. **Hoãn phần iPhone/Android, owner: originator, lúc: KM-004**, gồm cả tốc độ mở khoá trên điện thoại (KM-001 Concern 4) |
| 4 | Intent §5 đòi "mở lại khi không có mạng", nhưng Service Worker (F-PWA-02) thuộc KM-004, nên không có gì phục vụ file của app nếu chúng nằm trên mạng | Product Owner | **Đã chốt (PO):** ở KM-003, file của app được phục vụ từ chính máy đó; "offline" là ngắt mạng còn chương trình phục vụ cục bộ vẫn chạy. Mở khoá vẫn không cần mạng thật (NFR04, AC06). Offline như app đã cài là việc của KM-004. Originator xem lại khi duyệt spec |
| 5 | Intent §7 câu 4: ranh giới giao diện hẹp với KM-004 | Originator | **Đã chốt (originator, 2026-11-01):** KM-003 làm dạng dùng được: xếp chồng dưới 900px, đủ chức năng, không cuộn ngang ở 360px, vùng chạm ≥ 44×44 px, có nút quay lại trong app (FR46, NFR09). Back Android, vuốt mép, tab env ngang, Gần đây, lớp che khi chuyển nền thuộc KM-004 |
| 6 | 03 §1 và prototype ghi dùng "thư viện giải mã QR dự phòng" cho Safari/Firefox, trái với `CLAUDE.md` và 04 ("không có thư viện bên thứ ba"). iPhone là nền tảng chính mà Safari không có bộ đọc QR sẵn | Originator | **Đã chốt phần KM-003 (originator, 2026-11-01):** không có thư viện dự phòng; nơi không có bộ đọc thì báo rõ và mời nhập tay (FR37, AC33). **Hoãn, owner: originator, lúc: KM-004:** quyết định cách đọc QR trên iPhone; engineer KM-003 thêm việc này vào `KM-004.md` và sửa dòng trong 03 §1 |
| 7 | 04 chỉ cho xoá khi clipboard vẫn là giá trị đã copy, nhưng trình duyệt có thể từ chối đọc clipboard | Originator | **Đã chốt (originator, 2026-11-01): vẫn xoá khi không đọc được,** ưu tiên không để secret nằm lại, chấp nhận có thể mất thứ khác vừa copy. Bị từ chối ghi vì mất focus thì thử lại khi có focus (FR40, AC36). Engineer sửa dòng Clipboard ở 04 |
| 8 | Intent §7 câu 5: F-VIEW-02 tìm theo tag, nhưng F-ITM-11 thuộc KM-011 | Originator | **Đã chốt (originator, 2026-11-01): dời sang KM-011** (FR44). Engineer ghi vào `KM-011.md`; `KM-003.md` phần F-VIEW-02 hiểu theo FR44 |
| 9 | 03 §1 có `reason: "restore"` nhưng 09 chỉ có `updateItem` ghi `reason: "edit"`, chưa có thao tác nào ghi `restore`. Lịch sử còn chứa `scopes`, trong khi khôi phục cả `scopes` sẽ làm item gán lại vào env đã fork đi, phá tiêu chí 5 | Product Owner | **Đã chốt (PO):** khôi phục giữ nguyên gán env, và bản đẩy vào lịch sử mang `reason: "restore"` (FR28, AC25). Build-plan chọn cách làm; nếu sửa lõi thì cập nhật 09 và ghi lý do. `merge` không phụ thuộc vào `reason` nên không ảnh hưởng KM-002. Originator xem lại khi duyệt spec |
| 10 | Intent không nói về nhiều tab. Hai tab cùng mở khoá thì mỗi tab giữ một bản vault trong bộ nhớ, tab lưu sau ghi đè tab lưu trước, âm thầm mất dữ liệu | Product Owner | **Đã chốt (PO):** chỉ một tab được mở khoá tại một thời điểm (FR13, AC11). Đây là cách đơn giản nhất để không mất dữ liệu âm thầm trước khi có gộp trong app. KM-006 có thể nới ra nếu cần. Originator xem lại khi duyệt spec |
| 11 | Prototype sinh mật khẩu *Dễ nhớ* từ 20 từ: 4 từ chỉ khoảng 17 bit, quá yếu cho một trình sinh mật khẩu; 07 không nêu con số nào | Product Owner | **Đã chốt (PO):** danh sách ≥ 2048 từ, mặc định 5 từ, tối thiểu 3 (FR32, AC28). **Hoãn, owner: engineer, lúc: build-plan:** chọn nguồn danh sách từ và ghi giấy phép. Đây là dữ liệu, không phải phụ thuộc mã; nếu nguồn đòi hỏi thêm gì trái quy ước thì quay lại hỏi originator. **Kết quả (implement):** EFF Large Wordlist, bỏ 4 từ có gạch nối, còn 7 772 từ, 5 từ ≈ 64,6 bit; CC BY 4.0, ghi công ở `wordlist.js` và `README.md` |
| 12 | Intent §7 câu 6 và KM-002 Concern 10: env sống dưới project đã xoá, item chỉ trỏ tới env đã xoá | Originator | **Hoãn, owner: originator, lúc: build-plan KM-003** (theo intent). Ở KM-003 chưa có gộp nên không tạo ra được env sống dưới project đã xoá qua giao diện; item chỉ trỏ tới env đã xoá đã có quy tắc ở 03 và FR43. Đề xuất từ KM-002: env có project đã xoá thì coi như đã xoá khi hiển thị. **Kết quả (originator chốt 2026-11-01, plan):** làm theo đề xuất; quy tắc ở `liveEnvs()`, 03 §1 và 09 |
| 13 | KM-003.md ghi "Chạy được dưới CSP", nhưng `_headers` và `Permissions-Policy` nằm ở phạm vi KM-004, và `wrangler` chỉ có từ KM-005 | Product Owner | **Đã chốt (PO):** KM-003 phải tự chạy dưới đúng chuỗi CSP ở 04 ngay từ đầu, không đợi KM-004 (NFR01, AC45). **Hoãn, owner: engineer, lúc: build-plan:** cách phục vụ cục bộ không dùng `wrangler`, không thêm phụ thuộc, và kiểm rằng camera và đọc QR từ ảnh chạy được dưới `img-src 'self' data:`, `default-src 'none'`. Nếu CSP cản thì quay lại đây, không tự nới. KM-004 vẫn lo `Permissions-Policy` và các header còn lại. **Kết quả (plan, implement):** `testkit/serve.mjs` chỉ dùng `node:http`, gắn đúng CSP; camera giả, đọc QR từ ảnh và tải file đều chạy với 0 vi phạm, không nới CSP |
| 14 | F-ITM-16 tải field `secret-multi` ra file đang ở dạng plaintext, trái nghĩa đen của 04 nguyên tắc 3 ("dữ liệu chỉ nằm trên đĩa ở dạng đã mã hoá") | Product Owner | **Đã chốt (PO):** chấp nhận vì do người dùng chủ động bấm tải và 07 yêu cầu rõ. App không tự ghi plaintext ra đĩa; AC46 chỉ xét dữ liệu do app giữ |
| 15 | Bảng "Epic nào dùng thao tác nào" ở 09 ghi KM-009 là thùng rác và KM-008 là đổi mật khẩu, ngược với `KM-008.md`, `KM-009.md` và intent §6. Spec này theo file epic | Engineer | **Đã sửa (implement KM-003):** 09 nay ghi KM-008 là thùng rác, KM-009 là đổi mật khẩu |
| 16 | Safari có thể xoá dữ liệu do trang lưu sau thời gian không dùng, nên dữ liệu thử có thể mất giữa chừng | Originator | **Hoãn, owner: originator, lúc: KM-004** (khi cài lên iPhone). Không ảnh hưởng KM-003 vì chỉ dùng dữ liệu thử và Safari không bắt buộc |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

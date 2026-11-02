# Spec — Đồng bộ đa thiết bị

**Epic ID:** `KM-006`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-006 nối app với server KM-005 để hai thiết bị cùng giữ một dữ liệu: đăng ký chính bộ khoá đang có, đăng nhập trên thiết bị mới, đăng xuất (có thể xoá dữ liệu trên máy), đồng bộ ưu tiên offline theo từng vault bằng phép gộp của KM-002, thanh trạng thái với nút "Đồng bộ ngay", và đánh dấu đúng field bị xung đột kèm "Đã xử lý". Spec phục vụ intent §1 ("tạo item trên laptop thì máy kia không thấy gì") và các điểm ở intent §5. Đạt nghĩa là **đạt trên giả lập và server cục bộ, không hơn**; deploy, Cloudflare thật, điện thoại thật và secret thật chuyển sang epic mới `KM-014` (intent §6). Kế thừa, không đổi: bộ khoá và dạng dữ liệu của KM-001, KM-003; quy tắc gộp của KM-002 (`docs/05-sync.md`, `docs/09-core-api.md`); hợp đồng và ngưỡng chống dò của KM-005 (`docs/06-api.md`). Những điểm spec này đổi so với tài liệu hoặc epic trước được ghi ở mục 8 (Concern 2, 4, 5, 8–12, 15, 16).

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md`: JavaScript thuần, không build, không phụ thuộc thứ ba ở runtime; phân lớp `ui/` → `app.js` → `store`/`sync` → `core/`; `core/` thuần và là hợp đồng ở 09; test chỉ dùng `node:test`; CSP chỉ `'self'`, không `innerHTML` với dữ liệu người dùng; không ghi password, khoá, secret, plaintext ra `console`, lỗi hay URL; Service Worker không cache `/api/*` |
| `.aidlc/workspace.yaml`, `state.json`, `inputs.json` | `artifact_language: vi`; `strict_mode: true`; chưa có feedback hay lần từ chối; `from_epic: KM-005`, `also_from: KM-002, KM-003`. Không có project skill nào ràng buộc thêm |
| `docs/epics/KM-006/artifacts/intent.md`, `KM-006.md` | Phạm vi, "Not this", 7 câu hỏi mở, các việc KM-003 và KM-005 chuyển sang |
| `docs/epics/KM-005` (`intent`, `spec`, `review`) | Hành vi server không đổi; Concern 4, 5, 10, 11, 12, 16, 18 và `review.md` finding 1 cần chia lại giữa KM-006 và `KM-014` |
| `docs/epics/KM-002` (`intent`, `spec`) | Quy tắc gộp; `invalid` nghĩa là không gộp; Concern 11 (`meta`), Concern 12 (tốc độ trên điện thoại) |
| `docs/epics/KM-003` (`intent`, `spec`) | Concern 1, AC53: đăng ký chính bộ khoá đang có; FR13: một tab mở khoá; FR47, AC44 đang cấm đúng các nút epic này thêm (Concern 10) |
| `docs/epics/KM-007/artifacts/spec.md` Concern 13 | Xoá dữ liệu phải xoá cả bản ghi passkey; bản ghi đó không đồng bộ; đổi tài khoản phải tắt passkey |
| `docs/epics/KM-008/artifacts/intent.md`, `KM-009/artifacts/intent.md` | Hai epic nhận việc từ đây; KM-009 đang ghi cần bản deploy của KM-006 (Concern 8) |
| `docs/05-sync.md` | Trạng thái `current`/`base`/`dirty`, giao thức, thời điểm đồng bộ, backoff 2 s, 5 s, 15 s, 60 s, thuật toán gộp |
| `docs/06-api.md` | Hợp đồng server, quy tắc username, cách xử lý 401 |
| `docs/03-data-model.md` §3 | Những gì được lưu trên máy; "Giá trị trước KM-006"; không có plaintext hay khoá chưa bọc trên đĩa |
| `docs/04-security.md` | Zero-knowledge; master password mạnh là ≥ 4 từ ngẫu nhiên hoặc ≥ 14 ký tự; tự khoá; điều kiện trước khi đưa secret thật lên server |
| `docs/07-features.md` | F-AUTH-01, F-AUTH-02, F-AUTH-08, F-SYNC-01, F-SYNC-02, F-ITM-13; bảng "Thông báo và trạng thái"; tiêu chí 1–3 |
| `docs/08-roadmap.md` | Định nghĩa M3; cách ghi "đạt trên giả lập" đã dùng cho M2 |
| `docs/09-core-api.md` | `merge`, `validateVault`, giới hạn `iter`; đổi hợp đồng thì sửa 09 trong cùng thay đổi |
| `src/public/js` (`session`, `store`, `app`, `vault-ops`, `model`, `ui/gate`, `ui/shell`, `ui/detail`), `src/public/sw.js`, `test/e2e` (đã đọc, 2026-11-02) | App chỉ mở một vault; `meta.session` chưa dùng; chưa có thao tác bỏ đánh dấu xung đột; `sweep.e2e.js` cấm từ "đăng nhập", "đồng bộ"; lưu bản nháp gửi đủ mọi giá trị (Concern 13) |
| Trả lời của originator (2026-11-02, phiên `/spec`) | Quyết định ở Concern 2, 7, 8 |

## 3. User scenarios

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

Dữ liệu thử, server cục bộ. "Máy A" là trình duyệt laptop, "máy B" lần lượt là giả lập Android rồi giả lập iOS.

1. **Đăng ký tài khoản đang có.** *Given* máy A có tài khoản cục bộ đang chứa dữ liệu và đã mở khoá, *when* người dùng chọn đăng ký, nhập username, token đăng ký và master password hiện tại, *then* đăng ký thành công; dữ liệu giữ nguyên; khoá lại rồi mở bằng mật khẩu cũ vẫn thấy đủ; thanh trạng thái chuyển sang "Đã đồng bộ"; đúng dữ liệu đó đã có trên server.
2. **Đăng nhập trên thiết bị mới.** *Given* máy B trống, *when* người dùng chọn đăng nhập, nhập username và master password, *then* app tải về đủ dữ liệu và mở ra; sau đó tắt mạng, khoá lại, mở bằng mật khẩu vẫn xem và sửa được.
3. **Tiêu chí 1.** *Given* hai máy đang mở khoá, ở foreground, có mạng, *when* máy A tạo item "Partner X" gán vào `PaymentGW/uat` và `PaymentGW/staging`, *then* trong ≤ 60 giây máy B hiện item ở cả hai env, không cần thao tác gì.
4. **Tiêu chí 2.** *Given* máy B offline, *when* đổi mật khẩu của item rồi bật mạng lại, *then* thanh trạng thái của B đi từ "Offline – 1 thay đổi chờ" tới "Đã đồng bộ" mà không cần thao tác; máy A nhận mật khẩu mới, lịch sử có bản cũ.
5. **Tiêu chí 3.** *Given* hai máy offline, *when* cả hai sửa field Password của cùng item rồi cùng online, *then* item còn một bản giống nhau ở hai máy, có badge ⚠, field Password được đánh dấu, lịch sử chứa bản thua. Sửa hai field khác nhau thì giữ cả hai, không có badge. Gán thêm hai env khác nhau thì item nằm ở cả bốn env.
6. **Đã xử lý.** *Given* item đang có đánh dấu ở cả hai máy, *when* bấm "Đã xử lý" ở một máy, *then* sau khi đồng bộ, đánh dấu mất ở cả hai máy; nội dung và lịch sử không đổi.
7. **Đăng xuất.** *Given* máy B đã đăng nhập, mọi thay đổi đã đẩy lên, *when* đăng xuất không xoá, *then* app khoá, dữ liệu còn trên máy, mở khoá offline được, không còn đồng bộ tới khi đăng nhập lại. *When* đăng xuất có xoá, *then* máy B về màn thiết bị trống, soi dữ liệu app để lại không đọc được gì của tài khoản. Máy A không bị ảnh hưởng ở cả hai trường hợp.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

| Tình huống | Kết quả mong đợi |
|---|---|
| Tài khoản chưa từng đăng ký | Dùng như M1, M2; không có lời gọi mạng nào tới server; thanh trạng thái ghi "Chỉ trên máy này" |
| Đăng ký hoặc đăng nhập khi mất mạng, server tắt | Báo không kết nối được; không có gì trên máy thay đổi; thử lại được |
| Nhập sai master password ở form đăng ký | Báo sai ngay trên máy, không gửi gì lên server |
| Token đăng ký sai hoặc server đã đóng đăng ký | Báo đăng ký đang đóng; tài khoản cục bộ vẫn chưa đăng ký, vẫn dùng được |
| Username đã có, hoặc đăng ký xong nhưng mất kết nối trước khi nhận phản hồi rồi gửi lại | Báo tên đã có và mời đăng nhập bằng tên đó. Cùng bộ khoá thì được nhận là chính tài khoản này, không mất gì (Concern 3b) |
| Sai username hoặc mật khẩu lúc đăng nhập | Một câu báo chung, không phân biệt |
| Bị khoá đăng nhập do thử sai nhiều | Báo còn bao nhiêu phút, dữ liệu trên máy vẫn dùng được |
| Tham số KDF từ server ngoài khoảng cho phép | Từ chối, không dẫn xuất khoá, báo không tương thích |
| Mất kết nối giữa lúc tải dữ liệu trên thiết bị trống | Máy vẫn được coi là trống, đăng nhập lại từ đầu được; không có tài khoản dở dang |
| Đăng nhập tài khoản B trên máy đang có tài khoản A | Chặn cho tới khi chọn. Huỷ là mặc định, A nguyên vẹn (Concern 2) |
| Đăng xuất có xoá khi còn thay đổi chưa đẩy lên, có hoặc không có mạng | Có mạng thì thử đẩy trước. Vẫn còn thì nêu số thay đổi sẽ mất, cho chọn: huỷ, đăng xuất giữ dữ liệu, hoặc xoá sau khi gõ xác nhận (Concern 3) |
| Đăng xuất khi offline | Được, xoá phiên trên máy; báo rõ phiên trên server chưa huỷ và tự hết sau 30 ngày không dùng |
| Phiên hết hạn (`401`) đang lúc dùng | Không đẩy người dùng ra khỏi app: đọc, sửa vẫn chạy, chấm đỏ "Cần đăng nhập lại"; đăng nhập lại thì đẩy nốt thay đổi (Concern 11) |
| Server tắt, hoặc lỗi `5xx` | Đọc, sửa vẫn chạy; thử lại theo backoff; có lại thì tự đồng bộ, không mất thay đổi |
| Lưu thêm trong lúc đang đẩy lên | Thay đổi mới vẫn ở trạng thái chờ, được đẩy ở lượt sau |
| Đóng app hoặc app bị giết giữa lượt đồng bộ | Lần mở sau đồng bộ tiếp, không mất, không nhân đôi, không sinh xung đột giả |
| Đang sửa dở một item thì nhận thay đổi của item đó | Bản nháp không mất; lưu bản nháp chỉ ghi những gì người dùng đã sửa (Concern 13) |
| Lưu rồi khoá app ngay, hoặc khoá trong lúc chờ | Thay đổi nằm an toàn trên máy, đẩy lên sau lần mở khoá kế tiếp |
| Bản từ server không giải mã được hoặc không hợp lệ | Không ghi đè, không gộp; báo lỗi riêng vault đó; các vault khác vẫn chạy |
| Vault không còn trên server (`404`, hoặc không có trong danh sách) | Không xoá gì trên máy; báo lỗi riêng vault đó (Concern 17) |
| Vault vượt giới hạn dung lượng (`413`) | Giữ thay đổi; báo lỗi rõ; không lặp lại cho tới khi vault đổi |
| Có tab khác của app đang mở lúc xoá dữ liệu | Xoá vẫn xong; tab kia không ghi lại dữ liệu cũ (Concern 16) |
| Item có đánh dấu ở field đã bị xoá, hoặc đánh dấu `deletedAt`, `purgedAt` | Vẫn có badge, ghi bằng chữ phần bị xung đột vì không có dòng field nào để tô |

## 4. Functional requirements

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-006-FR01` | Màn thiết bị trống có hai lối: tạo tài khoản cục bộ (chỉ cần master password, không cần mạng, như M1) và đăng nhập | Must | §5 Thiết bị mới, Vẫn dùng được; Concern 9 |
| `KM-006-FR02` | Form tạo tài khoản và form đăng ký có thanh đo độ mạnh mật khẩu, tính trên máy, ba mức theo số ký tự sau chuẩn hoá NFC: **Yếu** (< 12 ký tự, hoặc < 6 ký tự khác nhau), **Khá** (12–13), **Mạnh** (≥ 14). Không chặn việc tiếp tục. Ở form đăng ký, mức Yếu có thêm cảnh báo rằng mật khẩu sẽ bảo vệ dữ liệu trên server và chưa đổi được cho tới KM-009 | Must | `KM-006.md` F-AUTH-01; 04; Concern 18 |
| `KM-006-FR03` | Tài khoản cục bộ chưa đăng ký, đang mở khoá, có lối đăng ký: nhập username, token đăng ký, master password hiện tại. Username được kiểm theo quy tắc ở 06 trước khi gửi. Mật khẩu được kiểm với tài khoản cục bộ trước khi gửi; sai thì không có request nào | Must | §5 Giữ dữ liệu đang có; KM-005 Concern 10 |
| `KM-006-FR04` | Đăng ký gửi đúng bộ khoá và vault đang có, không tạo khoá mới, không mã hoá lại. Thành công thì tài khoản có `username`, `userId`, phiên làm việc; vault ở version 1, trạng thái máy khớp với bản đã gửi; thay đổi lưu trong lúc đăng ký vẫn ở trạng thái chờ. Mật khẩu cũ vẫn mở được. Token đăng ký không được lưu ở bất kỳ đâu trên máy | Must | §5 Giữ dữ liệu đang có; KM-003 Concern 1 |
| `KM-006-FR05` | Mọi lỗi đăng ký (mất kết nối, `403`, `409`, `5xx`) đều có thông báo riêng, không đổi gì trên máy; tài khoản vẫn dùng được như chưa đăng ký. Lỗi `username_taken` kèm lối chuyển sang đăng nhập bằng tên đó | Must | §5 Không mất âm thầm; KM-005 §3.2 |
| `KM-006-FR06` | Đăng nhập dùng username và master password, dẫn xuất khoá từ tham số KDF của server. Từ chối tham số ngoài khoảng ở 09 trước khi dẫn xuất. `401` hiện một câu chung; `429` hiện thời gian còn lại lấy từ server, làm tròn lên theo phút | Must | §5 Thiết bị mới; F-AUTH-02 |
| `KM-006-FR07` | Đăng nhập trên thiết bị trống: tải mọi vault của tài khoản, ghi xuống máy một lần trọn vẹn, rồi mới vào app. Mọi lần gián đoạn trước đó để máy vẫn trống. Vault có trạng thái đã đồng bộ, không có thay đổi chờ. Thiết bị nhận `deviceId` mới. Mở khoá về sau không cần server | Must | §5 Thiết bị mới |
| `KM-006-FR08` | Đăng nhập là **cùng tài khoản** khi `userId` trùng, hoặc khi tài khoản cục bộ chưa đăng ký và `wrappedAccountKey` trùng từng byte. Khi đó không có gì trên máy bị thay thế: tài khoản nhận phiên mới (và `username`, `userId` nếu còn trống), thay đổi đang chờ được gộp và đẩy lên | Must | §5 Không mất âm thầm; 06 "Khi nhận 401" |
| `KM-006-FR09` | Đăng nhập **khác tài khoản**: chỉ sau khi server xác nhận đúng mới hỏi. App nêu tài khoản đang có (username, hoặc "chưa đăng ký") và cái sẽ mất, rồi cho chọn **Huỷ** (mặc định: huỷ phiên vừa tạo, trên máy không đổi gì) hoặc **Thay thế** (xoá theo FR13, rồi làm như FR07). Tài khoản cũ chưa đăng ký hoặc có thay đổi chờ thì phải gõ từ xác nhận mới thay thế được. Có lối đăng nhập tài khoản khác ở màn khoá, nên quên mật khẩu tài khoản cũ vẫn làm được | Must | §5 Không mất âm thầm; §7 câu 2; Concern 2 |
| `KM-006-FR10` | Chỉ tài khoản đã đăng ký và đang mở khoá mới có nút đăng xuất. Hỏi rõ hai lựa chọn: giữ dữ liệu, hoặc xoá dữ liệu trên máy này | Must | §5 Đăng xuất; F-AUTH-08 |
| `KM-006-FR11` | Đăng xuất giữ dữ liệu: huỷ phiên trên server nếu kết nối được, luôn xoá phiên trên máy, khoá app. Dữ liệu và thay đổi chờ còn nguyên, mở khoá offline được, sửa được, chưa đồng bộ cho tới khi đăng nhập lại cùng tài khoản. Không kết nối được thì báo phiên trên server chưa huỷ và tự hết sau 30 ngày | Must | §5 Đăng xuất; §7 câu 3; Concern 3 |
| `KM-006-FR12` | Đăng xuất có xoá khi còn thay đổi chờ: có mạng thì đồng bộ trước. Đồng bộ xong hết thì xoá như thường. Còn thay đổi chờ (kể cả do offline) thì nêu N thay đổi sẽ mất vĩnh viễn và cho chọn: huỷ (mặc định), đăng xuất giữ dữ liệu, hoặc gõ từ xác nhận rồi xoá | Must | §5 Không mất âm thầm; §7 câu 3; Concern 3 |
| `KM-006-FR13` | Xoá dữ liệu trên máy gỡ toàn bộ: tài khoản, phiên, passkey, cài đặt, danh sách gần đây, bản sao file, mọi vault, kèm khoá và plaintext trong bộ nhớ; thử xoá clipboard. Trọn vẹn hoặc không có gì. Xong thì về màn thiết bị trống. Credential passkey trong hệ điều hành web không xoá được, nên báo cho người dùng khi có bản ghi passkey. App shell đã cache vẫn còn vì không chứa dữ liệu tài khoản | Must | §5 Đăng xuất; §7 câu 6; Concern 6 |
| `KM-006-FR14` | Bản ghi passkey không bao giờ được gửi lên server. Đăng nhập cùng tài khoản và đăng xuất giữ dữ liệu không đụng tới passkey. Thay thế bằng tài khoản khác thì passkey bị xoá theo FR13 | Must | §7 câu 6; KM-007 Concern 13 |
| `KM-006-FR15` | Tài khoản chưa đăng ký hoặc đã đăng xuất không gọi API đồng bộ nào. Khi app đang khoá cũng không đồng bộ. Hoạt động đồng bộ không tính là thao tác của người dùng, nên không làm chậm tự khoá | Must | §5 Vẫn dùng được; 04; Concern 4 |
| `KM-006-FR16` | Đồng bộ chạy khi: mở khoá xong; 1,5 giây sau lần lưu cuối; app về foreground; có mạng lại; mỗi 50 giây khi đang mở ở foreground; bấm "Đồng bộ ngay". Mỗi lượt lấy danh sách vault, kéo vault có version mới, đẩy vault có thay đổi chờ. Tại một thời điểm chỉ có một lượt cho mỗi vault | Must | §5 Tiêu chí 1; 05; §7 câu 4; Concern 4 |
| `KM-006-FR17` | Mỗi vault đồng bộ độc lập: lỗi hay xung đột ở một vault không chặn, không làm chậm quá một backoff các vault khác | Must | §5 Nhìn thấy trạng thái; F-SYNC-01 |
| `KM-006-FR18` | Đẩy lên kèm version đang dựa vào. Thành công thì bản chung và version cập nhật theo đúng bản đã gửi. Thay đổi chờ chỉ được xoá khi trên máy không có lần lưu nào mới hơn bản đã gửi | Must | §5 Vẫn dùng được; 05; Concern 12 |
| `KM-006-FR19` | Bị báo version đã đổi: giải mã bản của server, gộp ba chiều với bản chung và bản trên máy, ghi xuống máy, đẩy bản gộp với version mới. Tối đa 5 lần liên tiếp mỗi lượt, sau đó chờ theo backoff | Must | Tiêu chí 3; 05 |
| `KM-006-FR20` | Kéo về: không có thay đổi chờ thì bản trên máy và bản chung đều thành bản server; có thay đổi chờ thì gộp, bản chung thành bản server, giữ trạng thái chờ | Must | Tiêu chí 1, 2, 3; 05 |
| `KM-006-FR21` | Kết quả đồng bộ đi qua cùng hàng đợi với các lần lưu, không chồng lên nhau, và được ghi trọn vẹn cùng version và bản chung. Sau khi ghi, màn hình cập nhật ngay; item đang xem vẫn đang xem, trừ khi nó không còn hiện được | Must | §5 Vẫn dùng được; Tiêu chí 1 |
| `KM-006-FR22` | Bản nháp đang sửa không bị đồng bộ thay đổi. Khi lưu, chỉ những giá trị người dùng đã đổi so với lúc mở bản nháp mới được ghi, trên nền bản mới nhất; giá trị vừa nhận từ máy khác mà người dùng không đụng tới vẫn còn. Người dùng đổi đúng giá trị đó thì giá trị của họ thắng và giá trị trước đó vào lịch sử. Item không còn sửa được thì giữ bản nháp trên màn và báo | Must | §5 Không mất âm thầm; 05; Concern 13 |
| `KM-006-FR23` | Bản từ server không giải mã được, hoặc phép gộp báo `invalid`: không ghi đè, không gộp, không đẩy gì lên cho vault đó; dữ liệu trên máy và bản chung giữ nguyên; báo lỗi riêng vault đó; thử lại ở lượt có version khác | Must | §5 Không mất âm thầm; 09 |
| `KM-006-FR24` | Mất kết nối hoặc `5xx`: thử lại sau 2 s, 5 s, 15 s, 60 s rồi mỗi 60 s. Về foreground, có mạng lại hoặc bấm "Đồng bộ ngay" thì thử ngay và đặt lại backoff. Mất kết nối thì hiện Offline, `5xx` thì hiện lỗi | Must | §5 Vẫn dùng được; 05 |
| `KM-006-FR25` | `401`: dừng mọi lời gọi cần phiên, giữ nguyên dữ liệu và thay đổi chờ, hiện "Cần đăng nhập lại"; đăng nhập lại chỉ cần mật khẩu, username điền sẵn. `403`, `400`, `404`, `413`: hiện lỗi đúng nguyên nhân, không lặp với cùng dữ liệu nhanh hơn 60 s, không mất gì | Must | §5 Vẫn dùng được; 06; Concern 11 |
| `KM-006-FR26` | Gián đoạn ở bất kỳ điểm nào của một lượt (đã đẩy lên nhưng chưa kịp ghi xuống máy, đóng app, mất điện) thì lượt sau hội tụ về đúng dữ liệu, không mất thay đổi, không sinh đánh dấu xung đột mới | Must | §5 Vẫn dùng được |
| `KM-006-FR27` | Danh sách có vault chưa có trên máy thì tải về như FR07. Vault trên máy không có trong danh sách thì không xoá, báo lỗi riêng vault đó. Thay đổi `meta` từ máy khác không được nhận ở epic này | Must | §6; §7 câu 5; 05; Concern 5, 17 |
| `KM-006-FR28` | Vault đang hiện không đổi khi có thêm vault: trên thiết bị đang dùng giữ nguyên vault đã mở; thiết bị mới mở vault có `createdAt` nhỏ nhất, hoà thì theo id. Vault khác vẫn đồng bộ dù không hiện. Vault hỏng không phải vault đang hiện thì không chặn mở khoá | Must | §6; Concern 15 |
| `KM-006-FR29` | Khi không có gì đổi, một lần hỏi định kỳ không tải blob nào: client tự giữ `ETag` và gửi lại (KM-005 Concern 16) | Must | 05; `KM-006.md` |
| `KM-006-FR30` | Vault từ 1 000 000 byte trở lên hiện cảnh báo không chặn ở thanh trạng thái, nêu giới hạn 2 000 000 byte | Should | 03; KM-005 Concern 11 |
| `KM-006-FR31` | Thanh trạng thái luôn thấy khi app mở: thanh dưới ở desktop, chấm ở đầu trang ở mobile (07). Trạng thái chung theo thứ tự ưu tiên: Lỗi hoặc cần đăng nhập lại (đỏ) > Đang đồng bộ… > Offline – N thay đổi chờ (xám) > N thay đổi chờ (vàng) > Đã đồng bộ · thời điểm tương đối (xanh). Tài khoản chưa đăng ký hoặc đã đăng xuất có trạng thái riêng, "Chỉ trên máy này" hoặc "Đã đăng xuất" (xám) | Must | §5 Nhìn thấy trạng thái; F-SYNC-02; 05; 07 |
| `KM-006-FR32` | N là số item, project, env có nội dung khác bản chung, tính trên mọi vault. Sửa một item hai lần thì N vẫn là 1 | Must | §5 Nhìn thấy trạng thái; 07; Concern 14 |
| `KM-006-FR33` | Chạm vào trạng thái mở chi tiết: từng vault với tên, trạng thái, thời điểm thành công gần nhất, nguyên nhân lỗi nếu có, cùng nút "Đồng bộ ngay" và lối đăng ký, đăng nhập lại hoặc đăng xuất tương ứng. Chi tiết không chứa dữ liệu item | Must | §5 Nhìn thấy trạng thái; F-SYNC-02 |
| `KM-006-FR34` | "Đồng bộ ngay" chạy một lượt cho mọi vault trong vòng 1 giây, bỏ qua backoff. Đang có lượt chạy thì không tạo lượt thứ hai. Không có mạng thì báo ngay | Must | §5 Nhìn thấy trạng thái; F-SYNC-02 |
| `KM-006-FR35` | Item có `conflict` có badge ⚠ trong danh sách và màn chi tiết. Có số item xung đột: ở trang chủ trên mobile, ở cột điều hướng trên desktop. Project, env không có badge (05) | Must | §5 Thấy đúng chỗ xung đột; F-ITM-13; 07 |
| `KM-006-FR36` | Màn chi tiết tô sáng đúng các field và thuộc tính trong `conflict`, và chỉ các phần đó, kèm dấu hiệu không dựa vào màu. Phần không có dòng hiển thị (field đã xoá, `deletedAt`, `purgedAt`, thuộc tính không có trên màn) được ghi bằng chữ. Giá trị secret vẫn che như thường | Must | §5 Thấy đúng chỗ xung đột; F-ITM-13 |
| `KM-006-FR37` | "Đã xử lý" bỏ đánh dấu của item, không đổi nội dung, không thêm bản lịch sử, được lưu và đồng bộ như một thay đổi; theo quy tắc gộp ở 05, đánh dấu mất ở cả hai máy, trừ xung đột mới phát sinh. Sửa item không tự bỏ đánh dấu | Must | §5 Thấy đúng chỗ xung đột; 05; Concern 16b |
| `KM-006-FR38` | Bản thua tìm được trong lịch sử của item, có nhãn "Xung đột"; bản có `note` `deleted-elsewhere` ghi "đã bị xoá ở thiết bị khác". Màn chi tiết của item có badge dẫn tới lịch sử | Must | §5 Thấy đúng chỗ xung đột; 05 |
| `KM-006-FR39` | Không sửa hành vi server, không đổi quy tắc gộp. Cần sửa thì dừng và báo originator, trừ thao tác bỏ đánh dấu ở FR37 (ghi vào 09) | Must | §1 "Kế thừa, không đổi" |
| `KM-006-FR40` | Có bộ test chạy bằng lệnh, dùng hai bộ dữ liệu trình duyệt riêng biệt trên server cục bộ thật, đi qua mọi tình huống ở mục 3. `npm test` vẫn chạy được khi chưa cài gì | Must | §5; `CLAUDE.md` |
| `KM-006-FR41` | Originator kiểm tay trên từng cặp (laptop + giả lập Android, laptop + giả lập iOS) theo danh sách ở `AC51`, kết quả từng mục theo từng cặp được ghi vào `implement.md`. Mục không làm được quay lại originator, không tự coi là đạt hay tự bỏ | Must | §5 đoạn đầu |
| `KM-006-FR42` | Sửa `KM-006.md`: phạm vi và "Xong khi" mới (giả lập, server cục bộ, không deploy), giữ lại phần client của `ETag` và username, ghi việc chuyển giao của KM-007 Concern 13, chuyển mọi việc Cloudflare sang `KM-014` | Must | §5 Tài liệu khớp |
| `KM-006-FR43` | Tạo brief `KM-014` (chỉ ghi việc, chưa code, **chưa xếp mốc**, Concern 7) nhận đủ danh sách ở intent §6: header thật; phần còn lại của AC25 và request không có IP; binding và `database_id`; đặt `ALLOWED_ORIGINS`, `REGISTRATION_TOKEN`, `SERVER_SECRET`; tài khoản và đo gói Free, gồm ước lượng ghi mới ở Concern 4; lỗi giới hạn dòng D1; câu lỗi trùng khoá; `ETag` dạng yếu; kiểm trên điện thoại thật; tốc độ gộp trên máy thật; câu hỏi dung lượng của KM-009 (Concern 8). Ghi rõ phải xong trước khi đưa secret thật lên server | Must | §5 Tài liệu khớp; §6 |
| `KM-006-FR44` | Sửa tài liệu: 08 ghi M3 "đạt trên giả lập và server cục bộ" cùng điều kiện còn lại; 04 thêm `KM-014` vào điều kiện về secret thật, ghi giới hạn đăng xuất offline; 05, 06 đổi nhịp 50 giây; 06 đổi cách xử lý `401`; 05 ghi quy tắc thay đổi chờ khi đang đẩy và bản nháp; 07 đổi F-AUTH-01 và thêm trạng thái mới; 09 thêm thao tác bỏ đánh dấu; 03 ghi xoá dữ liệu và đổi tài khoản | Must | §5 Tài liệu khớp; `CLAUDE.md` |
| `KM-006-FR45` | Sửa `KM-008.md` nhận gộp `meta`, nhận `meta` từ máy khác và xử lý vault bị xoá; sửa `KM-009.md` ghi kiểm trên server cục bộ (Concern 8); ghi vào KM-003 rằng FR47, AC44 đã đổi theo epic này, và sửa danh sách từ cấm ở test cho khớp, phần còn lại của danh sách giữ nguyên | Must | §1; §7 câu 5; Concern 5, 8, 10 |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-006-NFR01` | Server không đọc được gì | Dò toàn bộ dữ liệu server cục bộ sau chuỗi ở mục 3.1, dạng gốc, base64, hex: 0 lần trùng với master password, plaintext vault (chuỗi đánh dấu trong item và tên vault), `encKey`, `accountKey`, `vaultKey`, `authKey` dạng gốc, token phiên dạng gốc, token đăng ký |
| `KM-006-NFR02` | Không lộ trên máy | Dò bộ nhớ trình duyệt sau chuỗi trên: 0 lần trùng với master password, plaintext, khoá chưa bọc, `authKey`, token đăng ký. Token phiên chỉ nằm ở chỗ 03 quy định |
| `KM-006-NFR03` | Không lộ qua log, URL, lỗi | Đầu ra `console` của client và server, mọi URL đã gọi, mọi thông báo lỗi trong bộ test: 0 lần trùng với các giá trị ở NFR01, NFR02 và token phiên |
| `KM-006-NFR04` | Xoá thật | Sau xoá dữ liệu: quét IndexedDB, Cache Storage, `localStorage`, `sessionStorage`: 0 lần trùng với username, `userId`, token, khối mã hoá, `deviceId`, id vault của tài khoản |
| `KM-006-NFR05` | Độ trễ tiêu chí 1 | Máy nhận đang mở khoá, foreground, có mạng: từ lúc máy gửi lưu tới lúc máy nhận hiện ≤ 60 s, kể cả trường hợp xấu nhất là lưu ngay sau lần hỏi của máy nhận. Máy nhận vừa về foreground hoặc vừa mở khoá: ≤ 10 s |
| `KM-006-NFR06` | Hội tụ | Sau khi hai máy online: ≤ 2 lượt đẩy cho một xung đột; dữ liệu giống nhau theo nội dung ở hai máy. Hai máy không thay đổi gì trong 10 phút: 0 lần ghi vault, version không đổi |
| `KM-006-NFR07` | Không mất dữ liệu | 100 lần lưu xen kẽ với mất kết nối, đóng app và ghi đồng thời trên hai máy: mọi giá trị đã lưu đều còn, ở vault hoặc trong lịch sử, trừ khi đã bị cắt theo `HISTORY_MAX` |
| `KM-006-NFR08` | Hồi phục | Có mạng hoặc server trở lại: tự đồng bộ ≤ 65 s nếu không có sự kiện nào; ≤ 5 s sau sự kiện `online` hoặc về foreground |
| `KM-006-NFR09` | Mượt khi đồng bộ | Vault 200 KB trên máy dev: một lượt có gộp ≤ 2 s, không có tác vụ nào chặn giao diện quá 300 ms. Thiết bị trống đăng nhập tới lúc hiện dữ liệu ≤ 10 s. Trên giả lập chỉ đo và ghi số vào `implement.md`, không chấm ngưỡng. Các ngưỡng này chưa có số đo cơ sở |
| `KM-006-NFR10` | Tải server | Một thiết bị, không có gì đổi: đúng 1 request mỗi 50 s ± 5 s ở foreground, 0 request khi khoá, 0 request lúc bị `401` |
| `KM-006-NFR11` | Accessibility | Thanh trạng thái thông báo qua vùng `status`; mọi trạng thái, badge và tô sáng có chữ hoặc ký hiệu, không chỉ dựa vào màu; có tên cho trình đọc màn hình; dùng được bằng bàn phím; vùng chạm ≥ 44×44 px |
| `KM-006-NFR12` | Tương thích | Chrome desktop; Chrome trên giả lập Android; Safari trên giả lập iOS; cả tab lẫn app đã cài trên giả lập. Không làm vỡ giới hạn 3 lần chạm tới copy ở 07 |
| `KM-006-NFR13` | Không ảnh hưởng phần đã có | `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run test:server`, `npm run vectors` đều xanh; test KM-004 "không có server" vẫn đúng; `dependencies` rỗng; không thêm devDependency; không đổi CSP, không sinh lại vector |
| `KM-006-NFR14` | Không có cửa sau cho test | Mã chạy thật không có cờ hay nhánh chỉ dành cho test. Test đổi thời gian, mạng hay trạng thái qua trình duyệt, kho cục bộ hoặc đồng hồ được truyền vào |
| `KM-006-NFR15` | Chỉ dữ liệu thử | Mọi lần kiểm, kể cả kiểm tay, chỉ dùng dữ liệu thử; không ghi giá trị thật vào `implement.md`, ảnh hay log |

## 6. Acceptance criteria

| Id | Given / When / Then |
|---|---|
| `KM-006-AC01` | *Given* thiết bị trống, mất mạng *when* tạo tài khoản cục bộ, tạo item, khoá, mở lại *then* mọi bước chạy; 0 request tới API (FR01, FR15) |
| `KM-006-AC02` | *Given* mật khẩu `abc`, 12 ký tự, 14 ký tự, và 14 ký tự chỉ gồm 2 ký tự khác nhau *when* nhập ở form tạo tài khoản và đăng ký *then* lần lượt Yếu, Khá, Mạnh, Yếu; không mức nào chặn tiếp tục; mức Yếu ở form đăng ký có cảnh báo (FR02) |
| `KM-006-AC03` | *Given* tài khoản lập theo dạng KM-003 có item, chưa đăng ký *when* đăng ký đúng *then* id vault, `wrappedAccountKey`, `wrappedVaultKey`, `meta` và blob trên server trùng từng byte với trên máy; server ở version 1; khoá rồi mở bằng mật khẩu cũ thấy đủ; đọc lại trên máy khác giống hệt (FR04) |
| `KM-006-AC04` | *Given* form đăng ký *when* username sai quy tắc (rỗng, 65 ký tự, ký tự lạ), hoặc mật khẩu sai *then* báo lỗi, 0 request (FR03) |
| `KM-006-AC05` | *Given* lần lượt mất kết nối, token sai, username đã có, id vault đã có, `500` *when* đăng ký *then* mỗi lỗi một thông báo riêng; dữ liệu trên máy và trạng thái chưa đăng ký không đổi; 0 chỗ lưu token đăng ký; lỗi username đã có kèm lối đăng nhập (FR05) |
| `KM-006-AC06` | *Given* server đã tạo tài khoản nhưng phản hồi bị cắt, máy vẫn chưa đăng ký và có thêm một thay đổi *when* đăng nhập bằng tên đó *then* được nhận là cùng tài khoản; không có câu hỏi thay thế; thay đổi được đẩy lên; không có đánh dấu xung đột trên phần không đổi (FR05, FR08, FR26) |
| `KM-006-AC07` | *Given* thiết bị trống, tài khoản có dữ liệu *when* đăng nhập đúng, rồi tắt mạng, khoá, mở bằng mật khẩu *then* thấy đủ dữ liệu cả trước và sau khi tắt mạng; `deviceId` khác máy kia (FR07) |
| `KM-006-AC08` | *Given* thiết bị trống *when* mất kết nối lúc tải blob và lúc ghi xuống máy *then* lần mở sau vẫn là màn thiết bị trống, đăng nhập lại thành công (FR07) |
| `KM-006-AC09` | *Given* đăng nhập sai username, sai mật khẩu, và bị `429` *when* hiển thị *then* hai trường hợp đầu cùng một câu; trường hợp ba có số phút khớp `Retry-After`; dữ liệu trên máy không đổi (FR06) |
| `KM-006-AC10` | *Given* server giả trả `iter` 599 999 và 6 000 001 *when* đăng nhập *then* từ chối, không gửi khoá xác thực nào (FR06) |
| `KM-006-AC11` | *Given* máy có tài khoản A chưa đăng ký hoặc có thay đổi chờ *when* đăng nhập đúng tài khoản B rồi chọn Huỷ *then* dữ liệu, khoá của A không đổi; phiên vừa tạo bị huỷ; mật khẩu A vẫn mở được (FR09) |
| `KM-006-AC12` | *Given* như AC11 *when* chọn Thay thế mà chưa gõ từ xác nhận *then* không làm được. Gõ đúng rồi xác nhận thì dữ liệu A không còn (quét NFR04), máy có dữ liệu B. *Given* A đã đăng ký, không có thay đổi chờ *then* chỉ cần xác nhận một bước (FR09) |
| `KM-006-AC13` | *Given* máy có tài khoản A, không biết mật khẩu A *when* từ màn khoá đăng nhập tài khoản B *then* có câu hỏi FR09, không cần mở khoá A; đăng nhập sai B thì không có câu hỏi nào, A nguyên vẹn (FR09) |
| `KM-006-AC14` | *Given* tài khoản đã đăng ký, không có thay đổi chờ, online *when* đăng xuất giữ dữ liệu *then* token cũ bị server từ chối; app khoá; phiên không còn trên máy; mở khoá offline được; 0 request đồng bộ; máy kia vẫn đồng bộ (FR10, FR11, FR15) |
| `KM-006-AC15` | *Given* offline, có thay đổi chờ *when* đăng xuất giữ dữ liệu, mở khoá, sửa thêm, rồi có mạng và đăng nhập lại *then* có thông báo phiên chưa huỷ; mọi thay đổi lên server, máy kia nhận được (FR08, FR11) |
| `KM-006-AC16` | *Given* offline, có N thay đổi chờ *when* chọn đăng xuất có xoá *then* cảnh báo nêu đúng N; Huỷ và "giữ dữ liệu" không mất gì; không gõ từ xác nhận thì không xoá được (FR12) |
| `KM-006-AC17` | *Given* online, có thay đổi chờ *when* chọn đăng xuất có xoá *then* thay đổi lên server trước, không có cảnh báo mất dữ liệu; nếu server từ chối thì có cảnh báo như AC16 (FR12) |
| `KM-006-AC18` | *Given* đã đăng ký, có cài đặt, danh sách gần đây, bản ghi passkey đặt trong kho *when* xoá dữ liệu *then* về màn thiết bị trống; quét NFR04 đạt; có lời nhắc credential trong hệ điều hành; máy kia đồng bộ bình thường. Nếu KM-007 đóng trước thì kiểm trên passkey thật của giả lập (FR13, FR14, NFR04, Concern 6) |
| `KM-006-AC19` | *Given* có bản ghi passkey *when* chạy mọi luồng đồng bộ, đăng ký, đăng nhập *then* giá trị bản ghi không xuất hiện trong request nào; đăng nhập cùng tài khoản và đăng xuất giữ dữ liệu không đổi bản ghi (FR14) |
| `KM-006-AC20` | *Given* có tab khác của app đang ở màn khoá *when* xoá dữ liệu *then* xoá hoàn tất; tab kia thao tác tiếp không tạo lại dữ liệu cũ (FR13, Concern 16) |
| `KM-006-AC21` | *Given* hai máy mở khoá, foreground, online *when* máy A tạo item gán hai env, ngay sau một lần hỏi của máy B *then* máy B hiện item ở cả hai env trong ≤ 60 s (tiêu chí 1; FR16, NFR05) |
| `KM-006-AC22` | *Given* máy B đang khoá hoặc ở nền *when* máy A lưu, rồi B mở khoá hoặc về foreground *then* B có 0 request khi đang khoá; hiện thay đổi trong ≤ 10 s kể từ lúc đó (FR15, FR16, NFR05) |
| `KM-006-AC23` | *Given* máy B offline *when* đổi mật khẩu rồi có mạng *then* B tự đẩy lên; A nhận mật khẩu mới; lịch sử có bản cũ (tiêu chí 2; FR18, FR20, NFR08) |
| `KM-006-AC24` | *Given* hai máy offline cùng sửa field Password *when* cùng online *then* hai máy cùng một nội dung; badge và tô sáng đúng field đó, không field nào khác; lịch sử có bản thua (tiêu chí 3; FR19, FR35, FR36, FR38) |
| `KM-006-AC25` | *Given* hai máy offline, một máy sửa Password, một máy sửa Ghi chú *when* cùng online *then* có cả hai thay đổi, không có badge (tiêu chí 3; FR19) |
| `KM-006-AC26` | *Given* hai máy offline, gán thêm `PaymentGW/prod` và `CRM/uat` *when* cùng online *then* item ở cả bốn env trên hai máy, không có badge (tiêu chí 3; FR19) |
| `KM-006-AC27` | *Given* một lần đẩy đang chạy *when* người dùng lưu thay đổi mới, rồi lần đẩy thành công *then* thay đổi mới vẫn chờ và được đẩy ở lượt sau; server cuối cùng có cả hai (FR18, Concern 12) |
| `KM-006-AC28` | *Given* đang sửa dở item, field A không đụng tới, field B đã đổi *when* đồng bộ nhận giá trị mới của A, rồi lưu *then* A giữ giá trị vừa nhận, B giữ giá trị người dùng; không có đánh dấu xung đột; lịch sử theo quy tắc lưu (FR22, Concern 13) |
| `KM-006-AC29` | *Given* đang sửa field A *when* đồng bộ nhận giá trị khác của A, rồi lưu *then* giá trị của người dùng thắng, giá trị vừa nhận nằm trong lịch sử (FR22) |
| `KM-006-AC30` | *Given* server đã ghi bản đẩy nhưng máy chưa nhận phản hồi (cắt kết nối, đóng tab) *when* mở lại và đồng bộ *then* dữ liệu khớp server, không có đánh dấu mới, không có giá trị nào mất (FR26) |
| `KM-006-AC31` | *Given* đẩy lên ở `500`, mất kết nối, rồi hồi phục *when* quan sát *then* các lần thử cách 2 s, 5 s, 15 s, 60 s, 60 s (±20%); thay đổi còn trên máy; hồi phục thì đồng bộ ≤ 65 s; sự kiện `online` thì ≤ 5 s (FR24, NFR08) |
| `KM-006-AC32` | *Given* phiên bị vô hiệu trong kho server *when* lượt đồng bộ chạy, người dùng tiếp tục sửa, rồi đăng nhập lại chỉ bằng mật khẩu *then* không bị đẩy khỏi app; chấm đỏ "Cần đăng nhập lại"; 0 request cho tới khi đăng nhập; mọi thay đổi lên server sau đó (FR25, Concern 11) |
| `KM-006-AC33` | *Given* lần lượt bị `403`, `400`, `404`, `413` *when* đồng bộ *then* đúng nguyên nhân hiện ở chi tiết; khoảng cách lần thử ≥ 60 s; dữ liệu và trạng thái chờ giữ nguyên (FR25) |
| `KM-006-AC34` | *Given* blob server bị thay bằng khối không giải mã được (có và không có thay đổi chờ) *when* đồng bộ *then* trên máy không đổi, 0 lần đẩy cho vault đó, có lỗi riêng; ghi lại bản hợp lệ thì tự hết lỗi (FR23) |
| `KM-006-AC35` | *Given* hai vault (vault thứ hai tạo qua API bằng khoá thật), một vault bị lỗi ở AC33 hoặc AC34 *when* đồng bộ *then* vault kia vẫn đẩy, kéo đúng; chi tiết hiện đúng từng vault; vault đang hiện không đổi (FR17, FR27, FR28) |
| `KM-006-AC36` | *Given* thiết bị đang chạy, có thêm vault id nhỏ hơn vault đang hiện *when* đồng bộ và khoá, mở lại *then* vault đang hiện không đổi; thiết bị mới mở vault có `createdAt` nhỏ nhất (FR28) |
| `KM-006-AC37` | *Given* vault trên máy không có trong danh sách server *when* đồng bộ *then* không xoá gì; có lỗi riêng vault đó (FR27, Concern 17) |
| `KM-006-AC38` | *Given* không có gì đổi *when* 3 lần hỏi định kỳ *then* 0 lần tải blob, phản hồi là "không đổi"; sau khi máy khác ghi thì đúng 1 lần tải (FR29) |
| `KM-006-AC39` | *Given* hai máy không thay đổi gì trong 10 phút (đồng hồ được truyền vào hoặc thời gian thật) *when* đếm *then* 0 lần ghi vault; không có vòng đẩy qua lại; một thiết bị ~1 request mỗi 50 s (NFR06, NFR10) |
| `KM-006-AC40` | *Given* app đang mở, không thao tác *when* đồng bộ chạy tới hết thời gian tự khoá *then* app vẫn khoá đúng giờ; khoá giữa lượt không ghi hỏng dữ liệu (FR15) |
| `KM-006-AC41` | *Given* tạo lần lượt từng trạng thái ở FR31 *when* xem trên desktop và mobile *then* đúng màu, chữ và thứ tự ưu tiên; có chữ cho trình đọc màn hình (FR31, NFR11) |
| `KM-006-AC42` | *Given* sửa một item hai lần, thêm một env *when* offline *then* hiện "Offline – 2 thay đổi chờ"; về đúng bản chung thì không còn đếm (FR32) |
| `KM-006-AC43` | *Given* trạng thái bất kỳ *when* chạm vào, bấm "Đồng bộ ngay" hai lần, kể cả đang trong backoff *then* có đủ thông tin FR33, không có dữ liệu item; lượt chạy trong ≤ 1 s; chỉ một lượt; offline thì báo ngay (FR33, FR34) |
| `KM-006-AC44` | *Given* vault ≥ 1 000 000 byte *when* đồng bộ *then* có cảnh báo, vẫn đồng bộ; dưới ngưỡng thì không (FR30) |
| `KM-006-AC45` | *Given* item có `conflict` trên một field, một thuộc tính, một field đã xoá, và `deletedAt` *when* xem danh sách, trang chủ, chi tiết *then* có badge, đúng số lượng; chỉ phần đó được đánh dấu, có dấu hiệu ngoài màu; phần không có dòng hiện bằng chữ; secret vẫn che; bản `deleted-elsewhere` ghi đúng câu (FR35, FR36, FR38) |
| `KM-006-AC46` | *Given* item đang có đánh dấu trên hai máy *when* bấm "Đã xử lý" ở một máy rồi đồng bộ *then* đánh dấu mất ở cả hai; nội dung giống trước; không thêm bản lịch sử. Sửa item mà không bấm thì đánh dấu còn (FR37) |
| `KM-006-AC47` | *Given* đã chạy mục 3.1 kèm xung đột *when* quét theo NFR01, NFR02, NFR03 *then* 0 lần trùng; ở server không có chỗ nào đọc được nội dung (NFR01, NFR02, NFR03) |
| `KM-006-AC48` | *Given* 100 lần lưu xen kẽ theo NFR07 *when* so kết quả *then* mọi giá trị còn lại theo NFR07; hai máy giống nhau theo nội dung (NFR06, NFR07) |
| `KM-006-AC49` | *Given* vault 200 KB *when* đo theo NFR09 *then* đạt trên máy dev; số đo trên giả lập được ghi vào `implement.md` (NFR09) |
| `KM-006-AC50` | *Given* đã xong *when* chạy các lệnh ở NFR13 *then* đều xanh; `git diff` không đổi `src/functions/`, `src/migrations/`, `merge.js`, vector; không có request tới Cloudflare (FR39, FR40, NFR13) |
| `KM-006-AC51` | *Given* server cục bộ, dữ liệu thử, lần lượt laptop + giả lập Android và laptop + giả lập iOS *when* originator kiểm tay: mục 3.1 bước 1–7, giữ dữ liệu đang có, thiết bị mới offline, hai trường hợp không mất âm thầm ở intent §5, tắt server rồi bật lại, mọi trạng thái của 07 *then* `implement.md` ghi đạt hoặc không theo từng mục, từng cặp, kèm bằng chứng. Mục không làm được do originator quyết (FR41, NFR12, NFR15) |
| `KM-006-AC52` | *Given* `KM-006.md`, `KM-014.md`, `KM-008.md`, `KM-009.md`, 03–09 và KM-003 *when* verifier đọc lại *then* đúng nội dung FR42–FR45; mọi mục ở intent §6 có mặt trong `KM-014.md`, kèm điều kiện về secret thật; không còn câu nào nói KM-006 deploy; 08 ghi đúng mức đạt (FR42, FR43, FR44, FR45) |
| `KM-006-AC53` | *Given* mã client *when* reviewer đọc *then* không có cờ hay nhánh chỉ cho test; không có `innerHTML` với dữ liệu người dùng; không thêm phụ thuộc; tầng đúng theo `CLAUDE.md` (NFR13, NFR14) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- Deploy và mọi việc kiểm trên Cloudflare thật, điện thoại thật (chuyển sang `KM-014`). Hệ quả đã chấp nhận: đạt ở đây không chứng minh gì về hai môi trường đó, giới hạn gói Free phát hiện muộn hơn.
- Đưa secret thật lên server. Điều kiện ở `docs/04-security.md` vẫn mở, cộng thêm `KM-014` phải xong.
- Đổi tên, đổi màu, xoá vault, giao diện tạo nhiều vault; gộp và nhận `meta`; xử lý vault bị xoá ở máy khác; đẩy vault chỉ có cục bộ lên server khi đã đăng ký (KM-008). Epic này không có đường nào tạo ra vault như vậy.
- Giao diện thùng rác (KM-008). Epic này chỉ hiện đúng đánh dấu `deletedAt`, `purgedAt` nếu có.
- Đổi mật khẩu, thu hồi phiên, danh sách thiết bị, snapshot, nhật ký (KM-009). Hệ quả đã chấp nhận: phiên của lần đăng xuất offline tự hết sau 30 ngày không dùng; lần ghi đè không khôi phục được từ server.
- Passkey (KM-007), ngoài việc xoá bản ghi và không gửi nó lên server. Backup và bản sao ra file (KM-010). Chia sẻ vault.
- Đồng bộ khi app đang khoá hoặc ở nền; thông báo đẩy; cơ chế server chủ động báo thiết bị. Tiêu chí 1 chỉ cam kết khi máy nhận đang mở (Concern 4).
- Gộp hai tài khoản khác nhau; một máy giữ cùng lúc nhiều tài khoản (Concern 2).
- Xoá tài khoản khỏi server; khôi phục khi server mất dữ liệu.
- Sửa hành vi server hoặc quy tắc gộp.

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: ba thiết bị có cùng tới được một server cục bộ với secure context và đúng Origin không? Giả lập iOS chạy trên máy Mac; offline có tách được khỏi server không? KM-004 đã chạy Android qua `adb reverse` và iOS qua Xcode, nhưng chưa kèm server này | Engineer (`/build-plan`) | **Hoãn, owner: engineer, lúc: build-plan, chạy thử trước khi viết mã.** Thiếu phần nào thì báo originator theo intent §5, không tự bỏ (FR41) |
| 2 | Intent §7 câu 2: đăng nhập tài khoản khác trên máy đã có tài khoản. Hai bên khác khoá, app chỉ có một vault, một máy chỉ có chỗ cho một tài khoản (03 §3) nên không gộp hay giữ song song được | Originator | **Đã chốt (originator, 2026-11-02): chặn, cho chọn.** Huỷ là mặc định; Thay thế xoá tài khoản cũ, phải gõ xác nhận khi có dữ liệu chưa lên server. Dùng được cả khi quên mật khẩu cũ (FR09, AC11–AC13) |
| 3 | Intent §7 câu 3: đăng xuất khi còn thay đổi chờ và không có mạng | PO | **Đã quyết:** giữ dữ liệu luôn được và không mất gì; xoá thì nêu N và phải gõ xác nhận (FR11, FR12). Hệ quả: offline thì không huỷ được phiên trên server. Không giữ token lại để huỷ sau, vì trái yêu cầu xoá. Trước KM-009 phiên đó tự hết sau 30 ngày; ghi vào 04 |
| 3b | KM-005 §3.2 để client tự xử lý trường hợp đăng ký thành công nhưng mất phản hồi. Tự đăng nhập thử khi gặp `username_taken` sẽ tính một lần sai nếu tên đó của người khác | PO | **Đã quyết:** không tự thử; mời người dùng bấm đăng nhập. Cùng bộ khoá thì nhận là cùng tài khoản (FR05, FR08, AC06) |
| 4 | Intent §7 câu 4: "≤ 60 giây" tính khi nào? Ngoài ra nhịp ở 05 không đủ: debounce 1,5 s cộng hỏi mỗi 60 s, trường hợp xấu nhất là 61,5 s trở lên, vỡ đúng tiêu chí 1 | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** tính khi máy nhận đang mở khoá, foreground, có mạng. Ở nền hay đang khoá thì không có khoá để gộp, nên không đồng bộ; khi quay lại ≤ 10 s. **Đổi nhịp hỏi thành 50 giây** (FR16, NFR05), sửa 05, 06. Ước lượng ghi phiên tăng từ 2 880 lên khoảng 3 456 lần/ngày cho 2 thiết bị mở liên tục; chuyển số này sang `KM-014` để đo |
| 5 | Intent §7 câu 5: ghi việc `meta` ở đâu, có nhận `meta` từ máy khác không | PO | **Đã quyết:** ghi vào `KM-008.md` (FR45), khớp intent KM-008. Không nhận ở epic này: chưa có thao tác nào đổi `meta` (`PATCH` đang `404`), nên `metaVersion` luôn là 1 (FR27). Quyết định này thay cho KM-002 Concern 11, nơi giao `meta` cho KM-006 |
| 6 | Intent §7 câu 6: KM-007 đang ở build-plan, chạy song song. Xoá dữ liệu phải xử lý passkey thế nào, epic nào chịu | PO | **Đã quyết:** yêu cầu thuộc KM-006 (FR13, FR14), xoá toàn bộ nên không phụ thuộc KM-007 có đóng hay chưa. **Epic đóng sau chịu phần kiểm thật:** KM-007 đóng trước thì AC18 kiểm trên passkey thật; KM-006 đóng trước thì AC18 kiểm bằng bản ghi đặt trong kho, và KM-007 thêm test cho passkey thật. Ghi vào `KM-006.md` và báo KM-007 (FR42). |
| 7 | Intent §7 câu 7: làm `KM-014` khi nào | Originator | **Đã chốt (originator, 2026-11-02): chưa xếp mốc.** Chỉ ghi việc và điều kiện về secret thật (FR43). Chấp nhận rủi ro phát hiện giới hạn gói Free muộn |
| 8 | Intent §4 ghi không epic sau nào cần bản deploy, nhưng intent KM-009 §5 ghi kiểm trên "bản deploy mà KM-006 đã dựng" và §7 câu 4 chờ "KM-006 đo trên Cloudflare thật" | Originator | **Đã chốt (originator, 2026-11-02): KM-009 kiểm cục bộ,** cùng mức KM-006, KM-008. Câu dung lượng gói Free chuyển sang `KM-014`. Ghi vào `KM-009.md` (FR45). **Sửa `intent.md` của KM-009, owner: Originator, lúc: bước intent KM-009 đang chạy** |
| 9 | F-AUTH-01 là một form username + mật khẩu, nhưng intent §5 giữ tài khoản chưa đăng ký dùng được như M1, M2, và tài khoản cũ phải đăng ký sau | PO | **Đã quyết:** tách hai bước, một đường đăng ký duy nhất: tạo cục bộ (không username), rồi đăng ký trong app (FR01, FR03). Câu "Dữ liệu chỉ nằm trên trình duyệt này" ở màn tạo vẫn đúng. Sửa 07 (FR44) |
| 10 | KM-003 FR47, AC44 và `sweep.e2e.js` cấm "đăng nhập", "đăng xuất", "đồng bộ" trên mọi màn; epic này thêm đúng các thứ đó | PO | **Đã quyết:** bỏ ba mục đó khỏi danh sách cấm, phần còn lại giữ nguyên (FR45). Đây là thay đổi có chủ đích, không phải sinh lại test cho xanh |
| 11 | 06 ghi "khi nhận 401, client chuyển sang màn đăng nhập", trái intent §5 "vẫn dùng được", và cắt ngang lúc đang sửa | PO | **Đã quyết:** không chuyển màn; chấm đỏ và đăng nhập lại khi người dùng chọn (FR25, AC32). Sửa 06 (FR44) |
| 12 | Sơ đồ ở 05 đặt `dirty = false` ngay khi đẩy thành công. Lưu trong lúc đang đẩy sẽ bị coi là đã lên server, và mất âm thầm ở lần kéo sau | PO | **Đã quyết:** chỉ xoá trạng thái chờ khi không có lần lưu mới hơn (FR18, AC27). Sửa 05 (FR44) |
| 13 | Đã đọc mã: lưu bản nháp gửi đủ mọi giá trị, và lõi coi mọi giá trị khác hiện tại là thay đổi. Nhận thay đổi từ máy khác trong lúc sửa dở rồi lưu sẽ ghi đè lại giá trị cũ, âm thầm, không có đánh dấu | PO; engineer chọn cách làm | **Đã quyết hành vi:** FR22, AC28, AC29. **Cách làm hoãn, owner: engineer, lúc: build-plan.** Không đổi quy tắc gộp; đổi hợp đồng `core/` thì sửa 09 |
| 14 | 05, 07 ghi "N thay đổi" nhưng trên máy chỉ có một cờ theo vault; cách đếm theo vault thì N luôn là 1 | PO | **Đã quyết:** đếm thực thể khác bản chung (FR32). Chỉ tính khi đang mở khoá; lúc đó mới có khoá |
| 15 | App lấy vault đầu tiên theo thứ tự id, nên một vault mới có id nhỏ hơn sẽ đổi vault đang hiện. Intent §5 yêu cầu kiểm "lỗi ở một vault không chặn vault khác" trong khi giao diện không tạo được vault thứ hai | PO | **Đã quyết:** FR28. Test tạo vault thứ hai bằng khoá thật qua API đã có (AC35); không thêm giao diện. **Thu hẹp so với intent §5:** riêng mục này chỉ có bằng chứng từ test tự động, không kiểm tay, vì giao diện không tạo được vault thứ hai; originator có thể đổi khi duyệt spec |
| 16 | Xoá dữ liệu bị chặn hoặc treo được khi tab khác còn giữ kết nối tới kho | PO; engineer chọn cách làm | **Đã quyết hành vi:** FR13, AC20. **Cách làm hoãn, owner: engineer, lúc: build-plan** |
| 16b | "Đã xử lý" đổi `conflict` mà 09 chưa có thao tác nào; 05 ghi việc này không tính là sửa nội dung | PO | **Đã quyết:** thêm một thao tác thuần vào `core/`, ghi 09 (FR37, FR39, FR44). Đây là ngoại lệ duy nhất với "không đổi lõi", không đổi phép gộp |
| 17 | Vault biến mất khỏi server: xử lý theo 05 (xoá bản cục bộ) thuộc KM-008, nhưng nếu giữ nguyên 05 thì một lần server cục bộ bị xoá dữ liệu sẽ xoá luôn dữ liệu trên máy | PO | **Đã quyết:** epic này không bao giờ xoá dữ liệu theo tín hiệu từ server (FR27, AC37). KM-008 thêm đường xoá có xác minh |
| 18 | 04 yêu cầu master password mạnh vì `wrappedAccountKey` trên server brute-force offline được, trong khi tài khoản KM-003 có thể dùng mật khẩu yếu, và đổi mật khẩu ở tận KM-009 | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** cảnh báo, không chặn (FR02). Epic này chỉ dùng dữ liệu thử; ghi vào điều kiện về secret thật ở 04 (FR44) |
| 19 | KM-005 Concern 5, 11, 12, 16, 18, finding 1 và KM-002 Concern 12 đang giao cho KM-006; intent §6 chuyển đi | Originator đã chốt ở intent | **Đã quyết:** `KM-014` nhận phần Cloudflare và máy thật (FR43). KM-006 giữ phần client của Concern 16 (FR29) và Concern 10 (FR03). Điều kiện Concern 18 giữ ở 04, owner vẫn là originator |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

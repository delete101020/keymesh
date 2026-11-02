# Spec — Thùng rác và quản lý vault

**Epic ID:** `KM-008`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `intent.md`

---

## 1. Overview

Epic đưa hai khả năng tới tay người dùng. Thứ nhất là thùng rác: xoá item, xem và khôi phục trong 30 ngày, xoá vĩnh viễn, tự xoá trắng khi quá hạn, đồng bộ giữa hai máy. Thứ hai là quản lý nhiều vault: tạo, đổi tên, đặt màu, chuyển vault, tìm "mọi vault", xoá vault kèm phần xoá phía server. Epic phục vụ dòng "Hôm nay người dùng KeyMesh không xoá được item nào… Họ cũng chỉ có một vault" và "tiêu chí chấp nhận 7 chưa có gì để chứng minh" (`intent.md` §1).

Epic kế thừa từ KM-006 (`inputs.json`): đồng bộ theo từng vault, quy tắc gộp item, tài khoản chưa đăng ký vẫn dùng được, mức kiểm bằng giả lập và server cục bộ. KM-006 chưa có `spec.md` và chưa có mã, nên phần kế thừa lấy từ intent KM-006, `docs/03`, `docs/05`; các giả định về KM-006 được ghi ở Concern 1. Điều epic này đổi so với tài liệu:

- Xoay khoá vault về KM-011.
- Metadata vault mang thêm thời điểm sửa (Concern 6).
- Xoá vault đã từng gửi lên server thì phải có server xác nhận; vault chưa từng gửi thì xoá được ngay trên máy (Concern 2).
- Phiên đang mở giữ cả `accountKey` (Concern 8).
- App so giờ thiết bị với giờ server; lệch quá 1 giờ thì báo lỗi và chặn mọi thay đổi (Concern 3). Việc này áp dụng cho cả app, không riêng thùng rác.
- Thu hẹp `KM-003-FR47` (Concern 11).

Spec trả lời câu 2, 3, 4 ở `intent.md` §7 và câu 5 ở intent KM-006 §7 (Concern 2, 3, 4, 5). Câu 1 hoãn cho `/build-plan` (Concern 1).

## 2. Constraints applied

| Source | What it constrains |
|---|---|
| `CLAUDE.md` (dự án) | Không phụ thuộc bên thứ ba, không bước build. Chiều phụ thuộc `ui/` → `app.js` → `store.js`, `sync.js` → `core/`; `core/` thuần, thời gian và `deviceId` do bên gọi truyền vào. Server không giải mã gì. CSP chỉ `'self'`, không `style="…"`, không `innerHTML` với dữ liệu người dùng. Không ghi password, khoá, plaintext ra `console`, lỗi, URL. Service Worker không cache `/api/*`. `npm test`, `npm run test:browser` cho lõi, `npm run test:server` cho server |
| `docs/05-sync.md` § Danh sách vault, § Xoá, thùng rác và sửa | Phát hiện vault mới và vault bị xoá; giữ lại khi đang dirty; meta "bản muộn hơn thắng"; bảng xoá 9 dòng, không được đổi |
| `docs/03-data-model.md` § Quy tắc toàn vẹn, §2, §3 | `TRASH_DAYS = 30`; tombstone giữ mãi; dọn chạy ở client khi mở khoá; meta mã hoá bằng `vaultKey`; vault đang chọn là cài đặt riêng từng thiết bị |
| `docs/06-api.md` | Hợp đồng đổi metadata và xoá vault; lỗi `last_vault`; `404` cho vault không thuộc user; quy tắc `401` |
| `docs/04-security.md` § Vòng đời khoá, § Mô hình mối đe doạ | Zero-knowledge, kể cả tên vault; xoá vault phải nhập lại mật khẩu; ngưỡng 5 lần sai trong 15 phút; thùng rác là biện pháp chống lỡ tay xoá |
| `docs/07-features.md` F-ITM-07, F-ITM-12, F-VLT-02, F-VLT-03, F-VIEW-02, tiêu chí 7 | Phạm vi và tiêu chí chấp nhận |
| `docs/08-roadmap.md` Q2, Q5, M5 | Thùng rác 30 ngày, thiết kế nhiều vault, mức đạt của M5 |
| `docs/09-core-api.md` | `trashItem`, `restoreItem`, `purgeItem`, `DELETED_ELSEWHERE`, `conflict.attrs`, `encryptVaultMeta`, `wrapVaultKey`, `generateVaultKey` đã có và đã test |
| Intent KM-006 §1, §5, §6, §7 | Phần kế thừa; mức kiểm trên từng cặp; việc KM-006 giao sang epic này |
| `KM-003-FR47`, `KM-003-NFR08` | Danh sách tính năng bị cấm hiện ở UI (Concern 11); ngưỡng hiệu năng đang có |
| `KM-005-FR19` và các FR rate limit | Cách đếm lần sai, dùng cho xoá vault (Concern 10) |
| KM-007 `spec.md` Concern 6 | Đang giả định phiên mở khoá không giữ `accountKey` (Concern 8) |
| Mã đã đọc (2026-11-02) | `session.js`, `store.js`, `core/model.js`, `core/merge.js`, `core/crypto.js`, `ui/history-dialog.js`, `ui/detail.js`, `functions/api/*`, `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` |
| `.aidlc/workspace.yaml`, `state.json` | Viết bằng tiếng Việt; `strict_mode: true` nên đủ độ sâu. Không có project skill nào khác ràng buộc phần này |

## 3. User scenarios

### 3.1 Primary flow

**Xoá và khôi phục giữa hai máy (tiêu chí 7)**
*Given* máy A và máy B đã đồng bộ, cùng thấy item "Partner X",
*when* người dùng xoá item trên A, rồi hai máy đồng bộ,
*then* item biến khỏi danh sách trên cả hai máy và hiện trong Thùng rác của vault đó.
*When* người dùng khôi phục item trên B, rồi hai máy đồng bộ,
*then* item quay lại đúng các env, đủ field và lịch sử trên cả hai máy.

**Xoá vĩnh viễn**
*Given* item nằm trong thùng rác,
*when* người dùng chọn xoá vĩnh viễn, đọc lời báo về snapshot và file backup, rồi xác nhận,
*then* trên cả hai máy, sau khi đồng bộ, không còn chỗ nào trong app đọc được nội dung item.

**Dọn thùng rác**
*Given* vault đang chọn có N item trong thùng rác,
*when* người dùng chọn Dọn thùng rác và xác nhận, với tên vault và số N hiện trong lời xác nhận,
*then* cả N item bị xoá trắng; thùng rác của vault khác không đổi.

**Tự xoá trắng**
*Given* một item đã nằm trong thùng rác quá 30 ngày, ở bất kỳ vault nào,
*when* người dùng mở khoá app,
*then* item bị xoá trắng, không cần thao tác nào, và hai máy hội tụ sau khi đồng bộ.

**Đồng hồ thiết bị lệch**
*Given* thiết bị đang liên lạc được với server và đồng hồ lệch hơn 1 giờ so với giờ server,
*when* app kiểm giờ ở lần sync,
*then* app báo lỗi ngay, nói rõ cần chỉnh giờ, chặn mọi thay đổi và tự xoá trắng, nhưng vẫn cho xem và copy.
*When* người dùng chỉnh giờ và app kiểm lại đạt,
*then* lỗi tự mất, thay đổi đang chờ được đẩy lên, tự xoá trắng chạy lại.

**Tạo và dùng vault thứ hai**
*Given* app đang mở,
*when* người dùng tạo vault "Cá nhân" màu xanh,
*then* app chuyển sang vault mới, trống; dữ liệu vault cũ không hiện ra; máy kia thấy vault này sau lần sync sau.

**Đổi tên, đổi màu**
*Given* hai máy cùng có một vault,
*when* cả hai đổi tên khi offline, rồi online,
*then* bản sửa muộn hơn thắng và hai máy hiện cùng một tên.

**Tìm mọi vault**
*Given* item "Stripe" nằm ở vault không đang chọn,
*when* người dùng bật "mọi vault" rồi gõ "stripe",
*then* item hiện kèm tên và màu vault của nó; chọn item thì app chuyển sang vault đó và mở item.

**Xoá vault**
*Given* tài khoản có từ hai vault trở lên, vault cần xoá đã lên server và thiết bị đang có mạng,
*when* người dùng chọn xoá một vault, đọc lời báo không lấy lại được, nhập đúng master password,
*then* vault biến mất khỏi máy này và khỏi server; máy kia xoá bản cục bộ ở lần sync sau.

**Xoá vault tạo nhầm khi offline**
*Given* máy đang offline và vừa tạo một vault, chưa lần nào gửi vault đó lên server,
*when* người dùng chọn xoá vault và nhập đúng master password,
*then* vault biến mất khỏi máy, và không máy nào hay server nào từng thấy nó.

### 3.2 Edge and error paths

| Tình huống | Điều người dùng thấy | Trạng thái sau đó |
|---|---|---|
| Thùng rác trống | Câu báo trống, không có thao tác Dọn | Không đổi |
| Xoá item khi offline | Như khi online | Đẩy lên ở lần có mạng |
| Không ghi được bộ lưu trữ khi xoá, khôi phục, dọn | Báo lỗi lưu | Giữ nguyên như trước thao tác |
| Khôi phục item có mọi env đã bị xoá | Item vào *Chưa gán* | Item vẫn giữ id env trong `scopes` (03) |
| Máy offline sửa item mà máy kia đã xoá hoặc xoá trắng | Item sống lại kèm badge ⚠ và câu giải thích | Đúng 05, không đổi quy tắc gộp |
| Đang mở form sửa, sync báo item đã vào thùng rác | Form giữ nguyên; lúc lưu được hỏi: *Khôi phục và lưu* hoặc *Bỏ thay đổi* | Không mất draft nếu chưa chọn |
| Đang mở form sửa, sync báo item đã bị xoá trắng | Form giữ nguyên; lúc lưu được hỏi: *Lưu thành item mới* hoặc *Bỏ thay đổi* | Không mất draft nếu chưa chọn |
| Đang xem item (kể cả secret đang hiện), sync báo item vào thùng rác hoặc bị xoá trắng | Màn chi tiết đóng lại | Không còn giá trị nào trên màn |
| Đồng hồ lệch quá 1 giờ, đang có server | Lỗi hiện ngay, không tắt được khi còn lệch; xem, copy, khoá app vẫn được; mọi thao tác thay đổi bị từ chối kèm lý do | Không ghi gì vào vault; đồng bộ tạm dừng, trừ phép kiểm giờ |
| Đang mở form sửa lúc phát hiện lệch giờ | Form giữ nguyên, nút lưu báo cần chỉnh giờ | Lưu được sau khi kiểm lại đạt |
| Lần kiểm cuối là lệch, giờ đang offline | Cảnh báo chưa kiểm lại được giờ; xem và sửa vẫn được; không tự xoá trắng | Có server là kiểm lại |
| Offline, hoặc tài khoản chưa đăng ký, lần kiểm cuối không lệch | Không có gì để so, app dùng giờ máy | Đồng hồ sai vẫn có thể gây xoá trắng sớm (rủi ro đã chấp nhận, Concern 3) |
| `deletedAt` ở tương lai (đồng hồ máy xoá nhanh hơn máy này) | Hiện còn 30 ngày; chưa tự xoá | Tính lại khi tới hạn |
| Tự xoá trắng không ghi được đĩa | Mở khoá vẫn thành công | Thử lại ở lần mở khoá sau |
| Tên vault rỗng, quá 64 ký tự, hoặc trùng tên vault khác trên máy | Báo ngay trên form, không tạo | Không đổi |
| Hai máy offline tạo vault cùng tên | Cả hai vault đều còn, cùng tên, app không tự đổi tên | Người dùng tự đổi |
| Tạo vault hoặc đổi tên khi offline, hoặc khi chưa đăng ký | Chạy bình thường | Đẩy lên khi có server và phiên |
| Mất phản hồi khi đẩy vault mới lên, thử lại bị báo id đã có | Không thấy gì | Nhận ra vault đã lên server, tiếp tục đồng bộ thường |
| Một vault hỏng hoặc không giải mã được | Vault đó hiện "không đọc được", không mở, không đổi tên, không xoá được; các vault khác dùng bình thường | Không ghi gì lên bản hỏng |
| Vault đang chọn (đã nhớ) không còn hoặc bị hỏng | Mở vault đọc được đầu tiên | Không báo lỗi chặn |
| Mọi vault đều hỏng | Báo lỗi như hôm nay | Không đổi dữ liệu |
| Xoá vault: sai mật khẩu | Báo sai mật khẩu, vẫn ở hộp xoá, phiên không mất | Không xoá; lần sai bị đếm |
| Xoá vault: quá số lần sai | Báo tạm khoá và thời gian chờ | Không xoá, kể cả khi nhập đúng; phiên đang có vẫn dùng được |
| Xoá vault: vault cuối, hoặc không còn vault đọc được nào khác | Báo không xoá được và lý do, không hỏi mật khẩu | Không đổi |
| Hai máy cùng xoá hai vault cuối | Máy tới trước xoá được; máy sau báo không xoá được vì là vault cuối | Luôn còn ít nhất một vault |
| Máy tin còn hai vault nhưng server chỉ có một (vault kia chưa đẩy lên) | Báo chưa xoá được, đồng bộ rồi thử lại | Không đổi |
| Xoá vault đã lên server khi offline hoặc server lỗi | Báo cần có mạng, thử lại được | Không đổi gì, cả ở máy lẫn server |
| Xoá vault chưa từng gửi lên server, kể cả khi offline | Hỏi mật khẩu, kiểm tại máy, xoá cục bộ | Không có request nào; sync không còn đẩy vault đó |
| Xoá vault đã gửi lên nhưng chưa biết server có nhận không (mất mạng giữa lúc đẩy) | Xử lý như vault đã lên server: offline thì báo cần có mạng | Có mạng thì server phân xử; server báo không có vault thì coi như xoá xong |
| Xoá vault: phiên đã hết hoặc đã bị thu hồi | Về màn đăng nhập theo 06 | Không xoá; dữ liệu cục bộ còn nguyên |
| Xoá vault: server đã xoá nhưng mất phản hồi, thử lại | Coi như đã xoá xong | Bản cục bộ được xoá |
| App khoá hoặc bị đóng giữa lúc xoá vault | Trước khi gửi thì không có gì đổi; sau khi server đã xoá thì bản cục bộ bị xử lý ở lần sync sau, theo cùng quy tắc với máy kia | Không có trạng thái nửa vời |
| Máy kia không có thay đổi chưa đẩy, đang mở vault vừa bị xoá | Báo vault đã bị xoá ở thiết bị khác, chuyển sang vault còn lại | Bản cục bộ bị xoá |
| Máy kia có thay đổi chưa đẩy trong vault vừa bị xoá | Báo tên vault và cho chọn *Tạo lại trên server* hoặc *Bỏ bản trên máy này* | Chưa chọn thì vault vẫn dùng được, không đồng bộ, vẫn nhắc |
| Thay đổi chưa đẩy chỉ là đổi tên hoặc màu | Xử lý như không có thay đổi | Bản cục bộ bị xoá |
| Máy kia đang mở form sửa trong vault vừa bị xoá | Form giữ nguyên; vault chỉ bị xử lý sau khi đóng form. Lưu thì vault có thay đổi chưa đẩy, đi theo đường giữ lại | Không mất draft |
| Máy chỉ có vault Y; máy khác đã tạo X rồi xoá Y | Nhận X trước, chuyển sang X, rồi mới xoá Y | Không lúc nào còn 0 vault |
| Vault đã xoá được tạo lại trong lúc máy thứ ba chưa sync | Máy thứ ba coi như vault có bản mới trên server, gộp bình thường | Không mất thay đổi |

## 4. Functional requirements

### Thùng rác

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-008-FR01` | Xoá item ở màn chi tiết chuyển item vào thùng rác của vault chứa nó, giữ nguyên nội dung và lịch sử. Không hỏi xác nhận vì khôi phục được; app báo đã chuyển vào thùng rác | Must | §5 "Tiêu chí 7" |
| `KM-008-FR02` | Item trong thùng rác không hiện ở bất kỳ danh sách, bộ đếm, tìm kiếm, *Gần đây*, yêu thích, *Sắp hết hạn*, chip dùng chung hay liên kết "fork từ" nào. Nếu item đang mở thì màn chi tiết đóng lại | Must | §5 "Tiêu chí 7" |
| `KM-008-FR03` | Mỗi vault có một thùng rác riêng, mở từ cột trái (desktop) hoặc trang chủ (mobile), kèm số item. Danh sách xếp mới xoá trước, mỗi dòng có tiêu đề, loại, thời điểm xoá, số ngày còn lại (làm tròn lên, từ 0 tới 30), và badge ⚠ nếu item còn đánh dấu xung đột | Must | §5 "Tiêu chí 7"; intent §7 câu 4 |
| `KM-008-FR04` | Mở một item trong thùng rác chỉ để xem: xem field, hiện và copy secret theo quy tắc thường, xem lịch sử. Không sửa, fork, nhân bản hay khôi phục bản lịch sử được | Must | §5 "Tiêu chí 7" |
| `KM-008-FR05` | Khôi phục đưa item về danh sách với đủ field, lịch sử, gán env, ghi chú, trên máy đó và trên máy kia sau khi đồng bộ. Env đã xoá thì theo quy tắc toàn vẹn ở 03 | Must | §5 "Tiêu chí 7" |
| `KM-008-FR06` | Xoá vĩnh viễn một item chỉ làm được từ thùng rác, sau một bước xác nhận nêu tên item và câu ở FR08 | Must | §5 "Xoá trắng" |
| `KM-008-FR07` | Dọn thùng rác áp dụng cho vault đang chọn, sau một bước xác nhận nêu tên vault, số item và câu ở FR08. Thao tác là một lần ghi: hoặc xoá trắng hết, hoặc không có gì đổi | Must | §5 "Xoá trắng"; intent §7 câu 4 |
| `KM-008-FR08` | Câu báo nói rõ ba ý: bản cũ đã mã hoá có thể còn trong snapshot và file backup; muốn vô hiệu một secret thì phải đổi chính secret đó; thiết bị đang offline mà sửa item này thì item có thể sống lại. Câu này hiện ở hai bước xác nhận và luôn hiện trên màn thùng rác (vì tự xoá trắng không có bước xác nhận). Không câu chữ nào trong app hứa "xoá sạch", "không thể khôi phục" hay tương tự về nội dung đã xoá trắng | Must | §5 "Lời hứa đúng thực tế"; §6 "Đổi quy tắc gộp" |
| `KM-008-FR09` | Tự xoá trắng chạy sau khi mở khoá và khi mở màn thùng rác (thứ tự với phép kiểm giờ theo FR40), trên mọi vault đọc được, kể cả vault chưa chọn lần nào trên máy đó, cho item có giờ thiết bị trừ `deletedAt` lớn hơn đúng 30 × 24 giờ. Không tự xoá khi `deletedAt` ở tương lai. Vault không có gì để xoá thì không bị ghi lại. Lỗi ở bước này không chặn mở khoá | Must | §5 "Xoá trắng"; intent §7 câu 3, 4 |
| `KM-008-FR10` | Sau khi xoá trắng, app không còn hiện gì của item, kể cả trong thùng rác, và vault đã giải mã không còn tiêu đề, field, ghi chú, tag, gán env, lịch sử của item đó (03). Id của item bị bỏ khỏi *Gần đây* | Must | §5 "Xoá trắng" |
| `KM-008-FR11` | Chuyển vào thùng rác, khôi phục và xoá trắng (kể cả tự xoá) là thay đổi vault thường: lưu cục bộ trước, đẩy lên sau, gộp ở máy khác. Hai máy bất đồng cho đúng kết quả của cả 9 dòng bảng xoá ở 05. Epic không đổi quy tắc gộp | Must | §5 "Hai máy bất đồng"; §6 "Đổi quy tắc gộp" |
| `KM-008-FR12` | Item sống lại hoặc xung đột do xoá có badge ⚠ và câu nói rõ chuyện gì đã xảy ra: "đã bị xoá ở thiết bị khác" khi `conflict.attrs` có `deletedAt`, "đã bị xoá vĩnh viễn ở thiết bị khác" khi có `purgedAt`. Bản lịch sử có `note: "deleted-elsewhere"` hiện đúng câu "đã bị xoá ở thiết bị khác" thay vì chỉ "Xung đột". "Đã xử lý" (KM-006) gỡ các đánh dấu này như mọi đánh dấu khác | Must | §5 "Hai máy bất đồng" |
| `KM-008-FR13` | Form sửa đang mở không mất nội dung khi sync báo item đã vào thùng rác hoặc bị xoá trắng. Lúc lưu, người dùng chọn như bảng §3.2. *Khôi phục và lưu* là khôi phục rồi áp dụng thay đổi. *Lưu thành item mới* tạo một item mới từ form | Must | §5 "Hai máy bất đồng"; 05 "Không mất dữ liệu âm thầm" |

### Vault: tạo, đổi tên, đặt màu, đồng bộ metadata

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-008-FR14` | Tạo vault từ bộ chọn vault với tên bắt buộc và màu tuỳ chọn. Vault mới có khoá riêng, không có dữ liệu, và trở thành vault đang chọn. Không cần nhập lại mật khẩu. Làm được khi offline và khi chưa đăng ký | Must | §5 "Vault"; §1; intent §7 câu 2 |
| `KM-008-FR15` | Tên vault sau khi cắt khoảng trắng phải có 1–64 ký tự và không trùng vault khác đang có trên máy (không phân biệt hoa/thường, so ở dạng NFC). Trùng do hai máy tạo độc lập thì được giữ nguyên | Must | §5 "Vault" |
| `KM-008-FR16` | Đổi tên và đặt màu từ bộ chọn vault, làm được khi offline. Màu lấy từ cùng bảng màu của env, cộng lựa chọn không màu. Giá trị màu lạ nhận từ máy khác được hiện như không màu | Must | §5 "Vault" |
| `KM-008-FR17` | Tên và màu vault lên server chỉ ở dạng mã hoá. Thay đổi đang chờ không mất khi đóng app. Hai máy cùng đổi thì bản có thời điểm sửa muộn hơn thắng **cho cả bản metadata** (hoà thì so `dev`, theo thứ tự toàn phần ở 09), và hai máy hội tụ về cùng kết quả. Thay đổi metadata từ máy khác được nhận ở lần sync sau và không tăng version của blob | Must | §5 "Vault"; §1 "Nhận từ KM-006" |
| `KM-008-FR18` | Vault tạo ở máy khác hiện ở máy này sau lần sync sau, kể cả khi phiên đang mở, không cần mở khoá lại. Vault tạo khi offline được đẩy lên khi có mạng. Lúc đăng ký, mọi vault cục bộ đều được đưa lên, không chỉ vault mặc định. Đẩy lên giữa chừng thất bại thì lần sync sau làm tiếp, không tạo bản trùng | Must | §5 "Vault"; §1 "Nhận từ KM-006" |

### Vault: chuyển và tìm kiếm

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-008-FR19` | Bộ chọn vault nằm ở đầu cột trái (desktop) và đầu trang chủ (mobile), hiện tên, màu và vault đang chọn. Thứ tự theo `order` rồi theo id, nên hai máy hiện giống nhau. Vault mới đứng cuối. Vault hỏng hiện "không đọc được" và không chọn được | Must | §5 "Vault"; §1 |
| `KM-008-FR20` | Chuyển vault chỉ hiện dữ liệu của vault đó: project, env, item, thùng rác, bộ đếm, *Gần đây*, yêu thích. Bộ lọc, ô tìm kiếm, item đang chọn trở về mặc định. Có form chưa lưu thì hỏi như khi rời form hiện nay. Đồng bộ của các vault khác không dừng | Must | §5 "Vault" |
| `KM-008-FR21` | Vault đang chọn được nhớ theo từng thiết bị, không đồng bộ (03). *Gần đây* tính riêng cho từng vault, mỗi vault tối đa 5 | Must | §5 "Vault"; 03 "Cài đặt riêng từng thiết bị" |
| `KM-008-FR22` | Ô tìm kiếm có tuỳ chọn "mọi vault", mặc định tắt và về tắt sau mỗi lần mở khoá. Khi bật: tìm trên mọi vault đọc được, cùng phạm vi field như F-VIEW-02, không gồm item trong thùng rác hay tombstone, bỏ qua bộ lọc đang chọn. Mỗi kết quả có tên và màu vault. Chọn kết quả thì chuyển sang vault đó và mở item. Có vault không đọc được thì báo số vault bị bỏ qua | Must | §5 "Vault"; intent §7 câu 4 |
| `KM-008-FR23` | Phiên đang mở giữ `accountKey`, mọi `vaultKey` và mọi vault đã giải mã, chỉ trong bộ nhớ. Khoá app xoá hết (04). Một vault hỏng không chặn mở khoá các vault còn lại | Must | §5 "Vault"; 05 "lỗi ở vault này không chặn vault khác" |

### Vault: xoá

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-008-FR24` | Xoá vault qua một hộp xác nhận nêu tên vault, số item (gồm cả thùng rác), rằng không lấy lại được, và rằng file backup đã tải về không bị đụng tới. Phải nhập master password, kể cả khi mở khoá bằng passkey. Không có đường tắt nào không qua mật khẩu | Must | §5 "Xoá vault"; §6 "Lấy lại vault đã xoá" |
| `KM-008-FR25` | Sai mật khẩu thì không xoá, phiên không mất, app không chuyển sang màn đăng nhập, người dùng ở lại hộp xoá | Must | §5 "Xoá vault" |
| `KM-008-FR26` | Không xoá được vault cuối của tài khoản, cũng không xoá được vault đọc được cuối trên máy. Server tự kiểm và phép kiểm là nguyên tử: hai yêu cầu xoá song song hai vault cuối thì đúng một yêu cầu thành công | Must | §5 "Xoá vault"; intent §7 câu 2 |
| `KM-008-FR27` | Mỗi vault cục bộ ghi một trong ba trạng thái, không mất khi đóng app: **chưa từng gửi**, **đã gửi nhưng chưa rõ kết quả**, **đã lên server**. Trạng thái đổi sang "đã gửi nhưng chưa rõ" trước khi request rời máy. Vault **chưa từng gửi** (gồm mọi vault của tài khoản chưa đăng ký): kiểm mật khẩu tại máy, xoá cục bộ, không gọi server, làm được khi offline; lần sai không bị đếm vì không có server, giống mở khoá offline. Hai trạng thái còn lại: phải được server xác nhận; offline hoặc server lỗi thì từ chối và không đổi gì | Must | Originator chốt 2026-11-02; intent §7 câu 2; §1 "tài khoản chưa đăng ký vẫn dùng được" |
| `KM-008-FR28` | Server xác nhận xong thì máy này xoá bản cục bộ trong một lần ghi, bỏ vault đó khỏi cài đặt của thiết bị, rồi chuyển sang vault còn lại. Thay đổi chưa đẩy của chính vault đó mất theo, vì người dùng đã xác nhận xoá. Server báo vault không còn thì coi như xoá xong | Must | §5 "Xoá vault" |
| `KM-008-FR29` | Sau khi xoá, những gì server lưu không còn blob, metadata, khoá đã bọc hay snapshot của vault đó. Phần lấy và ghi vault đó trả `not_found` như vault không tồn tại, và vault không thuộc user vẫn cho cùng phản hồi đó (06) | Must | §5 "Xoá vault" |
| `KM-008-FR30` | Lần sai mật khẩu khi xoá vault bị đếm chung với đăng nhập, theo username và IP, cùng ngưỡng và cùng thời gian khoá. Đang bị khoá thì từ chối kể cả khi mật khẩu đúng. Lần đúng xử lý bộ đếm như đăng nhập đúng | Must | 04 § Xác thực; Concern 10 |
| `KM-008-FR31` | Máy kia, ở lần sync sau, nếu vault không có thay đổi nội dung chưa đẩy: xoá bản cục bộ, báo tên vault, và chuyển vault nếu đang mở vault đó | Must | §5 "Xoá vault" |
| `KM-008-FR32` | Máy kia, nếu vault có thay đổi nội dung chưa đẩy: giữ lại, báo, cho chọn. *Tạo lại trên server* đưa toàn bộ bản cục bộ lên cùng id và cùng khoá thành một vault mới trên server. *Bỏ bản trên máy này* xoá bản cục bộ sau một bước xác nhận, không cần mật khẩu. Chưa chọn thì vault vẫn đọc và sửa được, lỗi của nó không chặn vault khác, và trạng thái đồng bộ vẫn nhắc | Must | §5 "Xoá vault" |
| `KM-008-FR33` | Khi một lần sync vừa có vault mới vừa có vault bị xoá, app nhận vault mới trước, nên không lúc nào máy còn 0 vault. Form sửa đang mở trong vault bị xoá được giữ tới khi đóng | Must | §5 "Xoá vault"; 05 "Không mất dữ liệu âm thầm" |

### Kiểm giờ với server

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-008-FR38` | Mỗi lần liên lạc server trong đồng bộ (sau mở khoá, định kỳ 60 giây khi app mở, khi quay lại foreground, khi có mạng lại, khi bấm "Đồng bộ"), app so giờ thiết bị với giờ server. Lệch hơn 1 giờ, nhanh hay chậm, là lệch. Kết quả lần kiểm cuối không mất khi đóng app. Không thêm request riêng cho việc này | Must | Originator chốt 2026-11-02; intent §7 câu 3 |
| `KM-008-FR39` | Khi đang lệch: lỗi hiện ngay, nói rõ cần chỉnh giờ thiết bị, không tắt được, và mã OTP được ghi chú có thể sai. **Bị chặn:** mọi thao tác ghi vào vault hay metadata (sửa, tạo, xoá, khôi phục, dọn, tạo và đổi tên vault), xoá vault, tự xoá trắng, đẩy và nhận dữ liệu. **Vẫn được:** mở khoá, xem, hiện và copy secret, khoá app, Cài đặt, kiểm lại giờ ngay. Kiểm lại đạt thì lỗi tự mất và đồng bộ chạy lại. Không mất thay đổi nào | Must | Originator chốt 2026-11-02; 05 "Không mất dữ liệu âm thầm" |
| `KM-008-FR40` | Có phiên và có mạng: tự xoá trắng lúc mở khoá chờ phép kiểm giờ đầu tiên của lần đó, và không làm mở khoá chậm đi. Không liên lạc được server, hoặc chưa đăng ký: tự xoá theo giờ máy, trừ khi lần kiểm cuối là lệch thì không tự xoá. Khi offline mà lần kiểm cuối là lệch thì các thao tác sửa vẫn được, kèm cảnh báo, vì không có cách nào biết người dùng đã chỉnh giờ hay chưa | Must | Originator chốt 2026-11-02; intent §7 câu 3; intent KM-006 §5 "Vẫn dùng được khi không có server" |

### Ranh giới và tài liệu

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-008-FR34` | Xoay khoá vault không có trong epic: thao tác đó vẫn trả `not_found` như mọi thao tác chưa giao (06), giao diện không có lối vào | Must | §6 "Xoay khoá vault" |
| `KM-008-FR35` | `KM-003-FR47` được thu hẹp, bỏ "xoá item", "thùng rác", "chọn vault". Các mục còn lại giữ nguyên, trừ phần KM-006, KM-007 đã thu hẹp. Test đang chặn các chữ này được sửa cho khớp, không xoá cả test | Must | Concern 11 |
| `KM-008-FR36` | Tài liệu khớp lúc đóng epic: `KM-008.md` (bỏ xoay khoá, ghi gộp `meta` và "Xong khi" theo mức kiểm); `docs/06` (xoay khoá về KM-011; lỗi của đổi metadata và xoá vault, kể cả sai mật khẩu và quy tắc `401`); `docs/04` (chưa xoay được khoá vault cho tới khi có epic làm việc đó; kiểm giờ với server và rủi ro đồng hồ còn lại; giữ `accountKey` trong phiên); `docs/03` (hình dạng meta mới, cài đặt thiết bị, trạng thái gửi của vault); `docs/05` (quy tắc xoá vault theo trạng thái gửi; đồng hồ của meta); `docs/07` (trạng thái tính năng); `docs/08` (tiêu chí 7 đạt trên giả lập và server cục bộ, không hơn); `docs/09` (phần lõi đổi) | Must | §5 "Tài liệu khớp" |
| `KM-008-FR37` | Epic deploy (dự kiến `KM-014`) có thêm: hai thao tác server mới trên Cloudflare thật, gồm việc xoá có kèm body đi qua được hạ tầng thật, việc xoá dây chuyền snapshot trên D1 thật, câu hỏi về bản lưu dự phòng của D1 (Concern 15), và phép kiểm giờ trên hạ tầng thật (Concern 20) | Must | §5 "Tài liệu khớp"; §6 "Deploy" |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-008-NFR01` | Hiệu năng mở khoá (máy dev, Chrome, trung vị 5 lần) | Một vault 200 KB: vẫn ≤ 1,5 s (`KM-003-NFR08`). Năm vault, mỗi vault 200 KB: ≤ 2,5 s, kể cả bước tự xoá trắng khi không có gì để xoá. Không đạt thì quay lại PO, không tự nới |
| `KM-008-NFR02` | Hiệu năng thao tác (cùng cách đo) | Chuyển vault 1 MB plaintext: ≤ 200 ms. Chuyển vào thùng rác, khôi phục, xoá vĩnh viễn, dọn 100 item trong vault 1 MB: ≤ 500 ms mỗi thao tác. Gõ tìm "mọi vault" với 5 vault, tổng 500 item: ≤ 100 ms mỗi lần gõ |
| `KM-008-NFR03` | Zero-knowledge | Sau toàn bộ chuỗi AC, soi mọi thứ server cục bộ lưu và mọi body đã gửi: 0 lần xuất hiện tên vault, màu, master password, `accountKey`, `vaultKey`, plaintext. Server không có bản metadata hay blob dạng đọc được |
| `KM-008-NFR04` | Không rò rỉ | Theo dõi `console`, thông báo lỗi và URL trong các luồng của epic với chuỗi đánh dấu trong password, tên vault, tiêu đề item: 0 lần xuất hiện. Lỗi server theo câu cố định (06) |
| `KM-008-NFR05` | An toàn client | Đi qua mọi màn mới: 0 vi phạm CSP. Tên vault, tên item chứa `<img onerror=…>` hiện nguyên văn dạng chữ. Không `innerHTML`, không `style="…"`; màu vault đi qua lớp cố định |
| `KM-008-NFR06` | Bền vững dữ liệu | Đóng app đột ngột ở bất kỳ điểm nào của tạo vault, xoá, dọn, tự xoá: mở lại thì vault mở được, mỗi thao tác hoặc đã xong hoặc chưa làm. 0 lần mất thay đổi đã báo lưu |
| `KM-008-NFR07` | Offline | Có Service Worker và tắt mạng: mở app, mở màn thùng rác, xoá, khôi phục, dọn, tạo, đổi tên, chuyển vault, tìm mọi vault đều chạy. Chỉ xoá vault đã gửi lên server bị từ chối, kèm câu báo; vault chưa từng gửi thì xoá được |
| `KM-008-NFR08` | Tương thích dữ liệu | Tài khoản và vault tạo trước epic, gồm metadata chưa có thời điểm sửa, mở được không cần chuyển đổi. Metadata thiếu thời điểm thua mọi bản có thời điểm. Bộ vector ở `testkit/vectors.js` không đổi |
| `KM-008-NFR09` | Khả năng truy cập | Vùng chạm mới ≥ 44×44 px trên mobile. Bộ chọn vault, thùng rác, các hộp xác nhận dùng được bằng bàn phím, có tên cho trình đọc màn hình. Màu không bao giờ là tín hiệu duy nhất: luôn có tên vault. Nút Back của Android lùi đúng qua màn thùng rác và hộp xác nhận |
| `KM-008-NFR10` | Phân lớp và phụ thuộc | Quy ước `CLAUDE.md` giữ nguyên. Không thêm phụ thuộc. Lõi không đọc giờ hệ thống: hạn 30 ngày nhận `now` từ bên gọi |
| `KM-008-NFR11` | Kiểm thử | `npm test`, `npm run test:browser`, `npm run test:server` xanh. Thao tác xoá vault có test với snapshot được gieo trực tiếp vào server cục bộ, vì KM-009 chưa ghi snapshot |
| `KM-008-NFR12` | Giờ server chỉ để chặn | Giờ server không được ghi vào vault, không dùng để tính hạn 30 ngày hay đồng hồ gộp. Server trả giờ sai chỉ có thể làm app chặn nhầm hoặc không chặn, không thể gây xoá trắng. Mọi thay đổi vẫn lấy giờ thiết bị |

## 6. Acceptance criteria

Các AC ghi "từng cặp" được originator kiểm bằng tay, với dữ liệu thử, trên server cục bộ, lần lượt ở **laptop + giả lập Android** và **laptop + giả lập iOS**. Cặp nào không làm được mục nào thì mục đó quay lại originator quyết định (`intent.md` §5).

### Thùng rác

| Id | Given / When / Then |
|---|---|
| `KM-008-AC01` | *Given* hai máy đã đồng bộ *when* xoá item trên A rồi đồng bộ *then* item biến khỏi danh sách trên cả hai máy và hiện trong thùng rác (từng cặp; tiêu chí 7; FR01, FR03, FR11) |
| `KM-008-AC02` | *Given* AC01 *when* khôi phục trên B rồi đồng bộ *then* trên cả hai máy item có đủ field, lịch sử, gán env như trước khi xoá (từng cặp; tiêu chí 7; FR05) |
| `KM-008-AC03` | *Given* item trong thùng rác *when* soi mọi bộ lọc, bộ đếm, tìm kiếm, *Gần đây*, yêu thích, *Sắp hết hạn* *then* không chỗ nào có item (FR02) |
| `KM-008-AC04` | *Given* item B fork từ item A *when* xoá A *then* màn chi tiết của B không còn liên kết tới A; B không đổi (FR02) |
| `KM-008-AC05` | *Given* item trong thùng rác đang xem *when* thử mọi thao tác *then* không sửa, fork, nhân bản, khôi phục bản lịch sử được; xem field và lịch sử được (FR04) |
| `KM-008-AC06` | *Given* item đã xoá và mọi env của nó bị xoá sau đó *when* khôi phục *then* item nằm ở *Chưa gán*, `scopes` vẫn giữ id env (FR05) |
| `KM-008-AC07` | *Given* thùng rác trống *when* mở *then* có câu báo trống, không có thao tác Dọn (FR03) |
| `KM-008-AC08` | *Given* item trong thùng rác *when* xoá vĩnh viễn và xác nhận, rồi đồng bộ *then* trên cả hai máy không còn nơi nào trong app đọc được nội dung, và vault đã giải mã không còn tiêu đề, field, ghi chú, tag, lịch sử (từng cặp; FR06, FR10) |
| `KM-008-AC09` | *Given* bước xác nhận xoá vĩnh viễn *when* huỷ *then* không đổi gì (FR06) |
| `KM-008-AC10` | *Given* vault X và Y đều có item trong thùng rác, đang chọn X *when* dọn thùng rác *then* thùng rác X trống, Y không đổi, xác nhận có tên X và đúng số item (từng cặp; FR07) |
| `KM-008-AC11` | *Given* lỗi ghi lúc dọn thùng rác *when* dọn *then* báo lỗi và không item nào bị xoá trắng (FR07) |
| `KM-008-AC12` | *Given* hai bước xác nhận và màn thùng rác *when* đọc *then* cả ba chỗ có đủ ba ý của FR08 (FR08) |
| `KM-008-AC13` | *Given* toàn bộ chuỗi chữ trong giao diện *when* tìm các cụm "xoá sạch", "không thể khôi phục" và cụm tương tự về xoá trắng *then* 0 kết quả (test tĩnh; FR08) |
| `KM-008-AC14` | *Given* item có `deletedAt` cách đây 30 ngày + 1 ms, dữ liệu thử *when* mở khoá *then* item bị xoá trắng, không cần thao tác; sau khi đồng bộ, máy kia cũng vậy (từng cặp; FR09) |
| `KM-008-AC15` | *Given* item có `deletedAt` cách đây đúng 30 ngày *when* mở khoá *then* item vẫn còn, hiện 0 ngày (FR03, FR09) |
| `KM-008-AC16` | *Given* item quá hạn ở vault chưa chọn lần nào trên máy này *when* mở khoá *then* item bị xoá trắng (FR09) |
| `KM-008-AC17` | *Given* `deletedAt` ở tương lai *when* mở khoá *then* item còn nguyên, hiện còn 30 ngày (FR03, FR09) |
| `KM-008-AC18` | *Given* không có item nào quá hạn *when* mở khoá *then* không vault nào bị ghi lại hoặc đặt dirty (FR09) |
| `KM-008-AC19` | *Given* lỗi ghi ở bước tự xoá trắng *when* mở khoá *then* mở khoá vẫn thành công, lần mở khoá sau xoá trắng được (FR09) |
| `KM-008-AC20` | *Given* phiên mở, item vừa quá hạn *when* mở màn thùng rác *then* item bị xoá trắng, không hiện (FR09) |
| `KM-008-AC21` | *Given* 9 dòng bảng xoá ở 05 *when* tạo từng trường hợp bằng thao tác thật, hai máy offline rồi online *then* mỗi dòng cho đúng kết quả đã ghi, gồm cả bên sửa thắng bên xoá và item sống lại kèm badge ⚠ (từng cặp, 9 dòng; FR11) |
| `KM-008-AC22` | *Given* A chuyển item vào thùng rác, B sửa item khi offline *when* đồng bộ *then* item sống, có badge, có câu "đã bị xoá ở thiết bị khác", lịch sử có bản mang câu đó (FR12) |
| `KM-008-AC23` | *Given* A xoá trắng, B sửa item khi offline *when* đồng bộ *then* item sống lại với nội dung của B, có badge và câu "đã bị xoá vĩnh viễn ở thiết bị khác" (FR12) |
| `KM-008-AC24` | *Given* AC22 *when* bấm "Đã xử lý" ở một máy rồi đồng bộ *then* đánh dấu mất ở cả hai máy (FR12) |
| `KM-008-AC25` | *Given* form sửa đang mở trên B, A vừa xoá item *when* B đồng bộ rồi lưu, chọn *Khôi phục và lưu* *then* item sống với nội dung vừa sửa (FR13) |
| `KM-008-AC26` | *Given* form sửa đang mở trên B, A vừa xoá trắng item *when* B đồng bộ rồi lưu, chọn *Lưu thành item mới* *then* có item mới với nội dung form, tombstone giữ nguyên (FR13) |
| `KM-008-AC27` | *Given* B đang xem item với secret đang hiện *when* sync báo item bị xoá trắng *then* màn chi tiết đóng, DOM không còn giá trị đó (FR02, FR10) |

### Vault: tạo, đổi tên, màu, chuyển, tìm

| Id | Given / When / Then |
|---|---|
| `KM-008-AC28` | *Given* hai máy đã đồng bộ, phiên đang mở trên B *when* A tạo vault, đặt màu, rồi B sync *then* B thấy đúng tên và màu mà không cần mở khoá lại (từng cặp; FR14, FR16, FR18) |
| `KM-008-AC29` | *Given* tên rỗng, tên toàn khoảng trắng, 65 ký tự, trùng tên khác hoa/thường hoặc khác dạng NFC/NFD *when* tạo hoặc đổi tên *then* bị từ chối với câu báo trên form; 64 ký tự thì được (FR15) |
| `KM-008-AC30` | *Given* máy offline *when* tạo vault, thêm item, đổi tên một vault khác, rồi có mạng *then* mọi thứ lên server và máy kia thấy (FR14, FR16, FR18) |
| `KM-008-AC31` | *Given* tài khoản chưa đăng ký có hai vault *when* đăng ký *then* cả hai lên server; thiết bị mới đăng nhập thấy đủ dữ liệu (FR18) |
| `KM-008-AC32` | *Given* server đã nhận vault mới nhưng phản hồi bị mất *when* lần sync sau *then* không có bản trùng và không có lỗi hiện ra (FR18) |
| `KM-008-AC33` | *Given* hai máy offline cùng đổi tên một vault, B sửa muộn hơn *when* cả hai online, theo cả hai thứ tự đẩy *then* hai máy hiện tên của B (từng cặp; FR17) |
| `KM-008-AC34` | *Given* hai máy offline cùng đổi màu một vault *when* online *then* bản muộn hơn thắng, hai máy hiện cùng màu (từng cặp; FR17) |
| `KM-008-AC35` | *Given* A đổi tên còn B đổi màu cùng vault khi offline *when* online *then* hai máy hội tụ về nguyên bản metadata sửa muộn hơn (FR17) |
| `KM-008-AC36` | *Given* cùng thời điểm sửa, khác `dev` *when* hai máy hoà giải *then* hai máy ra cùng một bản (test lõi; FR17) |
| `KM-008-AC37` | *Given* đổi tên đang chờ *when* đóng app rồi mở lại, có mạng *then* thay đổi vẫn được đẩy lên (FR17) |
| `KM-008-AC38` | *Given* đổi tên một vault *when* đồng bộ *then* version blob của vault không tăng, version metadata tăng; thao tác với version metadata cũ bị báo xung đột kèm bản hiện tại (test server; FR17) |
| `KM-008-AC39` | *Given* vault X có project P, vault Y không *when* chuyển sang Y *then* không chỗ nào hiện dữ liệu của X, gồm bộ đếm, *Gần đây*, thùng rác (từng cặp; FR19, FR20) |
| `KM-008-AC40` | *Given* form có thay đổi chưa lưu *when* chuyển vault *then* hỏi như khi rời form hiện nay; chọn ở lại thì giữ form (FR20) |
| `KM-008-AC41` | *Given* đang ở vault Y *when* khoá rồi mở lại, hoặc tải lại trang *then* vẫn ở Y; máy kia không bị đổi vault (FR21) |
| `KM-008-AC42` | *Given* mở và copy item ở X và Y *when* chuyển giữa hai vault *then* *Gần đây* chỉ có item của vault đang chọn, tối đa 5 (FR21) |
| `KM-008-AC43` | *Given* item ở vault không đang chọn *when* bật "mọi vault" và tìm *then* item hiện cùng tên và màu vault; chọn thì chuyển vault và mở item (từng cặp; FR22) |
| `KM-008-AC44` | *Given* item trong thùng rác và tombstone ở mọi vault *when* tìm "mọi vault" *then* không có kết quả nào từ chúng (FR22) |
| `KM-008-AC45` | *Given* một giá trị chỉ nằm trong field `secret` *when* tìm "mọi vault" *then* 0 kết quả (FR22) |
| `KM-008-AC46` | *Given* đang có bộ lọc project *when* bật "mọi vault" *then* bộ lọc không giới hạn kết quả; khoá rồi mở lại thì tuỳ chọn về tắt (FR22) |
| `KM-008-AC47` | *Given* ba vault, một vault hỏng *when* mở khoá *then* hai vault kia dùng được; vault hỏng hiện "không đọc được", không chọn, không xoá được; tìm "mọi vault" báo bỏ qua 1 vault (FR19, FR22, FR23) |
| `KM-008-AC48` | *Given* phiên mở *when* khoá app *then* session không còn giữ khoá hay vault nào (FR23) |

### Vault: xoá

| Id | Given / When / Then |
|---|---|
| `KM-008-AC49` | *Given* tài khoản có hai vault, đang có mạng *when* nhập sai mật khẩu ở hộp xoá *then* không xoá, không về màn đăng nhập, vẫn ở hộp xoá, các vault nguyên vẹn (từng cặp; FR24, FR25) |
| `KM-008-AC50` | *Given* AC49 *when* nhập đúng mật khẩu *then* vault mất khỏi máy này, app chuyển sang vault còn lại (từng cặp; FR24, FR28) |
| `KM-008-AC51` | *Given* AC50, vault có snapshot được gieo *when* soi mọi bảng của server cục bộ *then* không còn blob, metadata, khoá đã bọc, snapshot của vault đó (từng cặp, kèm test server; FR29) |
| `KM-008-AC52` | *Given* máy kia không có thay đổi chưa đẩy *when* lần sync sau *then* máy kia mất bản cục bộ, có báo tên vault; đang mở vault đó thì chuyển vault (từng cặp; FR31) |
| `KM-008-AC53` | *Given* máy kia có thay đổi nội dung chưa đẩy trong vault đã xoá *when* lần sync sau *then* vault còn nguyên, có báo và hai lựa chọn; vault khác vẫn đồng bộ (từng cặp; FR32) |
| `KM-008-AC54` | *Given* AC53 *when* chọn *Tạo lại trên server* *then* vault lên server với đủ dữ liệu cục bộ; máy đã xoá thấy nó như một vault mới và mở được (từng cặp; FR32) |
| `KM-008-AC55` | *Given* AC53 *when* chọn *Bỏ bản trên máy này* và xác nhận *then* bản cục bộ bị xoá, server không đổi (từng cặp; FR32) |
| `KM-008-AC56` | *Given* vault cuối của tài khoản *when* thử xoá *then* bị từ chối cả trên máy và khi gọi trực tiếp server (`last_vault`) (từng cặp, kèm test server; FR26) |
| `KM-008-AC57` | *Given* hai vault, một vault hỏng *when* thử xoá vault đọc được *then* bị từ chối (FR26) |
| `KM-008-AC58` | *Given* hai vault cuối *when* gửi song song hai yêu cầu xoá *then* đúng một yêu cầu thành công, một yêu cầu `last_vault`, còn đúng một vault (test server; FR26) |
| `KM-008-AC59` | *Given* vault đã lên server, offline hoặc server trả 5xx *when* xoá vault với mật khẩu đúng *then* báo cần có mạng, không đổi gì (FR27) |
| `KM-008-AC60` | *Given* tài khoản chưa đăng ký, hai vault, không có server *when* xoá với mật khẩu đúng *then* xoá cục bộ; sai mật khẩu thì không xoá; không có request mạng nào (FR27) |
| `KM-008-AC61` | *Given* server đã xoá, phản hồi bị mất *when* thử lại *then* app coi như đã xong, bản cục bộ bị xoá (FR28) |
| `KM-008-AC62` | *Given* vault đã xoá nằm trong vault đang chọn đã nhớ và *Gần đây* *when* soi cài đặt thiết bị *then* không còn id của vault và item đó (FR28) |
| `KM-008-AC63` | *Given* phiên hợp lệ của user khác hoặc vault không tồn tại *when* xoá, đổi metadata *then* cùng phản hồi `not_found`, kể cả khi body sai (test server; FR29) |
| `KM-008-AC64` | *Given* vault đã xoá *when* đọc, ghi, đổi metadata bằng phiên chủ cũ *then* `not_found` (test server; FR29) |
| `KM-008-AC65` | *Given* 5 lần sai mật khẩu qua xoá vault *when* lần thứ 6 đúng mật khẩu, hoặc đăng nhập mới *then* bị từ chối với thời gian chờ; phiên đang có vẫn đọc và ghi được (test server; FR30) |
| `KM-008-AC66` | *Given* sai 4 lần qua đăng nhập *when* sai thêm 1 lần qua xoá vault *then* bị khoá, tức đếm chung (test server; FR30) |
| `KM-008-AC67` | *Given* máy chỉ có Y, máy khác đã tạo X rồi xoá Y *when* máy này sync, kể cả ngắt ở giữa *then* máy có X trước khi mất Y, không lúc nào còn 0 vault (FR33) |
| `KM-008-AC68` | *Given* form sửa đang mở trong vault bị xoá ở máy khác *when* sync *then* form còn nguyên; lưu rồi thì đi theo AC53; huỷ thì đi theo AC52 (FR33) |
| `KM-008-AC82` | *Given* tài khoản đã đăng ký, offline, vừa tạo vault N và thêm item *when* xoá N với mật khẩu đúng *then* N mất khỏi máy, không có request nào; có mạng lại thì N không xuất hiện trên server hay máy kia (từng cặp; FR27) |
| `KM-008-AC83` | *Given* vault chưa từng gửi *when* xoá với mật khẩu sai *then* không xoá, vẫn ở hộp xoá (FR25, FR27) |
| `KM-008-AC84` | *Given* vault mới đã bắt đầu gửi lên, mất mạng trước khi có phản hồi *when* xoá khi offline *then* bị từ chối với câu báo cần có mạng; đóng app mở lại thì vẫn trạng thái đó (FR27) |
| `KM-008-AC85` | *Given* AC84, server thực ra đã nhận vault *when* có mạng rồi xoá với mật khẩu đúng *then* server xoá, không còn vault mồ côi (test server và client; FR27, FR29) |
| `KM-008-AC86` | *Given* vault chưa từng gửi đang chờ đợt đẩy *when* xoá ngay trước lúc đợt đẩy chạy *then* chỉ một trong hai xảy ra: xoá thắng thì không có request; đẩy đã bắt đầu thì đi theo AC84 (FR27) |
| `KM-008-AC87` | *Given* đồng hồ thiết bị lệch 1 giờ + 1 phút, nhanh rồi chậm *when* đồng bộ *then* lỗi hiện ngay ở cả hai chiều (từng cặp; FR38, FR39) |
| `KM-008-AC88` | *Given* đồng hồ lệch 59 phút *when* đồng bộ *then* không có lỗi, app chạy thường (FR38) |
| `KM-008-AC89` | *Given* đang lệch *when* thử sửa, tạo item, xoá, khôi phục, dọn, tạo và đổi tên vault, xoá vault *then* mỗi thao tác bị từ chối kèm lý do, vault và server không đổi (từng cặp; FR39) |
| `KM-008-AC90` | *Given* đang lệch *when* mở khoá, xem, hiện và copy secret, khoá app *then* đều làm được; mã OTP có ghi chú có thể sai (từng cặp; FR39) |
| `KM-008-AC91` | *Given* đang lệch, có thay đổi chờ đẩy và form đang mở *when* chỉnh giờ rồi kiểm lại đạt *then* lỗi tự mất, form còn nguyên và lưu được, thay đổi được đẩy lên (từng cặp; FR39) |
| `KM-008-AC92` | *Given* đồng hồ nhanh 40 ngày, có mạng, item trong thùng rác mới xoá 1 ngày *when* mở khoá *then* item không bị xoá trắng, lỗi lệch giờ hiện ra (từng cặp; FR39, FR40) |
| `KM-008-AC93` | *Given* lần kiểm cuối là lệch, đóng app, offline *when* mở khoá *then* có cảnh báo, sửa được, không tự xoá trắng (FR38, FR40) |
| `KM-008-AC94` | *Given* offline, lần kiểm cuối không lệch, item quá hạn theo giờ máy *when* mở khoá *then* item bị xoá trắng; tài khoản chưa đăng ký cũng vậy, và không có request nào (FR40) |
| `KM-008-AC95` | *Given* server trả giờ giả *when* đồng bộ *then* vault không có giá trị giờ nào từ server, không item nào bị xoá trắng vì giờ đó (test client; NFR12) |

### Ranh giới, phi chức năng và tài liệu

| Id | Given / When / Then |
|---|---|
| `KM-008-AC69` | *Given* server và giao diện *when* gọi thao tác xoay khoá vault, soi giao diện *then* `not_found`, không có lối vào (FR34) |
| `KM-008-AC70` | *Given* `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` *when* chạy *then* xanh, vẫn chặn đăng nhập, backup, đổi mật khẩu và các mục chưa giao (FR35) |
| `KM-008-AC71` | *Given* lúc đóng epic *when* đọc các tài liệu ở FR36 *then* mỗi mục khớp; `KM-008.md` và `docs/06` không còn giao xoay khoá vault cho KM-008; `docs/08` ghi tiêu chí 7 đạt trên giả lập và server cục bộ, không hơn (đọc tài liệu; FR36) |
| `KM-008-AC72` | *Given* lúc đóng epic *when* đọc danh sách việc của epic deploy *then* có đủ mục ở FR37 (đọc tài liệu; FR37) |
| `KM-008-AC73` | *Given* máy dev, Chrome *when* đo theo NFR01, NFR02 *then* đạt ngưỡng, số đo ghi vào `verify.md` (NFR01, NFR02) |
| `KM-008-AC74` | *Given* sau chuỗi AC từng cặp *when* soi server và body theo NFR03 *then* 0 lần xuất hiện (NFR03) |
| `KM-008-AC75` | *Given* chuỗi đánh dấu trong password, tên vault, tiêu đề *when* đi qua các luồng và theo dõi `console`, lỗi, URL *then* 0 lần xuất hiện (NFR04) |
| `KM-008-AC76` | *Given* tên vault và item chứa `<img src=x onerror=…>` *when* hiện ở bộ chọn, thùng rác, kết quả "mọi vault" *then* hiện nguyên văn, 0 vi phạm CSP, 0 thực thi (NFR05) |
| `KM-008-AC77` | *Given* ngắt ở từng bước của tạo vault, dọn thùng rác, tự xoá trắng (test store giả lập) *when* mở lại *then* mọi vault mở được, thao tác hoặc đã xong hoặc chưa làm (NFR06) |
| `KM-008-AC78` | *Given* Service Worker đã cài, tắt mạng *when* đi qua các thao tác ở NFR07 *then* đều chạy, chỉ xoá vault đã gửi lên server bị từ chối kèm câu báo (từng cặp; NFR07) |
| `KM-008-AC79` | *Given* tài khoản và vault tạo trước epic, metadata chưa có thời điểm sửa *when* mở khoá, đổi tên *then* mở được, đổi được; `npm run vectors` không đổi (NFR08) |
| `KM-008-AC80` | *Given* mobile *when* đo vùng chạm, dùng Back của Android, đi bằng bàn phím trên desktop *then* đạt NFR09 (từng cặp Android; NFR09) |
| `KM-008-AC81` | *Given* mã epic *when* chạy `npm test`, `npm run test:browser`, `npm run test:server` *then* xanh; `dependencies` vẫn rỗng; lõi không đọc giờ hệ thống (NFR10, NFR11) |

## 7. Out of scope

- Xoay khoá vault (`intent.md` §6): về KM-011 cùng F-AUTH-09. Nghi lộ `vaultKey` thì chưa xoay được; KM-011 chỉ đánh giá nên chưa có epic nào cam kết làm.
- Xoá dấu vết trong snapshot và file backup. Xoá trắng chỉ tác động lên vault hiện tại.
- Đổi quy tắc gộp, kể cả việc thiết bị offline làm item đã xoá trắng sống lại.
- Lấy lại vault đã xoá; snapshot (KM-009); backup (KM-010).
- Chuyển hoặc sao chép item giữa các vault (F-VLT-04); mật khẩu riêng cho từng vault; chia sẻ vault.
- Sắp xếp lại thứ tự vault. Trường `order` đã có, nhưng không có thao tác đổi: vault mới đứng cuối.
- Xoá vault bị hỏng, và công cụ sửa vault hỏng.
- Tìm kiếm bên trong thùng rác; hoàn tác ngay sau khi xoá; hành động hàng loạt ngoài *Dọn thùng rác*.
- Giới hạn số vault của một tài khoản.
- Chặn xem và copy khi lệch giờ; dùng giờ server để tính hạn 30 ngày; phát hiện đồng hồ sai khi offline (Concern 3).
- Đặt lại mật khẩu khi quên, kể cả để xoá vault khi chỉ còn passkey.
- Deploy và kiểm trên điện thoại thật, Cloudflare thật: chỉ làm trong epic deploy. Đạt ở đây không chứng minh được gì trên hai môi trường đó.

## 8. Concerns

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: KM-006 mới có intent, chưa có `spec.md` hay mã đồng bộ. Spec này dựa vào KM-006 ở: sync engine theo từng vault; thanh trạng thái; badge và "Đã xử lý"; hành vi `401`; đăng ký tài khoản | Originator; Engineer | **Hoãn, owner: Engineer ở `/build-plan`, originator quyết thứ tự.** Điều đã biết để quyết: (a) không cần KM-006: phần cục bộ của thùng rác, vault trên tài khoản chưa đăng ký, phần server; (b) cần KM-006: FR11, FR12, FR17, FR18, FR31–33, FR38–40 và mọi AC "từng cặp". Epic **không đóng được** trước KM-006. Khi `spec.md` của KM-006 có, phải đối chiếu lại đoạn này; lệch thì sửa spec này trước khi implement |
| 2 | Intent §7 câu 2: có cho tạo và xoá vault khi offline hoặc chưa đăng ký không; giữ "không xoá được vault cuối" thế nào khi hai máy offline cùng xoá hai vault. `docs/03` có `vaults[].deletedAt` như thể có xoá offline, còn `docs/06` thì xoá cần `authKey` phía server | Product Owner; originator duyệt ở gate | **Originator chốt 2026-11-02.** Tạo, đổi tên, đặt màu: làm được mọi lúc. Xoá theo trạng thái gửi của vault (FR27). Vault chưa từng gửi không tồn tại ở đâu ngoài máy này, nên xoá cục bộ được kể cả khi offline; điều này không phá "vault cuối" vì server chưa từng tính vault đó. Vault đã gửi, kể cả chưa rõ kết quả, phải qua server, nên hai máy không thể cùng xoá hai vault cuối (FR26). Phải có trạng thái "chưa rõ kết quả": nếu không, mất phản hồi rồi xoá cục bộ sẽ để lại vault mồ côi trên server, và vault đó quay lại ở lần sync sau. `vaults[].deletedAt` không được dùng, luôn `null`; cách lưu ba trạng thái và việc bỏ hay giữ trường đó do Engineer chọn |
| 3 | Intent §7 câu 3: đồng hồ thiết bị chạy nhanh làm xoá trắng sớm, và xoá trắng thì lan sang máy kia qua gộp (05: bên xoá trắng thắng bên không sửa) | Product Owner; originator duyệt ở gate | **Originator chốt 2026-11-02:** dùng giờ máy, nhưng thường xuyên so với giờ server, lệch thì báo lỗi ngay, theo cách Chrome làm với đồng hồ sai (FR38–40, NFR12). Hai cách sai dẫn tới xoá trắng sớm: máy **chạy tự xoá** có đồng hồ nhanh; máy **bấm xoá** có đồng hồ chậm, làm `deletedAt` bị ghi lùi. Phép kiểm chặn được cả hai khi có server. **PO điều chỉnh so với ví dụ Chrome, chờ originator xác nhận khi duyệt:** vẫn cho xem và copy, chỉ chặn thay đổi. Lý do: chặn việc đọc không bảo vệ thêm gì, vì đọc không ghi đồng hồ, trong khi có thể khoá người dùng khỏi mật khẩu đúng lúc cần. **Ngưỡng 1 giờ do PO đặt, chưa đo:** đủ hẹp so với hạn 30 ngày, và đủ rộng để lệch nhỏ của đồng hồ không chặn người dùng. **Rủi ro còn lại, chấp nhận và ghi `docs/04`:** offline hoặc chưa đăng ký thì không có gì để so; thay đổi đã ghi khi offline với đồng hồ sai vẫn mang giờ sai sau khi chỉnh lại. Giảm nhẹ thêm: không tự xoá khi `deletedAt` ở tương lai (FR09). Còn lại để cứu: snapshot từ KM-009 và file backup |
| 4 | Intent §7 câu 4: phạm vi của thùng rác, dọn thùng rác, hạn 30 ngày và tìm "mọi vault" | Product Owner | **Đã chốt.** Thùng rác và Dọn theo vault đang chọn, vì Dọn là thao tác không lùi được nên phạm vi phải nhìn thấy được (FR03, FR07). Hạn 30 ngày chạy trên mọi vault đọc được, vì mở khoá đã giải mã hết và lời hứa 30 ngày không nên phụ thuộc vào việc có mở vault đó hay không (FR09). Tìm "mọi vault" không gồm thùng rác, đúng 03 "chỉ hiện trong Thùng rác" (FR22) |
| 5 | Intent KM-006 §7 câu 5: gộp `meta` ghi ở đâu, thay đổi `meta` từ máy khác có được nhận xuống ở KM-006 không. `KM-002` `spec.md` còn ghi việc này thuộc KM-006 | Product Owner | **Đã chốt.** KM-008 nhận trọn từ đầu tới cuối: đẩy, nhận, hoà giải (FR17). Cả nhận vault mới từ máy khác và đẩy vault tạo cục bộ (FR18). KM-006 chỉ cần không chặn việc này. Ghi vào `KM-008.md` (FR36). Nếu KM-006 làm trước phần nào thì dùng lại, không làm hai lần |
| 6 | `docs/05` ghi meta "bản có thời điểm sửa muộn hơn thắng", nhưng meta ở `docs/03` chỉ có `{ name, color, order }`, không có thời điểm nào. Server cũng không giữ được vì server không giải mã | Product Owner | **Đã chốt.** Bản meta mã hoá mang thêm thời điểm sửa và thiết bị sửa, cùng thứ tự toàn phần với đồng hồ ở 09. Thiếu thì coi như `{ at: 0, dev: '' }`, nên không cần chuyển đổi (NFR08). Sửa 03, 05, 09 (FR36). Lõi đã nhận meta tuỳ dạng nên vector không đổi; Engineer xác nhận ở `/build-plan` |
| 7 | A đổi tên, B đổi màu cùng lúc: lấy cả bản metadata thì một thay đổi mất, trái tinh thần "không mất dữ liệu âm thầm"; gộp theo thuộc tính thì giữ được cả hai | Product Owner | **Đã chốt, giữ `docs/05` và `intent.md` §5.** Cả bản, bản muộn hơn thắng (FR17, AC35). 05 đã nêu lý do "meta chỉ là tên và màu": mất một lần đổi màu thì nhìn thấy ngay và sửa lại trong vài giây, không có lịch sử nào cần giữ. Không thêm đồng hồ theo thuộc tính cho metadata |
| 8 | Tạo vault và nhận vault từ máy khác giữa phiên đều cần `accountKey`. `session.js` hôm nay không giữ khoá này, và KM-007 Concern 6 cân nhắc không giữ vì "tăng thứ có thể lộ". Không giữ thì phải hỏi lại mật khẩu mỗi lần tạo vault, và vault của máy khác chỉ hiện sau lần mở khoá sau, trái §5 "máy kia thấy sau lần sync sau" | Product Owner; originator duyệt ở gate | **Originator chốt 2026-11-02.** Giữ `accountKey` trong bộ nhớ suốt phiên, xoá khi khoá (FR23). `docs/04` đã ghi "Khoá app: xoá `accountKey`…". Phiên mở đã giữ mọi `vaultKey` và plaintext, nên thứ bị lộ thêm khi có XSS không đáng kể so với thứ đã có. **Không đổi** quyết định của KM-007: bật passkey vẫn phải nhập lại mật khẩu, vì lý do chính của nó là "ai cầm máy đang mở", không phải chỗ giữ khoá. Phần mô tả ở KM-007 Concern 6 sẽ cũ đi sau epic này |
| 9 | `docs/06` không ghi lỗi cho sai mật khẩu khi xoá vault. Dùng `401 invalid_credentials` thì đụng câu cuối 06: "Khi nhận 401, client chuyển sang màn đăng nhập", làm người dùng văng khỏi phiên chỉ vì gõ sai | Product Owner | **Đã chốt.** Hành vi: sai mật khẩu không làm mất phiên và không chuyển màn (FR25, AC49). Mã lỗi cụ thể do Engineer chọn ở `/build-plan`, phải tách được với `unauthorized`. `docs/06` ghi lại mã đó và sửa câu `401` (FR36) |
| 10 | Thao tác xoá vault nhận `authKey`, tạo thêm một đường thử mật khẩu. Không có giới hạn thì người có token (ví dụ qua XSS hoặc máy bị mất) thử mật khẩu vô hạn ở đây, vượt qua ngưỡng 5 lần sai của đăng nhập (`docs/04`). `docs/06` không nói gì | Product Owner; originator duyệt ở gate | **Originator chốt tạm 2026-11-02; originator xem lại khi có sử dụng thật.** Đếm chung bộ đếm với đăng nhập (FR30, AC65, AC66). Cái giá: gõ sai nhiều lần ở hộp xoá cũng khoá đăng nhập mới trong 15 phút; phiên đang có không bị ảnh hưởng, đúng rủi ro đã chấp nhận ở KM-005 Concern 1 |
| 11 | `KM-003-FR47` cấm hiện "xoá item, thùng rác, chọn vault"; `test/ui-static.test.js` và `test/e2e/sweep.e2e.js` đang chặn các chữ này, nên sẽ fail ngay khi có nút. KM-006 và KM-007 cũng sửa cùng danh sách | Product Owner | **Đã chốt.** FR47 cấm cho tới khi có epic giao, nên chỉ thu hẹp đúng ba mục đó (FR35). Epic đóng sau phải giữ phần các epic trước đã thu hẹp |
| 12 | `docs/06` và KM-006 chỉ đăng ký được **một** vault cùng tài khoản. Sau epic này, tài khoản chưa đăng ký có thể có nhiều vault, và KM-006 chưa tính tới | Product Owner | **Đã chốt.** Đăng ký vẫn đưa một vault như 06, các vault còn lại đi theo đường đẩy vault mới ở lần sync đầu, nên đứt giữa chừng vẫn làm tiếp được (FR18, AC31, AC32). Không đổi hợp đồng đăng ký |
| 13 | `session.js` chỉ mở `vaults[0]` và ném lỗi nếu vault đó hỏng, trái `docs/05` "lỗi ở vault này không chặn vault khác". `core/crypto.js` đã báo lỗi theo từng vault. Câu hỏi kéo theo: có cho xoá vault hỏng không, và vault hỏng có được tính vào "vault cuối" không | Product Owner | **Đã chốt.** Vault hỏng không chặn các vault khác (FR23). Không cho xoá vault hỏng: bản cục bộ hỏng không có nghĩa bản trên server hỏng, và xoá sẽ mất luôn bản lành. Không xoá được vault đọc được cuối cùng, vì nếu không người dùng còn lại đúng một vault không mở được (FR26, AC57). Mọi vault đều hỏng thì báo lỗi như hôm nay |
| 14 | Hai thứ dễ gây nhắc nhầm khi vault bị xoá ở máy khác: tự xoá trắng lúc mở khoá đặt dirty cho vault, và đổi tên đang chờ cũng là thay đổi chưa đẩy | Product Owner | **Đã chốt.** Chỉ thay đổi nội dung vault mới đi đường giữ lại (FR31, FR32); đổi tên hoặc màu đang chờ thì bỏ, vì vault đã bị chủ xoá. Tự xoá trắng vừa chạy có thể gây một lần nhắc thừa: chấp nhận, không mất gì, người dùng chọn *Bỏ* là xong |
| 15 | `intent.md` §5 kiểm "những gì server lưu" bằng cách soi server cục bộ. Trên Cloudflare thật, D1 có thể giữ các điểm khôi phục (Time Travel) trong một thời gian. Đây là hiểu biết chung về D1, **chưa kiểm** trong dự án. Nghĩa là "đã xoá" có thể không tức thì ở tầng hạ tầng, dù đó chỉ là ciphertext | Originator | **Hoãn, owner: originator ở epic deploy (FR37).** Trong epic này: lời báo xoá vault chỉ nói "không lấy lại được từ trong app", không hứa gì về tầng lưu trữ. `docs/04` ghi điểm này khi đã đo |
| 16 | `docs/03` có `recents` là một danh sách chung tối đa 5 id. Dùng chung cho nhiều vault thì đổi vault có thể thấy *Gần đây* trống, dù F-VLT-01 ghi mọi chức năng chạy trên vault đang chọn | Product Owner | **Đã chốt.** *Gần đây* riêng theo vault, mỗi vault tối đa 5 (FR21). Danh sách cũ thuộc về vault chứa các id đó; giá trị lạ về mặc định như `settings.js` đang làm. Sửa 03 (FR36) |
| 17 | Đang sửa mà sync báo item đã bị xoá: 05 chỉ nói về thay đổi đã lưu, còn form chưa lưu thì chưa có quy tắc. Lõi từ chối sửa item trong thùng rác, nên không xử lý thì người dùng thấy lỗi và mất draft | Product Owner | **Đã chốt.** Theo đúng tinh thần "bên sửa thắng" nhưng để người dùng chọn: FR13. Nếu `spec.md` của KM-006 đặt quy tắc chung cho form đang mở thì đối chiếu lại (Concern 1) |
| 18 | `intent.md` §5 đòi đủ các dòng bảng xoá trên cả hai cặp máy: 9 dòng × 2 cặp, kiểm bằng tay | Originator | **Giữ đúng intent, không tự thu hẹp** (AC21). Phép gộp đã có test tự động từ KM-002, nên đây là phép kiểm chuỗi thật. Nếu quá tốn, originator quyết thu hẹp ở `/verify`, không phải Engineer |
| 19 | Epic deploy `KM-014` chưa tồn tại; KM-006 mới là epic tạo ra nó (intent KM-006 §5). FR37 cần chỗ để ghi | Originator | **Đã chốt.** KM-008 đóng sau KM-006 nên lúc đó epic đã có. Nếu tên khác thì ghi vào epic deploy thực tế; nếu chưa có thì quay lại originator trước khi đóng |
| 20 | Phép kiểm giờ cần giờ server ở cả phản hồi `304` của lần liệt kê định kỳ. Chưa kiểm app đọc được giờ đó trên server cục bộ và trên Cloudflare thật không. Giả lập có thể lệch giờ, nên lúc kiểm có thể gặp lỗi lệch giờ thật | Engineer | **Hoãn, owner: Engineer ở `/build-plan`.** Spec chỉ đòi hành vi và không thêm request (FR38). Nguồn giờ do Engineer chọn; nếu phải thêm vào hợp đồng API thì ghi vào `docs/06`. Trên Cloudflare thật kiểm ở epic deploy (FR37) |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

# Intent — Thùng rác và quản lý vault

**Epic ID:** `KM-008`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

Hôm nay người dùng KeyMesh không xoá được item nào: tạo nhầm thì item nằm lại mãi. Họ cũng chỉ có một vault, nên không tách được dữ liệu công việc khỏi dữ liệu cá nhân, dù thiết kế đã hứa nhiều vault (Q5 ở `docs/08-roadmap.md`) và thùng rác 30 ngày (Q2).

Khoảnh khắc hỏng **chưa phải một lần lỡ tay xoá hay một lần cần tách vault**: originator xác nhận chưa gặp lần nào (2026-11-02). Khoảnh khắc hỏng là lúc đóng M5: tiêu chí chấp nhận 7 (`docs/07-features.md`) chưa có gì để chứng minh, và `docs/04-security.md` đang tính thùng rác là biện pháp chống lỡ tay xoá trong khi người dùng chưa chạm được vào nó. Epic này làm theo roadmap, không chữa một nỗi đau đang có.

**Kế thừa từ intent KM-006, không đổi:** đồng bộ theo từng vault, quy tắc gộp item, tài khoản chưa đăng ký vẫn dùng được, mức kiểm bằng giả lập và server cục bộ. KM-006 chưa có `spec.md`, nên quy tắc chi tiết lấy từ `docs/03-data-model.md` và `docs/05-sync.md`.

**Nhận từ KM-006:** gộp `meta` của vault, xử lý vault bị xoá ở thiết bị khác, giao diện tạo nhiều vault (intent KM-006 mục 1, 6).

**Đổi so với tài liệu:** xoay khoá vault rời khỏi epic này (mục 6).

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người đóng M5.** Họ cần chứng minh tiêu chí 7 trên hai thiết bị đã đồng bộ.
- **Originator, trong vai người dùng duy nhất sau này,** lúc lỡ tay xoá một item, lúc cần tách vault, hoặc lúc xoá một vault mà không lấy lại được. Đây là giả định về tương lai: chưa có sử dụng thật.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Lần vướng vì không xoá được item hoặc không có vault thứ hai | 0 lần được ghi nhận | Originator xác nhận làm theo roadmap (2026-11-02) |
| Tiêu chí chấp nhận của M5 | Tiêu chí 7 chưa đạt | M5 cần tiêu chí 6–8; tiêu chí 7 thuộc epic này (`docs/08-roadmap.md`) |
| Epic bị chặn | 0 | Không epic nào ghi KM-008 là phụ thuộc |
| Dữ liệu mất vì lỡ tay xoá hoặc gộp sai | Chưa có số liệu | Chưa có dữ liệu thật; lỗi ở đây chỉ gây hại khi đã có dữ liệu thật |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Phần lõi đã có thao tác chuyển vào thùng rác, khôi phục và xoá trắng (`src/public/js/core/model.js`, kèm test), nhưng lớp app chưa gọi tới; `test/e2e/sweep.e2e.js` còn khẳng định giao diện chưa nhắc tới thùng rác hay xoá item (đã đọc mã, 2026-11-02).
- Intent của KM-003 (mục 6) ghi originator chấp nhận rằng item tạo nhầm hoặc hết dùng chưa bỏ đi được cho tới KM-008, nên khoảng trống này là có chủ ý, không phải lỗi mới phát hiện.
- App luôn mở vault đầu tiên (`src/public/js/session.js`); chưa có cách nào tới vault thứ hai.
- `KM-008.md` ghi các thao tác phía server cho metadata và xoá vault chưa có (KM-005 giao 8 trong 18).
- **Mâu thuẫn trong tài liệu:** `KM-008.md` và `docs/06-api.md` giao xoay khoá vault cho KM-008, còn F-AUTH-09 (P3) nằm ở KM-011. Originator chốt ở mục 6.
- **Nhu cầu từ sử dụng thật: chưa có dữ liệu.** Lý do làm bây giờ là quyết định theo roadmap của originator.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Kiểm cùng mức KM-006 (originator chốt 2026-11-02): bằng tay, với dữ liệu thử, trên server chạy cục bộ, với **trình duyệt laptop cùng giả lập Android, rồi cùng giả lập iOS**. Nếu một cặp không làm được mục nào, mục đó quay lại originator quyết định.

- **Tiêu chí 7:** xoá item trên máy A thì item biến khỏi danh sách trên cả hai máy và hiện trong thùng rác. Khôi phục trên máy B thì item quay lại đủ field và lịch sử trên cả hai máy.
- **Xoá trắng:** xoá vĩnh viễn một item, hoặc dọn cả thùng rác, thì trên cả hai máy không còn đọc được nội dung item từ trong app. Item quá 30 ngày trong thùng rác cũng vậy, không cần ai thao tác.
- **Lời hứa đúng thực tế** (originator chốt 2026-11-02): trước khi xoá trắng, người dùng được báo rằng bản cũ đã mã hoá có thể còn trong snapshot và file backup, nên muốn vô hiệu secret thì phải đổi chính secret đó. Không câu chữ nào hứa "xoá sạch mọi nơi".
- **Hai máy bất đồng:** các trường hợp ở bảng xoá của `docs/05-sync.md` đều cho đúng kết quả đã ghi, gồm cả việc bên sửa nội dung thắng bên xoá và làm item sống lại kèm badge ⚠.
- **Vault:** tạo, đổi tên, đặt màu trên máy này thì máy kia thấy sau lần sync sau. Hai máy cùng đổi tên hoặc màu một vault thì bản sửa muộn hơn thắng và hai máy hội tụ về cùng kết quả (`docs/05-sync.md`). Chuyển sang vault khác chỉ thấy dữ liệu của vault đó. Tìm kiếm "mọi vault" ra được item ở vault không đang chọn và cho biết item thuộc vault nào.
- **Xoá vault:** sai mật khẩu thì không xoá; vault cuối cùng thì bị từ chối. Xoá xong thì máy kia xoá bản cục bộ ở lần sync sau, và kiểm những gì server lưu thì không còn dữ liệu hay khoá của vault đó. Máy kia đang có thay đổi chưa đẩy lên thì giữ lại, báo và cho chọn (`docs/05-sync.md`).
- **Tài liệu khớp:** `KM-008.md` và `docs/06-api.md` không còn giao xoay khoá vault cho KM-008. `KM-008.md` ghi nhận việc gộp `meta` và "Xong khi" theo mức kiểm trên. `docs/04-security.md` ghi rõ chưa xoay được khoá vault cho tới khi có epic làm việc đó. `docs/08-roadmap.md` ghi tiêu chí 7 đạt trên giả lập và server cục bộ, không hơn. Danh sách việc của epic deploy có thêm các thao tác server mới của epic này.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Xoay khoá vault** (chốt 2026-11-02): về lại KM-011 cùng F-AUTH-09. Hệ quả chấp nhận được: nghi lộ `vaultKey` thì chưa xoay được. KM-011 chỉ đánh giá, nên chưa có epic nào cam kết làm.
- **Xoá dấu vết trong snapshot và file backup** (chốt 2026-11-02): xoá trắng chỉ tác động lên vault hiện tại. File người dùng đã tải về thì không với tới được.
- **Đổi quy tắc gộp:** thiết bị offline đang sửa item vẫn làm item đã xoá trắng sống lại, đúng `docs/05-sync.md`.
- **Lấy lại vault đã xoá:** không có đường lùi, vì vậy mới phải nhập lại mật khẩu. Snapshot (KM-009) và backup (KM-010) không thuộc epic này.
- Chuyển hoặc sao chép item giữa các vault (F-VLT-04), mật khẩu riêng cho từng vault, chia sẻ vault.
- **Deploy và kiểm trên điện thoại thật, Cloudflare thật** (originator chốt 2026-11-02): cả quá trình phát triển chỉ làm và kiểm trên giả lập. Khi mọi epic phát triển đã xong mới deploy, và chỉ làm trong một epic duy nhất (intent KM-006 dự kiến là `KM-014`), gồm cả các thao tác server mới của epic này. **Hệ quả chấp nhận được:** đạt ở đây không chứng minh được gì trên hai môi trường đó; nếu Cloudflare thật buộc phải đổi gì thì phát hiện muộn. Điều kiện về secret thật ở epic đó giữ nguyên.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | KM-006 mới có intent, chưa có `spec.md` và chưa có mã đồng bộ. Epic này có phải chờ KM-006 đóng rồi mới bắt đầu làm không, hay làm được phần nào trước? | Originator; Engineer (ở `/build-plan`) |
| 2 | Tài khoản chưa đăng ký vẫn dùng được (intent KM-006 mục 5). Khi đó, hoặc khi offline, có cho tạo và xoá vault không? "Không xoá được vault cuối" giữ thế nào khi hai máy offline cùng xoá hai vault khác nhau? | Product Owner (ở `/spec`) |
| 3 | Hạn 30 ngày theo đồng hồ thiết bị. Đồng hồ sai thì item có thể bị xoá trắng sớm, và xoá trắng thì không lấy lại được từ trong app. Có chấp nhận được không? | Product Owner (ở `/spec`) |
| 4 | Thùng rác và việc dọn thùng rác áp dụng cho vault đang chọn hay mọi vault? Hạn 30 ngày có chạy cho cả vault chưa mở lần nào trên máy đó không? Tìm "mọi vault" có gồm item trong thùng rác không? | Product Owner (ở `/spec`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

# Intent — App v2 chạy cục bộ

**Epic ID:** `KM-003`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-01`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

Secret công việc của originator đang nằm rải rác trong file, ghi chú và tin nhắn chat. Khoảnh khắc hỏng: cần đúng mật khẩu hay key của một project và env, thì phải đi tìm qua nhiều nơi, không chắc bản tìm được là bản mới nhất, và nơi đang cất không được mã hoá.

KeyMesh được thiết kế để giải quyết chuyện này, nhưng hôm nay chưa có gì để dùng. KM-001 và KM-002 mới cho phần lõi chỉ gọi được từ test. Prototype `design/` bấm được nhưng dùng dữ liệu giả, không mã hoá, không lưu. Vì vậy chưa ai kiểm được bằng tay rằng quy trình thật có đúng hay không: tạo tài khoản, khoá rồi mở lại, cất item theo project/env, dùng chung một item cho nhiều env, fork, tìm rồi copy.

Epic này kế thừa từ KM-001 và không đổi cách mở khoá hay hình dạng vault (`docs/09-core-api.md`). KM-001 đã bỏ chuyển dữ liệu v1; KM-003 đi tiếp theo quyết định đó và bỏ luôn import v1 khỏi phạm vi (xem mục 6).

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người dùng duy nhất sau này.** Lúc cần lấy đúng secret của một project/env để làm việc. Trong KM-003 họ chỉ dùng dữ liệu thử, để kiểm tra quy trình trước khi tin giao secret thật.
- **Originator, trong vai người làm KM-004, KM-006 và KM-010.** Ba epic này phụ thuộc trực tiếp vào KM-003. Họ cần một app chạy được để làm tiếp, không phải định nghĩa lại cách dữ liệu được giữ và mở trên thiết bị.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Thời gian tìm secret | Chưa có số liệu | Originator chưa đo |
| Dùng nhầm env hoặc bản cũ | Chưa có số liệu | Chưa có sự cố nào được ghi lại; giả định đây là rủi ro khi secret không có một nơi chung |
| Lộ secret | Chưa có số liệu | Secret đang ở dạng không mã hoá trong file, ghi chú, chat (originator xác nhận); chưa biết có lần lộ nào |
| Epic bị chặn | 3 trực tiếp (KM-004, KM-006, KM-010); 4 gián tiếp (KM-007, KM-008, KM-009, KM-011) | Dòng "Phụ thuộc" trong `docs/epics/KM-0xx/` |
| Mốc M1 | Chưa đạt kết quả "chạy cục bộ được" | `docs/08-roadmap.md` |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Originator xác nhận secret đang rải rác trong file, ghi chú, chat (2026-11-01). **Số liệu và sự cố cụ thể: chưa có dữ liệu.**
- `src/` hôm nay chỉ có phần lõi, chưa có gì để mở ra và dùng.
- `design/README.md`: prototype "không mã hoá, không lưu và không gọi mạng", mọi dữ liệu là dữ liệu giả.
- Về v1: originator xác nhận không có file v1 thật nào cần giữ (2026-11-01), khớp với intent KM-001 mục 6.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Originator kiểm được bằng tay, trên một trình duyệt, với dữ liệu thử:

- **Thiết lập và mở khoá:** từ trình duyệt trống, lập được tài khoản cục bộ có một vault mặc định. Đóng trình duyệt rồi mở lại khi không có mạng: đúng master password thì thấy lại đủ dữ liệu, sai thì không thấy gì.
- **Khoá:** khoá thủ công, hoặc không thao tác quá thời gian mặc định (10 phút, `docs/04-security.md`), thì phải nhập lại mật khẩu mới xem được dữ liệu.
- **Một item, nhiều env:** tạo được item cả 9 loại, gán vào nhiều env kể cả khác project; sửa một lần thì mọi env đều thấy giá trị mới.
- **Tiêu chí chấp nhận 5 (`docs/07-features.md`):** fork item cho `staging`, sửa bản fork không ảnh hưởng bản ở `uat`.
- **Các chức năng còn lại trong phạm vi `KM-003.md`** làm được đúng như mô tả ở `07-features.md`.
- **An toàn:** chạy không vi phạm CSP ở `docs/04-security.md`; khi app đã khoá, soi dữ liệu nó để lại trên máy không đọc được secret nào.
- **Làm tiếp được:** KM-004, KM-006, KM-010 bắt đầu được mà không phải định nghĩa lại cách giữ dữ liệu trên thiết bị. Nếu phải sửa phần lõi thì có lý do được ghi lại.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Cất secret thật.** Chỉ có một bản dữ liệu trên một trình duyệt, xoá dữ liệu trình duyệt là mất hết. Originator chỉ dùng thật khi đã có đồng bộ hoặc backup (2026-11-01). Secret vẫn rải rác như cũ sau epic này.
- **Import file v1.** Không có file thật nào để cứu, nên đã bỏ F-DATA-02 (phần v1) và tiêu chí "import được file v1 và dùng tiếp" khỏi `KM-003.md` (originator quyết định 2026-11-01). Import backup v2 vẫn thuộc KM-010.
- **Xoá item và thùng rác** (KM-008). Originator chấp nhận rằng từ KM-003 đến lúc có KM-008, item tạo nhầm hoặc hết dùng chưa bỏ đi được.
- Server, đồng bộ, đăng ký và đăng nhập thiết bị mới, hiển thị xung đột (KM-005, KM-006).
- Cài lên điện thoại, mở offline như app đã cài, tự khoá khi chuyển nền, chỉnh thời gian tự khoá (KM-004).
- Backup và export (KM-010); đổi mật khẩu (KM-009); quản lý nhiều vault (KM-008).

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Lập tài khoản cục bộ cần những gì, khi F-AUTH-01 (username, đo độ mạnh mật khẩu) thuộc KM-006? Tài khoản cục bộ trở thành gì khi KM-006 đăng ký với server? | Originator (ở `/spec`) |
| 2 | Master password có chuẩn hoá Unicode không? `docs/09-core-api.md` nhắc phải quyết trước khi có dữ liệu thật; đổi sau là đổi định dạng | Originator (ở `/spec`) |
| 3 | "Chạy được" tính trên những trình duyệt nào? Spec KM-001 Concern 6 hoãn kiểm tra Safari/Firefox sang KM-003/KM-004 | Originator (ở `/spec`) |
| 4 | Đến đâu là đủ cho giao diện hẹp ở KM-003, đến đâu là phần "hoàn thiện mobile" của KM-004? | Originator (ở `/spec`) |
| 5 | F-VIEW-02 tìm theo tag, nhưng F-ITM-11 (tag) không nằm trong phạm vi: tìm tag có còn nghĩa gì ở epic này? | Originator (ở `/spec`) |
| 6 | Env còn sống dưới project đã xoá, item chỉ trỏ tới env đã xoá: hiển thị thế nào? Spec KM-002 Concern 10 hẹn chốt ở build-plan KM-003 | Originator (ở `/build-plan`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

# Intent — Backup, bản sao file và export Bitwarden

**Epic ID:** `KM-010`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

Theo thiết kế, dữ liệu KeyMesh chỉ nằm trong app: trình duyệt trên từng máy và, sau KM-006, server. Chủ tài khoản chưa có bản nào nằm ngoài các nơi đó, nên có ba khoảnh khắc chưa có lối ra:

- **Mất nơi chứa:** xoá dữ liệu trình duyệt, mất máy, hoặc server hỏng mà không còn máy nào giữ dữ liệu. Không có file nào để lấy lại.
- **Quên tải backup:** kể cả khi có nút tải, bản trong tay sẽ cũ dần nếu phải nhớ tải bằng tay.
- **Rời KeyMesh:** khi công ty lên Vaultwarden, chưa có cách mang dữ liệu sang mà giữ được quan hệ một item dùng chung cho nhiều `Project/env`.

Đây là các khoảnh khắc dự kiến, **chưa xảy ra lần nào**. Epic này làm theo roadmap M5 (originator chốt 2026-11-02), không chữa sự cố nào đang có.

**Kế thừa từ KM-003, không đổi:** cách giữ dữ liệu trên thiết bị và cách mở khoá. **Đổi so với brief:** thêm phụ thuộc KM-006 và KM-008 (mục 5).

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người dùng duy nhất sau này,** lúc vừa mất dữ liệu trên một máy và cần lấy lại, hoặc lúc cần chuyển sang Vaultwarden. Đây là giả định về tương lai: hôm nay chỉ có dữ liệu thử.
- **Originator, trong vai người đóng M5.** Tiêu chí 6 và 8 ở `docs/07-features.md` chỉ đạt được qua epic này.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Sự cố mất dữ liệu | 0 lần được ghi nhận | Chưa có dữ liệu thật (originator xác nhận 2026-11-02) |
| Dữ liệu mất nếu xoá trình duyệt, khi chưa có server | Toàn bộ, không lấy lại được | Rủi ro đã ghi ở intent KM-003 mục 6 |
| Tiêu chí M5 đang chờ epic này | 2 trong 3 (tiêu chí 6, 8) | `docs/08-roadmap.md` |
| Công sức chuyển sang Vaultwarden bằng tay | Chưa có số liệu | Mốc lên Vaultwarden: "chưa có thời điểm" (`docs/01-overview.md`) |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Đã đọc mã (2026-11-02): `src/` chưa có backup, import hay export. KM-003-FR47 cố ý không hiện các nút này.
- `docs/01-overview.md` G6 đặt yêu cầu chuyển được sang Vaultwarden. `docs/04-security.md` khuyên "nên tải backup định kỳ" cho trường hợp quên mật khẩu, nhưng hôm nay chưa có gì để tải.
- **Gộp thẳng có thể làm mất dữ liệu:** spec KM-009 Concern 1 đã chạy thử trên quy tắc gộp thật. Coi bản cũ như một bản `remote` thì giá trị hiện tại mất hẳn, không còn cả trong lịch sử. Import cũng đưa bản cũ vào vault, nên có nguy cơ tương tự (**chưa chạy thử riêng cho import**).
- **Tài liệu lệch nhau:** brief đòi nhập lại mật khẩu trước khi export Bitwarden, F-DATA-03 không nhắc. `docs/04-security.md` chưa có dòng nào về file export không mã hoá. Brief chỉ ghi phụ thuộc KM-003, trong khi phạm vi cần KM-006 và KM-008. Mục 5 xử lý cả ba.
- **Nhu cầu từ sử dụng thật: chưa có dữ liệu.**

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Kiểm cùng mức KM-006, KM-008, KM-009 (originator chốt 2026-11-02): bằng tay, với dữ liệu thử, trên **server chạy cục bộ, với trình duyệt laptop cùng giả lập Android, rồi cùng giả lập iOS**. Riêng bản sao file chỉ kiểm trên Chromium desktop. Epic **chỉ đóng được sau khi KM-006 và KM-008 xong** (originator chốt 2026-11-02).

- **Tải backup:** tải được file đã mã hoá cho một vault hoặc mọi vault, trên cả ba môi trường. Mở file ra không đọc được secret nào.
- **Khôi phục sau khi mất dữ liệu:** xoá sạch dữ liệu trình duyệt rồi import file vào một tài khoản: thấy lại đủ item, env đang gán, lịch sử, thùng rác. File sai định dạng, hỏng, hoặc nhập sai mật khẩu thì được báo rõ và dữ liệu đang có không đổi.
- **Import không làm mất gì** (originator chốt 2026-11-02): import vào vault đang có dữ liệu thì thứ trong file quay lại, thứ thêm sau lúc tải file vẫn còn. Cùng một item có nội dung khác nhau thì không bên nào mất: bản không hiện ra tìm lại được trong lịch sử item. Import cũng đưa được vào một vault mới. Sau khi sync, máy kia thấy cùng kết quả.
- **Tiêu chí 8:** bật bản sao file trên Chrome desktop, sửa một item. Trong ≤ 15 giây file được ghi lại; import file đó vào một tài khoản thử nghiệm, mở được bằng master password và thấy thay đổi vừa sửa.
- **Bản sao file không làm phiền:** sau khi khởi động lại trình duyệt mà mất quyền ghi, app báo cần cấp lại và mọi thứ khác vẫn chạy; cấp lại xong thì file có dữ liệu mới. Ghi lỗi thì được báo. App không bao giờ đọc file này để sync. Trình duyệt không hỗ trợ thì không thấy tuỳ chọn này nhưng vẫn tải backup được.
- **Tiêu chí 6:** export Bitwarden rồi import vào một Vaultwarden thử nghiệm **tự chạy cục bộ trên Mac** (originator chốt 2026-11-02): item "Partner X" nằm trong 2 collection `PaymentGW/uat` và `PaymentGW/staging`. Mã OTP của item login tạo ra được bên Vaultwarden và khớp với KeyMesh. Item chưa gán env vẫn có mặt.
- **Biết trước cái gì không sang được** (originator chốt 2026-11-02): export chỉ mang item đang sống. Trước khi tải, người dùng thấy lịch sử, thùng rác và liên kết fork sẽ không sang, kèm số lượng.
- **File không mã hoá là việc có ý thức** (originator chốt 2026-11-02): không nhập lại đúng mật khẩu thì không export được; người dùng được báo rõ file không mã hoá trước khi tải.
- **Tài liệu khớp:** `KM-010.md` ghi thêm phụ thuộc KM-006 và KM-008. F-DATA-03 ở `docs/07-features.md` ghi điều kiện nhập lại mật khẩu. `docs/04-security.md` có rủi ro file export không mã hoá và rủi ro ghi đè ở mục 6.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Bản sao file chống lỗi của chính mình** (originator chấp nhận 2026-11-02): chỉ có một file và bị ghi đè, nên sửa sai hay xoá vault thì vài giây sau bản tốt trước đó cũng mất. Bản sao chống mất trình duyệt và mất máy. Quay lại bản cũ là việc của file tải tay và snapshot (KM-009).
- **Mang lịch sử, thùng rác, liên kết fork sang Bitwarden** (originator chốt 2026-11-02): Bitwarden không có chỗ chứa tương ứng, và mang theo thì thêm secret cũ vào file không mã hoá.
- **Bảo vệ file Bitwarden sau khi đã tải:** từ lúc đó là trách nhiệm của người dùng. App không theo dõi hay xoá được file đó.
- **Thu hồi file backup đã tải:** đổi mật khẩu không ảnh hưởng file đã ra ngoài, file đó vẫn mở bằng mật khẩu cũ (đã chấp nhận ở KM-009 Concern 23).
- **Import từ Bitwarden hay file v1 vào KeyMesh** (v1: Q8 ở `docs/08-roadmap.md`), export plaintext JSON/CSV (F-DATA-04, P3).
- **Quyết định cất secret thật:** đóng epic không tự mở điều kiện nào ở `docs/04-security.md` hay `docs/08-roadmap.md`.
- **Deploy, Cloudflare thật, điện thoại thật** (originator chốt 2026-11-02): thuộc `KM-014`.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Cách khôi phục của KM-009 (FR28–FR31) có dùng lại được cho import không? Khác biệt: file có thể đến từ tài khoản khác hoặc mật khẩu cũ, và không có sẵn trên server. Bản cũ trong thùng rác, item đã xoá trắng, lịch sử giới hạn 20 bản xử lý thế nào? "Không mất gì" có cùng nghĩa hẹp như KM-009 Concern 2 không? | Product Owner (ở `/spec`) |
| 2 | File chứa nhiều vault mà chọn "vault đang chọn" thì các vault gộp vào một, hay người dùng chọn từng vault? Vault trùng id với vault đang có thì sao? | Product Owner (ở `/spec`) |
| 3 | Tiêu chí 8 ghi "mở được bằng master password": mật khẩu của file hay của tài khoản đang đăng nhập? Tài khoản thử nghiệm có thể có mật khẩu khác | Originator (ở `/spec`) |
| 4 | Đăng xuất rồi đăng nhập tài khoản khác trên cùng trình duyệt: bản sao có ghi đè file của tài khoản trước không? | Product Owner (ở `/spec`) |
| 5 | Item loại không phải login và các loại field không có tương ứng ở Bitwarden thì sang thành gì? Bản Vaultwarden đang chạy có nhận định dạng tổ chức đã mô tả không? Chưa kiểm | Product Owner (ở `/spec`), Engineer (ở `/build-plan`) |
| 6 | Tải file và chọn file trên giả lập Android, iOS có làm được không? Lấy file ra để kiểm bằng cách nào? Chưa đo. Không làm được thì quay lại originator | Engineer (ở `/build-plan`) |
| 7 | Dựng Vaultwarden cục bộ trên Mac cần gì, có sẵn công cụ chưa? Chưa kiểm | Engineer (ở `/build-plan`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

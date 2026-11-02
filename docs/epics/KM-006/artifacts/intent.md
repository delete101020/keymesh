# Intent — Đồng bộ đa thiết bị

**Epic ID:** `KM-006`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

KeyMesh hứa cùng một dữ liệu trên nhiều thiết bị và vẫn dùng được khi offline (G3, `docs/05-sync.md`). Hôm nay app và server là hai nửa chưa từng gặp nhau: app chỉ biết dữ liệu trên một trình duyệt, server của KM-005 chỉ mới được test đóng vai thiết bị gọi.

Khoảnh khắc hỏng **chưa phải một lần cần secret ở máy khác**: originator xác nhận vẫn chưa gặp lần nào như vậy (2026-11-02). Khoảnh khắc hỏng là lúc đóng M3: tạo item trên laptop thì máy kia không thấy gì, nên chưa ai kiểm được tiêu chí 1–3 của `docs/07-features.md`, cũng chưa biết phép gộp của KM-002 có giữ đúng lời hứa "không mất dữ liệu âm thầm" khi hai thiết bị thật sự sửa offline hay không. Epic này làm theo roadmap để giảm rủi ro, không chữa một nỗi đau đang có.

**Kế thừa, không đổi:** bộ khoá và dạng dữ liệu của KM-001, KM-003 (đăng ký chính bộ khoá đang có, không mã hoá lại, KM-003 Concern 1); quy tắc gộp của KM-002; hợp đồng và ngưỡng chống dò của KM-005.

**Đổi so với các epic trước:**

- **Deploy ra khỏi epic này** (originator chốt 2026-11-02). KM-005 và `KM-006.md` đang giao deploy và mọi việc kiểm trên Cloudflare cho KM-006; các việc đó chuyển sang một epic mới (xem mục 5, 6). Quyết định Q1 ở `docs/08-roadmap.md` (`pages.dev` trước) không đổi, chỉ muộn hơn.
- **"Điện thoại thật" trong "Xong khi" của `KM-006.md` đổi thành giả lập** (originator chốt 2026-11-02), cùng mức M2.
- **Gộp `meta` của vault:** KM-002 giao cho KM-006, nhưng thao tác đổi metadata thuộc KM-008 và app chưa có chỗ đổi tên hay màu vault. Epic này không có gì để gộp, nên việc này đi cùng KM-008 (xem mục 7, câu 5).

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người đóng M3.** Họ cần biết tiêu chí 1–3 có đạt được không, trên hai thiết bị nối qua một server, trước khi xây tiếp.
- **Originator, trong vai người làm KM-008, KM-009, KM-011.** Ba epic này phụ thuộc trực tiếp vào KM-006.
- **Originator, trong vai người dùng duy nhất có hai thiết bị sau này,** lúc sửa một secret khi offline. Đây là giả định về tương lai: hôm nay chưa có secret thật nào trong KeyMesh, và epic này cũng không đưa lên.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Lần cần secret ở máy khác mà không có | 0 lần được ghi nhận | Originator xác nhận làm theo roadmap (2026-11-02) |
| Mất dữ liệu do sửa ở hai nơi | 0 lần được ghi nhận | Chưa có đồng bộ nên chưa thể xảy ra; đây là rủi ro theo thiết kế |
| Epic bị chặn | 3 trực tiếp (KM-008, KM-009, KM-011) | Lấy từ dòng "Phụ thuộc" trong `docs/epics/` |
| Mục tiêu M3 | Chưa đạt | Tiêu chí 1–3 đều cần hai thiết bị nối qua server |
| Giá của việc hoãn deploy | Chưa có số liệu | Giả định: nếu giới hạn của Cloudflare thật buộc đổi ngưỡng (KM-005 Concern 5, ước lượng 2 880 lần ghi/ngày, 10 ms CPU mỗi request), thì phát hiện càng muộn càng có nhiều phần đã xây trên ngưỡng cũ |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Mã client chưa có gì gọi server và chưa dùng phép gộp: tìm trong `src/public/js` không thấy lời gọi mạng nào tới `/api/`, ngoài `core/` không có chỗ nào import `merge.js` (đã đọc, 2026-11-02).
- `session.js` lập tài khoản với `userId` và `username` để trống, đúng phần KM-003 chuyển sang. Giao diện chỉ nhắc `conflict` ở nhãn lịch sử, chưa có chỗ nào cho thấy xung đột trên item.
- KM-005 `verify.md`: 59/59 tiêu chí đạt, nhưng chỉ trên môi trường cục bộ và bằng test đóng vai thiết bị.
- Giả lập Android và iOS đã từng chạy app qua máy dev (KM-004), nên mức kiểm này có tiền lệ. **Chạy cùng server cục bộ thì chưa ai thử.**
- Không epic nào sau này ghi là cần bản deploy (`KM-007` đến `KM-013`, đã tìm 2026-11-02), trừ câu hỏi về domain ở intent `KM-007` mục 7.
- **Nhu cầu từ sử dụng thật: chưa có dữ liệu.** Lý do làm bây giờ là quyết định theo roadmap của originator.
- **Cloudflare thật: chưa có dữ liệu.** Mọi số về gói Free vẫn là ước lượng trên giấy hoặc đo trên Node.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Originator kiểm được bằng tay, với dữ liệu thử, trên server chạy cục bộ, với **trình duyệt laptop cùng giả lập Android, rồi cùng giả lập iOS** (originator chốt 2026-11-02). Nếu một cặp không làm được mục nào, mục đó quay lại originator quyết định, không tự coi là đạt hay tự bỏ.

- **Tiêu chí 1, 2, 3 (`docs/07-features.md`), kể cả hai ý con của tiêu chí 3,** đạt trên từng cặp. M3 khi đó được ghi là **đạt trên giả lập và server cục bộ**, không hơn.
- **Giữ dữ liệu đang có:** tài khoản cục bộ đã có dữ liệu đăng ký xong thì vẫn mở được bằng mật khẩu cũ, thấy đủ dữ liệu, và lần đồng bộ đầu đưa đúng dữ liệu đó lên.
- **Thiết bị mới:** đăng nhập trên thiết bị trống thì thấy đủ dữ liệu và mở khoá được cả khi offline sau đó.
- **Không mất âm thầm** (originator chốt 2026-11-02): đăng nhập trên máy đã có tài khoản cục bộ khác, hoặc đăng xuất khi còn thay đổi chưa đẩy lên, thì dữ liệu cục bộ không mất mà người dùng không biết và không đồng ý.
- **Đăng xuất:** không chọn xoá thì dữ liệu còn trên máy; chọn xoá thì soi dữ liệu app để lại không đọc được gì của tài khoản đó. Thiết bị kia không bị ảnh hưởng.
- **Vẫn dùng được khi không có server:** mất mạng hay server tắt thì đọc và sửa vẫn chạy, có mạng lại thì tự đồng bộ, không mất thay đổi nào. Tài khoản chưa từng đăng ký vẫn dùng được như M1, M2.
- **Nhìn thấy trạng thái:** mỗi trạng thái ở bảng "Thông báo và trạng thái" của 07 đều tạo ra được và hiện đúng; người dùng tự kích hoạt đồng bộ được ngay. Lỗi ở một vault không chặn vault khác.
- **Thấy đúng chỗ xung đột:** sau tiêu chí 3, đúng field bị xung đột được đánh dấu, bản thua tìm lại được trong lịch sử. Bấm "Đã xử lý" ở một máy thì sau khi đồng bộ, đánh dấu mất ở cả hai máy.
- **Server không đọc được gì:** sau toàn bộ chuỗi trên, soi những gì server cục bộ đã lưu thì không có master password, plaintext vault hay khoá giải mã (giữ nguyên nghĩa ở intent KM-005 mục 5).
- **Tài liệu khớp:** `KM-006.md` ghi đúng phạm vi và "Xong khi" mới. Có epic mới (dự kiến `KM-014`, chỉ ghi việc, chưa code, chưa xếp mốc) nhận đủ danh sách ở mục 6, ghi rõ phải xong trước khi đưa secret thật lên server. `docs/08-roadmap.md` ghi đúng mức đạt của M3 và điều kiện còn lại; `docs/04-security.md` trỏ tới epic đó.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Deploy và mọi việc kiểm trên Cloudflare thật** (chốt 2026-11-02), chuyển sang epic mới, gồm: header thật (KM-004, KM-005 Concern 12); phần còn lại của AC25 (Concern 4) và request không có IP; binding và `database_id` thật; đặt `ALLOWED_ORIGINS`, `REGISTRATION_TOKEN`, `SERVER_SECRET`; xác nhận tài khoản và đo gói Free (Concern 5); lỗi giới hạn dòng D1 thật (Concern 11); câu lỗi trùng khoá trên D1 thật (KM-005 `review.md` finding 1); `ETag` dạng yếu qua hạ tầng thật (Concern 16). **Hệ quả chấp nhận được:** đạt ở epic này không chứng minh được gì về Cloudflare thật; nếu giới hạn gói Free buộc đổi ngưỡng thì phát hiện muộn hơn.
- **Kiểm trên điện thoại thật** (chốt 2026-11-02), chuyển sang cùng epic mới, gồm số đo tốc độ gộp trên máy thật (KM-002 Concern 12). iPhone thật cũng cần HTTPS thật, tức là cần bản deploy.
- **Đưa secret thật lên server** (chốt 2026-11-02): epic này chỉ dùng dữ liệu thử và không hứa gì về chuyện đó. KM-005 Concern 18 vẫn mở, cộng thêm điều kiện epic mới phải xong.
- Đổi tên, đổi màu, xoá vault, cùng việc gộp `meta` và xử lý vault bị xoá ở thiết bị khác (KM-008). Đổi mật khẩu, thu hồi phiên, thiết bị, snapshot, nhật ký (KM-009).
- Giao diện tạo nhiều vault (KM-008): đồng bộ vẫn theo từng vault, nhưng app chỉ có sẵn một vault.
- Passkey (KM-007); backup và bản sao ra file (KM-010); chia sẻ vault giữa nhiều người.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Giả lập Android, giả lập iOS và trình duyệt laptop có cùng nối được vào một server cục bộ, với secure context và đúng Origin không? Giả lập iOS chạy trên máy Mac, còn chế độ offline của giả lập có tách được khỏi server không? Chưa ai chạy thử | Engineer đo sớm (ở `/build-plan`); originator quyết nếu không làm được |
| 2 | "Không mất âm thầm" cụ thể là gì trên máy đã có tài khoản cục bộ khác: giữ, gộp, hay chặn cho tới khi người dùng chọn? Hai tài khoản có khoá khác nhau | Product Owner (ở `/spec`); originator duyệt |
| 3 | Đăng xuất khi còn thay đổi chưa đẩy lên và không có mạng thì người dùng được chọn gì? | Product Owner (ở `/spec`) |
| 4 | Tiêu chí 1 ghi "≤ 60 giây": tính khi app đang mở trên máy nhận, hay cả khi app đang ở nền hoặc đã khoá? 07 không nói, và hành vi ở nền trên giả lập chưa chắc giống máy thật | Product Owner (ở `/spec`) |
| 5 | Gộp `meta` chuyển sang KM-008 như mục 1: `KM-008.md` chưa ghi việc này. Ghi thêm ở đâu, và thay đổi `meta` từ thiết bị khác có cần được nhận xuống ở epic này không? | Product Owner (ở `/spec`) |
| 6 | KM-007 đang chạy song song và cũng đụng tới cách mở khoá trên thiết bị. Đăng xuất có xoá dữ liệu thì phải làm gì với phần passkey, và epic nào chịu nếu KM-007 đóng trước hoặc sau? | Product Owner (ở `/spec`) |
| 7 | Epic mới chưa có mốc. Originator muốn làm nó khi nào so với KM-008, KM-009, khi Cost mục 3 nói phát hiện càng muộn càng tốn? | Originator |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

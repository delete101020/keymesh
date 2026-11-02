# Intent — Mở khoá bằng passkey (WebAuthn PRF)

**Epic ID:** `KM-007`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

KeyMesh chỉ mở khoá được bằng master password. Theo thiết kế, từ KM-004 điện thoại tự khoá sau 60 giây ở nền, nên mỗi lần quay lại app quá thời gian đó, người dùng phải gõ lại một mật khẩu dài trên bàn phím điện thoại. Tiêu chí chấp nhận 4 (`docs/07-features.md`) hứa điều ngược lại: đang ở chế độ máy bay, mở bằng Face ID và xem được dữ liệu. Hôm nay chưa thiết bị nào làm được.

Khoảnh khắc hỏng **chưa phải một lần gõ mật khẩu thấy phiền**: originator xác nhận chưa gặp lần nào như vậy (2026-11-02). Khoảnh khắc hỏng là lúc đóng M4: chưa có gì để chứng minh tiêu chí 4, và chưa ai biết lời hứa đó có giữ được trên các nền tảng đích hay không. Epic này làm theo roadmap để giảm rủi ro, không chữa một nỗi đau đang có.

Epic kế thừa từ KM-001 và KM-004, giữ nguyên cách bọc khoá, cách giữ dữ liệu trên thiết bị và việc tự khoá. Điều duy nhất thay đổi: có thêm một cách mở khoá trên thiết bị, song song với master password chứ không thay thế.

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người đóng M4.** Họ cần biết tiêu chí 4 có đạt được không, trước khi tính tới việc dùng KeyMesh trên điện thoại.
- **Originator, trong vai người dùng duy nhất sau này,** lúc cần lấy một secret trên điện thoại sau khi app đã tự khoá. Đây là giả định về tương lai: hôm nay chưa có secret thật nào trên điện thoại, và điều kiện từ KM-004 vẫn còn hiệu lực.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Lần thấy phiền vì phải gõ master password | 0 lần được ghi nhận | Originator xác nhận làm theo roadmap (2026-11-02) |
| Tiêu chí chấp nhận của M4 | Chưa đạt | Tiêu chí 4 ở `docs/07-features.md` là kết quả kiểm chứng duy nhất của M4 (`docs/08-roadmap.md`) |
| Epic bị chặn | 1 | KM-009 chỉ đóng được sau khi KM-007 xong (originator chốt 2026-11-02, `docs/epics/KM-009/artifacts/intent.md` §5) |
| Thời gian gõ mật khẩu so với mở bằng sinh trắc học | Chưa có số liệu | Chưa đo trên thiết bị nào |
| Số lần mở khoá mỗi ngày trên điện thoại | Chưa có số liệu | Chưa có sử dụng thật |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Mã client hôm nay không có đường mở khoá nào ngoài master password; phần lõi của KM-001 đã có thao tác dẫn xuất và bọc khoá dành cho passkey, kèm test (`docs/09-core-api.md`, `KM-001-AC09`). Chưa có gì nối phần đó với thiết bị thật (đã đọc mã, 2026-11-02).
- `docs/04-security.md` liệt kê nền tảng hỗ trợ, nhưng **chưa ai chạy thử trên nền tảng nào trong dự án này**. Giả lập của KM-004 là iPhone 16 iOS 18.6 và Android 15 Chrome 124; tài liệu không nêu phiên bản tối thiểu cho Chrome Android.
- `docs/04-security.md` ghi "passkey đòi sinh trắc học". Hệ điều hành có thể cho nhập mã máy thay thế: đây là hiểu biết chung, **chưa đo trong dự án**.
- **Nhu cầu từ sử dụng thật: chưa có dữ liệu.** Lý do làm bây giờ là quyết định theo roadmap của originator.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Originator kiểm được bằng tay với dữ liệu thử, trên **máy giả lập iOS và Android** (originator chốt 2026-11-02, cùng mức với M2). Nếu giả lập không làm được một mục nào, mục đó quay lại originator quyết định, không tự coi là đạt hay tự bỏ.

- **Tiêu chí 4, trên giả lập iOS:** bật passkey cho thiết bị, tắt mạng, mở lại app, mở khoá bằng Face ID giả lập và xem được dữ liệu.
- **Chrome trên giả lập Android:** cùng chuỗi trên, bằng xác thực của thiết bị.
- **Theo từng thiết bị:** bật hoặc tắt trên máy này không đổi gì ở máy khác. Tắt rồi thì không còn mở được bằng passkey trên máy đó.
- **Thiết bị không hỗ trợ:** người dùng được báo rõ là không dùng được, và không rơi vào trạng thái nửa bật nửa tắt.
- **Luôn còn đường dự phòng:** sau khi bật, huỷ hoặc thất bại lúc xác thực bằng passkey, master password vẫn mở được ngay.
- **Đổi mật khẩu không làm hỏng passkey, kiểm ở mức khoá** (originator chốt 2026-11-02): chuyển khoá tài khoản sang mật khẩu mới thì passkey vẫn mở ra đúng dữ liệu đó. Luồng đổi mật khẩu đầy đủ vẫn do KM-009 kiểm.
- **Không gọi tới server:** mở khoá bằng passkey không cần mạng và không gửi gì lên server.
- **Tài liệu khớp:** `KM-007.md` mục "Xong khi" và `docs/08-roadmap.md` ghi đúng là đạt trên giả lập, kèm điều kiện ở dòng đầu mục 6. `docs/04-security.md` đổi "đòi sinh trắc học" thành "đòi xác thực của thiết bị".

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Kiểm trên iPhone và điện thoại Android thật** (chốt 2026-11-02): M4 đạt trên giả lập không chứng minh tiêu chí 4 trên máy thật. Điều kiện từ KM-004 giữ nguyên: **chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại.**
- **Chỉ cho phép sinh trắc học** (chốt 2026-11-02): chấp nhận rằng ai biết mã máy có thể mở vault trên thiết bị đã bật passkey, không cần master password. Passkey là tuỳ chọn theo từng thiết bị, nên chỉ bật ở máy có mã máy đủ an toàn.
- Luồng đổi mật khẩu đầy đủ (KM-009). Xoay khoá tài khoản và việc huỷ passkey đi kèm (KM-011 đánh giá, chưa có epic làm). Dùng passkey để đặt lại mật khẩu khi quên (epic sau, chưa có mã). Originator chốt 2026-11-02, ở bước intent KM-009; trước đó dòng này giao cả ba cho KM-009.
- Đăng nhập server bằng passkey (`docs/04-security.md`: chỉ mở khoá cục bộ).
- Đồng bộ trạng thái bật passkey giữa các thiết bị; chuyển passkey khi đổi domain (phải đăng ký lại, `docs/04-security.md`).

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Giả lập iOS và Android có làm được toàn bộ chuỗi này không, kể cả ở chế độ không có mạng? Chưa ai chạy thử. Nếu không thì tiêu chí nào thay thế? | Engineer đo sớm (ở `/build-plan`); originator quyết nếu không làm được |
| 2 | Bản mở khoá nằm trên thiết bị nhưng passkey có thể được nền tảng đồng bộ sang máy khác hoặc bị xoá ngoài app. Khi đó "theo từng thiết bị" có còn đúng, và người dùng thấy gì? | Product Owner (ở `/spec`) |
| 3 | Passkey gắn với domain, mà KM-006 chưa deploy nên chưa có domain thật. Có ảnh hưởng gì khi ngày sau dùng trên domain thật, ngoài việc phải đăng ký lại? | Engineer (ở `/build-plan`) |
| 4 | Thiết bị đang tắt mạng thì có bật passkey được không, hay chỉ mở khoá mới cần chạy offline? | Product Owner (ở `/spec`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

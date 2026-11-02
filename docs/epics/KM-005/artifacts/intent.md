# Intent — Server: D1, xác thực và API vault

**Epic ID:** `KM-005`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-01`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

KeyMesh hứa dữ liệu theo người dùng qua nhiều thiết bị và server không đọc được dữ liệu (G3, G4 trong `docs/01-overview.md`), nhưng hôm nay chưa có nơi nào ngoài trình duyệt để giữ một vault. Thiết kế phía server mới nằm trên giấy; chưa dòng nào chạy.

Khoảnh khắc hỏng **chưa phải một lần cần secret ở máy khác**: originator xác nhận chưa gặp lần nào như vậy (2026-11-01). Khoảnh khắc hỏng là lúc mở KM-006: người làm đồng bộ không có gì để nối vào, không thử được đăng nhập trên máy thứ hai, cũng không thử được hai máy cùng ghi một vault. Epic này làm theo roadmap để mở đường cho M3, không chữa một nỗi đau đang có.

Phần server còn phải giữ đúng lời hứa bảo mật khi nằm trên địa chỉ công khai, ai cũng gọi được: người lạ không dò ra username nào có thật, không thử mật khẩu liên tục được, không chạm được vault của người khác.

Epic kế thừa từ KM-001 và không đổi cách mở khoá hay hình dạng dữ liệu đã định ở đó: server chỉ cất và trả lại các khối đã mã hoá.

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người làm KM-006.** Lúc viết đồng bộ, họ cần một đối tác thật để thử đăng nhập, đọc, ghi và xung đột version.
- **Originator, trong vai người dùng duy nhất sau này,** lúc lần đầu đưa vault lên server. Đây là giả định về tương lai: hôm nay chưa có secret thật nào trong KeyMesh trên server, vì chưa có server.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Lần cần secret ở máy khác mà không có | 0 lần được ghi nhận | Originator xác nhận làm theo roadmap (2026-11-01) |
| Epic bị chặn | 1 trực tiếp (KM-006); 3 gián tiếp (KM-008, KM-009, KM-011) | Lấy từ dòng "Phụ thuộc" trong `docs/epics/` |
| Mục tiêu M3 | Chưa bắt đầu được | Tiêu chí 1–3 ở `docs/07-features.md` đều cần hai thiết bị nối qua server |
| Thiệt hại nếu server lộ dữ liệu hoặc cho dò mật khẩu | Chưa có số liệu | Giả định: lỗi ở đây chỉ gây hại khi đã có dữ liệu thật trên server, nên càng phát hiện trước lúc đó càng rẻ |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- `src/` hôm nay không có phần server nào và `package.json` không có công cụ chạy server cục bộ (đã đọc, 2026-11-01). Test của KM-004 xác nhận app chạy được khi không có server và mọi lời gọi `/api` đều thất bại.
- `docs/epics/KM-006/KM-006.md` ghi KM-005 là phụ thuộc.
- `docs/epics/KM-005/KM-005.md` tự mâu thuẫn về phạm vi và về deploy; các quyết định ở mục 5 và 6 chốt lại hai điểm đó.
- **Nhu cầu đồng bộ từ sử dụng thật: chưa có dữ liệu.** Lý do làm bây giờ là quyết định theo roadmap của originator.
- **Có ai đang dò server không: chưa có dữ liệu.** Chưa có server. Các ngưỡng chống dò ở mục 5 lấy từ thiết kế (`docs/04-security.md`), chưa từ sự cố nào.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Tất cả kiểm được bằng lệnh chạy trên môi trường cục bộ, không cần tài khoản Cloudflare (originator chốt 2026-11-01, xem mục 6).

- **Đủ cho KM-006:** với server chạy cục bộ, hai thiết bị giả lập đi được hết chuỗi: đăng ký kèm bộ khoá đã có từ trước (KM-003 Concern 1), đăng nhập trên thiết bị thứ hai, liệt kê, tạo, đọc và ghi vault, nhận đúng báo xung đột khi hai bên ghi cùng một version, đăng xuất. Người làm KM-006 không phải sửa server để bắt đầu.
- **Từ chối đúng:** sai Origin, token thiếu, sai, hết hạn hoặc đã mất hiệu lực đều bị từ chối. Vault của người khác và vault không tồn tại cho **cùng một** kết quả, không phân biệt được.
- **Không dò được:** từ bên ngoài không phân biệt được username có thật hay không. Đăng ký chỉ mở khi có token đăng ký hợp lệ.
- **Không thử liên tục được:** sau 5 lần sai cho mỗi username, hoặc 20 lần cho mỗi IP, trong 15 phút thì bị khoá 15 phút (`docs/04-security.md`); hết khoá thì đăng nhập lại được.
- **Server không đọc được gì:** sau chuỗi trên, kiểm toàn bộ những gì server đã lưu thì không có master password, không có plaintext vault, không có khoá giải mã, và token phiên hay khoá xác thực không nằm ở dạng gốc. `authKey` vẫn được gửi lên theo thiết kế; nó không giải mã được dữ liệu. Câu "không bao giờ nhận plaintext hay khoá" ở `KM-005.md` phải hiểu theo nghĩa này.
- **Tài liệu khớp:** `KM-005.md` ghi đúng phạm vi mới ở "Xong khi" (không còn "mọi endpoint"); việc kiểm header trên Cloudflare chuyển sang `KM-006.md`; `KM-008.md` và `KM-009.md` ghi rõ nhận phần API của mình; `docs/03-data-model.md` và `docs/04-security.md` ghi rằng giữ bản cũ và nhật ký chỉ có từ KM-009.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Phần API không phục vụ đồng bộ** (chốt 2026-11-01): đổi metadata, xoá vault và xoay khoá vault (KM-008), đổi mật khẩu, xoay khoá tài khoản, thiết bị, snapshot, nhật ký (KM-009). Epic này giao 8 trong 18 endpoint của `docs/06-api.md`. Hệ quả chấp nhận được: trước KM-009 không có cách thu hồi phiên của máy bị mất hay đổi master password.
- **Giữ bản cũ của vault và ghi nhật ký hoạt động** (chốt 2026-11-01): chỉ chừa chỗ, chưa ghi. Hệ quả chấp nhận được: lần ghi đè trước KM-009 không khôi phục được từ server, lần đăng nhập sai không để lại dấu vết để xem lại. **Điều kiện đi kèm: xem lại trước khi đưa secret thật lên server.** Đếm lần sai để khoá vẫn thuộc epic này.
- **Deploy lên Cloudflare và kiểm header thật** (chốt 2026-11-01): chuyển sang KM-006, nơi app đã nối với server. Đạt trên môi trường cục bộ không chứng minh được hành vi trên Cloudflare thật cho tới lúc đó.
- App nói chuyện với server, đồng bộ, gộp dữ liệu, thanh trạng thái, màn đăng ký và đăng nhập (KM-006).
- Xác thực server bằng passkey (`docs/04-security.md`: passkey chỉ mở khoá cục bộ).
- Chia sẻ vault giữa nhiều người.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Biết username là khoá được đăng nhập của chủ tài khoản 15 phút bằng 5 lần gõ sai. Thiết bị đã đăng nhập có bị ảnh hưởng không, và mức này có chấp nhận được không? `docs/04-security.md` chưa nói | Product Owner (ở `/spec`); originator nếu phải đổi ngưỡng |
| 2 | "Token đã mất hiệu lực" kiểm thế nào khi thao tác làm token mất hiệu lực (đổi mật khẩu, thu hồi phiên) thuộc KM-009? | Engineer (ở `/build-plan`) |
| 3 | Môi trường cục bộ có giả lập được đếm lần sai theo IP không? Chưa ai chạy thử, công cụ chưa được cài | Engineer (ở `/build-plan`) |
| 4 | Gói miễn phí của Cloudflare có đủ cho nhu cầu cá nhân không (G5)? Chưa có số đo. Originator chưa xác nhận đã có tài khoản; KM-006 sẽ cần | Originator (trước KM-006) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

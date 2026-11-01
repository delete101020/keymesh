# Intent — Gộp ba chiều theo field

**Epic ID:** `KM-002`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-01`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

KeyMesh được thiết kế để dùng offline trên nhiều thiết bị (`docs/05-sync.md`). Khoảnh khắc hỏng: laptop và điện thoại cùng sửa một vault khi mất mạng, rồi cả hai online lại. Hôm nay chưa có gì quyết định được kết quả hợp lệ của hai bản đó là gì. Bất kỳ cách nào "lấy bản mới nhất" đều âm thầm bỏ thay đổi của thiết bị kia, kể cả khi hai bên sửa hai chỗ khác nhau (một bên đổi mật khẩu, bên kia sửa ghi chú; một bên gán thêm env, bên kia gán env khác). Với xoá cũng vậy: một item bị chuyển vào thùng rác ở máy này trong khi đang được sửa ở máy kia có thể biến mất cùng bản sửa.

Quy tắc mong muốn đã viết ở `docs/05-sync.md` § "Thuật toán gộp ba chiều theo field", nhưng chưa có gì chạy và được kiểm chứng theo các quy tắc đó. Đồng bộ (KM-006) không thể bắt đầu khi chưa có câu trả lời đúng cho câu hỏi "gộp hai bản thế nào".

Epic này kế thừa từ KM-001: hình dạng vault, đồng hồ theo thuộc tính/field, lịch sử, tombstone và cách một lần lưu ghi đồng hồ là cố định (`docs/09-core-api.md`). KM-002 không đổi các quy tắc đó; chỉ bổ sung quy tắc gộp còn thiếu (xem mục 6–7).

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người dùng duy nhất có hai thiết bị.** Lúc sửa secret công việc trên điện thoại khi offline (ví dụ đổi mật khẩu đối tác ngay sau khi đối tác cấp lại), trong khi laptop cũng có thay đổi chưa đồng bộ. Họ cần cả hai thay đổi còn nguyên, và khi thật sự đụng nhau thì biết đúng chỗ nào đụng và lấy lại được bản thua.
- **Originator, trong vai người làm KM-006 (sync engine) và KM-009 (thùng rác).** Họ cần một quy tắc gộp đã được kiểm chứng để dựa vào, không phải tự quyết lại khi gặp xung đột.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Mất dữ liệu âm thầm | Chưa có số liệu | Giả định: không có gộp đúng thì mỗi lần hai thiết bị cùng sửa offline có thể mất một thay đổi mà không ai biết. Với secret, mất mật khẩu mới nghĩa là bị khoá khỏi hệ thống đối tác |
| Epic bị chặn | KM-006 phụ thuộc trực tiếp; mốc M1 chưa đạt kết quả "test gộp dữ liệu pass" | `docs/08-roadmap.md` M1 |
| Dữ liệu thật đang bị ảnh hưởng | Không có | Chưa dùng KeyMesh với dữ liệu thật |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- **Sự cố thực tế: chưa có dữ liệu.** Originator chưa gặp mất dữ liệu do sửa ở hai nơi (2026-11-01). Đây là rủi ro theo thiết kế, không phải lỗi đã xảy ra.
- Quyết định Q6 (`docs/08-roadmap.md`): gộp theo field ngay từ đầu, chỉ tính xung đột khi hai bên cùng sửa một giá trị.
- Tiêu chí chấp nhận 2, 3, 7 trong `docs/07-features.md` mô tả đúng các khoảnh khắc ở mục 1.
- KM-001 để lại ghi chú cho KM-002 (`docs/09-core-api.md` § "Lưu ý cho epic sau"): `docs/05-sync.md` chưa có quy tắc cho việc xoá project/env.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Mỗi điều dưới đây kiểm được bằng `npm test` (và `npm run test:browser` cho lõi), ở mức dữ liệu vault, không cần thiết bị thật:

- **Kịch bản 3** (`07-features.md`): hai bên cùng sửa field Password → còn một item, xung đột được đánh dấu đúng field Password, bản thua nằm trong lịch sử. Một bên sửa Password, bên kia sửa ghi chú → có cả hai thay đổi, không đánh dấu xung đột. Hai bên gán thêm env khác nhau → item nằm ở cả bốn env.
- **Kịch bản 2:** sửa ở một bên, bên kia không đổi → nhận đúng giá trị mới, lịch sử còn bản cũ.
- **Kịch bản 7:** xoá ở một bên, khôi phục ở bên kia → item quay lại đủ field và lịch sử.
- Mọi dòng trong bảng "Xoá, thùng rác và sửa" của `05-sync.md` có một test tương ứng, cộng thêm quy tắc xoá project/env và trường hợp hai bên cùng tạo một id.
- Các tính chất ở `05-sync.md` § "Tính chất cần test" pass trên dữ liệu sinh ngẫu nhiên: gộp với chính nó không đổi gì, đổi chỗ hai bên không đổi nội dung kết quả, không id nào biến mất, mọi nội dung thua đều tìm lại được trong lịch sử.
- Kết quả gộp luôn là một vault hợp lệ theo kiểm tra của KM-001.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- Giao tiếp mạng, push/pull, thử lại, thanh trạng thái (KM-006); server và so sánh version (KM-005).
- Lưu `base`/`local` trên thiết bị (KM-003).
- Hiển thị badge ⚠, tô sáng field và nút "Đã xử lý" (KM-004). Ở đây chỉ có dữ liệu đánh dấu xung đột (phần dữ liệu của F-ITM-13).
- Giao diện thùng rác và việc tự xoá trắng sau 30 ngày (KM-009); ở đây chỉ gộp đúng các trạng thái xoá đã có.
- Gộp `meta` của vault (tên, màu): `05-sync.md` đã chốt "bản sửa muộn hơn thắng", thuộc KM-006.
- Đổi đồng hồ, lịch sử hay hình dạng vault đã cố định ở KM-001. Nếu KM-002 thấy cần đổi, phải ghi lý do và cập nhật `docs/09-core-api.md`.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Xoá project/env: ghi chú KM-001 đề xuất "cùng xoá thì lấy thời điểm xoá sớm hơn; chỉ một bên đổi thì bên đó thắng". Còn khi một bên xoá env, bên kia thêm item vào env đó thì item đi đâu? | Originator (ở `/spec`) |
| 2 | Hai bên cùng tạo một id (không còn import v1, nhưng vẫn có thể khi cùng import một file): coi mọi khác biệt là xung đột thật, hay có quy tắc riêng? | Originator (ở `/spec`) |
| 3 | Đánh dấu xung đột đã được "Đã xử lý" ở một bên, trong khi bên kia vẫn còn đánh dấu cũ: kết quả gộp giữ hay bỏ đánh dấu? | Originator |
| 4 | "Đổi chỗ hai bên cho cùng nội dung" khi đồng hồ hoà hoàn toàn (cùng `at`, cùng `dev`) — có xảy ra được không, và nếu có thì phân xử thế nào? | Originator / spec |
| 5 | Lịch sử bị cắt còn `HISTORY_MAX = 20`: nếu bản thua bị đẩy ra ngoài giới hạn ngay trong lần gộp, "mọi nội dung thua tìm lại được" có còn đúng không? | Originator (ở `/spec`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

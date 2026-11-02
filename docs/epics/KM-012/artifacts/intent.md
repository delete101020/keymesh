# Intent — Tự che lại secret đang hiện trên mobile

**Epic ID:** `KM-012`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

Trên điện thoại, secret đã bấm hiện cứ hiện mãi, tới khi chuyển item hoặc app khoá. Rời app lúc đó thì ảnh ở màn đa nhiệm giữ nguyên giá trị. Trên giả lập iOS, sau 65 giây ảnh vẫn còn secret, dù quay lại thì app đã khoá. Khoá không xoá được ảnh, và web không có cách chặn đã biết (`docs/04-security.md`).

Khoảnh khắc hỏng: bấm hiện để đọc một secret, quên che, rồi rời app. Secret nằm trong ảnh đó, ngoài mọi lớp bảo vệ của app.

**Kế thừa từ KM-004, không đổi:** khoá sau 60 giây ở nền; chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại.

**Đổi so với KM-004:** KM-004 chấp nhận việc lộ này cho M2 vì chỉ dùng dữ liệu thử. Epic này xem lại việc đó cho secret thật.

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

Originator, người dùng duy nhất, lúc đọc credential của công ty và đối tác trên điện thoại rồi chuyển sang app khác.

Chưa có người xem ảnh cụ thể nào đáng lo (originator, 2026-11-02). Việc này là phòng xa, không xuất phát từ một tình huống đã gặp.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Thời gian secret đang hiện | Không giới hạn trong lúc app còn mở | Đọc từ mã hiện tại |
| Thời gian ảnh giữ secret | Ít nhất 65 giây trên giả lập iOS | Chưa đo mức tối đa; Android chưa đo theo thời gian |
| Thiệt hại nếu ảnh bị xem | Lộ credential, phải đổi từng cái bên ngoài | Chưa xảy ra lần nào; xoay khoá không thu hồi được giá trị đã bị đọc |
| Số lần bấm hiện trên điện thoại | No data yet | Chưa cất secret thật trên điện thoại |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Đo ở KM-004 trên giả lập Android 15 và iOS 18.6, cả tab lẫn standalone: `docs/epics/KM-004/artifacts/implement.md` (`KM-004-AC06`).
- Ảnh iOS sau 65 giây hiện cả tiêu đề, username, secret và mã OTP: `docs/epics/KM-004/artifacts/evidence/ios-safari-switcher-65s.png`. Ảnh Android: `evidence/android-standalone-switcher.png`.
- Chưa có số đo trên điện thoại thật. Chưa có sự cố nào.
- Màn sửa item và hộp lịch sử chưa được đo; đưa vào phạm vi là suy ra từ cùng cơ chế, chưa phải kết quả đo.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

**Originator quyết (2026-11-02):**

- Secret tự che lại sau **30 giây**, ở mọi nơi hiện secret: màn xem item, màn sửa item, hộp lịch sử phiên bản.
- **Chấp nhận phần còn lộ** trong ảnh màn đa nhiệm khi cất secret thật: tiêu đề và nhãn item, username, mã OTP đang chạy, và secret nếu rời app trước khi hết 30 giây.

**Kiểm được khi**, trên giả lập Android và iOS:

- Bấm hiện rồi để yên 30 giây ở từng nơi trên thì giá trị không còn hiện.
- Sau đó rời app thì ảnh màn đa nhiệm không còn giá trị secret.
- Các tài liệu (`docs/04-security.md`, `docs/07-features.md`, `docs/08-roadmap.md`) ghi đúng hành vi mới và phần còn lộ đã chấp nhận.

**Giới hạn phải nói rõ:** đây chỉ giảm rủi ro. Đọc secret rồi sang app khác trong vòng 30 giây là trường hợp vẫn lộ, và ảnh đó vẫn giữ secret sau khi app đã khoá.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- Chặn hẳn ảnh màn đa nhiệm: web không có cách đã biết.
- Che tiêu đề, username hay mã OTP trong ảnh: đã chấp nhận ở mục 5.
- Máy tính: phép đo và rủi ro này là của máy cảm ứng.
- Kiểm trên điện thoại thật: vẫn là điều kiện riêng trước khi cất secret thật. Epic này xong không tự mở khoá việc đó.
- Năm mục kiểm tay và copy trên máy tính thật: KM-013.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | 30 giây tính từ lúc bấm hiện hay từ lần thao tác cuối? Đang đọc dở một secret nhiều dòng thì có bị che giữa chừng không? | Originator, lúc duyệt build-plan |
| 2 | Ở màn sửa item, đang gõ dở mà hết 30 giây thì sao? Không được làm mất nội dung đang gõ | Originator, lúc duyệt build-plan |
| 3 | Ảnh màn đa nhiệm giữ secret bao lâu, trên Android và trên máy thật? | Đo khi có máy thật (điều kiện riêng ở `docs/08-roadmap.md`) |
| 4 | Phần chấp nhận ở mục 5 được quyết khi chưa có người xem ảnh cụ thể nào. Dùng thật mà xuất hiện tình huống cụ thể (cho mượn máy, bị giữ máy) thì có xem lại không? | Originator |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

# Intent — Lõi mật mã và model vault v2

**Epic ID:** `KM-001`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-10-30`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

Thiết kế v2 đã viết xong (`docs/03-data-model.md`, `docs/04-security.md`) nhưng chưa có phần lõi nào chạy được đúng theo thiết kế đó. Phần mã hoá và dữ liệu hiện có nằm chung một file với giao diện v1 (`envvault.html`), và dùng mô hình khoá cũ mà v2 đã quyết định bỏ (D3). Lúc bắt đầu bất kỳ epic nào phía sau (KM-002 gộp dữ liệu, KM-003 app cục bộ, KM-005 server, KM-007 passkey) thì gặp ngay chỗ hỏng: không có nền chung đã kiểm chứng để dựa vào. Mỗi epic phải tự đoán dữ liệu vault trông thế nào và được bảo vệ ra sao, hoặc tự viết lại phần đó.

Vì vậy chưa thể bắt đầu cất secret thật vào KeyMesh: nếu nền thay đổi về sau, dữ liệu đã cất có thể không mở được hoặc phải chuyển đổi lại.

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người làm các epic M1–M5.** Lúc mở KM-002, KM-003, KM-005 hoặc KM-007, họ cần một vault v2 và cách mở khoá đã cố định thì mới viết và kiểm thử được phần việc của epic đó.
- **Originator, trong vai người dùng duy nhất về sau.** Lúc cất secret công việc (mật khẩu đối tác, API key, SSH key) theo project và env. Một lỗi ở lõi lúc này là lỗi trên toàn bộ dữ liệu sau này.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Epic bị chặn | 4 epic phụ thuộc trực tiếp (KM-002, KM-003, KM-005, KM-007); 6 epic còn lại phụ thuộc gián tiếp | Lấy từ dòng "Phụ thuộc" trong `docs/epics/KM-0xx/` |
| Làm lại | Chưa có số liệu | Giả định: nếu mỗi epic tự định nghĩa dữ liệu vault thì sẽ phải sửa lại khi chúng gặp nhau |
| Rủi ro bảo mật | Chưa có số liệu | Giả định: lõi mật mã không có test thì một lỗi (sai khoá, bỏ sót kiểm tra toàn vẹn) có thể nằm im cho đến khi mất dữ liệu |
| Dữ liệu thật đang bị ảnh hưởng | Không có | v1 chưa được dùng với dữ liệu thật (originator xác nhận) |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Đồ thị phụ thuộc giữa các epic: KM-001 là epic duy nhất không phụ thuộc vào epic nào, và mọi epic khác đều đi qua nó.
- `envvault.html` dẫn xuất khoá AES thẳng từ mật khẩu và mã hoá cả vault bằng khoá đó (định dạng `v: 1`), trái với quyết định D3/D4 trong `docs/01-overview.md`.
- Mã hoá, lưu trữ (`localStorage`) và giao diện nằm chung một file, không có test nào.
- Về người dùng bị ảnh hưởng: **chưa có dữ liệu.** v1 chưa được dùng thật, không có sự cố nào được ghi nhận.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

- Người làm KM-002, KM-003, KM-005 và KM-007 bắt đầu được epic của mình mà **không phải sửa hay định nghĩa lại** cách mở khoá vault hay hình dạng dữ liệu vault. Kiểm chứng: các epic đó không có thay đổi nào nhắm vào phần lõi này, trừ khi có lý do được ghi lại.
- Các tiêu chí đã ghi trong `KM-001.md` vẫn áp dụng, và mỗi tiêu chí kiểm tra được bằng một lệnh chạy:
  - dữ liệu bị sửa một byte, hoặc bị gắn sang ngữ cảnh khác, thì bị từ chối thay vì trả ra dữ liệu sai;
  - cùng một bộ kiểm tra pass cả trong Node lẫn trong trình duyệt, không cần thư viện bên thứ ba.
- Tiêu chí "migrate được file v1 thật" trong `KM-001.md` **không còn áp dụng** (xem *Not this*).

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- Giao diện người dùng, kể cả màn hình mở khoá (KM-003, KM-004).
- Lưu trữ trên thiết bị và đồng bộ giữa thiết bị (KM-003, KM-006).
- Gộp dữ liệu khi hai nơi cùng sửa (KM-002).
- Server, xác thực với server (KM-005).
- Mở khoá bằng passkey ở mức dùng được (KM-007); ở đây chỉ cần không chặn đường cho nó.
- Đổi mật khẩu, thùng rác hoạt động thật, export Bitwarden (KM-008, KM-009, KM-010).
- Chia sẻ cho nhiều người.
- **Chuyển dữ liệu v1 sang v2.** v1 chưa từng được dùng với dữ liệu thật nên không có gì để cứu; originator quyết định bỏ phần này khỏi KM-001 (2026-10-30). Mô tả epic và mục F-DATA-02 trong `KM-001.md` vẫn còn nhắc đến nó, cần sửa cho khớp.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Đã bỏ migrate v1, vậy có còn cần chấp nhận id kiểu v1 (Q7: "code chấp nhận cả hai dạng") không, hay chỉ cần id có tiền tố? | Originator |
| 2 | "Epic sau dùng được ngay" cần được chốt là ai kiểm và kiểm lúc nào: lúc đóng KM-001 (đọc lại spec KM-002/003/005/007), hay chỉ biết được khi các epic đó chạy? | Originator |
| 3 | Mức tốc độ mở khoá chấp nhận được trên iPhone/Android cũ là bao nhiêu? Chưa có số đo | Originator (đo trên thiết bị thật) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

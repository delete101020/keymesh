# Intent — Tuỳ chọn M6: đánh giá và xếp ưu tiên

**Epic ID:** `KM-011`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

M6 ghi các mục là "tuỳ chọn", nhưng các epic trước đã đẩy về đây cả những việc có hệ quả về bảo mật: KM-008 trả về xoay khoá vault, KM-009 trả về xoay khoá tài khoản, và `docs/04-security.md` buộc KM-011 xếp hạng xoay khoá tài khoản trước lần đầu đưa secret thật lên server. Chưa có epic nào cam kết làm các việc đó.

Khoảnh khắc hỏng là lúc originator định đưa secret thật lên server mà không trả lời được ba câu: quên master password thì sao, nghi lộ khoá thì sao, và mục nào trong danh sách tuỳ chọn thật sự phải có trước đó. Hôm nay cả hai tình huống đều không có lối ra: backup cũng mở bằng chính mật khẩu đó (tiêu chí 8 của 07), passkey mở được dữ liệu nhưng chưa đặt được mật khẩu mới (KM-009 mục 6), đổi mật khẩu giữ nguyên `accountKey` (04).

**Kế thừa từ KM-006, không đổi:** deploy làm một lần ở `KM-014`, sau mọi epic phát triển; mức kiểm là giả lập và server cục bộ; hôm nay chưa có secret thật.

**Đổi so với tài liệu** (originator chốt 2026-11-02): hai mục rời "tuỳ chọn" thành việc phải xong trước `KM-014` (mục 5); share target bị bỏ.

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, lúc quyết định đưa secret thật lên server.** Họ cần biết điều kiện đã đủ chưa.
- **Originator, người dùng duy nhất sau này, lúc quên master password hoặc nghi lộ khoá.** Dữ liệu là credential của công ty và đối tác. Đây là giả định về tương lai: chưa xảy ra lần nào.
- **Người làm `KM-014`.** Họ cần biết còn epic nào phải xong trước khi deploy.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Lần quên mật khẩu, nghi lộ khoá | 0 lần được ghi nhận | Chưa có secret thật. Nếu xảy ra sau này: quên mật khẩu trên máy không bật passkey là mất toàn bộ dữ liệu (04) |
| Thời gian mất do thiếu các mục M6 | Chưa có số liệu | Chưa có sử dụng thật |
| Khối lượng thêm trước `KM-014` | 2 epic mới, chưa ước lượng | Đẩy lùi deploy; originator chấp nhận |
| Quy ước bị nới | 0 | Argon2id cần mã ngoài repo và nới CSP, nhưng đã hoãn nên chưa nới gì |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- **Nhu cầu từ sử dụng thật: chưa có dữ liệu.** Mọi xếp hạng dưới đây là phán đoán của originator (trả lời phỏng vấn 2026-11-02), không dựa trên sự cố.
- `docs/04-security.md` § Điều kiện trước khi đưa secret thật lên server, KM-008 và KM-009 mục 6: xoay khoá chưa có epic nào làm.
- Yêu thích đã có nhưng chỉ ở màn hẹp (07); tag được lõi giữ và gộp, chưa hiện và chưa tìm được (đã đọc `src/public/js`, KM-003 Concern 8).
- CSP hiện tại chỉ có `script-src 'self'` (`src/public/_headers`); `CLAUDE.md` chỉ cho phép một phụ thuộc ngoài là `wrangler`.
- Argon2id: không có mối lo cụ thể. 04 ghi `kdf_name` đã thiết kế để nâng cấp sau, và 03 cho biết đổi mật khẩu chỉ bọc lại `accountKey`, không mã hoá lại vault, nên chưa thấy lý do đổi sau tốn hơn nhiều. Chưa đo trên máy thật.
- KM-006 đến KM-010 chưa đóng, nên xếp hạng này dựa trên tài liệu, chưa dựa trên app đã chạy đủ.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Originator đã duyệt bảng dưới, và mỗi mục "Làm" có một epic đề xuất.

| Mục | Xếp hạng | Lý do | Xem lại khi |
|---|---|---|---|
| Recovery key (F-AUTH-10), cùng đặt lại mật khẩu bằng passkey | **Làm**, trước `KM-014` | Quên mật khẩu đang là mất hết, trên dữ liệu không tạo lại được | — |
| Xoay khoá vault và tài khoản (F-AUTH-09) | **Làm**, trước `KM-014` | Nghi lộ khoá thì chỉ còn cách đổi từng secret bên ngoài. Xong điều kiện xếp hạng ở 04 | — |
| Argon2id | Hoãn (originator đổi từ "Làm" sau bước sửa nháp, 2026-11-02) | Chỉ còn lý do phòng xa, không đủ để nới hai quy ước và thêm một epic trước deploy | WebCrypto hỗ trợ Argon2id, hoặc có mối lo cụ thể về dò mật khẩu. Khi đó xét lại hai ngoại lệ, KM-005 Concern 7 và chi phí trên điện thoại |
| Mật khẩu riêng từng vault | Hoãn | Chưa có vault cụ thể cần tách; 03 ghi thêm sau được | Có vault cần tách kể cả khi app đã mở khoá |
| Chuyển, sao chép item giữa vault (F-VLT-04) | Hoãn | Chưa rõ cách chia vault khi chưa có dữ liệu thật | KM-008 xong và đã dùng thật nhiều vault |
| Export plaintext (F-DATA-04) | Hoãn | Có thể export Bitwarden đã đủ để rời đi | KM-010 xong, có việc mà export đó không làm được |
| Tag, yêu thích trên màn rộng, tìm theo tag (F-ITM-11, F-VIEW-02) | Hoãn | Project và env có thể đã đủ | Đã dùng thật mà thấy thiếu cách phân loại |
| Share target Android (F-PWA-06) | **Bỏ** | Chưa gặp nhu cầu; app dùng để xem và copy credential, không phải gom link | — |

**Epic đề xuất** (mã cấp khi tạo). Điều kiện chung: kiểm trên giả lập và server cục bộ; phải xong trước `KM-014`; việc phía server mới thì ghi vào danh sách của `KM-014`.

| Epic | Vấn đề phải hết | Kiểm được khi | Phụ thuộc |
|---|---|---|---|
| Khôi phục khi quên mật khẩu | Quên mật khẩu là mất hết | Người quên mật khẩu lấy lại được toàn bộ dữ liệu và đặt mật khẩu mới | KM-007, KM-009 |
| Xoay khoá | Nghi lộ khoá mà không làm gì được | Sau khi xoay, khoá cũ không còn mở được dữ liệu trên server; dữ liệu còn đủ | KM-007, KM-008, KM-009 |

**Tài liệu khớp** (đã sửa 2026-11-02): ưu tiên và trạng thái ở 07, M6 và Q9 ở 08, các dòng về xoay khoá và Argon2id ở 04, 06. `CLAUDE.md` không đổi. Xếp hạng không tự mở khoá việc đưa secret thật: KM-005 Concern 18 vẫn còn.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- Viết code hay sửa quy ước ở epic này.
- Tạo sẵn epic cho mục "Hoãn". Chia sẻ vault giữa nhiều người (không có trong danh sách).
- Kiểm trên Cloudflare thật hoặc điện thoại thật (`KM-014`).
- Chọn cách làm của từng mục: thuộc spec của từng epic.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Recovery key là thêm một đường vào dữ liệu nằm ngoài app. Mất hoặc lộ tờ giấy thì sao, và có cần cả hai đường (giấy, passkey) không? | Product Owner của epic Khôi phục |
| 2 | Xoay khoá khi thiết bị khác đang offline và còn thay đổi chưa đẩy lên thì giữ dữ liệu thế nào? Xoay khoá vault xoá snapshot cũ (04), trong khi KM-008 và KM-009 dựa vào snapshot làm đường cứu | Product Owner của epic Xoay khoá |
| 3 | Thứ tự hai epic, và có làm song song với KM-010 không? | Originator |
| 4 | KM-006 đến KM-010 đóng xong mà thấy khác giả định thì có xếp hạng lại không? | Originator |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

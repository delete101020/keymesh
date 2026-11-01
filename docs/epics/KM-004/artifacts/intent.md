# Intent — PWA và giao diện mobile

**Epic ID:** `KM-004`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-01`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

KeyMesh đặt mục tiêu dùng được trên máy tính, Android và iPhone (G3, `docs/01-overview.md`), nhưng app KM-003 mới chỉ được chứng minh trên Chrome desktop. Chưa ai biết nó có chạy được trên WebKit và trên màn hình điện thoại hay không. Lần duy nhất thử Safari desktop thì bộ test treo 180 giây, chưa rõ nguyên nhân (KM-003 `verify.md`, finding 1).

Khoảnh khắc hỏng hôm nay **chưa phải một lần cần secret trên điện thoại**: originator chưa gặp lần nào như vậy. Khoảnh khắc hỏng là lúc định xây tiếp đồng bộ trên một app mà không biết nền tảng chính có chạy được không. Lỗi WebKit hay mobile phát hiện càng muộn thì càng có nhiều thứ đã xây trên đó. Vì vậy epic này giảm rủi ro theo roadmap, không chữa một nỗi đau đang có.

Kể cả khi app chạy được, hôm nay vẫn còn các khoảng trống so với `docs/07-features.md` §6:

- Không cài được thành app, và không mở được nếu thiếu chương trình phục vụ cục bộ.
- Chuyển sang app khác, vault vẫn mở cho tới khi hết 10 phút không thao tác, và màn đa nhiệm có thể chụp lại secret.
- Không chỉnh được thời gian tự khoá.
- Bố cục hẹp của KM-003 chỉ ở mức dùng được: nút Back của Android không hoạt động theo điều hướng trong app, chưa có Gần đây, chưa đạt 3 lần chạm tới copy.

Epic kế thừa từ KM-003 và không đổi cách giữ hay mở dữ liệu trên thiết bị.

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người làm tiếp KM-005/KM-006 và KM-007.** Họ cần biết app có chạy trên WebKit và mobile không trước khi đầu tư thêm. KM-007 (passkey) phụ thuộc trực tiếp vào KM-004.
- **Originator, trong vai người dùng duy nhất sau này,** lúc cần lấy một secret trên điện thoại. Đây là giả định về tương lai: hôm nay họ chưa có điện thoại để dùng và chưa từng gặp tình huống này (originator xác nhận, 2026-11-01).

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Lần cần secret trên điện thoại mà không có | 0 lần được ghi nhận | Originator xác nhận chưa có khoảnh khắc thật |
| Trình duyệt đã có kết quả kiểm | 1 (Chrome desktop) | Safari, Firefox: chưa có kết quả (KM-003 `AC49`); điện thoại: chưa thử |
| Chi phí nếu WebKit hỏng và phát hiện muộn | Chưa có số liệu | Giả định: phải làm lại nhiều hơn nếu đã xây đồng bộ |
| Epic bị chặn | 1 trực tiếp (KM-007) | KM-005 và KM-006 không phụ thuộc KM-004 |
| Tốc độ mở khoá trên điện thoại | Chưa có số liệu | Máy dev: trung vị 65 ms, vault 269 KB, Chrome desktop (KM-003 `implement.md`). Không suy ra được cho điện thoại |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- KM-003 `verify.md` kết luận `fail` và `review.md` kết luận `hold`, cùng vì `AC49` chưa có kết quả; nhánh vẫn được merge. 63 test e2e đều chạy trên Chrome 156.
- `src/public/` hôm nay không có gì giúp cài app hoặc mở offline, và không có xử lý khoá khi chuyển nền (đã đọc mã, 2026-11-01).
- **Nhu cầu dùng trên điện thoại: chưa có dữ liệu.** Lý do làm bây giờ là quyết định theo roadmap của originator (2026-11-01), không phải bằng chứng từ sử dụng.
- **WebKit có thực sự hỏng không: chưa có dữ liệu.** Lần treo ở Safari có thể do bộ test chứ không phải do app.

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Originator kiểm được bằng tay với dữ liệu thử, trên **máy giả lập iOS và Android** (originator quyết định 2026-11-01: chưa có máy thật, giả lập là đủ để đạt M2). Máy này chưa có Xcode và Firefox; originator đồng ý cài Xcode để có giả lập iOS (2026-11-01), và phần Firefox dưới đây cũng cần cài trình duyệt này.

- **Safari và Firefox desktop (nợ KM-003, `AC49`):** đi hết luồng lập tài khoản → mở khoá → tạo item → copy, có kết quả ghi lại; biết vì sao bộ test từng treo ở Safari. Trên Firefox, secret nhiều dòng vẫn được che khi sửa (review finding 2).
- **Năm mục kiểm tay còn lại của KM-003 (`verify.md` §3), trên máy tính thật:** tắt Wi-Fi (`AC06`), ngủ máy 11 phút (`AC10`), camera thật (`AC32`), từ chối camera (`AC33`), clipboard bị từ chối vì mất focus (`AC36`). Mỗi mục có kết quả ghi lại.
- **Cài và offline:** trên cả hai máy giả lập, thêm được app ra màn hình chính, mở lên không có thanh trình duyệt. Tắt mạng rồi mở lại vẫn vào được và mở khoá được.
- **Bản mới:** khi có phiên bản app mới, người dùng được báo và tự chọn lúc tải lại.
- **Khoá khi chuyển nền:** chuyển sang app khác quá thời gian đã đặt (mặc định 60 giây) thì quay lại phải nhập mật khẩu. Màn đa nhiệm không để lộ secret.
- **Chỉnh tự khoá:** đổi được thời gian trong cài đặt của thiết bị, và giá trị còn sau khi khoá rồi mở lại.
- **Dùng trên màn hình nhỏ:** từ lúc mở khoá đến lúc copy được mật khẩu của item gần đây tối đa 3 lần chạm; các nguyên tắc còn lại ở `docs/07-features.md` § Mobile đều làm được, kể cả Back của Android.
- **Tài liệu khớp:** tiêu chí M2 ở `docs/08-roadmap.md` và mục "Xong khi" ở `KM-004.md` ghi đúng là đạt trên giả lập, kèm điều kiện ở dòng đầu mục 6.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Kiểm trên điện thoại thật.** Giả lập không nói gì về tốc độ mở khoá thật, camera, hay cách máy thật xoá dữ liệu. M2 đạt không chứng minh G3 trên máy thật; originator chấp nhận điều này, với điều kiện: **chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại** (chốt 2026-11-01).
- **Quét QR trên iPhone** (KM-003 Concern 6, chốt 2026-11-01): nhập tay là đủ. Không đổi quy ước không dùng thư viện bên thứ ba.
- **Cất secret thật trên điện thoại, và chống Safari tự xoá dữ liệu** (KM-003 Concern 16): chỉ dùng dữ liệu thử nên mất cũng chấp nhận được. Xem lại cùng lúc kiểm trên điện thoại thật.
- **Ngưỡng tốc độ mở khoá trên điện thoại** (KM-001 Concern 4): không đo được trên giả lập; đo khi kiểm trên điện thoại thật.
- Đồng bộ giữa các thiết bị (KM-005, KM-006); mở khoá bằng Face ID hoặc vân tay (KM-007); backup (KM-010); share target (F-PWA-06).

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | App được phục vụ từ đâu để cài? `docs/08-roadmap.md` nói M2 không cần Cloudflare, còn `wrangler` theo quy ước chỉ có từ KM-005. Tiêu chí giả lập có thể không cần một địa chỉ thật, nhưng ngày có điện thoại thật thì vẫn phải trả lời | Engineer (ở `/build-plan`); originator nếu phải đổi roadmap |
| 2 | Lần treo Safari do bộ test hay do app? Nếu do app thì khối lượng epic này có thể lớn hơn dự kiến | Engineer (ở `/build-plan`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

# Intent — Bảo mật tài khoản: đổi mật khẩu, thiết bị, snapshot

**Epic ID:** `KM-009`
**Originator:** delete101020@live.com
**Status:** Draft
**Created:** `2026-11-02`

---

## 1. Problem

> *What is broken today? Describe the moment it goes wrong, not the fix.*

Theo thiết kế, khi KM-006 xong, dữ liệu sẽ nằm trên server và trên nhiều thiết bị, nhưng chủ tài khoản chưa có cách phản ứng khi có chuyện:

- **Lộ master password:** không đổi được, nên người có mật khẩu đó vẫn đăng nhập được.
- **Mất một máy:** không thấy máy nào đang đăng nhập, cũng không cắt được phiên của máy đó.
- **Một lần sync ghi đè nhầm cả vault:** server chỉ giữ bản mới nhất, không có bản cũ để quay về.
- **Nghi có người thử vào tài khoản:** không có dấu vết nào để xem lại, kể cả các lần đăng nhập sai.

Đây là các khoảnh khắc dự kiến, **chưa xảy ra lần nào**: KM-006 mới tới bước build-plan, server chưa chứa dữ liệu thật. Epic này làm theo roadmap M5 (originator chốt 2026-11-02), không chữa một sự cố đang có.

**Kế thừa, không đổi:** `intent.md` và `spec.md` đã duyệt của KM-006 (cách đăng nhập, cách sync, máy bị từ chối phiên vẫn dùng được bản cục bộ, mức kiểm trên giả lập và server cục bộ). Từ KM-007: passkey theo từng thiết bị, đổi mật khẩu không làm hỏng passkey.

**Đổi so với hai epic đó:**

- **Đăng nhập lại sau khi đổi mật khẩu:** KM-006-FR08 không thay gì trên máy khi đăng nhập lại cùng tài khoản, nên bản cục bộ vẫn mở bằng mật khẩu cũ. Epic này đổi điều đó (mục 5).
- **Việc KM-007 từng giao sang:** intent KM-007 giao cho KM-009 việc xoay khoá tài khoản và đặt lại mật khẩu bằng passkey. Originator đã đưa cả hai ra khỏi epic này (mục 6); spec KM-007 đã sửa theo (Concern 14, FR25).
- **Phụ thuộc mới:** brief chưa ghi KM-007 (mục 5).

## 2. Who hurts

> *The specific person or role, doing the specific task. Not "users".*

- **Originator, trong vai người dùng duy nhất sau này,** vào lúc vừa mất máy, nghi lộ mật khẩu, hoặc thấy một vault bị ghi đè sai. Đây là giả định về tương lai: hôm nay chưa có secret thật nào trên server.
- **Originator, trong vai người đóng M5.** Đổi mật khẩu, thiết bị, snapshot và nhật ký nằm trong nội dung M5 ở `docs/08-roadmap.md`. Tiêu chí 6–8 của M5 không kiểm các mục này, nên "Xong khi" của epic là phép kiểm duy nhất.

## 3. Cost

> *Time, money, errors, abandonment. Quantify where you can.*

| Dimension | Today | Notes |
|---|---|---|
| Sự cố lộ mật khẩu, mất máy, mất dữ liệu | 0 lần được ghi nhận | Originator xác nhận làm theo roadmap (2026-11-02) |
| Mục đang phải xem lại trước khi đưa secret thật lên server | 4 | Thu hồi phiên, đổi mật khẩu, khôi phục bản cũ, nhật ký (`docs/04-security.md`, KM-005 Concern 18) |
| Thao tác API còn thiếu trong phần này | 7 thao tác đang trả `404`, epic nhận 6 | Thao tác còn lại về KM-011 (mục 6) |
| Dữ liệu mất do một lần ghi đè sai | Chưa có số liệu | Chưa có sử dụng thật; về thiết kế, trước epic này không khôi phục được từ server |

## 4. Evidence

> *What makes us believe this is real — tickets, metrics, a recording, a quote.
> Write "no data yet" rather than inventing a number.*

- Mã server hôm nay không ghi snapshot hay nhật ký và chưa có các thao tác của phần này; mã client chưa có màn nào cho đổi mật khẩu, thiết bị, snapshot, nhật ký (đã đọc mã, 2026-11-02).
- `docs/04-security.md` mục "Điều kiện trước khi đưa secret thật lên server" ghi rõ các khoảng trống này là có chủ ý.
- `docs/05-sync.md` mô tả khôi phục là coi snapshot như một bản `remote` mới rồi đẩy lên, nhưng không nói item đã sửa hoặc đã xoá sau thời điểm snapshot sẽ ra sao. Originator chốt kết quả mong muốn ở mục 5; **chưa kiểm** quy tắc gộp hiện tại có cho ra kết quả đó không (mục 7, câu 1).
- **Tài liệu lệch nhau:** `KM-009.md` nhận thao tác xoay khoá tài khoản, nhưng F-AUTH-09 thuộc KM-011. Intent KM-007 ghi KM-009 lo xoay khoá tài khoản và đặt lại mật khẩu khi quên. `docs/04-security.md` ghi passkey "dùng để đặt mật khẩu mới" khi quên. Originator chốt ở mục 6.
- **Nhu cầu từ sử dụng thật: chưa có dữ liệu.**

## 5. Done looks like

> *The observable change that lets us close this. Someone must be able to check it.*

Kiểm cùng mức KM-006, KM-008 (originator chốt 2026-11-02, KM-006 Concern 8): bằng tay, với dữ liệu thử, trên **server chạy cục bộ, với trình duyệt laptop cùng giả lập Android, rồi cùng giả lập iOS**. Mục nào một cặp không làm được thì quay lại originator. Epic **chỉ đóng được sau khi KM-006 và KM-007 xong** (originator chốt 2026-11-02).

- **Đổi mật khẩu:** đổi trên máy A thì máy A vẫn dùng tiếp. Máy B mất quyền với server ở lần liên lạc kế tiếp và báo cần đăng nhập lại, nhưng vẫn dùng được bản cục bộ (KM-006-FR25). Mật khẩu cũ không đăng nhập được nữa, mật khẩu mới thì được. Dữ liệu không đổi trên cả hai máy.
- **Passkey sau khi đổi mật khẩu:** thiết bị đã bật passkey vẫn mở khoá và thấy đúng dữ liệu đó.
- **Không bị khoá ngoài:** mạng đứt hoặc thao tác thất bại giữa chừng thì người dùng vẫn vào được bằng mật khẩu cũ hoặc mật khẩu mới, và được báo rõ mật khẩu nào đang có hiệu lực.
- **Máy phải đăng nhập lại giữ được thay đổi:** thay đổi chưa sync trên máy B lên được sau khi B đăng nhập lại bằng mật khẩu mới. Sau đó mật khẩu cũ không mở được bản cục bộ trên B nữa.
- **Thiết bị:** thấy danh sách các máy đang đăng nhập và biết máy nào là máy này. Thu hồi một máy thì máy đó không đọc hay ghi được gì trên server nữa, các máy khác không bị ảnh hưởng. Phiên còn sót của một lần đăng xuất offline (KM-006-FR11) cũng thấy và thu hồi được.
- **Xem snapshot:** với một vault, thấy các bản cũ (tối đa 30) cùng thời gian, thiết bị, kích thước, và xem được nội dung một bản trước khi quyết định.
- **Khôi phục không làm mất gì** (originator chốt 2026-11-02): item có trong snapshot quay lại, item thêm sau snapshot vẫn còn, trên cả hai máy sau khi sync. Nếu cùng một item có nội dung khác nhau thì không nội dung nào mất: bản không hiện ra vẫn tìm lại được trong lịch sử của item. Máy kia đang có thay đổi chưa đẩy lên thì vẫn giữ được.
- **Nhật ký trả lời "tài khoản có bị đụng không"** (originator chốt 2026-11-02): thấy đăng nhập đúng và sai, thu hồi phiên, đổi mật khẩu, khôi phục snapshot, kèm thời gian và thiết bị khi biết. Không ghi secret hay nội dung vault.
- **Tài liệu khớp:** `KM-009.md` không còn giao xoay khoá tài khoản cho KM-009 và ghi thêm phụ thuộc KM-007. Intent KM-007 và `docs/04-security.md` không còn hứa điều epic này không làm. Danh sách việc của `KM-014` có thêm các thao tác server mới của epic này. F-DATA-05 ở `docs/07-features.md` không còn ghi "lỗi xung đột". `docs/04-security.md` bỏ bốn mục đã có khỏi danh sách cần xem lại và ghi các rủi ro ở mục 6. Quyết định đưa secret thật lên server vẫn thuộc originator và vẫn cần `KM-014` xong; đóng epic không tự mở điều kiện đó.

## 6. Not this

> *Adjacent problems we are deliberately not solving here.*

- **Xoay khoá tài khoản** (chốt 2026-11-02): về lại KM-011 cùng F-AUTH-09. Hệ quả chấp nhận được: nghi lộ `accountKey` thì chưa xử lý được, vì đổi mật khẩu giữ nguyên khoá đó. KM-011 chỉ đánh giá, nên chưa có epic nào cam kết làm; KM-011 phải xếp hạng xong việc này trước lần đầu đưa secret thật lên server (`docs/04-security.md`).
- **Đặt lại mật khẩu khi quên, kể cả bằng passkey** (chốt 2026-11-02): về epic sau. Quên mật khẩu thì máy đã bật passkey vẫn mở được dữ liệu, nhưng chưa đặt được mật khẩu mới.
- **Mật khẩu cũ trên máy chưa đăng nhập lại** (chốt 2026-11-02): máy chưa nhận tin đổi mật khẩu, hoặc đã biết phiên bị huỷ nhưng chưa đăng nhập lại, vẫn mở được bản cục bộ bằng mật khẩu cũ. Đổi mật khẩu sau khi lộ không bảo vệ bản đang nằm trên các máy đó, và cũng không có cách chặn đáng tin vì người cầm máy chỉ cần tắt mạng. Rủi ro này được chấp nhận và phải ghi vào `docs/04-security.md`.
- **Xoá từ xa:** thu hồi phiên chỉ cắt đường tới server, không xoá gì trên máy bị mất. Bản mã hoá đã nằm trên máy đó vẫn còn đó.
- **Đưa vault về đúng trạng thái cũ** (chốt 2026-11-02): khôi phục là gộp, không phải quay ngược. Thứ thêm sau snapshot không tự biến mất.
- **Nâng số vòng dẫn xuất khoá** (chốt 2026-11-02): giữ 600 000, nên KM-005 Concern 7 không phát sinh ở đây. Epic nào nâng thì phải xử lý Concern 7 trước.
- **Ghi sự cố đồng bộ và xung đột vào nhật ký** (chốt 2026-11-02): server không đọc được nội dung nên không biết xung đột theo field, chỉ biết lần ghi bị từ chối vì lệch version, và nhật ký này không nhằm trả lời câu hỏi đó. Danh sách hành động ở `docs/03-data-model.md` rộng hơn mục 5 (có cả lần ghi vault, xung đột version), nên phải sửa cho khớp.
- Thùng rác và xoá vault (KM-008), bản sao tự động ra file (KM-010).
- **Deploy, Cloudflare thật, điện thoại thật** (originator chốt 2026-11-02): thuộc `KM-014`. Đạt ở đây không chứng minh gì trên hai môi trường đó; điều kiện từ KM-004 giữ nguyên.

## 7. Open questions

| # | Question | Who can answer |
|---|---|---|
| 1 | Snapshot mang đồng hồ cũ nên có thể thua trong quy tắc gộp hiện tại: item đã xoá sau snapshot có quay lại thật không, item đã bị xoá trắng thì sao? Khôi phục có đánh dấu xung đột hàng loạt không? Lịch sử item chỉ giữ 20 bản (`HISTORY_MAX`, KM-006-NFR07 chấp nhận việc cắt này), vậy "không mất gì" có còn đúng khi bị cắt? Nếu không đạt mục 5 mà không đổi quy tắc gộp thì quay lại originator. | Product Owner (ở `/spec`), originator nếu phải đổi |
| 2 | 30 bản tính theo số lần ghi, không theo thời gian: sửa nhiều trong một ngày có đẩy hết các bản đáng giữ ra ngoài không? Chưa có số liệu. Dung lượng trên gói Free chuyển sang `KM-014` đo (KM-006 Concern 8). | Product Owner (ở `/spec`) |
| 3 | Nhật ký giữ bao lâu? Đăng nhập sai liên tục có làm nhật ký đầy hoặc đẩy mất dấu vết khác không? | Product Owner (ở `/spec`) |

---

*No solution language in this document. No components, endpoints, screens,
libraries or schemas — those belong in `spec.md` and `plan.md`.*

# Implementation Plan — Tự che lại secret đang hiện trên mobile

**Epic ID:** `KM-012`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `intent.md` (recipe `native-quick`, không có `spec.md`), `docs/epics/KM-004/artifacts/intent.md`, `docs/04-security.md`, `docs/07-features.md` §6

---

## 1. Approach

Thêm một module nhỏ `src/public/js/auto-mask.js`, cùng khuôn với `idle.js`: thuần, nhận `now` và timer từ bên gọi, tính bằng đồng hồ thật. Lý do: timer dừng khi app bị treo ở nền, còn `Date.now()` vẫn cho biết đã bao lâu. `app.js` tạo một bộ duy nhất và đưa ra `app.autoMask(onMask)`, trả về `{ touch(), stop() }`. Ba màn hình chỉ cần gọi hàm này lúc bấm hiện và tự quyết che thế nào. Trên máy không cảm ứng, hàm trả về một handle không làm gì, nên máy tính giữ nguyên hành vi (intent §6). Khi app quay lại từ nền, `app.js` kiểm tra hạn **trước** khi gỡ `#shield`, nên không có khung hình nào lộ secret đã quá hạn. `lock()` huỷ toàn bộ. Không đụng `core/`, schema hay server.

Mỗi màn hình che theo cách riêng vì trạng thái của chúng khác nhau:

- **Màn xem:** xoá id khỏi `state.revealed` rồi vẽ lại. Giá trị rời khỏi DOM, như khi chuyển item (`KM-003-AC38`).
- **Màn sửa:** che tại chỗ, không vẽ lại form. Đổi `input.type` hoặc class `masked`, cập nhật nút mắt, giữ vùng chọn. `formChanged()` sẽ làm reset select "Kiểu field mới", con trỏ và cuộn của textarea. Trên iOS, `focus()` ngoài cử chỉ người dùng có thể làm mất bàn phím.
- **Hộp lịch sử:** đưa dòng về mask và nút Hiện, dialog vẫn mở.

Phương án bị loại: **một timer riêng trong mỗi màn hình.** Cách này phải viết ba lần phần dùng đồng hồ thật, kiểm tra khi quay lại từ nền và huỷ khi khoá; chỉ cần quên một chỗ là secret quá hạn lộ ra lúc quay lại. Cũng bị loại: **che ngay khi `visibilitychange` sang `hidden`.** KM-004 đã đo là ảnh màn đa nhiệm chụp trước sự kiện này, nên cách đó không bớt lộ, mà còn che secret của người vừa sang app khác để gõ lại nó.

**Trả lời câu hỏi mở của intent (originator chốt 2026-11-02).**

- **Câu 1:** ở màn xem và hộp lịch sử, 30 giây tính cố định **từ lúc bấm hiện**. Chạm hay cuộn không kéo dài. Secret nhiều dòng có thể bị che khi đang đọc; bấm hiện lại được thêm 30 giây.
- **Câu 2:** ở màn sửa, mỗi lần **gõ vào đúng ô đó** thì đếm lại 30 giây. Ngừng gõ đủ 30 giây thì ô tự che, giữ nguyên nội dung, con trỏ và focus.
- **Câu 3 và 4:** chưa trả lời được và không chặn epic này. Câu 3 chờ máy thật, câu 4 chờ dùng thật.

**Quyết định thêm khi lập plan (originator chốt 2026-11-02).** Danh sách còn lộ ở intent §5 không nhắc Ghi chú và field không bí mật. Riêng loại `note` ("Ghi chú bảo mật") không có field nào (`core/model.js:29`), toàn bộ nội dung nằm ở Ghi chú và luôn hiện. Quyết định: **chấp nhận, không đổi mã**. Bổ sung vào danh sách còn lộ ở 04 và 07, kèm cảnh báo không để secret trong Ghi chú.

**Phạm vi suy từ intent, cần xem lúc duyệt plan:**

- Chỉ máy cảm ứng, theo `isTouchDevice()` đang dùng cho khoá nền (intent §6, mục Máy tính).
- Field được tự che là các field đang có nút che, gồm cả field file ở màn xem và field OTP ở màn sửa (nút mắt hiện secret TOTP).
- Field `multi` có file: màn xem đang che, nhưng "Sửa nội dung" ở màn sửa hiện nội dung và không có nút mắt. Plan tính "Sửa nội dung" là một lần bấm hiện; hết hạn thì về lại chip tên file, đây là đường duy nhất phải vẽ lại form.

Vì không có `spec.md`, các mã `KM-012-ACnn` ở §5 do plan này đặt, suy từ intent §5 và các quyết định trên.

## 2. Files

| Path | Change | Why |
|---|---|---|
| `src/public/js/auto-mask.js` | Thêm | `createAutoMask({ now, setTimer, clearTimer, timeoutMs })`: `arm(onMask)` trả `{ touch, stop }`, kèm `check()`, `stopAll()`. Hằng `AUTO_MASK_MS = 30000`. Chỉ có interval khi đang có secret hiện |
| `test/auto-mask.test.js` | Thêm | Test đơn vị bằng đồng hồ giả, cùng khuôn với `test/idle.test.js` |
| `src/public/js/app.js` | Sửa | Tạo bộ tự che; thêm `app.autoMask` (không làm gì nếu không cảm ứng); `toggleReveal` giữ handle theo field id; thêm `check()` vào `wake` và nhánh quay lại của `visibilitychange`, trước `emit('shield')`; `stopAll()` trong `lock()` |
| `src/public/js/ui/edit.js` | Sửa | Nút mắt và "Sửa nội dung" của field `multi` có file thì gọi `app.autoMask`; handler `input` gọi `touch()`; thêm `ui.sync` để che tại chỗ, giữ vùng chọn |
| `src/public/js/ui/history-dialog.js` | Sửa | `diffRow` chuyển được hai chiều giữa mask và giá trị; `openHistory` giữ các handle và dừng chúng ở `onClose` |
| `src/public/sw.js` | Sinh lại | `npm run sw-version`, vì danh sách shell có thêm file. `test/sw.test.js` sẽ fail nếu quên |
| `test/e2e/mobile.e2e.js` | Sửa | Test cả ba màn trên thiết bị cảm ứng giả lập, kể cả quay lại từ nền với timer đã dừng |
| `test/e2e/lock.e2e.js` | Sửa | Máy tính không tự che; khoá trong lúc đang hiện thì huỷ hết |
| `docs/04-security.md` | Sửa | Hàng "Ẩn secret" và "Màn đa nhiệm": hành vi mới, phần còn lộ đã chấp nhận, trường hợp vẫn lộ |
| `docs/07-features.md` | Sửa | F-PWA-04, F-VIEW-03 và mô tả mobile ở §6 |
| `docs/08-roadmap.md` | Sửa | Trạng thái M2: tự che đã xong trên giả lập; điều kiện máy thật vẫn còn |
| `docs/02-architecture.md` | Sửa | Thêm `auto-mask.js` vào cây thư mục (dòng 129) |
| `docs/epics/KM-012/artifacts/evidence/` | Thêm | Ảnh đo trên hai giả lập |
| `docs/epics/KM-012/artifacts/implement.md` | Thêm | Bằng chứng theo từng AC |

Không đổi: `src/public/js/ui/detail.js` (vẫn đọc `state.revealed`, vẫn gọi `toggleReveal`), `src/public/js/history-diff.js`, `src/public/js/idle.js`, `src/public/styles.css` (`textarea.masked` đã có), `core/`, `docs/09-core-api.md`.

## 3. Order

Làm trên máy Mac, ở nhánh `feat/KM-012-auto-mask`.

1. **`auto-mask.js` và test đơn vị.** *Sau bước này:* luật thời gian đã có và được kiểm (mốc 30 giây, `touch`, `stop`, kiểm tra khi timer đã dừng, đồng hồ lùi), chưa có màn nào dùng.
2. **Nối vào `app.js` và màn xem.** *Sau bước này:* trên máy cảm ứng, secret ở màn xem tự che sau 30 giây, kể cả khi quay lại từ nền; khoá thì huỷ; máy tính không đổi. Có e2e cho từng điều này.
3. **Màn sửa.** *Sau bước này:* ô đang hiện tự che tại chỗ, gõ thì đếm lại, nội dung và con trỏ còn nguyên, bản nháp lưu đúng từng byte. `multi` có file về lại chip.
4. **Hộp lịch sử.** *Sau bước này:* dòng đã hiện về mask, đóng dialog thì huỷ. Cả ba màn xong trên e2e; chạy `npm run sw-version`; `npm test` và `npm run test:e2e` xanh.
5. **Đo trên giả lập Android và iOS.** Chạy `npm start`, bấm hiện, chờ đủ 30 giây thật, rồi rời app và chụp màn đa nhiệm ở cả ba màn. Đo thêm đối chứng: rời app trước 30 giây. *Sau bước này:* có ảnh cho thấy secret đã rời khỏi ảnh màn đa nhiệm, và ảnh xác nhận giới hạn còn lại. Nếu kết quả khác dự kiến thì ghi vào plan dưới dạng amendment, không tự đổi phạm vi.
6. **Tài liệu.** *Sau bước này:* 02, 04, 07, 08 khớp kết quả đo ở bước 5; `implement.md` đủ bằng chứng.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: luật thời gian và màn xem chạy được trên thiết bị cảm ứng giả lập; máy tính không đổi; `npm test` xanh.

**Batch 2** — steps 3–4: màn sửa và hộp lịch sử xong; `npm test` và `npm run test:e2e` xanh.

**Batch 3** — steps 5–6: có kết quả đo trên hai giả lập, tài liệu khớp với kết quả. Bước này cần máy Mac có AVD và Xcode.

## 4. Risks

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Người gọi hiện có.** Không có `codegraph` trong phiên lập plan nên đã dò bằng `rg`. `state.revealed` chỉ được đọc ở `ui/detail.js:72`; `toggleReveal` chỉ có một chỗ gọi ở `ui/detail.js:86`; `openHistory` có một chỗ gọi, cũng ở `ui/detail.js` | Thấp | API hiện có giữ nguyên. Chạy toàn bộ e2e. Máy tính nhận handle không làm gì, nên test KM-003 không đổi hành vi |
| Hết hạn lúc đang ở form: `emit('detail')` sẽ vẽ lại form và làm hỏng phần đang gõ (reveal ở màn xem, rồi bấm Sửa) | Trung bình nếu không chặn | Chỉ `emit` khi `state.mode === 'view'`. Có test riêng: hiện, bấm Sửa, gõ, qua 30 giây, form không bị vẽ lại |
| Handle cũ chạm vào DOM cũ hoặc bản nháp đã bỏ | Trung bình | `ui.sync` kiểm `isConnected` và được gán lại ở mỗi lần vẽ. Đường vẽ lại của `multi` có file kiểm `app.state.draft === draft`. Handle cũ ở màn xem không làm gì vì `revealed.delete` trả false. Có test: hiện, Huỷ form, qua 30 giây |
| **Ít chắc nhất: đổi `input.type` trên iOS** có thể làm nhảy con trỏ hoặc đổi kiểu bàn phím trong lúc ô có focus | Trung bình | Lưu rồi khôi phục vùng chọn. E2e kiểm trên Chromium. Bước 5 kiểm trên giả lập iOS. Đổi bàn phím không làm mất dữ liệu nên chấp nhận được; mất nội dung thì dừng lại và báo |
| Ảnh màn đa nhiệm được chụp từ một khung hình cũ, dù DOM đã che | Thấp | Bước 5 đo bằng ảnh thật, không suy từ DOM. Không suy kết quả giả lập ra máy thật |
| Che trong lúc đọc secret dài gây khó chịu | Trung bình | Đã chấp nhận theo câu 1 ở §1. Bấm hiện lại là thêm 30 giây. Dùng thật mà vướng thì mở lại quyết định, không tự nới ở epic này |
| Đồng hồ máy lùi làm secret hiện quá 30 giây | Thấp | `t < start` được tính là hết hạn, vì che sớm là hướng an toàn |
| Test e2e cũ trên màn hẹp chạy qua mốc 30 giây thật rồi fail ngẫu nhiên | Thấp | `page.phone()` chỉ ở `mobile.e2e.js`; các bước hiện trong `sweep.e2e.js` kiểm ngay sau khi bấm. Fail thì sửa bằng `jump`, không nới luật |
| Tài liệu 04, 07, 08 và các artifact KM-012 đang chưa commit trên Windows | Chắc chắn | Phải commit và chuyển sang Mac trước khi implement, nếu không bước 6 sẽ conflict hoặc thiếu đầu vào |
| Khó đảo ngược | Không có | Không đổi dữ liệu, schema hay API. Revert commit là đủ; `sw.js` sinh lại theo |

## 5. Proofs

Mức kiểm là giả lập cộng server cục bộ. Máy thật không thuộc epic này (intent §6).

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-012-AC01` Màn xem: 30 giây sau khi bấm hiện thì giá trị rời khỏi DOM và nút trở lại "Hiện". Chạm, cuộn không kéo dài. Bấm hiện lại có đủ 30 giây mới. Bấm Che thì huỷ timer | Đơn vị: 29.999 giây còn hiện, 30 giây che. E2e cảm ứng, gồm cả field file và secret nhiều dòng, dò `domDump` với chuỗi đánh dấu | `npm test`; `node --test test/e2e/mobile.e2e.js` |
| `KM-012-AC02` Màn sửa: ngừng gõ 30 giây thì ô che lại (`secret`, `secret-multi`, secret OTP). Gõ thì đếm lại. Nội dung, vùng chọn và focus giữ nguyên. Lưu ra đúng giá trị đã gõ. `multi` có file về lại chip mà không mất nội dung | Đơn vị cho `touch`. E2e: gõ ở giây 20, kiểm chưa che ở giây 40, đã che ở giây 50; kiểm `input.type`, class, `selectionStart`, `document.activeElement`, select "Kiểu field mới" giữ giá trị; lưu rồi mở lại | `npm test`; `node --test test/e2e/mobile.e2e.js` |
| `KM-012-AC03` Hộp lịch sử: 30 giây sau khi bấm hiện thì cả giá trị cũ và mới rời khỏi `dialog.outerHTML`, mask và nút Hiện trở lại, dialog vẫn mở. Đóng dialog thì huỷ | E2e cảm ứng với chuỗi đánh dấu | `node --test test/e2e/mobile.e2e.js` |
| `KM-012-AC04` Trên giả lập Android và iOS, để yên 30 giây ở từng màn rồi rời app thì ảnh màn đa nhiệm không còn giá trị secret. Đối chứng: rời trước 30 giây thì vẫn lộ, đúng giới hạn intent §5 | Sáu cặp ảnh (hai giả lập, ba màn) và hai ảnh đối chứng ở `evidence/`, chờ 30 giây thật. Dùng AVD `Xperia_1V_API_35` với `adb`, và iPhone 16 iOS 18.6 với XCUITest một lần như KM-004 | Thủ công hoặc bộ điều khiển trên Mac; ghi lại lệnh và kết quả trong `implement.md` |
| `KM-012-AC05` Quay lại từ nền sau hơn 30 giây (dưới mốc khoá): secret đã che trước khi gỡ `#shield`, không cần timer chạy. Dưới 30 giây thì còn hiện | Đơn vị: `check()` khi timer đã dừng; `touch()` lúc đã quá hạn thì che, không gia hạn. E2e: xoá mọi timer như test AC06 của KM-004, `jump(31 s)`, `setBackground(false)`, kiểm DOM ngay khi hàm trả về | `npm test`; `node --test test/e2e/mobile.e2e.js` |
| `KM-012-AC06` Máy tính không đổi: `app.touch === false` thì cả ba màn không tự che | E2e ở chế độ máy tính: hiện, `jump(31 s)`, chờ qua hai nhịp, secret còn hiện | `node --test test/e2e/lock.e2e.js` |
| `KM-012-AC07` Khoá huỷ mọi timer và không có lỗi muộn: khoá khi đang hiện rồi mở lại thì mọi thứ đã che, không có gì tự vẽ lại | Đơn vị: `stopAll`. E2e: hiện, khoá, `jump`, mở khoá | `npm test`; `node --test test/e2e/lock.e2e.js` |
| `KM-012-AC08` Tài liệu 04, 07, 08 ghi đúng hành vi mới và phần còn lộ: tiêu đề, nhãn, username, mã OTP, Ghi chú, field không bí mật, hộp sinh mật khẩu, secret nếu rời app trước 30 giây (ảnh vẫn giữ sau khi app đã khoá). Ghi rõ chỉ giảm rủi ro, và điều kiện máy thật vẫn còn | Đọc đối chiếu từng mục với kết quả đo. `rg "KM-012" docs/04-security.md docs/07-features.md docs/08-roadmap.md` để không còn câu "chấp nhận cho M2" lỗi thời về việc này | Reviewer đọc; lệnh `rg` |
| Toàn epic: không hồi quy, CSP không vi phạm, `sw.js` khớp | Bộ test đầy đủ, không có file ngoài plan | `npm test`; `npm run test:browser`; `npm run test:e2e`; `git diff --stat` |

## 6. Feedback loop

- **Luật thời gian:** `node --test test/auto-mask.test.js`, đồng hồ giả, chạy tức thì.
- **Màn hình:** `node --test test/e2e/mobile.e2e.js` với `page.phone()` và `jump()` đã có sẵn, nên không phải chờ 30 giây thật. Kết thúc file kiểm cả CSP.
- **Thật:** `npm start`, `adb reverse tcp:8787 tcp:8787` cho Android; iOS vào thẳng `localhost:8787`. Chờ 30 giây thật, chụp bằng `adb exec-out screencap` và `simctl io booted screenshot`, rồi mở ảnh ra xem. Dùng secret thử, không dùng secret thật.

## 7. Deliberately not doing

- **Che khi chuyển sang `hidden`:** đã đo là không kịp với ảnh màn đa nhiệm (§1). Không thêm.
- **Che Ghi chú, field `text`, `url`, `multi` không có file:** originator chấp nhận (§1), chỉ ghi tài liệu. Hàng của `multi` có file ở hộp lịch sử đang không che (`history-diff.js:3`), giữ nguyên và ghi vào phần còn lộ.
- **Hộp sinh mật khẩu:** giá trị chưa được lưu và intent không liệt kê. Không đổi, chỉ ghi vào phần còn lộ.
- **Đổi được 30 giây trong cài đặt:** intent chốt một con số.
- **Đếm ngược trên màn hình:** intent không yêu cầu.
- **Tự che trên máy tính:** ngoài phạm vi theo intent §6.
- **Mở khoá việc cất secret thật trên điện thoại, đo trên máy thật, đo ảnh giữ bao lâu:** vẫn là điều kiện riêng (`docs/08-roadmap.md`, câu 3 ở intent).
- **Dọn `state.revealed = new Set()` rải ở sáu chỗ trong `app.js`:** chạy đúng với thiết kế này, không cần đụng.

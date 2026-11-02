# Spec — Bảo mật tài khoản: đổi mật khẩu, thiết bị, snapshot

**Epic ID:** `KM-009`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `intent.md`

---

## 1. Overview

> *One paragraph: what this is, and which line of `intent.md` it serves.*

KM-009 cho chủ tài khoản bốn cách phản ứng khi có chuyện, đúng bốn khoảnh khắc ở intent §1: đổi master password, xem và thu hồi thiết bị đang đăng nhập, xem và khôi phục bản cũ của vault trên server, xem nhật ký để trả lời "tài khoản có bị đụng không". Đạt nghĩa là **đạt trên server cục bộ, với trình duyệt laptop cùng giả lập Android, rồi cùng giả lập iOS**, không hơn (intent §5, KM-006 Concern 8). Kế thừa không đổi: cách đăng nhập, cách sync, máy bị từ chối phiên vẫn dùng được bản cục bộ (KM-006); passkey theo từng thiết bị (KM-007); quy tắc gộp (KM-002). Điều spec này đổi: `KM-006-FR08` (đăng nhập lại sau khi đổi mật khẩu thì thay bộ khoá bọc trên máy, FR14); `docs/05-sync.md` § Khôi phục snapshot (cách đang ghi làm mất dữ liệu, Concern 1); phần còn lại ở mục 8. Spec này trả lời cả ba câu ở intent §7 (Concern 1, 2, 4, 7).

## 2. Constraints applied

> *The skills, standards and docs loaded before writing this spec. A reviewer must
> be able to tell what this spec was bound by.*

| Source | What it constrains |
|---|---|
| `CLAUDE.md` | `.claude/CLAUDE.md`: JavaScript thuần, không build, không phụ thuộc thứ ba ở runtime; phân lớp `ui/` → `app.js` → `store`/`sync` → `core/`; `core/` thuần và là hợp đồng ở 09; server không giải mã gì; test chỉ dùng `node:test`; server test bằng wrangler cục bộ; CSP chỉ `'self'`, không `innerHTML` với dữ liệu người dùng; không ghi password, khoá, secret, plaintext ra `console`, lỗi hay URL; Service Worker không cache `/api/*` |
| `.aidlc/workspace.yaml`, `state.json`, `inputs.json` | `artifact_language: vi`; `strict_mode: true`; chưa có feedback hay lần từ chối; `from_epic: KM-006`. Không có project skill nào ràng buộc thêm |
| `docs/epics/KM-009/artifacts/intent.md`, `KM-009.md` | Phạm vi, "Not this", ba câu hỏi mở; 6 trong 7 thao tác nhận về, thao tác còn lại về KM-011 |
| `docs/epics/KM-006` (`intent`, `spec`, `plan`) | FR08, FR11, FR13, FR15, FR25, FR31, FR39, NFR07; Concern 8; plan ghi "cùng `userId` mà khác bộ khoá bọc" thuộc KM-009 |
| `docs/epics/KM-007` (`intent`, `spec`) | FR18, AC22, Concern 14: đổi mật khẩu không làm hỏng passkey; xoay khoá và đặt lại mật khẩu không thuộc epic này |
| `docs/epics/KM-005/artifacts/spec.md` | FR16, NFR04 (không phân biệt được username, chênh ≤ 5 ms), NFR07 (p95 ≤ 200 ms), Concern 7 (`iter`), Concern 17 (không lưu thô username đã thử sai và IP), Concern 18 |
| `docs/epics/KM-008/artifacts/spec.md` | NFR11, Concern 3 dựa vào snapshot làm đường cứu sau khi xoá trắng; xoay khoá vault xoá snapshot cũ |
| `docs/epics/KM-003/artifacts/spec.md` | FR28 (khôi phục một bản lịch sử), FR47, AC44 (đang cấm "đổi mật khẩu" trên giao diện) |
| `docs/03-data-model.md` | Hành động nhật ký, dữ liệu giữ cho mỗi bản cũ, `HISTORY_MAX` = 20, quy tắc xoá trắng |
| `docs/04-security.md` | Vòng đời khoá, mối đe doạ, giới hạn đăng nhập sai, điều kiện trước khi đưa secret thật lên server |
| `docs/05-sync.md` | Quy tắc gộp, bảng xoá, § Khôi phục snapshot, câu lệnh giữ bản cũ |
| `docs/06-api.md` | Hình dạng các thao tác của epic; cách trả lỗi; `404` chung cho vault không thuộc mình |
| `docs/07-features.md`, `docs/08-roadmap.md` | F-AUTH-06, F-AUTH-07, F-SYNC-03, F-DATA-05; nội dung M5 |
| `docs/09-core-api.md` | `newKdf`, `deriveFromPassword`, `wrapAccountKey`, `restoreItemVersion`; đổi hợp đồng thì sửa 09 trong cùng thay đổi |
| `src/functions/api/*`, `src/public/js/core/*`, `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` (đã đọc, 2026-11-02) | Cách ghi vault, đếm đăng nhập sai và gia hạn phiên hiện tại; client chưa gửi tên thiết bị; danh sách từ cấm trên giao diện |
| Chạy thử trên `merge.js` và `model.js` thật (2026-11-02) | Kết quả bốn cách khôi phục (Concern 1) |
| Quyết định của originator trong intent (2026-11-02) | Khôi phục là gộp; không nâng số vòng; nhật ký không ghi sự cố đồng bộ; rủi ro mật khẩu cũ trên máy chưa đăng nhập lại |

## 3. User scenarios

### 3.1 Primary flow
> *Given / when / then, from the user's point of view.*

Dữ liệu thử, server cục bộ. "Máy A" là trình duyệt laptop, "máy B" lần lượt là giả lập Android rồi giả lập iOS. Cả hai cùng tài khoản, đã đồng bộ.

1. **Đổi mật khẩu.** *Given* máy A đang mở khoá, có mạng, *when* người dùng nhập mật khẩu hiện tại và nhập mật khẩu mới hai lần, *then* app báo mật khẩu mới có hiệu lực; A vẫn dùng và đồng bộ tiếp; khoá rồi mở bằng mật khẩu mới được, mật khẩu cũ thì không; dữ liệu không đổi.
2. **Máy kia mất quyền.** *Given* bước 1 xong, máy B đang chạy, có thay đổi chưa đẩy lên, *when* B liên lạc với server, *then* B chấm đỏ "Cần đăng nhập lại", vẫn đọc và sửa được.
3. **Máy kia đăng nhập lại.** *Given* bước 2, *when* B đăng nhập lại bằng mật khẩu mới, *then* thay đổi chưa đẩy của B lên server và A nhận được; từ đó khoá B lại thì mật khẩu cũ không mở được, mật khẩu mới thì được.
4. **Passkey.** *Given* B đã bật passkey từ trước bước 1, *when* mở khoá bằng passkey sau bước 1 và sau bước 3, *then* thấy đúng dữ liệu đó.
5. **Thiết bị.** *Given* tài khoản có các phiên trên A và B, *when* mở màn Thiết bị trên A, *then* thấy cả hai, A được đánh dấu là máy này. *When* thu hồi B, *then* ở lần liên lạc kế tiếp B không đọc hay ghi được gì trên server, A không bị ảnh hưởng.
6. **Xem bản cũ.** *Given* vault đã được ghi nhiều lần, *when* mở danh sách bản cũ và chọn một bản, *then* thấy thời gian, thiết bị, kích thước, xem được nội dung và biết khôi phục sẽ đổi những gì; trên máy và trên server chưa có gì thay đổi.
7. **Khôi phục.** *Given* item X đã sửa, item Y đã xoá sau bản cũ, item Z mới thêm sau bản cũ, máy B có thay đổi chưa đẩy lên, *when* A khôi phục rồi hai máy đồng bộ, *then* hai máy giống nhau theo nội dung; X hiện giá trị cũ và giá trị ngay trước đó nằm trong lịch sử; Y quay lại; Z vẫn còn; thay đổi của B vẫn còn, ở item hoặc trong lịch sử.
8. **Nhật ký.** *Given* đã có các bước trên và vài lần đăng nhập sai, *when* mở nhật ký, *then* thấy đăng nhập đúng và sai, thu hồi phiên, đổi mật khẩu, khôi phục, kèm thời gian và thiết bị khi biết.

### 3.2 Edge and error paths
> *Dependency down, permission denied, empty state, boundary inputs, interruption
> and recovery.*

| Tình huống | Kết quả mong đợi |
|---|---|
| Sai mật khẩu hiện tại, hai ô mật khẩu mới khác nhau, hoặc mật khẩu mới trùng mật khẩu hiện tại | Báo ngay trên máy, không có request |
| Đổi mật khẩu khi mất mạng hoặc server tắt | Báo không kết nối được và **mật khẩu cũ vẫn có hiệu lực**; không đổi gì |
| Đổi mật khẩu khi tài khoản chưa đăng ký, đã đăng xuất, hoặc đang cần đăng nhập lại | Không có thao tác đổi; nói rõ phải đăng ký hoặc đăng nhập trước (Concern 16) |
| Mất phản hồi sau khi gửi đổi mật khẩu, hoặc app bị đóng giữa chừng | Báo **chưa xác nhận được**; máy vẫn mở được bằng mật khẩu cũ; có mạng lại thì tự kiểm và báo mật khẩu nào có hiệu lực, kể cả sau khi mở lại app (FR08, FR09) |
| Server đã đổi nhưng máy không nhận được phiên mới | Máy này xử lý như máy B: "Cần đăng nhập lại", không mất thay đổi chờ, mật khẩu cũ mở được bản cục bộ tới khi đăng nhập lại |
| Sai mật khẩu hiện tại ở server (phiên lạ, dữ liệu trên máy lệch) | Báo sai mật khẩu; phiên vẫn còn; lần sai tính chung với giới hạn đăng nhập, quá ngưỡng thì báo còn bao nhiêu phút (FR06) |
| Hai máy đổi mật khẩu gần như cùng lúc | Lần tới server trước thắng; máy kia mất phiên, báo mật khẩu cũ không còn hiệu lực (FR16) |
| Máy B đang khoá, chưa nhận tin, người dùng gõ mật khẩu mới ở màn khoá | Báo sai mật khẩu, kèm gợi ý nếu vừa đổi ở máy khác thì đăng nhập lại. Không tự gửi gì lên server (FR15) |
| Máy B đã đăng xuất giữ dữ liệu, rồi đổi mật khẩu ở máy A | Đăng nhập lại trên B bằng mật khẩu mới chạy như bước 3 |
| Bộ khoá server trả về không mở được vault trên máy | Không thay gì trên máy, không đẩy gì lên, báo lỗi (FR14) |
| Thu hồi phiên khi mất mạng hoặc phiên không còn | Báo lỗi; danh sách không đổi. Phiên đã mất thì coi như đã thu hồi |
| Thu hồi máy này | Không có nút thu hồi; dòng máy này dẫn tới luồng đăng xuất của KM-006 |
| Máy bị thu hồi đang có thay đổi chờ | Như `KM-006-FR25`; đăng nhập lại được nếu biết mật khẩu, nên giao diện nhắc đổi mật khẩu khi nghi lộ (FR20) |
| Vault chưa có bản cũ nào | Nói rõ chưa có và vì sao, không báo lỗi |
| Xem bản cũ khi offline | Báo cần kết nối; dữ liệu trên máy dùng bình thường |
| Bản cũ không giải mã được hoặc không hợp lệ | Báo lỗi riêng bản đó, không có thao tác khôi phục; các bản khác vẫn xem được |
| Bản đang xem đã rơi khỏi 30 bản | Báo bản này không còn, tải lại danh sách |
| Bản cũ giống hệt dữ liệu hiện tại | Báo không có gì để khôi phục, không ghi gì |
| Mất mạng hoặc đóng app sau khi bấm khôi phục | Kết quả đã ghi trên máy và ở trạng thái chờ; đẩy lên ở lượt sau, không mất, không khôi phục hai lần |
| Máy B sửa cùng giá trị với giá trị được khôi phục | Một bản hiện ra, bản kia trong lịch sử, có đánh dấu xung đột trên đúng giá trị đó |
| Item trong bản cũ đã vào thùng rác hoặc đã xoá trắng | Không làm item hiện tại biến mất; xem được ở phần xem trước (FR29) |
| Bản hiện tại trên server không giải mã được | Khôi phục không cứu được trường hợp này (Concern 21); báo lỗi như `KM-006-FR23` |
| Đăng nhập sai liên tục | Nhật ký không đầy, không đẩy mất dấu vết khác (FR38) |
| Thử username không tồn tại | Không ghi gì; phản hồi và thời gian không khác trường hợp có thật (NFR03) |
| Nhật ký trống hoặc offline | Nói rõ chưa có gì, hoặc cần kết nối |
| Tên thiết bị do bên gửi tự khai, có ký tự lạ hoặc giả tên máy thật | Hiện đúng dạng chữ, không chạy gì. Dòng đăng nhập sai ghi rõ tên do bên gửi tự khai (FR39) |

## 4. Functional requirements

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-009-FR01` | Tài khoản đã đăng ký, đang mở khoá, phiên còn hiệu lực có thao tác đổi mật khẩu: nhập mật khẩu hiện tại, mật khẩu mới hai lần. Có thanh đo độ mạnh theo `KM-006-FR02`, mức Yếu cảnh báo nhưng không chặn. Giao diện nói rõ chưa có cách đặt lại khi quên. Các trạng thái khác không có thao tác này và nêu việc cần làm trước | Must | §5 Đổi mật khẩu; §6 Đặt lại mật khẩu; Concern 16 |
| `KM-009-FR02` | Mật khẩu hiện tại được kiểm trên máy; hai ô mới phải khớp; mật khẩu mới phải khác mật khẩu hiện tại sau chuẩn hoá NFC. Không đạt thì 0 request | Must | §5 Không bị khoá ngoài |
| `KM-009-FR03` | Không kết nối được, hoặc server từ chối rõ ràng: không đổi gì trên máy hay server; báo lý do và **mật khẩu cũ vẫn có hiệu lực** | Must | §5 Không bị khoá ngoài |
| `KM-009-FR04` | Đổi thành công là trọn vẹn ở server: salt mới, số vòng giữ 600 000, cùng `accountKey`; mật khẩu cũ không đăng nhập được, mật khẩu mới được; mọi phiên khác mất hiệu lực; mọi vault, khoá vault và bản cũ không đổi từng byte. Không có trạng thái nửa vời khi lỗi giữa chừng | Must | §5 Đổi mật khẩu; 04 Vòng đời khoá |
| `KM-009-FR05` | Máy đổi mật khẩu nhận phiên mới và dùng tiếp. Máy ghi trọn vẹn cùng lúc tham số dẫn xuất khoá, bộ khoá bọc mới và phiên mới; thay đổi chờ còn nguyên và đẩy lên bằng phiên mới. Phiên cũ của máy này bị từ chối từ lúc đó | Must | §5 Đổi mật khẩu; Concern 19 |
| `KM-009-FR06` | Server chỉ đổi khi mật khẩu hiện tại đúng. Sai thì không đổi gì, phiên vẫn còn (không hiện "Cần đăng nhập lại"), lần sai tính chung với bộ đếm đăng nhập sai của username đó; đang bị khoá thì báo còn bao nhiêu phút | Must | §5 Không bị khoá ngoài; 04 Rate limit; Concern 15 |
| `KM-009-FR07` | Server từ chối, không đổi gì, khi tham số mới có số vòng khác 600 000, salt mới trùng salt hiện tại, hoặc dữ liệu sai dạng | Must | §6 Nâng số vòng; KM-005 Concern 7 |
| `KM-009-FR08` | Sau mỗi lần thử, app báo đúng một trong ba kết quả: mật khẩu mới có hiệu lực; mật khẩu cũ vẫn có hiệu lực; chưa xác nhận được. Mất phản hồi, lỗi `5xx`, app bị đóng hoặc khoá giữa chừng đều là "chưa xác nhận được", trừ khi đã biết chắc kết quả | Must | §5 Không bị khoá ngoài; Concern 13 |
| `KM-009-FR09` | "Chưa xác nhận được" được ghi nhớ qua các lần mở app và tự giải quyết khi liên lạc được server, không cần thao tác: tham số dẫn xuất khoá của tài khoản chưa đổi thì báo mật khẩu cũ vẫn có hiệu lực; đã đổi thì báo mật khẩu cũ không còn hiệu lực và mời đăng nhập lại bằng mật khẩu mới. Trong lúc chờ, máy vẫn mở bằng mật khẩu cũ. Mật khẩu người dùng nhập không được ghi xuống máy để phục vụ việc này | Must | §5 Không bị khoá ngoài; Concern 13, 14 |
| `KM-009-FR10` | Request gửi bằng phiên cũ trước lúc đổi, có phản hồi `401` sau đó, không làm máy vừa đổi thành công chuyển sang "Cần đăng nhập lại" | Must | §5 Đổi mật khẩu "máy A vẫn dùng tiếp" |
| `KM-009-FR11` | Đổi mật khẩu không đổi, không đọc, không gửi bản ghi passkey trên bất kỳ máy nào. Máy đã bật passkey vẫn mở khoá và thấy đúng dữ liệu, trước và sau khi đăng nhập lại | Must | §5 Passkey; KM-007-FR18 |
| `KM-009-FR12` | Máy khác ở lần liên lạc kế tiếp nhận `401` và xử lý đúng `KM-006-FR25`: đọc, sửa vẫn chạy, giữ thay đổi chờ, "Cần đăng nhập lại". Mật khẩu cũ vẫn mở bản cục bộ trên máy đó tới khi đăng nhập lại | Must | §5 Đổi mật khẩu; §6 Mật khẩu cũ trên máy chưa đăng nhập lại |
| `KM-009-FR13` | Trên máy đã có tài khoản, đăng nhập bằng mật khẩu cũ sau khi đã đổi bị từ chối bằng cùng một câu của `KM-006-FR06`; dữ liệu trên máy không đổi | Must | §5 Đổi mật khẩu |
| `KM-009-FR14` | **Thay `KM-006-FR08`.** Đăng nhập cùng `userId` mà bộ khoá bọc hoặc tham số dẫn xuất khoá khác trên máy: trước hết kiểm khoá vừa mở từ server mở được khoá của mọi vault trên máy, không cần mật khẩu cũ. Đạt thì ghi trọn vẹn tham số, bộ khoá bọc và phiên mới, không đổi dữ liệu và passkey, đẩy thay đổi chờ; từ đó mật khẩu cũ không mở được bản cục bộ. Không đạt thì không thay gì, không đẩy gì lên, huỷ phiên vừa tạo nếu kết nối được, báo lỗi. Trường hợp bộ khoá giống nhau giữ nguyên như FR08 | Must | §1 Đăng nhập lại; §5 Máy phải đăng nhập lại; Concern 11 |
| `KM-009-FR15` | Màn khoá của tài khoản đã đăng ký: sai mật khẩu thì câu báo kèm gợi ý "vừa đổi ở máy khác thì đăng nhập lại" và lối đăng nhập điền sẵn username. Màn khoá vẫn 0 request cho tới khi người dùng chọn lối đó (`KM-006-FR15`) | Must | §5 Máy phải đăng nhập lại; Concern 12 |
| `KM-009-FR16` | Hai lần đổi đồng thời: chỉ một lần được áp dụng trọn vẹn. Máy thua nhận `401` và xử lý như FR09 | Should | §5 Không bị khoá ngoài |
| `KM-009-FR17` | Màn Thiết bị liệt kê mọi phiên còn hiệu lực của tài khoản, không có phiên hết hạn hay đã mất hiệu lực do đổi mật khẩu: tên thiết bị, lúc đăng nhập, lần dùng gần nhất, đánh dấu "Máy này". Không có tên thì ghi "Thiết bị không rõ". Mới dùng gần nhất ở đầu, máy này luôn đầu danh sách | Must | §5 Thiết bị |
| `KM-009-FR18` | Đăng ký và đăng nhập gửi tên thiết bị tự suy ra từ nền tảng và trình duyệt, không chứa username, id hay dữ liệu vault; tối đa 100 ký tự như 06. Phiên tạo trước đó hiện "Thiết bị không rõ" | Must | §5 Thiết bị; Concern 17 |
| `KM-009-FR19` | Thu hồi một phiên khác sau một bước xác nhận: phiên biến khỏi danh sách; request kế tiếp của phiên đó nhận `401`; các phiên khác không đổi. Phiên của lần đăng xuất offline (`KM-006-FR11`) hiện và thu hồi được như mọi phiên khác | Must | §5 Thiết bị |
| `KM-009-FR20` | Hộp xác nhận thu hồi nói rõ: dữ liệu đã mã hoá trên máy đó vẫn còn, ai biết mật khẩu vẫn đăng nhập lại được, muốn chặn thì đổi mật khẩu | Must | §6 Xoá từ xa |
| `KM-009-FR21` | Dòng "Máy này" không có nút thu hồi mà dẫn tới luồng đăng xuất của `KM-006-FR10`. Thu hồi chính phiên đang dùng qua server có tác dụng như đăng xuất. Thu hồi id không tồn tại hoặc của tài khoản khác cùng một `404` | Must | 06; §5 Thiết bị |
| `KM-009-FR22` | Mỗi lần ghi vault thành công giữ lại bản vừa bị thay, cùng một thao tác trọn vẹn với lần ghi. Lần ghi bị từ chối (lệch version, quá lớn, sai dạng) không tạo bản nào. Mỗi vault giữ đúng 30 bản mới nhất, không tính bản hiện tại | Must | §1 Một lần sync ghi đè; §5 Xem snapshot; Concern 5 |
| `KM-009-FR23` | Mỗi bản giữ lại cho biết: version, thời điểm bản đó được ghi lên server (không phải lúc nó bị thay), tên thiết bị đã ghi nó, kích thước. Tên vẫn còn sau khi phiên đó mất; không biết thì ghi "Thiết bị không rõ" | Must | §5 Xem snapshot; Concern 6 |
| `KM-009-FR24` | Với một vault, danh sách hiện các bản cũ mới nhất ở đầu, kèm thông tin ở FR23 và câu cho biết đang giữ được từ thời điểm nào. Tài khoản có nhiều vault thì chọn được vault theo tên đã giải mã. Bản của vault không thuộc tài khoản trả cùng một `404`. Chưa có bản nào thì ghi trạng thái trống | Must | §5 Xem snapshot; Concern 4 |
| `KM-009-FR25` | Xem một bản: tải về, giải mã trên máy, hiện chỉ đọc project, env, item theo đúng quy tắc che secret, hiện và copy của app (OTP chỉ hiện mã). Kèm số item sẽ quay lại, sẽ đổi nội dung, và thêm sau bản này (vẫn giữ). Xem không ghi gì xuống máy hay lên server. Nội dung bản đang xem bị bỏ khỏi bộ nhớ khi đóng màn xem hoặc khi app khoá | Must | §5 Xem snapshot |
| `KM-009-FR26` | Bản không tải được, không giải mã được hoặc không hợp lệ: báo lỗi riêng bản đó, không có thao tác khôi phục, không đổi gì | Must | §5 Khôi phục không làm mất gì; 09 |
| `KM-009-FR27` | Khôi phục sau một bước xác nhận nêu các con số ở FR25. Khi có sự khác biệt, kết quả ghi xuống máy trọn vẹn như **một lần lưu bình thường** rồi đồng bộ theo `KM-006`. Sau khi bấm, mất mạng hay đóng app không làm mất kết quả. Không có sự khác biệt thì không ghi gì | Must | §5 Khôi phục; Concern 1 |
| `KM-009-FR28` | Với item **còn sống trong bản cũ**: (a) hiện tại đang sống và khác nội dung: nội dung bản cũ hiện ra với đồng hồ mới, nội dung ngay trước đó vào đầu lịch sử với nhãn "Khôi phục", đúng cách của `KM-003-FR28`, gồm cả việc giữ nguyên env đang gán; (b) đang ở thùng rác: như (a) và ra khỏi thùng rác; (c) đã xoá trắng: quay lại với nội dung và env của bản cũ; (d) giống hệt: không đổi, không thêm lịch sử | Must | §5 Khôi phục; Concern 1, 3 |
| `KM-009-FR29` | Khôi phục **không làm biến mất gì**: item thêm sau bản cũ giữ nguyên; item đang sống mà trong bản cũ đã vào thùng rác hoặc đã xoá trắng giữ nguyên; item trong thùng rác hoặc đã xoá trắng ở cả hai bên giữ nguyên. Item đang trong thùng rác ở bản cũ không tự quay lại, nhưng phần xem trước có hiện nội dung và copy được | Must | §5 Khôi phục; §6 Đưa vault về đúng trạng thái cũ |
| `KM-009-FR30` | Project, env còn sống trong bản cũ mà hiện tại đã xoá thì sống lại với tên, thứ tự, màu của bản cũ. Project, env đang sống giữ nguyên tên, thứ tự, màu hiện tại. Project, env mới thêm sau bản cũ giữ nguyên | Must | §5 Khôi phục; Concern 1 |
| `KM-009-FR31` | Khôi phục không tạo đánh dấu xung đột nào trên máy thực hiện và không xoá đánh dấu đang có. Máy khác không có thay đổi chờ thì không có đánh dấu mới. Máy có thay đổi chờ chỉ có đánh dấu trên đúng giá trị hai bên cùng đổi | Must | §7 câu 1; Concern 1 |
| `KM-009-FR32` | Máy khác có thay đổi chưa đẩy lên: gộp theo quy tắc hiện có, không mất giá trị nào, ở item hoặc trong lịch sử, trừ khi bị cắt theo `HISTORY_MAX`. **Không đổi quy tắc gộp.** Thao tác khôi phục mới ở lõi được ghi vào 09 | Must | §5 Khôi phục; §7 câu 1; `KM-006-FR39` |
| `KM-009-FR33` | Bản ngay trước khi khôi phục trở thành một bản cũ sau khi đẩy lên, nên khôi phục nhầm thì khôi phục lại bản đó được | Should | §5 Khôi phục; Concern 2 |
| `KM-009-FR34` | Nhật ký ghi đúng các hành động: đăng nhập đúng, đăng nhập sai, thu hồi phiên, đổi mật khẩu, khôi phục snapshot, kèm thời gian server, thiết bị khi biết; khôi phục kèm vault và version. Không ghi hành động nào khác | Must | §5 Nhật ký; §6 Ghi sự cố đồng bộ; Concern 9 |
| `KM-009-FR35` | Dòng nhật ký không chứa secret hay nội dung vault, gồm: mật khẩu, `authKey`, token, khối mã hoá, tên vault, username đã gõ, IP dạng gốc | Must | §5 Nhật ký; KM-005 Concern 17 |
| `KM-009-FR36` | Đăng nhập sai được ghi chỉ khi username có thật. Lần bị chặn vì đang khoá không được ghi. Sai mật khẩu hiện tại lúc đổi mật khẩu ghi thành dòng riêng, cùng nhóm đăng nhập sai | Must | §5 Nhật ký; §7 câu 3; Concern 7, 8 |
| `KM-009-FR37` | Đăng nhập đúng, thu hồi phiên, đổi mật khẩu ghi nhật ký trọn vẹn cùng thao tác: không ghi được thì thao tác thất bại. Khôi phục đi kèm lần đẩy mang kết quả, có ít nhất một dòng kể cả khi lần đẩy đầu bị gián đoạn (Concern 10). Đăng nhập sai ghi sau khi đã phản hồi; ghi lỗi không đổi phản hồi `401` | Must | §5 Nhật ký; Concern 8, 10 |
| `KM-009-FR38` | Nhật ký giữ theo số dòng, không theo thời gian: mỗi tài khoản 1 000 dòng mới nhất cho nhóm đăng nhập sai và 1 000 dòng mới nhất cho nhóm còn lại, tính riêng. Đăng nhập sai không bao giờ đẩy mất dòng nhóm kia | Must | §7 câu 3; Concern 7 |
| `KM-009-FR39` | Màn nhật ký chỉ cho tài khoản đang đăng nhập: mới nhất ở đầu, 50 dòng một lần, xem thêm được tới hết phần còn giữ; có lựa chọn ẩn nhóm đăng nhập sai. Mỗi loại có câu dễ hiểu; vault hiện tên đã giải mã khi có, không thì 8 ký tự đầu của id. Tên thiết bị hiện dạng chữ, dòng đăng nhập sai ghi rõ tên do bên gửi tự khai | Must | §5 Nhật ký; Concern 7, 17 |
| `KM-009-FR40` | Có bộ test chạy bằng lệnh, dùng hai bộ dữ liệu trình duyệt riêng trên server cục bộ thật, đi qua mọi tình huống ở mục 3 kể cả các điểm gián đoạn. `npm test` vẫn chạy được khi chưa cài gì | Must | §5; `CLAUDE.md` |
| `KM-009-FR41` | Originator kiểm tay trên từng cặp (laptop + giả lập Android, laptop + giả lập iOS) theo `AC49`; kết quả từng mục theo từng cặp ghi vào `implement.md`. Mục không làm được quay lại originator, không tự coi là đạt hay tự bỏ. Epic chỉ đóng sau khi KM-006 và KM-007 đóng | Must | §5 đoạn đầu |
| `KM-009-FR42` | Sửa `KM-009.md`: bỏ xoay khoá tài khoản khỏi phần API nhận về, thêm phụ thuộc KM-007, sửa "Xong khi" theo mức kiểm ở intent §5. Sửa dòng KM-009 ở 09 (bỏ xoay khoá). Xác nhận intent KM-007 và 04 không còn hứa việc đã đưa ra (KM-007-FR24) | Must | §5 Tài liệu khớp; §4 |
| `KM-009-FR43` | Sửa 03: danh sách hành động nhật ký và dữ liệu giữ cho mỗi bản cũ khớp FR23, FR34. Sửa 05: viết lại § Khôi phục snapshot theo FR27–FR33, sửa câu giữ 30 bản (Concern 5). Sửa 06: các thao tác của epic, gồm thông tin mới của bản cũ, phân trang nhật ký, lỗi sai mật khẩu hiện tại, cách báo khôi phục. Sửa 07: F-DATA-05 không còn "lỗi xung đột". Sửa 08: ghi mức đạt của phần này. Sửa 09: thêm thao tác khôi phục. Ghi `KM-006` rằng FR08 đã đổi và câu "chưa đổi được cho tới KM-009" ở FR02 không còn đúng (đổi cả chữ trên giao diện); ghi `KM-003` rằng FR47 bỏ mục "đổi mật khẩu" (Concern 18) | Must | §5 Tài liệu khớp; `CLAUDE.md` |
| `KM-009-FR44` | Sửa 04: bỏ bốn mục đã có khỏi danh sách cần xem lại; ghi các rủi ro: nghi lộ `accountKey` chưa xử lý được, mật khẩu cũ trên máy chưa đăng nhập lại, thu hồi không xoá từ xa, quên mật khẩu chưa đặt lại được, nội dung đã xoá trắng còn trong tối đa 30 bản cũ (Concern 3), file backup cũ vẫn mở bằng mật khẩu cũ (Concern 23), tín hiệu salt đổi (Concern 14), giới hạn 30 lần ghi (Concern 4). Giữ nguyên: đưa secret thật lên server vẫn do originator quyết và cần `KM-014` xong | Must | §5 Tài liệu khớp; §6 |
| `KM-009-FR45` | Thêm vào danh sách việc của `KM-014`: các thao tác server mới của epic; đo dung lượng bản cũ (trần 60 MB mỗi vault) và số lần ghi thêm do nhật ký trên gói Free; thời gian đổi mật khẩu trên điện thoại thật | Must | §5 Tài liệu khớp; §7 câu 2 |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-009-NFR01` | Server không đọc được gì | Dò toàn bộ dữ liệu server cục bộ sau chuỗi ở mục 3.1, dạng gốc, base64, hex: 0 lần trùng với mật khẩu cũ, mật khẩu mới, plaintext vault (kể cả nội dung bản cũ), `encKey`, `accountKey`, `vaultKey`, `authKey` và token dạng gốc |
| `KM-009-NFR02` | Không lộ trên máy và qua kênh phụ | Dò bộ nhớ trình duyệt, `console` client và server, URL đã gọi, thông báo lỗi: 0 lần trùng với mật khẩu cũ, mật khẩu mới, khoá chưa bọc, plaintext. Sau khi khoá app: nội dung bản đang xem không còn tham chiếu trong trạng thái app |
| `KM-009-NFR03` | Không dò được username | Sau khi thêm ghi nhật ký: phản hồi của sai mật khẩu và username không tồn tại vẫn giống từng byte; chênh lệch trung vị ≤ 5 ms trên 200 lần mỗi nhánh (giữ `KM-005-NFR04`) |
| `KM-009-NFR04` | Không bị khoá ngoài | Cắt kết nối tại mọi điểm của đổi mật khẩu và đăng nhập lại (trước khi gửi, sau khi server ghi, trước và trong lúc ghi xuống máy, đóng app): 100% trường hợp vẫn vào được dữ liệu bằng mật khẩu cũ hoặc mật khẩu mới; kết quả báo khớp trạng thái server sau lần liên lạc kế tiếp |
| `KM-009-NFR05` | Không mất dữ liệu khi khôi phục | Với mọi tổ hợp ở AC30–AC38: mọi giá trị trước khi khôi phục còn lại ở item hoặc lịch sử, trừ bản cũ nhất bị cắt theo `HISTORY_MAX`; giá trị vừa bị thay luôn còn. Hai máy giống nhau theo nội dung sau ≤ 2 lượt đẩy |
| `KM-009-NFR06` | Tốc độ ghi | Ghi vault 200 KB có giữ bản cũ: p95 ≤ 200 ms trên 100 lần tuần tự, máy dev (giữ `KM-005-NFR07`). Sau 1 000 lần ghi, số bản của vault đúng bằng 30 |
| `KM-009-NFR07` | Tốc độ màn hình | Trên máy dev, vault 200 KB: danh sách thiết bị, bản cũ, nhật ký hiện ≤ 1 s; xem một bản ≤ 2 s; khôi phục không chặn giao diện quá 300 ms. Đổi mật khẩu có báo đang xử lý, số đo ghi vào `implement.md`, không chấm ngưỡng. Các ngưỡng này chưa có số đo cơ sở |
| `KM-009-NFR08` | Thu hồi có hiệu lực ngay | 100% request dùng phiên đã thu hồi hoặc đã mất hiệu lực, sau khi thao tác trả về, nhận `401` |
| `KM-009-NFR09` | Giới hạn nhật ký | Tấn công liên tục theo giới hạn hiện có tạo tối đa khoảng 480 dòng đăng nhập sai mỗi ngày cho một username (5 lần mỗi 15 phút khoá); số lần thử bao nhiêu thì một tài khoản cũng không vượt 2 000 dòng |
| `KM-009-NFR10` | Accessibility | Mọi màn mới dùng được bằng bàn phím, có tên cho trình đọc màn hình, không chỉ dựa vào màu; thông báo kết quả ở vùng `status` hoặc `alert`; vùng chạm ≥ 44×44 px |
| `KM-009-NFR11` | Tương thích | Chrome desktop; Chrome trên giả lập Android; Safari trên giả lập iOS; cả tab lẫn app đã cài. Không làm vỡ giới hạn 3 lần chạm tới copy ở 07 |
| `KM-009-NFR12` | Không ảnh hưởng phần đã có | `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run test:server`, `npm run vectors` đều xanh; `merge.js` và vector không đổi; `dependencies` rỗng; không thêm devDependency; CSP không đổi |
| `KM-009-NFR13` | Không có cửa sau cho test | Mã chạy thật không có cờ hay nhánh chỉ dành cho test. Test đổi thời gian, mạng hay trạng thái qua trình duyệt, kho cục bộ hoặc đồng hồ được truyền vào |
| `KM-009-NFR14` | Chỉ dữ liệu thử | Mọi lần kiểm, kể cả kiểm tay, chỉ dùng dữ liệu thử; không ghi giá trị thật vào `implement.md`, ảnh hay log |

## 6. Acceptance criteria

| Id | Given / When / Then |
|---|---|
| `KM-009-AC01` | *Given* máy A đã đăng ký, mở khoá *when* nhập sai mật khẩu hiện tại, hai ô mới khác nhau, hoặc mật khẩu mới trùng mật khẩu hiện tại (kể cả khác dạng NFC/NFD) *then* mỗi ca một thông báo, 0 request (FR02) |
| `KM-009-AC02` | *Given* tài khoản chưa đăng ký, đã đăng xuất, và đang "Cần đăng nhập lại" *when* mở phần đổi mật khẩu *then* không có thao tác đổi, có câu nêu việc cần làm (FR01) |
| `KM-009-AC03` | *Given* mật khẩu mới mức Yếu *when* đổi *then* có cảnh báo, không bị chặn; giao diện có câu về việc chưa đặt lại được khi quên (FR01) |
| `KM-009-AC04` | *Given* hai máy, có dữ liệu *when* đổi mật khẩu trên A *then* salt đổi, số vòng vẫn 600 000; mọi blob, khoá vault, meta và bản cũ trên server trùng từng byte với trước đó; đăng nhập bằng mật khẩu cũ `401`, mật khẩu mới thành công và mở ra cùng dữ liệu (FR04, FR13) |
| `KM-009-AC05` | *Given* AC04, A có thay đổi chờ *when* A dùng tiếp, khoá, mở *then* A không bị hỏi đăng nhập; token cũ bị từ chối, token mới dùng được; thay đổi chờ lên server; mở bằng mật khẩu mới được, mật khẩu cũ báo sai (FR05) |
| `KM-009-AC06` | *Given* lượt đồng bộ đang chạy bằng token cũ *when* đổi mật khẩu thành công rồi lượt đó nhận `401` *then* A không chuyển sang "Cần đăng nhập lại", lượt sau chạy bình thường (FR10) |
| `KM-009-AC07` | *Given* mất kết nối trước khi gửi, server tắt, và server trả `400` *when* đổi mật khẩu *then* báo mật khẩu cũ vẫn có hiệu lực; trên máy và server không đổi; không có "chưa xác nhận" (FR03, FR08) |
| `KM-009-AC08` | *Given* server đã ghi nhưng phản hồi bị cắt *when* quan sát *then* báo "chưa xác nhận được"; A mở được bằng mật khẩu cũ; có mạng lại thì tự báo mật khẩu cũ không còn hiệu lực; đăng nhập lại bằng mật khẩu mới thì đủ dữ liệu, thay đổi chờ lên server (FR08, FR09, FR14, NFR04) |
| `KM-009-AC09` | *Given* phản hồi bị cắt và server chưa ghi (`5xx`, hoặc request không tới) *when* có mạng lại *then* từ "chưa xác nhận được" chuyển thành mật khẩu cũ vẫn có hiệu lực; phiên vẫn dùng được (FR08, FR09) |
| `KM-009-AC10` | *Given* trạng thái "chưa xác nhận được" *when* đóng app, mở lại bằng mật khẩu cũ, lúc đầu offline rồi online *then* vẫn báo đúng trạng thái và tự giải quyết; quét kho cục bộ không có mật khẩu, khoá chưa bọc (FR09, NFR02) |
| `KM-009-AC11` | *Given* app bị khoá hoặc đóng ngay sau khi server ghi, trước khi máy ghi xong *when* mở lại *then* không có trạng thái nửa vời: hoặc đủ bộ mới, hoặc đủ bộ cũ kèm báo như AC08 (FR05, FR08, NFR04) |
| `KM-009-AC12` | *Given* mật khẩu hiện tại sai ở server (client đã qua kiểm trên máy) *when* gửi tới 5 lần *then* không đổi gì; phiên còn dùng được; không có "Cần đăng nhập lại"; đăng nhập mới với username đó cũng bị khoá; thử tiếp nhận thời gian còn lại; nhật ký có dòng riêng (FR06, FR36) |
| `KM-009-AC13` | *Given* request trực tiếp với số vòng 600 001, salt trùng salt hiện tại, và dữ liệu sai dạng *when* gửi *then* đều bị từ chối, không đổi gì (FR07) |
| `KM-009-AC14` | *Given* hai máy gửi đổi mật khẩu đồng thời *when* cả hai xong *then* đúng một mật khẩu mới có hiệu lực; dữ liệu đăng nhập khớp đúng một lần đổi; máy thua không bị mất dữ liệu (FR16) |
| `KM-009-AC15` | *Given* B đã và chưa bật passkey *when* A đổi mật khẩu; mở B bằng passkey; B đăng nhập lại; mở bằng passkey lần nữa *then* bản ghi passkey không đổi từng byte; mở ra đúng dữ liệu; giá trị bản ghi không có trong request nào (FR11) |
| `KM-009-AC16` | *Given* B có thay đổi chờ *when* A đổi mật khẩu rồi B đồng bộ *then* B chấm đỏ "Cần đăng nhập lại"; đọc, sửa được; 0 request cần phiên sau đó; offline mở bằng mật khẩu cũ được (FR12) |
| `KM-009-AC17` | *Given* AC16 *when* B đăng nhập lại bằng mật khẩu mới *then* thay đổi lên server, A nhận được, không có đánh dấu xung đột trên phần không đổi; khoá B: mật khẩu cũ báo sai, mật khẩu mới mở được (FR14) |
| `KM-009-AC18` | *Given* B đăng nhập lại bằng mật khẩu cũ *when* gửi *then* câu chung của `KM-006-FR06`; trên B không đổi gì; mật khẩu cũ vẫn mở bản cục bộ (FR13) |
| `KM-009-AC19` | *Given* server trả bộ khoá bọc mở được bằng mật khẩu nhưng khoá trong đó khác (không mở được vault trên B) *when* B đăng nhập *then* không thay gì trên B, 0 lần đẩy, phiên vừa tạo bị huỷ, có lỗi; mật khẩu cũ vẫn mở (FR14) |
| `KM-009-AC20` | *Given* mất kết nối hoặc đóng app giữa lúc B đăng nhập lại *when* mở lại *then* B còn đủ bộ cũ và dữ liệu, đăng nhập lại được (FR14, NFR04) |
| `KM-009-AC21` | *Given* B đang khoá, A đã đổi mật khẩu *when* gõ mật khẩu mới ở màn khoá B *then* báo sai kèm gợi ý và lối đăng nhập điền sẵn username; 0 request trước khi chọn lối đó; đăng nhập xong mở vào dữ liệu. *Given* B đã đăng xuất giữ dữ liệu *then* đăng nhập lại cũng như vậy (FR14, FR15) |
| `KM-009-AC22` | *Given* tài khoản có 3 phiên, gồm một phiên hết hạn và một phiên đã mất hiệu lực do đổi mật khẩu (đặt trong kho) *when* mở màn Thiết bị *then* chỉ thấy phiên còn hiệu lực; đúng tên, thời điểm; máy này ở đầu và có đánh dấu (FR17) |
| `KM-009-AC23` | *Given* đăng ký và đăng nhập trên laptop, Android, iOS *when* xem danh sách *then* tên thiết bị đúng nền tảng và trình duyệt, không chứa username; phiên không có tên hiện "Thiết bị không rõ"; tên có thẻ HTML hiện đúng dạng chữ (FR17, FR18) |
| `KM-009-AC24` | *Given* A, B đang dùng *when* A thu hồi B *then* B biến khỏi danh sách; request kế tiếp của B `401`, B không đọc hay ghi được; A và phiên thứ ba vẫn chạy; dữ liệu trên B còn; hộp xác nhận có đủ nội dung FR20 (FR19, FR20, NFR08) |
| `KM-009-AC25` | *Given* B đăng xuất giữ dữ liệu khi offline *when* A mở màn Thiết bị và thu hồi phiên còn sót *then* phiên hiện ra và thu hồi được (FR19) |
| `KM-009-AC26` | *Given* dòng máy này; id phiên của tài khoản khác; id không tồn tại *when* thao tác *then* dòng máy này không có nút thu hồi, dẫn tới luồng đăng xuất; gọi trực tiếp thu hồi phiên hiện tại thì như đăng xuất; hai id còn lại cùng một `404`, giống từng byte (FR21) |
| `KM-009-AC27` | *Given* vault *when* ghi thành công 35 lần, xen lẫn lần lệch version, quá lớn, sai dạng *then* lần bị từ chối không tạo bản nào; còn đúng 30 bản mới nhất, nối tiếp nhau; blob mỗi bản trùng từng byte với version đó (FR22, NFR06) |
| `KM-009-AC28` | *Given* version V ghi từ máy A lúc T, bị máy B thay lúc T2, phiên của A đã thu hồi *when* xem danh sách *then* bản V hiện thời điểm T, tên máy A, đúng kích thước; danh sách có câu "giữ được từ…" (FR23, FR24) |
| `KM-009-AC29` | *Given* hai tài khoản, hai vault của một tài khoản; vault chưa có bản cũ *when* gọi danh sách và lấy một bản của vault người khác; chọn vault; mở vault trống *then* cùng một `404`; chọn được vault theo tên; có trạng thái trống; offline báo cần kết nối (FR24) |
| `KM-009-AC30` | *Given* một bản cũ *when* xem *then* hiện đủ project, env, item; secret che, hiện và copy được theo quy tắc app; số đếm đúng; 0 lần ghi xuống máy (so kho cục bộ trước và sau) và 0 lần ghi lên server. Khoá app thì màn xem đóng (FR25, NFR02) |
| `KM-009-AC31` | *Given* bản có khối bị sửa, hoặc đã rơi khỏi 30 bản *when* xem *then* có lỗi riêng, không có thao tác khôi phục; dữ liệu không đổi; bản khác vẫn xem được (FR26) |
| `KM-009-AC32` | *Given* item X đã sửa sau bản cũ *when* khôi phục rồi đồng bộ hai máy *then* cả hai hiện giá trị bản cũ; đầu lịch sử có giá trị ngay trước đó, nhãn "Khôi phục"; không có đánh dấu xung đột; env đang gán giữ nguyên (FR27, FR28, FR31) |
| `KM-009-AC33` | *Given* item Y vào thùng rác và item W đã xoá trắng sau bản cũ *when* khôi phục rồi đồng bộ *then* cả hai hiện lại đủ nội dung trên hai máy; W có env của bản cũ; không tự xoá lại ở lần mở khoá sau (FR28) |
| `KM-009-AC34` | *Given* item Z thêm sau bản cũ, item đang sống mà trong bản cũ đã vào thùng rác hoặc đã xoá trắng, và item giống hệt bản cũ *when* khôi phục rồi đồng bộ *then* các item đó không đổi nội dung, không thêm lịch sử, không biến mất; item trong thùng rác ở bản cũ xem được ở màn xem trước (FR28, FR29) |
| `KM-009-AC35` | *Given* env và project đã xoá sau bản cũ, project đang sống đã đổi tên, env mới thêm sau bản cũ *when* khôi phục *then* env, project đã xoá sống lại và item trở lại đúng chỗ; project đổi tên giữ tên hiện tại; env mới còn (FR30) |
| `KM-009-AC36` | *Given* B có thay đổi chờ ở field khác của cùng item, và ở item khác *when* A khôi phục rồi hai máy đồng bộ *then* cả thay đổi của B và giá trị khôi phục đều còn; không có đánh dấu (FR31, FR32, NFR05) |
| `KM-009-AC37` | *Given* B có thay đổi chờ đúng giá trị được khôi phục, lần lượt với đồng hồ sớm hơn và muộn hơn lúc khôi phục *when* đồng bộ *then* bản đồng hồ muộn hơn hiện ra; bản kia và giá trị trước khôi phục đều trong lịch sử; đánh dấu đúng field đó, không field nào khác; không ca nào làm hai máy lệch nhau (FR31, FR32, NFR05) |
| `KM-009-AC38` | *Given* B có thay đổi chờ là chuyển item X vào thùng rác hoặc xoá trắng *when* A khôi phục nội dung X rồi đồng bộ *then* kết quả theo bảng xoá ở 05: bên sửa thắng, có đánh dấu, không mất nội dung khôi phục (FR32, NFR05) |
| `KM-009-AC39` | *Given* item có 25 lần sửa sau bản cũ *when* khôi phục *then* giá trị vừa bị thay còn trong lịch sử; lịch sử có tối đa 20 bản; sau khi đẩy lên, các giá trị bị cắt khỏi lịch sử vẫn đọc được ở bản ngay trước khi khôi phục, trừ phần vốn đã bị cắt trước đó; khôi phục bản đó thì item quay lại đúng giá trị trước đó (FR33, NFR05) |
| `KM-009-AC40` | *Given* đóng app hoặc mất mạng ngay sau khi bấm khôi phục *when* mở lại, có mạng *then* kết quả còn, lên server đúng một lần theo nội dung; nhật ký có ít nhất một dòng; bấm khôi phục với bản giống hệt hiện tại thì không ghi gì, không có dòng nhật ký (FR27, FR37) |
| `KM-009-AC41` | *Given* mỗi hành động ở FR34 *when* xảy ra *then* có đúng loại dòng đó, thời gian, thiết bị khi biết; lần ghi vault, xung đột version, đăng xuất, tạo vault không tạo dòng nào (FR34) |
| `KM-009-AC42` | *Given* chuỗi ở mục 3.1 kèm đăng nhập sai với mật khẩu làm dấu trong ô username *when* đọc toàn bộ dữ liệu nhật ký trong kho server *then* 0 lần trùng với các giá trị ở FR35; không có chuỗi đã gõ ở ô username (FR35, NFR01) |
| `KM-009-AC43` | *Given* đăng nhập sai với username có thật, username không có thật, và lần thử lúc đang khoá *when* đếm dòng *then* lần lượt 1, 0, 0; đo theo NFR03 đạt (FR36, NFR03) |
| `KM-009-AC44` | *Given* kho từ chối ghi dòng nhật ký *when* đăng nhập đúng, thu hồi, đổi mật khẩu *then* thao tác thất bại trọn vẹn, không đổi gì. *When* đăng nhập sai *then* vẫn `401` như thường (FR37) |
| `KM-009-AC45` | *Given* 1 500 dòng đăng nhập sai và 10 dòng nhóm khác (đặt trong kho) *when* có thêm một lần sai *then* còn đúng 1 000 dòng sai mới nhất và đủ 10 dòng kia. 1 500 dòng nhóm khác thì còn 1 000, không đụng nhóm sai (FR38, NFR09) |
| `KM-009-AC46` | *Given* 120 dòng, có đăng nhập sai và tên thiết bị chứa thẻ HTML *when* xem *then* 50 dòng mới nhất, xem thêm tới hết, ẩn nhóm sai được; tài khoản khác không thấy; tên hiện dạng chữ; dòng sai có ghi chú tự khai; vault không còn hiện 8 ký tự đầu của id; trống và offline có câu riêng (FR39) |
| `KM-009-AC47` | *Given* chuỗi ở mục 3.1 *when* quét theo NFR01, NFR02 *then* 0 lần trùng (NFR01, NFR02) |
| `KM-009-AC48` | *Given* đã xong *when* chạy các lệnh ở NFR12 và soi `git diff` *then* đều xanh; `merge.js`, vector không đổi; không có request tới Cloudflare; reviewer không thấy cờ chỉ cho test hay `innerHTML` với dữ liệu người dùng; đo NFR06, NFR07 ghi vào `implement.md` (FR32, FR40, NFR06, NFR07, NFR12, NFR13) |
| `KM-009-AC49` | *Given* server cục bộ, dữ liệu thử, lần lượt laptop + giả lập Android và laptop + giả lập iOS *when* originator kiểm tay mục 3.1 bước 1–8, cắt mạng giữa lúc đổi mật khẩu, B khoá rồi gõ mật khẩu mới, thu hồi phiên còn sót của đăng xuất offline, B có thay đổi chờ khi khôi phục *then* `implement.md` ghi đạt hoặc không theo từng mục, từng cặp, kèm bằng chứng. Mục không làm được do originator quyết (FR41, NFR10, NFR11, NFR14) |
| `KM-009-AC50` | *Given* tài liệu *when* verifier đọc lại `KM-009.md`, 03–09, `KM-006.md`, `KM-003` và `KM-014.md` *then* đúng nội dung FR42–FR45; 05 không còn câu "coi snapshot như một bản `remote`"; 04 ghi đủ rủi ro và vẫn nêu quyết định về secret thật thuộc originator (FR42, FR43, FR44, FR45) |
| `KM-009-AC51` | *Given* KM-003-FR47 *when* chạy lại test cấm từ trên giao diện *then* chỉ bỏ "đổi mật khẩu", các mục khác còn nguyên trừ phần epic khác đã bỏ; màn mới không có chữ thuộc mục còn cấm (FR43, Concern 18) |

## 7. Out of scope

> *What this explicitly does not do. Mandatory — an unbounded spec is not a spec.*

- Xoay khoá tài khoản (về KM-011). Hệ quả đã chấp nhận: nghi lộ `accountKey` thì chưa xử lý được, vì đổi mật khẩu giữ nguyên khoá đó.
- Đặt lại mật khẩu khi quên, kể cả bằng passkey (epic sau). Hệ quả: máy đã bật passkey vẫn mở được dữ liệu nhưng chưa đặt được mật khẩu mới.
- Chặn mật khẩu cũ trên máy chưa đăng nhập lại. Rủi ro được chấp nhận và ghi vào 04.
- Xoá từ xa: thu hồi phiên không xoá gì trên máy bị mất.
- Đưa vault về đúng trạng thái cũ; khôi phục từng item từ bản cũ (đã có thể xem và copy ở màn xem trước).
- Xoá hoặc đặt tên, ghim một bản cũ; giữ bản cũ theo thời gian thay vì theo số lần ghi (Concern 4).
- Nâng số vòng dẫn xuất khoá.
- Đổi quy tắc gộp.
- Ghi sự cố đồng bộ, xung đột, lần ghi vault, đăng xuất, tạo hoặc xoá vault vào nhật ký. Ghi IP. Xuất nhật ký ra file; cảnh báo chủ động khi có đăng nhập lạ.
- Đổi mật khẩu cho tài khoản chưa đăng ký (Concern 16).
- Đổi tên thiết bị do người dùng đặt; gộp nhiều phiên của cùng một máy.
- Cứu vault khi bản hiện tại trên server không giải mã được (Concern 21).
- Thùng rác, xoá vault, xoay khoá vault (KM-008). Bản sao tự động ra file (KM-010).
- Deploy, Cloudflare thật, điện thoại thật, secret thật (`KM-014`, originator). Đạt ở đây không chứng minh gì trên các môi trường đó.

## 8. Concerns

> *Every conflict between the intent and a constraint, itself, or something that
> already ships. Each must be resolved inline or deferred with a named owner
> before this spec is approved.*

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Intent §7 câu 1: snapshot mang đồng hồ cũ thì có đạt §5 không? **Đã chạy thử trên `merge.js`, `model.js` thật (2026-11-02), item có sửa, vào thùng rác, xoá trắng và thêm mới sau bản cũ.** (a) Cách 05 đang ghi, gộp với bản cũ làm `remote`: bản cũ hiện ra, nhưng **giá trị hiện tại mất hẳn, không còn cả trong lịch sử**, vì chỉ một bên đổi nên không tính là xung đột và lịch sử bị thay bằng lịch sử cũ. Trái §5. (b) Gộp không có `base`: không mất gì, nhưng **giá trị hiện tại thắng nên bản cũ không hiện ra**, và mọi item khác nhau đều có badge. (c) Dùng bản cũ làm `base`: không có gì quay lại. (d) Coi khôi phục là một lần lưu đồng hồ mới theo từng item như `restoreItemVersion`, rồi gộp bình thường: đạt mọi ca, cả máy kia có thay đổi chờ với đồng hồ sớm hơn hay muộn hơn | PO | **Đã quyết: dùng (d), không đổi quy tắc gộp, nên không cần quay lại originator** (FR27–FR32). Trả lời câu 1: item đã xoá sau bản cũ quay lại thật; item đã xoá trắng quay lại với nội dung bản cũ (cần thêm thao tác ở lõi, ghi vào 09); không có đánh dấu hàng loạt. Sửa 05. Đồng hồ máy lệch chỉ ảnh hưởng bản nào hiện ra khi máy kia cùng sửa, giá trị thua vẫn trong lịch sử |
| 2 | Intent §7 câu 1: lịch sử chỉ giữ 20 bản, "không mất gì" có đúng khi bị cắt? Chạy thử 25 lần sửa rồi khôi phục: giá trị vừa bị thay còn, giá trị cũ hơn 20 bản thì không | PO | **Đã quyết:** cam kết chính xác là **giá trị vừa bị thay luôn còn** trong lịch sử; phần cũ hơn bị cắt như `KM-006-NFR07` đã chấp nhận, nhưng vẫn đọc được ở bản ngay trước khôi phục cho tới khi bản đó rơi khỏi 30 bản (FR33, NFR05, AC39). Đây là cách hiểu hẹp hơn câu chữ "không mất gì" ở §5; originator có thể đổi khi duyệt spec |
| 3 | Khôi phục làm sống lại item đã xoá trắng. Như vậy "Xoá vĩnh viễn" không xoá ngay nội dung khỏi bản cũ trên server, trong khi KM-008 Concern 3 và 04 lại coi snapshot là đường cứu sau khi xoá trắng | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** giữ đường cứu (FR28c). Nội dung đã xoá trắng còn trong tối đa 30 bản cũ, dạng đã mã hoá; ghi rõ vào 04 (FR44). Muốn xoá hẳn thì xoay khoá vault (KM-008) |
| 4 | Intent §7 câu 2: 30 bản tính theo lần ghi. Mỗi lần lưu cách nhau trên 1,5 giây là một lần ghi, nên một buổi sửa nhiều, hoặc một máy lỗi ghi lặp, đẩy hết bản đáng giữ ra ngoài trong vài phút. Chưa có số liệu sử dụng thật. Giữ theo thời gian cần thêm quy tắc và tốn thêm dung lượng trên gói chưa đo | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** giữ 30 bản theo lần ghi đúng như brief và intent. Danh sách cho biết đang giữ được từ khi nào để người dùng không tưởng nhầm (FR24). Ghi giới hạn vào 04; đường dài hạn là backup (KM-010). Xem lại khi có số liệu thật. Dung lượng chuyển `KM-014` (FR45) |
| 5 | Câu giữ bản cũ ở 05 xoá bản có `version` ≤ bản hiện tại − 30: sau khi ghi tới version n, chỉ còn n−29…n−1, tức **29 bản**, trái "30 bản" ở 03, 02, brief | PO | **Đã quyết:** đúng 30 bản, không tính bản hiện tại (FR22, AC27). Sửa 05 (FR43) |
| 6 | §5 yêu cầu thời gian và thiết bị cho mỗi bản, nhưng 03 và 06 chưa giữ thiết bị. Câu ở 05 đặt thời gian là lúc bản bị thay, trong khi người dùng cần biết bản đó có từ lúc nào. Phiên có thể mất, nên không thể chỉ tra lại | PO; engineer chọn cách làm | **Đã quyết hành vi:** FR23, AC28. **Cách làm hoãn, owner: engineer, lúc: build-plan.** Sửa 03, 05, 06 (FR43) |
| 7 | Intent §7 câu 3: nhật ký giữ bao lâu, đăng nhập sai có đẩy mất dấu vết không. Đã đọc mã giới hạn: 5 lần sai rồi khoá 15 phút, lần bị chặn không tới bước so khớp, nên tối đa khoảng 480 lần sai mỗi ngày cho một username | PO; originator có thể đổi khi duyệt spec | **Đã quyết:** giữ theo số dòng, hai nhóm riêng 1 000 dòng (FR38), không ghi lần bị chặn (FR36), có thể ẩn nhóm sai khi đọc (FR39). Đang bị tấn công liên tục thì nhóm sai chỉ còn khoảng 2 ngày gần nhất, nhưng lần đăng nhập đúng của kẻ tấn công không bị đẩy mất. Con số 1 000 do PO đặt, chưa có số liệu |
| 8 | Ghi dòng đăng nhập sai chỉ cho username có thật làm nhánh đó tốn thêm một lần ghi, có thể lộ username qua thời gian, trái `KM-005-NFR04`. Ghi cả username không có thật thì người lạ làm đầy kho và lưu chuỗi họ gõ, có thể là mật khẩu | PO; engineer chọn cách làm | **Đã quyết:** chỉ username có thật, ghi sau khi đã phản hồi, đo lại ngưỡng cũ (FR36, FR37, NFR03, AC43). Đổi lại, lỗi ghi có thể làm mất một dòng sai; chấp nhận vì không đổi phản hồi. **Cách làm hoãn, owner: engineer, lúc: build-plan** |
| 9 | 03 liệt kê 12 hành động, rộng hơn §5; F-DATA-05 ghi "lỗi xung đột". Intent §6 yêu cầu sửa cho khớp. `logout` không nằm trong §5, và KM-008 không ghi nhật ký | PO | **Đã quyết:** đúng năm hành động ở FR34, không có `logout`. Thu hồi chính mình coi như đăng xuất, không ghi dòng. Sửa 03, 07 (FR43). Epic sau muốn thêm thì tự thêm |
| 10 | Khôi phục là lần lưu trên máy nên server không tự biết. Muốn có dòng nhật ký thì client phải báo kèm lần đẩy, nên kẻ có phiên hợp lệ có thể báo sai hoặc không báo. Mất phản hồi rồi gửi lại có thể tạo dòng trùng | PO; engineer chọn cách làm | **Đã quyết:** dòng này là do client khai, ghi rõ ở 06. Cam kết **ít nhất một dòng**, chấp nhận trùng khi gián đoạn (FR37, AC40). **Cách làm hoãn, owner: engineer, lúc: build-plan** |
| 11 | `KM-006-FR08` không thay gì khi đăng nhập cùng tài khoản; plan KM-006 ghi trường hợp bộ khoá khác thuộc KM-009. Nhận mù bộ khoá từ server thì server độc có thể ghi đè; đòi mật khẩu cũ thì trái §5 | PO | **Đã quyết:** FR14 kiểm bằng cách mở khoá vault trên máy, không cần mật khẩu cũ. Xoay khoá về sau (KM-011) sẽ rơi vào nhánh "không đạt" và phải tự xử lý; ghi ở 06 |
| 12 | Máy đang khoá không có request (`KM-006-FR15`, AC22) nên không biết mật khẩu đã đổi. Người dùng gõ mật khẩu mới và chỉ nhận "sai mật khẩu", dễ tưởng bị khoá ngoài | PO | **Đã quyết:** chỉ thêm gợi ý và lối đăng nhập, giữ 0 request (FR15, AC21) |
| 13 | §5 đòi báo rõ mật khẩu nào có hiệu lực, nhưng khi mất phản hồi thì máy thật sự không biết. `5xx` cũng không chắc chắn | PO; engineer chọn cách làm | **Đã quyết:** ba kết quả, trong đó có "chưa xác nhận được", tự giải quyết khi có mạng (FR08, FR09). Máy không nhận được phiên mới thì đăng nhập lại như máy B, nên không có đường bị khoá ngoài (NFR04). Cách ghi nhớ giữa các lần mở app: **hoãn, owner: engineer, lúc: build-plan**, không ghi mật khẩu |
| 14 | Ai cũng lấy được salt qua bước lấy tham số đăng nhập. Salt giả của username không có thật không bao giờ đổi, nên nếu thấy salt đổi thì biết username có thật và biết lúc đổi mật khẩu. Hôm nay chưa lộ vì salt không đổi; KM-005 Concern 7 chỉ xét `iter` | PO; originator có thể đổi khi duyệt spec | **Đã quyết: chấp nhận.** Kẻ dò phải theo dõi đúng username trước và sau lần đổi. Không làm salt giả đổi theo thời gian vì sẽ phá cách đăng nhập tất định. Ghi vào 04 (FR44) |
| 15 | Có token bị lộ thì thao tác đổi mật khẩu cho thử mật khẩu mà không chịu giới hạn đăng nhập. Trả `401` cho sai mật khẩu thì client hiểu là mất phiên (`KM-006-FR25`) | PO; engineer chọn mã lỗi | **Đã quyết:** tính chung bộ đếm, phiên không mất (FR06, AC12). Đổi lại, kẻ có token làm khoá được đăng nhập mới 15 phút, ngang rủi ro đã chấp nhận ở KM-005 Concern 1. Mã lỗi ghi vào 06, **owner: engineer, lúc: build-plan** |
| 16 | F-AUTH-06 không phân biệt tài khoản đã đăng ký hay chưa, nhưng §5 chỉ nói về máy có server; tài khoản cục bộ chưa đăng ký không có phiên để mất. Thêm một đường đổi riêng là thêm phạm vi và test | PO; originator có thể đổi khi duyệt spec | **Đã quyết: thu hẹp, nêu rõ.** Tài khoản chưa đăng ký không đổi được; muốn đổi thì đăng ký trước. Đây là chủ đích, không phải sót (FR01, AC02) |
| 17 | §5 cần "thiết bị" nhưng client chưa gửi tên thiết bị, spec và plan KM-006 không nhắc tới. Tên do bên gửi tự khai, nên kẻ tấn công giả được tên máy thật | PO | **Đã quyết:** epic này thêm tên tự suy ra (FR18). Phiên cũ hiện "Thiết bị không rõ". Giao diện ghi rõ tên ở dòng đăng nhập sai là tự khai (FR39); hiện dạng chữ, giữ giới hạn 100 ký tự |
| 18 | KM-003 FR47, AC44 và hai test đang cấm "đổi mật khẩu" trên giao diện. Từ "chọn vault" và "thùng rác" cũng đang bị cấm, trong khi KM-008 có thể đóng sau epic này | PO | **Đã quyết:** chỉ bỏ "đổi mật khẩu" (FR43, AC51). Đây là thay đổi có chủ đích. Màn mới không dùng hai từ còn lại: dùng nhãn "Vault" và "đã xoá" |
| 19 | 06 có `keepCurrentSession`, nhưng §5 chỉ yêu cầu máy đổi dùng tiếp; giữ cả hai nhánh là thêm một trạng thái phải test | PO; engineer chọn cách làm | **Đã quyết:** luôn giữ phiên của máy đổi (FR05). Sửa 06 cho khớp (FR43) |
| 20 | KM-008 không phải phụ thuộc của epic này và đang ở build-plan. Xoay khoá và xoá vault của KM-008 xoá bản cũ; KM-008 NFR11 đang gieo bản cũ trực tiếp vì chưa có ai ghi | PO | **Đã quyết:** hai epic không chặn nhau. Không có giao diện KM-008 thì test nhiều vault tạo bằng API như `KM-006-AC35`. Epic đóng sau chạy lại test xoá vault và xoay khoá trên bản cũ thật |
| 21 | Khôi phục đẩy lên theo đường thường, nên nếu bản trên server không giải mã được thì lần gộp bị `KM-006-FR23` chặn, đúng lúc người dùng cần cứu nhất | PO; originator có thể đổi khi duyệt spec | **Đã quyết: ngoài phạm vi.** §1 nói về lần ghi đè hợp lệ; client hợp lệ không tạo ra bản hỏng. Dữ liệu trên máy không mất vì `KM-006-FR23` không ghi đè. Cứu trường hợp này cần thao tác ghi không gộp, rủi ro hơn lợi ích khi chưa từng xảy ra |
| 22 | §5 yêu cầu intent KM-007 và 04 hết hứa việc đã đưa ra. Intent KM-007 §6 đã sửa; dòng "Quên master password" ở 04 do `KM-007-FR24` sửa | PO | **Đã quyết:** KM-009 chỉ xác nhận lúc đóng (FR42), vì epic chỉ đóng sau KM-007 |
| 23 | Đổi mật khẩu không đổi file backup đã tải: file đó tự chứa bộ khoá bọc cũ nên vẫn mở bằng mật khẩu cũ | PO | **Đã quyết: chấp nhận,** không kiểm soát được file đã ra ngoài. Ghi vào 04 (FR44). Bản sao tự động của KM-010 sẽ ghi bộ mới ở lần ghi sau |
| 24 | Khả năng nối ba thiết bị vào một server cục bộ và cắt mạng đúng lúc trên giả lập | Engineer | **Hoãn, owner: engineer, lúc: build-plan, dùng lại kết quả `KM-006` Concern 1.** Thiếu phần nào thì báo originator (FR41) |
| 25 | `KM-014.md` chưa có; `KM-006-FR43` mới tạo ra nó. Dung lượng trần tăng từ 2 MB lên 62 MB mỗi vault, và mỗi lần đăng nhập, ghi vault tốn thêm ghi trên gói Free chưa đo | PO | **Đã quyết:** epic đóng sau KM-006 nên file đã có; thêm việc ở FR45. Không đặt ngưỡng dung lượng ở đây (KM-006 Concern 8) |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

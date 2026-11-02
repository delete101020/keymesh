# Spec — Mở khoá bằng passkey (WebAuthn PRF)

**Epic ID:** `KM-007`
**Owner:** Product Owner
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `intent.md`

---

## 1. Overview

Thêm một cách mở khoá trên thiết bị, song song với master password: người dùng bật passkey cho từng thiết bị, rồi mở vault bằng xác thực của thiết bị (Face ID, vân tay hoặc mã máy), không cần mạng và không gửi gì lên server. Epic phục vụ dòng "Điều duy nhất thay đổi: có thêm một cách mở khoá trên thiết bị, song song với master password chứ không thay thế" (`intent.md` §1). Kết quả cần có là bằng chứng cho tiêu chí 4 trên giả lập iOS và cùng chuỗi đó trên Chrome giả lập Android (§5). Epic giữ nguyên cách bọc khoá (KM-001), cách giữ dữ liệu và việc tự khoá (KM-004). KM-004 không có `spec.md` (recipe `native-quick`), nên phần kế thừa lấy từ `intent.md` và `verify.md` của KM-004. Điều epic này đổi so với hai epic cha: thu hẹp `KM-003-FR47` về passkey (Concern 8), không đổi gì khác.

Spec này trả lời câu 2 và câu 4 ở `intent.md` §7 (Concern 2, 3). Câu 1 và câu 3 thuộc Engineer ở `/build-plan` (Concern 1, 9).

## 2. Constraints applied

| Source | What it constrains |
|---|---|
| `CLAUDE.md` (dự án) | Không phụ thuộc bên thứ ba, không bước build. Chiều phụ thuộc `ui/` → `app.js` → `store.js`… → `core/`; `core/` thuần, không gọi API trình duyệt. CSP chỉ `'self'`. Không ghi khoá, password hay plaintext ra `console`, lỗi, URL. Test chỉ dùng `node:test` |
| `docs/04-security.md` § Mở khoá bằng passkey | Salt PRF 32B cố định cho mỗi credential; báo không hỗ trợ khi PRF không bật; chỉ mở khoá cục bộ; theo từng thiết bị; gắn RP ID; luôn giữ master password |
| `docs/04-security.md` § Vòng đời khoá, § Bảo vệ trên client | Khoá app xoá mọi khoá khỏi bộ nhớ; đổi mật khẩu không ảnh hưởng passkey; xoay khoá tài khoản huỷ passkey; `Permissions-Policy` không được chặn passkey |
| `docs/03-data-model.md` §2, §3 | `prfKey` bọc trực tiếp `accountKey`; hình dạng bản ghi `meta.passkey` đã định sẵn; không lưu khoá chưa bọc xuống đĩa; không đồng bộ |
| `docs/09-core-api.md` | Hợp đồng lõi cho KM-007: `deriveFromPrf`, `wrapAccountKey`, `unwrapAccountKey`, `unlockWithAccountKey` đã có và đã test |
| `docs/07-features.md` F-AUTH-04, tiêu chí 4; `docs/08-roadmap.md` M4 | Phạm vi tính năng và kết quả kiểm chứng của M4 |
| KM-001 `spec.md` (`FR03`, `FR05`, `AC09`, `NFR05`) | Thao tác dẫn xuất và bọc khoá, khoá không thoát khỏi lõi |
| KM-004 `intent.md` §5–§6, `verify.md` | Mức "đạt trên giả lập"; điều kiện "chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại"; tự khoá nền; 3 lần chạm tới copy |
| KM-003 `FR47`, `AC44` | Danh sách tính năng bị cấm hiện ở UI, đang gồm "passkey" (Concern 8) |
| `.aidlc/workspace.yaml`, `state.json` | Viết bằng tiếng Việt; `strict_mode: true` nên đủ độ sâu. Không có project skill nào khác ràng buộc phần này |
| Tra cứu web (2026-11-02) | Credential trùng RP ID và user ID thì bị ghi đè; đầu ra PRF từng khác nhau giữa các đường xác thực (nguồn ở Concern 4, 5) |

## 3. User scenarios

### 3.1 Primary flow

**Bật passkey**
*Given* vault đang mở trên thiết bị hỗ trợ và passkey đang tắt,
*when* người dùng vào Cài đặt, chọn bật, nhập đúng master password và xác thực bằng thiết bị (tối đa 2 lần),
*then* Cài đặt báo passkey đang bật trên thiết bị này.

**Mở khoá offline (tiêu chí 4)**
*Given* passkey đã bật và thiết bị đang tắt mạng,
*when* người dùng mở lại app, chạm nút mở khoá bằng passkey và xác thực,
*then* vault mở ra với đúng dữ liệu, như khi mở bằng master password.

**Dùng master password**
*Given* passkey đã bật,
*when* người dùng không muốn hoặc không dùng được passkey,
*then* ô master password vẫn nằm ngay trên màn khoá và mở được ngay.

**Tắt passkey**
*Given* passkey đang bật và vault đang mở,
*when* người dùng tắt trong Cài đặt,
*then* màn khoá không còn cách mở bằng passkey trên thiết bị này, còn thiết bị khác không đổi gì.

### 3.2 Edge and error paths

| Tình huống | Điều người dùng thấy | Trạng thái sau đó |
|---|---|---|
| Trình duyệt không có WebAuthn | Cài đặt báo thiết bị không dùng được passkey, không có thao tác bật | Tắt |
| Có WebAuthn nhưng PRF không bật, hoặc không ra đầu ra PRF | Báo thiết bị không hỗ trợ; nhắc có thể còn một passkey thừa trong danh sách của hệ điều hành | Tắt |
| Sai master password lúc bật | Báo sai mật khẩu, không hiện hộp xác thực của hệ điều hành | Tắt |
| Huỷ hoặc xác thực thất bại lúc bật | Báo chưa bật được, có thể thử lại | Tắt |
| Chưa có mạng lúc bật | App không chặn; nếu nền tảng từ chối thì báo chưa bật được, kèm gợi ý thử lại khi có mạng | Tắt |
| App bị khoá hoặc bị đóng giữa lúc bật | Lần mở sau vẫn thấy passkey đang tắt | Tắt |
| Không ghi được bộ lưu trữ lúc bật hoặc tắt | Báo lỗi lưu | Giữ nguyên như trước thao tác |
| Huỷ hoặc xác thực thất bại lúc mở khoá | Báo không mở được bằng passkey, mời nhập master password. Không ghi "sai mật khẩu" | Vẫn bật, thử lại được |
| Passkey đã bị xoá ngoài app | Cùng thông báo trên, kèm hướng dẫn: mở bằng master password rồi tắt và bật lại. Nền tảng không cho phân biệt với huỷ | Vẫn bật cho tới khi người dùng tắt |
| Bản bọc hỏng hoặc không mở được bằng khoá từ passkey | Báo không mở được bằng passkey, mời nhập master password | Không đổi dữ liệu nào |
| Vault hỏng | Cùng thông báo như đường master password | Không đổi dữ liệu nào |
| Tab khác đang mở khoá | Cùng thông báo `other-tab` hiện có, không hiện hộp xác thực | Không đổi |
| Đã tắt ở tab khác, tab này còn hiện nút cũ | Báo passkey không còn bật, nút biến mất | Tắt |
| Nhập master password trong lúc hộp xác thực còn mở | Vault mở một lần; kết quả passkey đến sau bị bỏ qua | Đang mở |
| Không đọc được trạng thái passkey | Màn khoá chỉ hiện master password | Không đổi |

## 4. Functional requirements

| Id | Requirement | Priority | Traces to |
|---|---|---|---|
| `KM-007-FR01` | Cài đặt có mục Passkey, cho biết trạng thái trên thiết bị này: đang bật, đang tắt, hoặc không dùng được. Mục này có trên cả máy cảm ứng lẫn máy tính | Must | §5 "Theo từng thiết bị" |
| `KM-007-FR02` | Bật passkey phải nhập đúng master password trước khi có hộp xác thực nào của hệ điều hành (Concern 6) | Must | §1 "giữ nguyên cách bọc khoá"; §5 |
| `KM-007-FR03` | Bật chỉ thành công sau khi app đã mở lại được khoá tài khoản bằng đầu ra PRF từ một lần xác thực thật với credential vừa tạo. Trước đó không có gì được ghi. Tối đa 2 lần xác thực cho một lần bật (Concern 5) | Must | §5 "không rơi vào trạng thái nửa bật nửa tắt" |
| `KM-007-FR04` | Mọi lần tạo và dùng credential đều đòi xác thực của thiết bị; sinh trắc học và mã máy đều được chấp nhận. App không mở vault nếu không có đầu ra PRF từ lần xác thực đó | Must | §6 "Chỉ cho phép sinh trắc học" |
| `KM-007-FR05` | Mỗi lần bật tạo một credential mới, với salt PRF 32B ngẫu nhiên mới, giữ cố định suốt đời credential đó | Must | Mô tả epic (`KM-007.md`) |
| `KM-007-FR06` | Bật trên thiết bị B không làm hỏng passkey của thiết bị A, kể cả khi hai máy chung tài khoản đồng bộ passkey của nền tảng. Mỗi lần bật dùng một danh tính credential riêng, không suy ra từ tài khoản (Concern 4) | Must | §5 "Theo từng thiết bị"; §7 câu 2 |
| `KM-007-FR07` | Lúc mở khoá, app chỉ yêu cầu đúng credential đã ghi trên thiết bị này. Passkey đồng bộ từ máy khác không mở được máy này, vì máy này không có bản bọc tương ứng | Must | §5 "Theo từng thiết bị"; §7 câu 2 |
| `KM-007-FR08` | Khoá dẫn xuất từ đầu ra PRF bọc trực tiếp khoá tài khoản. Bản bọc, id credential và salt chỉ nằm trên thiết bị, theo hình dạng ở `docs/03-data-model.md` §3 | Must | §1 "giữ nguyên cách bọc khoá" |
| `KM-007-FR09` | Thiết bị không hỗ trợ được báo rõ. Không có WebAuthn thì báo ngay, không hỏi gì. PRF không bật hoặc không ra đầu ra thì báo sau lần thử, nhắc có thể còn passkey thừa trong hệ điều hành, và passkey vẫn tắt | Must | §5 "Thiết bị không hỗ trợ" |
| `KM-007-FR10` | Mọi thất bại khi bật (huỷ, lỗi nền tảng, app bị khoá giữa chừng, lỗi lưu, app bị đóng) đều để lại trạng thái tắt, không có bản bọc nào trên thiết bị | Must | §5 "không rơi vào trạng thái nửa bật nửa tắt" |
| `KM-007-FR11` | Khi passkey đang bật, màn khoá có nút mở bằng passkey cạnh ô master password. Khi đang tắt thì không có nút này. App chỉ mở hộp xác thực khi người dùng chạm nút, không tự mở lúc tải trang hay lúc vừa khoá (Concern 7) | Must | §5 "Luôn còn đường dự phòng" |
| `KM-007-FR12` | Mở khoá bằng passkey cho kết quả giống hệt đường master password: đúng dữ liệu, đúng màn hình, đúng quy tắc tự khoá và quy tắc một tab | Must | §5 "Tiêu chí 4" |
| `KM-007-FR13` | Mở khoá bằng passkey chạy được khi không có mạng, trong app đã cài trên giả lập iOS và trong Chrome trên giả lập Android | Must | §5 "Tiêu chí 4"; "Chrome trên giả lập Android" |
| `KM-007-FR14` | Mọi thất bại khi mở khoá bằng passkey đều giữ nguyên dữ liệu và trạng thái bật, không ghi "sai mật khẩu", và không tự tắt passkey. Master password dùng được ngay sau đó, không cần tải lại | Must | §5 "Luôn còn đường dự phòng" |
| `KM-007-FR15` | Khi passkey bị xoá ngoài app, thông báo lỗi ở màn khoá có hướng dẫn mở bằng master password rồi tắt và bật lại | Must | §7 câu 2 |
| `KM-007-FR16` | Tắt passkey xoá bản bọc khỏi thiết bị này: từ đó không mở được bằng passkey trên máy đó, kể cả khi credential còn trong hệ điều hành. Tắt không cần xác thực lại. Giao diện nói rõ app không xoá được passkey khỏi danh sách của hệ điều hành | Must | §5 "Tắt rồi thì không còn mở được" |
| `KM-007-FR17` | Bật, tắt hoặc thất bại trên thiết bị này không đổi gì ở thiết bị khác: trạng thái passkey không được đồng bộ và không rời khỏi thiết bị | Must | §5 "Theo từng thiết bị" |
| `KM-007-FR18` | Sau khi khoá tài khoản được bọc lại dưới mật khẩu mới, passkey vẫn mở đúng dữ liệu đó; mật khẩu mới mở được, mật khẩu cũ thì không. Kiểm ở mức khoá | Must | §5 "Đổi mật khẩu không làm hỏng passkey" |
| `KM-007-FR19` | Bật, mở khoá và tắt passkey không phát sinh request mạng nào | Must | §5 "Không gọi tới server" |
| `KM-007-FR20` | App không tự chặn việc bật passkey khi không có mạng. Chỉ mở khoá mới bắt buộc chạy offline. Nền tảng từ chối thì xử lý như FR10 (Concern 3) | Should | §7 câu 4 |
| `KM-007-FR21` | Nếu app bị khoá trong lúc đang bật, kết quả đến sau bị bỏ, vault vẫn khoá, passkey vẫn tắt. Khoảng thời gian trang bị che bởi hộp xác thực lúc mở khoá không làm app tự khoá lại ngay sau khi mở (Concern 10) | Must | §1 "giữ nguyên … việc tự khoá" |
| `KM-007-FR22` | Nếu tab khác đang mở khoá thì báo như đường master password trước khi hiện hộp xác thực. Nếu master password đã mở vault trong lúc hộp xác thực còn treo thì kết quả passkey bị bỏ qua. Nút cũ của một passkey đã tắt ở tab khác chỉ báo là không còn bật | Must | §5 "Luôn còn đường dự phòng" |
| `KM-007-FR23` | Giao diện chỉ hiện các thao tác passkey của epic này. `KM-003-FR47` được thu hẹp, bỏ "passkey" khỏi danh sách cấm, còn lại giữ nguyên (Concern 8) | Must | §1; `KM-007.md` |
| `KM-007-FR24` | Tài liệu khớp: `KM-007.md` mục "Xong khi" và `docs/08-roadmap.md` ghi đúng là đạt trên giả lập, kèm điều kiện "chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại". `docs/04-security.md` đổi "đòi sinh trắc học" thành "đòi xác thực của thiết bị", đổi nhãn "Mở khoá sinh trắc học", thêm các rủi ro còn lại ở Concern 4, 11, và sửa dòng "Quên master password" theo Concern 14. `docs/02-architecture.md` sửa dòng ghi WebAuthn thuộc `crypto.js` (Concern 12) | Must | §5 "Tài liệu khớp" |
| `KM-007-FR25` | Các việc chuyển giao được ghi vào `KM-006.md` (Concern 13), để không phụ thuộc vào việc ai nhớ đọc spec này. `KM-009.md` không nhận thêm việc nào từ epic này (Concern 14) | Must | §6; Concern 13, 14 |
| `KM-007-FR26` | Mỗi mục kiểm tay trên giả lập được ghi kết quả, kèm bản hệ điều hành, trình duyệt và chế độ chạy (app đã cài hay tab). Mục nào giả lập không làm được thì quay lại originator quyết định, không tự coi là đạt hay tự bỏ | Must | §5 dòng đầu |

## 5. Non-functional requirements

| Id | Requirement | Target |
|---|---|---|
| `KM-007-NFR01` | Không có khoá chưa bọc trên đĩa | 0 trường hợp `accountKey`, `vaultKey`, khoá dẫn xuất từ PRF hay đầu ra PRF nằm trong IndexedDB, sau mọi luồng thành công và thất bại |
| `KM-007-NFR02` | Khoá không ở lâu trong bộ nhớ | Trạng thái đang mở khoá không giữ `accountKey` sau khi bật hoặc mở khoá xong (giữ đúng như hôm nay). Đầu ra PRF bị xoá ngay sau khi dẫn xuất. Khoá app không để lại gì của passkey trong bộ nhớ |
| `KM-007-NFR03` | Không lộ qua kênh phụ | 0 lần password, khoá, đầu ra PRF hay plaintext xuất hiện trong `console`, thông điệp lỗi hoặc URL. Tên passkey hiện trong hệ điều hành không chứa dữ liệu vault hay master password |
| `KM-007-NFR04` | Không gọi mạng | 0 request trong các luồng bật, mở khoá, tắt, đo bằng bộ đếm request của e2e |
| `KM-007-NFR05` | CSP và header | 0 vi phạm CSP qua mọi luồng của epic; chuỗi CSP không đổi; `Permissions-Policy` không chặn passkey |
| `KM-007-NFR06` | Phụ thuộc và phân lớp | `dependencies` vẫn rỗng; không thêm thư viện; không có lệnh gọi WebAuthn trong `core/` |
| `KM-007-NFR07` | Tương thích dữ liệu | Tài khoản đã có mở được bằng master password mà không cần chuyển đổi dữ liệu. `testkit/vectors.js` không đổi |
| `KM-007-NFR08` | Số lần chạm | Từ màn khoá tới lúc copy được mật khẩu của item gần đây: tối đa 3 lần chạm (chạm passkey, chạm item, chạm copy), cộng thao tác xác thực của thiết bị. Cùng mức `KM-004-AC08` |
| `KM-007-NFR09` | Tốc độ | Phần việc của app, tính từ lúc có đầu ra PRF tới lúc hiện màn chính, không chậm hơn đường master password với cùng vault trên cùng máy. Đo trên Chrome desktop. Ngưỡng trên điện thoại không đo được trên giả lập nên không đặt (như KM-004) |
| `KM-007-NFR10` | Trợ năng | Mọi nút mới có tên truy cập được và vùng chạm ≥ 44 px; thông báo lỗi nằm trong `role="alert"` |
| `KM-007-NFR11` | Không hồi quy | `npm test`, `npm run test:browser` và bộ e2e đều xanh; `npm run vectors` không đổi file vector |

## 6. Acceptance criteria

Kiểm tự động dùng authenticator ảo có PRF trên Chrome. Authenticator ảo không chứng minh được hành vi của nền tảng thật, nên các AC ghi "tay" phải làm trên giả lập theo `KM-007-FR26`.

| Id | Given / When / Then |
|---|---|
| `KM-007-AC01` | *Given* app đã cài trên giả lập iOS, passkey đã bật, mạng đã tắt *when* mở lại app, chạm mở bằng passkey, xác thực bằng Face ID giả lập *then* vault mở và xem được dữ liệu thử (tay; FR13) |
| `KM-007-AC02` | *Given* Chrome trên giả lập Android, passkey đã bật, mạng đã tắt *when* mở lại app, chạm mở bằng passkey, xác thực của thiết bị *then* vault mở và xem được dữ liệu thử (tay; FR13) |
| `KM-007-AC03` | *Given* vault đang mở, passkey tắt *when* nhập đúng master password và xác thực thành công *then* Cài đặt báo đang bật, và sau khi khoá thì màn khoá có nút passkey (e2e; FR01, FR03, FR11) |
| `KM-007-AC04` | *Given* lần bật *when* nhập sai master password *then* báo sai mật khẩu, không có lệnh gọi tạo credential nào, passkey vẫn tắt (e2e; FR02) |
| `KM-007-AC05` | *Given* passkey đã bật xong *when* đọc bản ghi trên thiết bị và mở khoá lại bằng credential đó *then* bản ghi có id credential, salt 32B, bản bọc đúng hình dạng ở 03 §3, và mở ra đúng khoá tài khoản (e2e; FR08, FR03) |
| `KM-007-AC06` | *Given* passkey bật, tắt, rồi bật lại *when* so hai lần bật *then* id credential, salt và danh tính credential đều khác nhau (e2e; FR05, FR06) |
| `KM-007-AC07` | *Given* hai lần bật mô phỏng hai thiết bị trên cùng authenticator ảo, cùng tài khoản *when* thiết bị thứ hai bật xong *then* thiết bị thứ nhất vẫn mở được bằng credential của nó (e2e; FR06, FR17) |
| `KM-007-AC08` | *Given* một thiết bị đã bật *when* mở khoá *then* yêu cầu xác thực chỉ nêu đúng id credential của thiết bị đó và đòi xác thực của thiết bị (e2e; FR04, FR07) |
| `KM-007-AC09` | *Given* trình duyệt không có WebAuthn *when* mở Cài đặt *then* mục Passkey báo không dùng được, không có thao tác bật, màn khoá không có nút passkey (e2e; FR01, FR09) |
| `KM-007-AC10` | *Given* authenticator không có PRF *when* thử bật *then* báo thiết bị không hỗ trợ, nhắc passkey thừa, không có bản bọc trên thiết bị, passkey vẫn tắt (e2e; FR09, FR10) |
| `KM-007-AC11` | *Given* lúc tạo credential có PRF nhưng lần xác thực để kiểm tra không ra đầu ra PRF hoặc ra giá trị không mở được *when* thử bật *then* passkey vẫn tắt và báo không hỗ trợ (e2e; FR03, FR09) |
| `KM-007-AC12` | *Given* lần bật *when* người dùng huỷ ở lần xác thực thứ nhất, rồi ở lần thứ hai (hai ca), hoặc việc ghi xuống thiết bị thất bại *then* cả ba ca đều báo chưa bật được, không có bản bọc, và thử lại được (e2e; FR10) |
| `KM-007-AC13` | *Given* đang bật, hộp xác thực còn mở *when* app bị khoá rồi kết quả xác thực mới đến *then* không có gì được ghi, vault vẫn khoá, passkey vẫn tắt (e2e; FR10, FR21) |
| `KM-007-AC14` | *Given* đang bật, trang bị tải lại trước bước cuối *when* mở lại app *then* passkey tắt và master password mở được (e2e; FR10) |
| `KM-007-AC15` | *Given* passkey bật, trang vừa tải hoặc app vừa tự khoá *when* người dùng chưa chạm gì *then* không có lệnh gọi xác thực nào, ô master password hiện sẵn (e2e; FR11) |
| `KM-007-AC16` | *Given* vault có dữ liệu thử *when* mở bằng passkey *then* item, màn chính và giá trị copy được giống hệt khi mở bằng master password, và tự khoá vẫn áp dụng (e2e; FR12) |
| `KM-007-AC17` | *Given* passkey bật *when* người dùng huỷ, hoặc credential không còn *then* báo không mở được bằng passkey, không ghi "sai mật khẩu", passkey vẫn bật, master password mở được ngay không cần tải lại (e2e; tay trên cả hai giả lập cho ca huỷ; FR14) |
| `KM-007-AC18` | *Given* passkey bật và credential đã bị xoá khỏi authenticator *when* mở khoá thất bại *then* thông báo có hướng dẫn tắt và bật lại; làm theo hướng dẫn thì passkey dùng lại được (e2e; FR15) |
| `KM-007-AC19` | *Given* bản bọc bị sửa, hoặc đã bọc khoá tài khoản khác *when* mở bằng passkey *then* báo không mở được bằng passkey, không ghi gì xuống đĩa, master password mở được (e2e; FR14) |
| `KM-007-AC20` | *Given* passkey bật *when* tắt trong Cài đặt *then* không còn bản bọc, màn khoá không có nút, và credential cũ không mở được gì; giao diện nói rõ passkey có thể còn trong hệ điều hành (e2e; FR16) |
| `KM-007-AC21` | *Given* việc xoá bản bọc thất bại *when* tắt *then* báo lỗi lưu và vẫn hiện trạng thái đang bật (e2e; FR16) |
| `KM-007-AC22` | *Given* một tài khoản đã bật passkey *when* bọc lại khoá tài khoản dưới mật khẩu mới *then* passkey mở đúng dữ liệu đó, mật khẩu mới mở được, mật khẩu cũ báo sai (test mức khoá trên bản ghi thật của thiết bị; FR18) |
| `KM-007-AC23` | *Given* bộ đếm request bật *when* đi qua bật, mở khoá, tắt *then* 0 request (e2e; FR19, NFR04) |
| `KM-007-AC24` | *Given* mạng đã tắt *when* thử bật passkey trên từng giả lập *then* ghi lại kết quả: bật được, hoặc báo chưa bật được và passkey vẫn tắt. Không có trạng thái nào khác (tay; FR20) |
| `KM-007-AC25` | *Given* vừa mở bằng passkey, trong lúc xác thực trang bị che lâu hơn thời gian khoá nền *when* vào màn chính *then* app không tự khoá lại vì khoảng đó, còn lần chuyển nền kế tiếp vẫn khoá đúng giờ (e2e với `visibilityState` giả; tay trên hai giả lập; FR21) |
| `KM-007-AC26` | *Given* máy cảm ứng, khoá nền đặt "Ngay lập tức" *when* bật passkey *then* hoặc bật thành công, hoặc báo chưa bật được kèm gợi ý nới tạm thời gian khoá, và passkey vẫn tắt. Không có trạng thái nửa vời (tay trên hai giả lập; FR21, FR10) |
| `KM-007-AC27` | *Given* tab khác đang mở khoá *when* chạm mở bằng passkey *then* hiện thông báo `other-tab` và không có lệnh gọi xác thực (e2e; FR22) |
| `KM-007-AC28` | *Given* hộp xác thực passkey đang treo *when* mở bằng master password rồi kết quả passkey mới đến *then* vault chỉ mở một lần, không lỗi, không mất thay đổi nào (e2e; FR22) |
| `KM-007-AC29` | *Given* hai tab đều ở màn khoá *when* tab kia đã tắt passkey rồi chạm nút cũ ở tab này *then* báo không còn bật và nút biến mất (e2e; FR22) |
| `KM-007-AC30` | *Given* mọi luồng của epic *when* soi đĩa, `console`, lỗi, URL *then* không có khoá, password, đầu ra PRF hay plaintext (e2e và test đơn vị; NFR01, NFR02, NFR03) |
| `KM-007-AC31` | *Given* mọi luồng của epic *when* chạy e2e *then* 0 vi phạm CSP, và header không đổi ngoài những gì passkey cần (e2e; NFR05) |
| `KM-007-AC32` | *Given* tài khoản lập trước epic này, chưa có bản ghi passkey *when* mở app *then* mở bằng master password như cũ, Cài đặt báo đang tắt (e2e; NFR07) |
| `KM-007-AC33` | *Given* màn hẹp 360×640 có cảm ứng *when* mở bằng passkey rồi copy mật khẩu item gần đây *then* tối đa 3 lần chạm, mọi nút mới ≥ 44 px (e2e; NFR08, NFR10) |
| `KM-007-AC34` | *Given* cùng vault, cùng máy *when* đo từ lúc có đầu ra PRF tới màn chính, so với đường master password *then* không chậm hơn (e2e, ghi số đo; NFR09) |
| `KM-007-AC35` | *Given* test chặn tính năng ngoài phạm vi của KM-003 *when* chạy lại *then* vẫn chặn đủ các mục khác, chỉ bỏ passkey (test; FR23) |
| `KM-007-AC36` | *Given* lúc đóng epic *when* đọc `KM-007.md`, `docs/08-roadmap.md`, `docs/04-security.md`, `docs/02-architecture.md` *then* đúng các nội dung ở FR24 (đọc tài liệu) |
| `KM-007-AC37` | *Given* lúc đóng epic *when* đọc `KM-006.md`, `KM-009.md` *then* `KM-006.md` có các việc chuyển giao ở Concern 13; `KM-009.md` không ghi việc xoay khoá tài khoản hay đặt lại mật khẩu bằng passkey là do KM-007 giao (đọc tài liệu; FR25) |
| `KM-007-AC38` | *Given* các mục tay *when* verifier đọc kết quả *then* mỗi mục có bản hệ điều hành, trình duyệt, chế độ chạy, kết quả; mục không làm được có quyết định của originator (đọc tài liệu; FR26) |
| `KM-007-AC39` | *Given* toàn bộ thay đổi *when* chạy `npm test`, `npm run test:browser`, e2e, `npm run vectors` *then* đều xanh và `testkit/vectors.js` không đổi (NFR06, NFR07, NFR11) |

## 7. Out of scope

- Kiểm trên iPhone và điện thoại Android thật. Điều kiện từ KM-004 giữ nguyên: chưa kiểm trên điện thoại thật thì chưa cất secret thật trên điện thoại.
- Chỉ cho phép sinh trắc học: ai biết mã máy có thể mở vault trên thiết bị đã bật passkey (originator chấp nhận, 2026-11-02).
- Luồng đổi mật khẩu đầy đủ (KM-009). Xoay khoá tài khoản và việc huỷ passkey đi kèm (KM-011 đánh giá, chưa có epic làm). Dùng passkey để đặt lại mật khẩu khi quên (epic sau, chưa có mã). Concern 14.
- Đăng nhập server bằng passkey.
- Đồng bộ trạng thái bật passkey giữa các thiết bị. Chuyển passkey khi đổi domain: phải đăng ký lại.
- Xoá passkey khỏi danh sách của hệ điều hành từ trong app.
- Khoá bảo mật rời và đăng nhập chéo thiết bị (quét QR): passkey ở đây là của chính thiết bị đang dùng.
- Nhiều passkey trên một thiết bị: mỗi thiết bị chỉ có tối đa một.
- Cam kết về Chrome desktop thật hoặc Safari desktop: có thể chạy, nhưng không phải tiêu chí đóng epic. Kiểm tự động trên Chrome desktop chỉ dùng authenticator ảo.
- Tự mở hộp xác thực khi mở app.

## 8. Concerns

| # | Concern | Needs | Resolution |
|---|---|---|---|
| 1 | Giả lập iOS và Android có làm được toàn bộ chuỗi không, kể cả offline (`intent.md` §7 câu 1)? Chưa ai chạy thử. Giả lập KM-004 chạy Chrome 124 trên Android, có thể quá cũ cho PRF (chưa kiểm). Giả lập có thể cần đăng nhập tài khoản nền tảng và đặt khoá màn hình | Engineer đo; originator quyết nếu không làm được | **Hoãn, owner: Engineer ở `/build-plan`.** Phải đo trước khi xây giao diện. Mục không làm được quay lại originator (FR26); spec không đặt sẵn tiêu chí thay thế |
| 2 | Passkey có thể được nền tảng đồng bộ sang máy khác hoặc bị xoá ngoài app. "Theo từng thiết bị" có còn đúng không (câu 2)? | Product Owner | **Đã chốt.** Ở mức app vẫn đúng: bản bọc chỉ nằm trên máy đã bật, nên credential đồng bộ sang máy khác không tự mở được gì (FR07, FR17). Ở mức hệ điều hành thì không đúng hẳn: passkey có thể hiện ở máy khác, nên giao diện phải nói rõ (FR16). Passkey bị xoá ngoài app: nền tảng không cho phân biệt với huỷ, nên thông báo gộp hai ca và có hướng dẫn (FR15) |
| 3 | Thiết bị tắt mạng có bật được passkey không (câu 4)? | Product Owner | **Đã chốt.** Chỉ mở khoá mới bắt buộc offline. App không chặn; nền tảng có thể từ chối, chưa đo được. AC24 chỉ ghi lại kết quả đo; bật được hay bị từ chối đều đạt, miễn là không có trạng thái nửa vời |
| 4 | Credential trùng RP ID và user ID thì bị ghi đè. Nếu dùng một danh tính theo tài khoản, bật trên máy B có thể làm chết passkey của máy A qua đồng bộ, trái `intent.md` §5. Mặt khác, credential đồng bộ cộng bản bọc bị lấy khỏi thiết bị thì mở được ở máy khác | Product Owner | **Đã chốt.** Mỗi lần bật một danh tính riêng (FR06, AC06, AC07). Rủi ro còn lại ghi vào `docs/04-security.md`: kẻ tấn công cần cả dữ liệu thiết bị lẫn quyền vào tài khoản đồng bộ passkey. Nguồn: [W3C WebAuthn, 2022](https://lists.w3.org/Archives/Public/public-webauthn/2022Sep/0077.html), [Apple Developer Forums](https://developer.apple.com/forums/thread/723312). Nguồn không nêu riêng iCloud Keychain hay Google Password Manager, nên AC07 chỉ kiểm phía app |
| 5 | `docs/04-security.md` chỉ nói kiểm `prf.enabled` lúc tạo. Như vậy chưa đủ: có báo cáo `enabled` hoặc kết quả PRF sai lệch theo đường xác thực, kể cả đầu ra khác nhau cho cùng credential. Ghi bản bọc mà chưa kiểm thì có thể ra trạng thái "đã bật" nhưng không mở được | Product Owner | **Đã chốt.** Chỉ coi là bật sau khi một lần xác thực thật mở lại được khoá (FR03, AC11), đổi lại tối đa 2 lần xác thực. Nguồn: [Apple Developer Forums 774112](https://developer.apple.com/forums/thread/774112), [764730](https://origin-devforums.apple.com/forums/thread/764730?page=2). Đó là báo cáo diễn đàn, chưa đo trong dự án |
| 6 | Bọc khoá cần `accountKey`, nhưng trạng thái đang mở khoá hôm nay không giữ khoá này (chỉ giữ `vaultKey`). Giữ nó suốt phiên thì tăng thứ có thể lộ, và ai cầm máy đang mở cũng bật được passkey | Product Owner; originator duyệt ở gate | **Đã chốt, chờ originator xác nhận khi duyệt spec.** Bật phải nhập lại master password (FR02, NFR02), cùng tinh thần với xoá vault ở `docs/04-security.md`. Cái giá: thêm một lần nhập mật khẩu dài, nhưng chỉ khi bật |
| 7 | Tự mở hộp xác thực khi vào màn khoá thì nhanh hơn một chạm, nhưng dễ lặp lại sau khi huỷ, có thể che ô master password, và nền tảng có thể đòi cử chỉ người dùng (chưa đo) | Product Owner | **Đã chốt.** Chỉ mở khi chạm nút (FR11, AC15). Vẫn đạt 3 lần chạm (NFR08) |
| 8 | `KM-003-FR47` cấm UI có "passkey"; `test/ui-static.test.js` và `test/e2e/sweep.e2e.js` đang chặn chữ này, nên sẽ fail ngay khi có nút | Product Owner | **Đã chốt.** FR47 có hiệu lực cho phạm vi KM-003. Epic này thu hẹp đúng một mục, các mục khác giữ nguyên (FR23, AC35). Giao diện nên dùng chữ "passkey" và "xác thực của thiết bị" |
| 9 | Passkey gắn domain mà chưa có domain thật (câu 3) | Engineer | **Hoãn, owner: Engineer ở `/build-plan`.** Điều đã biết: passkey tạo trên giả lập với `localhost` không dùng được trên domain thật, và dữ liệu trên thiết bị cũng theo origin. Spec không yêu cầu chuyển đổi (mục 7) |
| 10 | Hộp xác thực có thể làm trang chuyển `hidden`, kích hoạt tự khoá nền, nhất là khi đặt "Ngay lập tức". Nới quy tắc tự khoá thì trái `intent.md` §1; giữ nguyên thì có thể không bật được ở thiết lập đó. Chưa đo trên giả lập | Product Owner; Engineer đo | **Đã chốt phần quy tắc.** Không nới tự khoá lúc bật: bị khoá thì huỷ lần bật, passkey vẫn tắt, và gợi ý nới tạm thời gian khoá (FR21, AC13, AC26). Lúc mở khoá thì app đang khoá nên không có gì để lộ; khoảng che đó không được tính khi vào màn chính (AC25). **Phần đo: owner Engineer ở `/implement`** |
| 11 | Tắt passkey không xoá được credential trong hệ điều hành; bật không thành cũng có thể để lại credential thừa. Danh sách có thể đầy passkey cũ | Product Owner | **Đã chốt.** Chấp nhận. Giao diện nói rõ (FR09, FR16); credential thừa không mở được gì vì không còn bản bọc. Ghi vào `docs/04-security.md`. Tính năng xoá từ trong app nằm ngoài phạm vi |
| 12 | `docs/02-architecture.md` ghi `crypto.js` có "WebAuthn PRF", trái quy ước `core/` thuần ở `CLAUDE.md`. `docs/09-core-api.md` đã đúng: lõi chỉ nhận byte PRF | Product Owner | **Đã chốt.** Giữ `core/` thuần (NFR06), sửa `docs/02` (FR24). Vị trí cụ thể do Engineer quyết ở `/build-plan` |
| 13 | KM-006 chưa làm (`in_progress`, bước 0). Đăng xuất có xoá dữ liệu cục bộ mà sót bản bọc thì passkey còn lại trên máy đã "xoá". Sync cũng không được gửi bản ghi này lên | KM-006 | **Hoãn, owner: KM-006.** Epic này chỉ ghi việc chuyển giao vào `KM-006.md` (FR25, AC37): xoá dữ liệu cục bộ phải xoá cả bản ghi passkey; bản ghi passkey không được đồng bộ; đổi tài khoản trên máy phải tắt passkey |
| 14 | `KM-009.md` chỉ có "passkey vẫn mở khoá được". `docs/04-security.md` còn hứa hai việc: xoay khoá tài khoản phải huỷ passkey, và "dùng passkey đặt mật khẩu mới khi quên" (dòng mô hình đe doạ), trong khi `intent.md` §6 giao cả hai cho KM-009 | Originator | **Đã chốt (originator, 2026-11-02, bước intent KM-009), thay cho `intent.md` §6.** KM-009 không nhận hai việc này. Xoay khoá tài khoản về KM-011 đánh giá; `docs/04-security.md` giữ quy tắc huỷ passkey và điều kiện KM-011 phải xếp hạng trước khi đưa secret thật lên server. Đặt lại mật khẩu bằng passkey về epic sau, chưa có mã. Dòng "Quên master password" ở `docs/04-security.md` chưa đúng: passkey mở được vault nhưng chưa đặt được mật khẩu mới. Sửa dòng đó cho đúng (FR24) |
| 15 | Trên iOS, app đã cài và tab Safari có thể giữ dữ liệu riêng, nên "theo từng thiết bị" thực ra là theo từng nơi lưu dữ liệu. Chưa đo trong dự án cho passkey | Product Owner | **Đã chốt.** "Thiết bị" trong spec này là một nơi lưu dữ liệu của app, cùng nghĩa với `deviceId` hiện có. Tiêu chí 4 kiểm trên app đã cài, vì đó là cách "mở app" trên iPhone (AC01) |

---

*No implementation detail: no libraries, tables, endpoints or file layouts.*

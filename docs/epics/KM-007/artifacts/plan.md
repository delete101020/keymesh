# Implementation Plan — Mở khoá bằng passkey (WebAuthn PRF)

**Epic ID:** `KM-007`
**Author:** Engineer
**Status:** Draft
**Created:** `2026-11-02`
**Traces to:** `spec.md`

---

## 1. Approach

Thêm một module trình duyệt mới, `src/public/js/passkey.js`, là nơi duy nhất gọi `navigator.credentials`. Module này chỉ trả về byte PRF và một loại lỗi đã phân nhóm, không bao giờ chuyển tiếp thông điệp của `DOMException`. `session.js` nhận hai lệnh gọi WebAuthn dưới dạng tham số, tự làm phần khoá bằng các hàm lõi đã có (`deriveFromPrf`, `wrapAccountKey`, `unwrapAccountKey`, `unlockWithAccountKey`), và giữ `accountKey` trong biến cục bộ của đúng lần bật. `core/` không đổi, `docs/09` không đổi, không cần nâng phiên bản IndexedDB vì `meta.passkey` chỉ là một key mới trong store `meta` đã có. Khoá nền và `idle.js` giữ nguyên (`KM-007-FR21`).

Phương án đã loại: đặt WebAuthn trong `core/crypto.js` như `docs/02-architecture.md` dòng 36 đang ghi. Cách đó trái quy ước `core/` thuần và không chạy được trên Node. Cũng đã loại phương án giữ `accountKey` trong `state` suốt phiên để khỏi hỏi lại mật khẩu, vì trái `KM-007-NFR02` và Concern 6.

**Việc chưa làm được ở bước plan: Concern 1 chưa đo.** Plan được viết trên máy Windows, không có `xcrun`, `adb` hay Android SDK. **Originator chốt (2026-11-02): bước `implement` chạy trên máy Mac**, nơi KM-004 đã đo với Xcode 16.4 và AVD. Spec chỉ buộc đo trước khi xây giao diện, nên phép đo là bước 2 và là cổng chặn của Order: chưa có kết quả thì không làm từ bước 3 trở đi.

**Đã đo trên Chrome 156 headless, Windows, authenticator ảo (script một lần, không vào repo):**

| Phép đo | Kết quả | Hệ quả |
|---|---|---|
| `create` trên origin `http://127.0.0.1` | `SecurityError: This is an invalid domain` | **E2E của epic này phải chạy trên `localhost`**; `testkit/serve.mjs` đang trả URL `127.0.0.1` |
| `create` trên `http://localhost`, `hasPrf: true` | `enabled: true`, có sẵn đầu ra 32B ngay lúc tạo | Cho phép so hai lần xác thực độc lập (xem Bật passkey) |
| `get` hai lần, cùng salt / salt khác | Cùng đầu ra / khác đầu ra | Dùng được làm IKM ổn định |
| Credential thứ hai với user id mới | 2 credential, credential đầu vẫn mở được | Khớp `KM-007-FR06` |
| Credential thứ ba **trùng** user id | Vẫn 2 credential, credential cũ bị thay, `get` nó ra `NotAllowedError` | Xác nhận Concern 4 trên authenticator ảo |
| Xác thực thất bại; credential đã xoá | Đều `NotAllowedError` sau 1–2 ms | Xác nhận không phân biệt được (`KM-007-FR15`) |
| `AbortController` lúc đang treo | `AbortError` | Dùng để huỷ khi khoá app hoặc khi master password thắng |
| `get` thứ hai khi `get` đầu còn treo | `OperationError: A request is already pending` | Phải chặn chạm đúp và huỷ lần trước |
| Authenticator `hasPrf: false` | `enabled: false`, `get` không có đầu ra | Khớp `KM-007-AC10` |

Authenticator ảo không chứng minh hành vi của nền tảng thật. Đầu ra PRF lúc tạo credential đặc biệt có thể không có trên iOS và Android; bước 2 sẽ đo.

**Bật passkey.** Đọc `meta.account`, dẫn xuất từ password và mở `accountKey`; sai thì dừng, chưa hiện hộp xác thực nào (`KM-007-FR02`). Sinh salt 32B và user id 32B ngẫu nhiên mới. Gọi `create` với `authenticatorAttachment: 'platform'`, `userVerification: 'required'`; `prf.enabled` khác `true` thì báo không hỗ trợ. Gọi `get` với đúng credential đó. Bọc `accountKey` bằng đầu ra lúc tạo nếu có, nếu không thì bằng đầu ra của `get`, rồi mở lại bằng đầu ra của `get`; thất bại hoặc không có đầu ra thì báo không hỗ trợ (`KM-007-FR03`, `KM-007-AC11`). Kiểm `epoch` của session lần cuối, sau đó mới ghi `meta.passkey`. `AbortController` gắn với `lock()`, nên khoá app làm lần bật kết thúc ngay.

**Mở khoá.** Chỉ chạy khi chạm nút: đọc lại bản ghi từ đĩa (mất thì báo không còn bật, ẩn nút); thử lấy rồi nhả tab lock (bận thì `other-tab`, không có hộp xác thực); gọi `get` với `transports: ['internal']`; xoá đầu ra PRF sau khi dẫn xuất; rồi vào `open()` như đường mật khẩu. Tab lock không được giữ trong lúc hộp xác thực mở, nếu không master password sẽ tự báo `other-tab` (`KM-007-AC28`). Một cờ single-flight trong `app.js` đảm bảo chỉ một đường vào `open()`, đường đến sau bị bỏ. Trường hợp mở được bản bọc nhưng vault không mở được: thử `unwrapVaultKey` (đã export) để phân biệt. Hỏng ở đây nghĩa là bản bọc chứa khoá tài khoản khác, nên báo lỗi passkey (`KM-007-AC19`); không hỏng thì báo `vault-damaged` như đường mật khẩu.

**Concern 9 (`intent.md` §7 câu 3), trả lời:** không truyền `rp.id`, trình duyệt lấy host hiện tại. Passkey tạo trên `localhost` không chuyển được sang domain thật, nhưng dữ liệu IndexedDB cũng theo origin nên không có bản ghi nào bị treo: trên domain mới passkey đang tắt, người dùng bật lại, và credential `localhost` chỉ còn là một mục thừa trong hệ điều hành. Ngoài việc đăng ký lại, có một hệ quả cần epic deploy biết (`KM-014`, do `KM-006-FR42` chuyển việc Cloudflare sang, hiện chưa có thư mục): mỗi URL preview của Cloudflare Pages là một origin riêng, nên có dữ liệu và passkey riêng. Epic này không viết gì phụ thuộc domain.

**Concern 12, vị trí:** `src/public/js/passkey.js`, cùng tầng với `store.js`. `docs/02` dòng 161 ghi lấy RP ID từ `config.js`, nhưng file này không tồn tại và epic này không cần nó, nên sửa dòng đó cho đúng.

## 2. Files

| Path | Change | Why |
|---|---|---|
| `testkit/passkey-probe/index.html`, `probe.js`, `serve.mjs` | Thêm | Trang đo Concern 1 và 10 trên giả lập, chạy dưới cùng CSP. Nằm ngoài `src/` nên không deploy |
| `src/public/js/store.js` | Sửa | `readPasskey`, `writePasskey`, `deletePasskey` trên key `passkey` của `meta` |
| `testkit/memory-store.mjs` | Sửa | Cùng ba hàm, có `failWrites` |
| `src/public/js/passkey.js` | Thêm | `isAvailable`, `createCredential`, `getPrf`; phân nhóm lỗi; nơi duy nhất gọi WebAuthn (`KM-007-NFR06`) |
| `src/public/js/session.js` | Sửa | `passkeyRecord`, `enablePasskey`, `unlockWithPrf`, `disablePasskey`; kiểm hình dạng bản ghi; phần cuối của `unlock` thành hàm dùng chung |
| `src/public/js/app.js` | Sửa | Các action passkey, `AbortController`, single-flight, thông báo ở màn khoá sau khi lần bật bị khoá ngang |
| `src/public/js/ui/passkey-settings.js` | Thêm | Mục Passkey trong Cài đặt: trạng thái, form nhập mật khẩu, tắt, các câu báo |
| `src/public/js/ui/settings-dialog.js` | Sửa | Gắn mục trên, trên cả máy cảm ứng và máy tính |
| `src/public/js/ui/gate.js` | Sửa | Nút mở bằng passkey, thông báo mới. Không đổi chữ ký `renderUnlock` |
| `src/public/styles.css` | Sửa nếu cần | Chỉ khi class có sẵn chưa đạt vùng chạm 44 px |
| `src/public/sw.js` | Sinh lại | `npm run sw-version`; thiếu file mới trong `SHELL` thì offline hỏng |
| `test/passkey.test.js` | Thêm | Session và `passkey.js` với WebAuthn giả, gồm `KM-007-AC22` |
| `test/store.test.js`, `test/ui-static.test.js`, `test/e2e/sweep.e2e.js` | Sửa | Ba hàm store mới; bỏ đúng chữ "passkey" khỏi danh sách cấm |
| `testkit/e2e/driver.mjs` | Sửa | `startApp({ host: 'localhost' })`, helper authenticator ảo, bộ đếm lệnh gọi WebAuthn |
| `test/e2e/passkey.e2e.js` | Thêm | Toàn bộ AC e2e, kể cả 360×640 và số đo tốc độ |
| `docs/04-security.md`, `docs/02-architecture.md`, `docs/03-data-model.md`, `docs/08-roadmap.md`, `docs/07-features.md` | Sửa | `KM-007-FR24`; 03 ghi mã hoá base64 của các trường; 07 cập nhật trạng thái F-AUTH-04 |
| `docs/epics/KM-007/KM-007.md`, `docs/epics/KM-006/KM-006.md` | Sửa | `KM-007-FR24`, `KM-007-FR25`. `KM-006-FR42` cũng ghi việc chuyển giao này vào `KM-006.md`: bên làm sau kiểm trước, đã có thì không ghi lại |

Không đổi: `core/*`, `docs/09-core-api.md`, `idle.js`, `tab-lock.js`, `_headers`, `testkit/vectors.js`, `docs/epics/KM-009/KM-009.md` (`KM-007-FR25` không giao thêm việc nào; hiện file không nhắc KM-007).

## 3. Order

Làm trên nhánh `feat/KM-007-passkey`.

1. **Lấy baseline trên máy Mac.** Chạy `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run vectors` trước khi sửa mã, và xác nhận Xcode, AVD còn chạy. *Sau bước này:* có baseline đúng của máy `implement`; đỏ thì xử lý hoặc ghi lại trước khi đi tiếp.
2. **Đo Concern 1 và 10 (cổng chặn).** Trang đo: bật credential, kiểm `prf.enabled`, có đầu ra lúc tạo không, `get` hai lần có cùng đầu ra không, so đầu ra lúc tạo và lúc `get`, nhật ký `visibilitychange` trong lúc hộp xác thực mở, thử lại khi tắt mạng. Chạy trên iOS (app đã thêm vào màn hình chính) và Chrome Android, ghi bản hệ điều hành, trình duyệt, chế độ chạy vào `implement.md`. AVD `Xperia_1V_API_35` với Chrome 124 không có Play Store nên khả năng cao không dùng được; dự kiến phải tạo AVD có Play Store, đăng nhập tài khoản Google, đặt khoá màn hình và cập nhật Chrome. *Sau bước này:* biết từng mục đo làm được hay không. **Mục nào không làm được thì dừng và hỏi originator, không làm tiếp giao diện.**
3. **Lưu trữ.** Thêm ba hàm vào `store.js` và `memory-store.mjs`. *Sau bước này:* đọc, ghi, xoá bản ghi được; bản ghi không dính vào `meta.account` và `settings`.
4. **Adapter WebAuthn.** `passkey.js` kèm test với `credentials` giả. *Sau bước này:* mọi lỗi nền tảng thành nhóm cố định, không còn chuỗi gốc; đầu ra PRF khác 32B bị coi là không có.
5. **Logic session.** *Sau bước này:* bật, mở khoá, tắt chạy được trên Node với WebAuthn giả, gồm `KM-007-AC22`; `state` vẫn không có `accountKey`; `test/session.test.js` vẫn xanh sau khi tách hàm dùng chung.
6. **Action ở `app.js` và driver e2e.** *Sau bước này:* huỷ khi khoá, single-flight, probe tab lock có mặt; driver chạy app trên `localhost` với authenticator ảo.
7. **Cài đặt.** *Sau bước này:* bật và tắt được qua giao diện, kèm mọi câu báo ở `spec.md` §3.2 cho lúc bật.
8. **Màn khoá.** *Sau bước này:* chuỗi bật, khoá, mở bằng passkey chạy được trên Chrome headless.
9. **Thu hẹp FR47 và sinh lại `sw.js`.** Sửa hai danh sách cấm, chạy `npm run sw-version`. *Sau bước này:* `KM-007-AC35` xanh, file mới có trong shell offline.
10. **E2E các đường lỗi.** Phủ hết AC e2e còn lại ở §5. Lúc này kiểm trạng thái KM-006: nếu KM-006 đã đóng trước, thêm test xoá dữ liệu với passkey thật, vì `KM-006` Concern 6 giao phần đó cho epic đóng sau. *Sau bước này:* `npm run test:e2e` xanh.
11. **Kiểm tay trên hai giả lập.** `KM-007-AC01`, `AC02`, ca huỷ của `AC17`, `AC24`, `AC25`, `AC26`, theo mẫu ghi của `KM-007-FR26`. Lỗi tìm thấy thì sửa kèm test và ghi amendment. *Sau bước này:* tiêu chí 4 có bằng chứng, hoặc có quyết định của originator cho từng mục.
12. **Khép tài liệu.** Viết theo kết quả thật của bước 11. Trong `docs/04-security.md`: dòng "Quên master password" chỉ còn nói passkey mở được vault, chưa đặt được mật khẩu mới; giữ quy tắc huỷ passkey khi xoay khoá và điều kiện KM-011 phải xếp hạng (Concern 14). Không ghi việc gì sang `KM-009.md`. *Sau bước này:* `KM-007-AC36`, `AC37`, `AC38` đọc được, cả bốn lệnh test xanh.

**Batches** — consecutive steps one fresh session can finish, tests passing.

**Batch 1** — steps 1–2: có baseline trên Mac, trang đo xong và có kết quả đo. Batch này quyết định có đi tiếp hay không.

**Batch 2** — steps 3–5: toàn bộ logic chạy trên Node với WebAuthn giả, `npm test` xanh; chưa có gì hiện ra giao diện.

**Batch 3** — steps 6–9: luồng chính chạy qua giao diện trên Chrome headless, `npm test` và `lock`, `sweep` e2e xanh.

**Batch 4** — step 10: mọi đường lỗi được e2e phủ, `npm run test:e2e` xanh.

**Batch 5** — steps 11–12: kết quả giả lập được ghi, tài liệu khớp, cả bốn lệnh xanh.

## 4. Risks

Tool `codegraph` không có trong phiên này, nên phần ảnh hưởng dưới đây lấy từ đọc mã và `rg`, không phải `blast-radius`.

| Risk | Likelihood | What we do about it |
|---|---|---|
| **Ít chắc nhất: giả lập không làm được chuỗi này.** Chưa có nguồn nào về passkey và PRF trên iOS Simulator; có thể cần iCloud. Android cần image có Play Store, tài khoản Google, khoá màn hình | Cao | Đo ở bước 2, trước khi xây giao diện. Không làm được thì về originator; plan không đặt sẵn tiêu chí thay thế |
| Nền tảng không trả đầu ra PRF lúc tạo. Khi đó lần `get` chỉ tự kiểm chính nó, và sự sai lệch kiểu Concern 5 chỉ lộ ở lần mở khoá đầu | Trung bình | Thêm lần xác thực thứ ba thì vượt giới hạn 2 lần của `KM-007-FR03`, nên không thêm. Hậu quả có giới hạn: báo không mở được và master password vẫn mở. Bước 2 đo; nếu xảy ra thì ghi vào `implement.md` |
| Trang đang `hidden` đúng lúc vào màn chính. `idle.start()` đặt `hiddenAt = null`, đúng cho `KM-007-AC25` kể cả khi đặt "Ngay lập tức". Nhưng nếu người dùng rời app đúng khoảnh khắc đó thì khoá nền không chạy cho tới lần chuyển nền kế tiếp; chỉ còn khoá theo thời gian không thao tác | Thấp | Giữ nguyên `idle.js` theo `KM-007-FR21`. Đo hành vi thật ở bước 2 và 11. Nếu thấy thật thì ghi amendment, không tự nới |
| Trạng thái "Ngay lập tức" làm không bật được trên máy cảm ứng | Trung bình | Spec đã chấp nhận: huỷ lần bật và gợi ý nới tạm (`KM-007-AC26`). Thông báo hiện ở màn khoá vì app đã khoá |
| Câu chữ giao diện dính danh sách cấm còn lại: "đồng bộ", "vân tay", "đăng nhập" đều vẫn bị chặn trong khi FR16 phải giải thích passkey còn trong hệ điều hành | Cao nếu không để ý | Viết "còn trong danh sách của hệ điều hành", "xác thực của thiết bị". Không nới danh sách (`KM-007-FR23`). `test/ui-static.test.js` chặn |
| Quên sinh lại `sw.js`: app chạy online nhưng hỏng khi offline | Thấp | `test/sw.test.js` fail nếu lệch; `KM-007-AC01` kiểm thật |
| Người gọi hiện có: phần tách từ `session.unlock` làm đổi hành vi đường mật khẩu | Thấp | Các thay đổi còn lại đều thêm mới, không đổi chữ ký hiện có. `test/session.test.js` và `lock.e2e.js` chạy lại không sửa |
| Máy Mac thiếu tài liệu: lúc viết plan, mọi `artifacts/`, `docs/epics/*/state.json`, `.aidlc/runs/*`, `docs/04-security.md`, `docs/06-api.md` đều chưa commit trên máy Windows | Chắc chắn nếu không xử lý | Phải chuyển sang Mac trước batch 1. Ở bước 1 kiểm có đủ `spec.md`, `plan.md` của KM-007 và các thay đổi trong `docs/04`, `docs/06` |
| Nhiều epic cùng sửa một file. KM-009 (đang ở spec) cũng sửa `docs/04-security.md` và phải đóng sau KM-007. KM-006 (đang ở build-plan) sửa `store.js`, `app.js` và `KM-006.md`, và `KM-006-FR13` xoá cả key `passkey` | Trung bình | Không commit thay đổi chưa commit của KM-009 vào nhánh này. Giữ key `passkey` và hình dạng ở `docs/03` §3 đúng như KM-006 đang giả định. Rebase lên `master` trước batch 3 và trước bước 12, chạy lại test sau mỗi lần |
| Khó đảo ngược: credential đã tạo không xoá được từ app, mỗi lần đo để lại mục thừa trên giả lập | Chắc chắn, chấp nhận | Chỉ dùng dữ liệu thử trên giả lập. Định dạng `meta.passkey` đã có sẵn trong `docs/03`, xoá key là về trạng thái cũ, không cần chuyển đổi |
| Chạy `npm start` với `127.0.0.1` thì passkey báo không hỗ trợ, dễ tưởng là lỗi | Trung bình | `SecurityError` xếp vào nhóm không hỗ trợ. Hướng dẫn kiểm dùng `localhost`, trang đo in sẵn URL đúng |

## 5. Proofs

"E2E" là `test/e2e/passkey.e2e.js` chạy bằng `npm run test:e2e`, Chrome headless, authenticator ảo trên `localhost`. "Tay" là bước 11, ghi theo `KM-007-FR26`.

| Criterion | Proof | How it is run |
|---|---|---|
| `KM-007-AC01` | Bật passkey trên app đã cài, tắt mạng, thoát rồi mở lại, Face ID giả lập, thấy dữ liệu thử; ảnh chụp | Tay, giả lập iOS, `localhost:8787` |
| `KM-007-AC02` | Cùng chuỗi trên Chrome Android; ảnh chụp | Tay, `adb reverse tcp:8787 tcp:8787`, rồi gỡ để cắt mạng |
| `KM-007-AC03` | Nhập đúng mật khẩu, Cài đặt báo đang bật, khoá thì có nút passkey | E2E |
| `KM-007-AC04` | Sai mật khẩu: bộ đếm `create` bằng 0, vẫn tắt | E2E |
| `KM-007-AC05` | Đọc `meta.passkey` trực tiếp từ IndexedDB: id, salt 32B, `ct` 48B; mở khoá lại bằng credential đó | E2E |
| `KM-007-AC06` | Hai lần bật: id và salt khác qua IndexedDB, `userHandle` khác qua `WebAuthn.getCredentials` | E2E |
| `KM-007-AC07` | Lưu bản ghi lần 1, bật lần 2, đặt lại bản ghi lần 1, vẫn mở được | E2E |
| `KM-007-AC08` | Bọc `credentials.get` ghi tham số: đúng một `allowCredentials`, `userVerification: 'required'` | E2E |
| `KM-007-AC09` | Init script xoá `PublicKeyCredential`: Cài đặt báo không dùng được, không có nút | E2E |
| `KM-007-AC10` | Authenticator `hasPrf: false`: báo không hỗ trợ, nhắc passkey thừa, không có bản ghi | E2E |
| `KM-007-AC11` | Bọc `get`: một ca bỏ đầu ra, một ca đổi đầu ra; đều tắt và báo không hỗ trợ | E2E |
| `KM-007-AC12` | Từ chối ở `create`, từ chối ở `get`, và `put` thất bại: cả ba báo chưa bật được, không có bản ghi, thử lại được | E2E |
| `KM-007-AC13` | Tắt `automaticPresenceSimulation`, nhảy đồng hồ để app tự khoá, rồi cho xác thực: không có gì được ghi | E2E |
| `KM-007-AC14` | Tải lại lúc hộp xác thực còn treo: tắt, mật khẩu mở được | E2E |
| `KM-007-AC15` | Sau khi tải trang và sau khi tự khoá: bộ đếm `get` bằng 0, ô mật khẩu có sẵn | E2E |
| `KM-007-AC16` | Đọc item và copy giá trị sau hai đường mở, so bằng nhau; nhảy đồng hồ thì vẫn khoá | E2E |
| `KM-007-AC17` | `setUserVerified(false)` và `clearCredentials`: có câu báo, không có "Sai mật khẩu", vẫn bật, mật khẩu mở ngay. Ca huỷ thật trên hai giả lập | E2E và tay |
| `KM-007-AC18` | `clearCredentials`, đọc hướng dẫn, mở bằng mật khẩu, tắt, bật lại, mở được | E2E |
| `KM-007-AC19` | Sửa `ct` trong IndexedDB; thay bản bọc bằng bản chứa khoá khác; báo lỗi passkey, đĩa không đổi, mật khẩu mở được | E2E |
| `KM-007-AC20` | Tắt: không còn bản ghi, không có nút, có câu nói rõ; `get` thẳng vẫn ra PRF nhưng không có gì để mở | E2E |
| `KM-007-AC21` | `delete` thất bại: báo lỗi lưu, vẫn đang bật | E2E |
| `KM-007-AC22` | Bật trên session thật, bọc lại `accountKey` dưới mật khẩu mới bằng hàm lõi: passkey mở đúng dữ liệu, mật khẩu mới mở, mật khẩu cũ `decrypt-failed` | `npm test`, `test/passkey.test.js` |
| `KM-007-AC23` | `page.requests` không tăng qua bật, mở khoá, tắt | E2E |
| `KM-007-AC24` | Ghi lại kết quả thử bật khi tắt mạng trên từng giả lập | Tay |
| `KM-007-AC25` | `setBackground(true)`, nhảy đồng hồ quá thời gian khoá, cho xác thực, `setBackground(false)`: vẫn ở màn chính; lần chuyển nền kế tiếp khoá đúng giờ. Lặp lại trên giả lập | E2E và tay |
| `KM-007-AC26` | Đặt "Ngay lập tức" rồi bật: ghi kết quả; không có trạng thái nửa vời | Tay |
| `KM-007-AC27` | Tab khác giữ khoá: hiện thông báo `other-tab`, bộ đếm `get` bằng 0 | E2E |
| `KM-007-AC28` | Hai thứ tự: mật khẩu xong trước khi passkey có kết quả; passkey đã vào `open()` khi mật khẩu được gửi. Mỗi ca vault mở một lần, không có `other-tab`, sửa dữ liệu rồi không mất | E2E |
| `KM-007-AC29` | Hai tab ở màn khoá, tắt ở tab kia, chạm nút cũ: báo không còn bật, nút biến mất | E2E |
| `KM-007-AC30` | Bọc `get` lấy đầu ra PRF làm chuỗi đánh dấu; soi IndexedDB, DOM, console, lỗi, URL sau mọi luồng; session không có thuộc tính `accountKey`; lỗi của `passkey.js` không chứa chuỗi gốc | E2E và `npm test` |
| `KM-007-AC31` | `app.allCsp()` rỗng ở `after`; `git diff master -- src/public/_headers` rỗng | E2E và lệnh |
| `KM-007-AC32` | Tài khoản không có `meta.passkey`: mật khẩu mở như cũ, Cài đặt báo đang tắt | E2E |
| `KM-007-AC33` | `page.phone(360, 640)`, đếm đúng 3 lần chạm tới khi clipboard có giá trị, nút mới ≥ 44 px | E2E |
| `KM-007-AC34` | Đo từ lúc `get` trả về tới màn chính, so với đường mật khẩu trên cùng vault; ghi số đo | E2E |
| `KM-007-AC35` | `test/ui-static.test.js` và `sweep.e2e.js` với danh sách chỉ bỏ "passkey"; diff hai dòng đó | `npm test`, E2E, `git diff` |
| `KM-007-AC36` | Đọc bốn tài liệu theo `KM-007-FR24` | Verifier đọc `git diff master -- docs/` |
| `KM-007-AC37` | `KM-006.md` có ba việc ở Concern 13. `KM-009.md` không ghi xoay khoá tài khoản hay đặt lại mật khẩu bằng passkey là do KM-007 giao | Verifier đọc; `rg -n "KM-007" docs/epics/KM-009/KM-009.md` để xem mọi chỗ nhắc tới (KM-009 có thể tự thêm phụ thuộc KM-007, điều đó không vi phạm) |
| `KM-007-AC38` | Bảng kết quả tay trong `implement.md`: hệ điều hành, trình duyệt, chế độ chạy, kết quả, quyết định của originator nếu có | Verifier đọc |
| `KM-007-AC39` | Cả bốn lệnh xanh; `git diff master -- testkit/vectors.js` rỗng; `dependencies` rỗng; `rg "navigator.credentials" src/public/js/core` rỗng | `npm test`, `npm run test:browser`, `npm run test:e2e`, `npm run vectors` |

## 6. Feedback loop

Máy chạy là máy Mac; baseline thật lấy ở bước 1. Số đo tham khảo trên máy Windows dùng viết plan, ngày 2026-11-02:

- `npm test`: 228 test, 222 pass, 5 skip, 1 fail (`KM-004 sw.js is in step with src/public`). Nguyên nhân là `core.autocrlf=true` làm working tree thành CRLF; git index là LF nên lỗi không nằm ở repo. Chưa chạy trên Mac.
- `npm run test:browser`: 216/216 trên Chrome 156.
- `lock.e2e.js` và `sweep.e2e.js`: 16/16. Các file e2e còn lại chưa chạy trên máy đó.
- `npm run vectors`: khớp.

Khi làm: logic dùng `node --test test/passkey.test.js`, giao diện dùng `node --test test/e2e/passkey.e2e.js`, ảnh chụp qua `KEYMESH_SHOTS`. Nền tảng thật dùng `testkit/passkey-probe/` ở bước 2, rồi app thật ở bước 11.

## 7. Deliberately not doing

- Đổi `core/`, `docs/09`, hay nâng phiên bản IndexedDB: không cần.
- Đổi `idle.js`, nới khoá nền lúc bật passkey: `KM-007-FR21` cấm.
- Tạo `config.js` cho RP ID: chỉ để lấy giá trị trình duyệt đã mặc định.
- Thêm lần xác thực thứ ba để kiểm đầu ra PRF: vượt `KM-007-FR03`; rủi ro ghi ở §4.
- Dùng `getClientCapabilities` để kiểm trước: spec chấp nhận báo sau lần thử, và kết quả thử thật mới là thứ quyết định.
- Thêm `.gitattributes` hay đường dẫn Chrome cho Windows: `implement` chạy trên Mac, nên không có lý do sửa trong epic này. `npm test` vẫn đỏ một test trên Windows khi `core.autocrlf=true`; đây là lỗi có sẵn, không thuộc epic.
- Trang đo không có Service Worker: khởi động lạnh khi offline của shell đã kiểm ở KM-004, và chuỗi đầy đủ được kiểm trên app thật ở bước 11.
- Các mục ở `spec.md` §7. Luồng đổi mật khẩu đầy đủ thuộc KM-009; xoay khoá tài khoản và việc huỷ passkey đi kèm do KM-011 đánh giá; đặt lại mật khẩu bằng passkey thuộc epic sau (Concern 14).
- Việc của KM-006: chỉ ghi chuyển giao (Concern 13), trừ phần kiểm có điều kiện ở bước 10.
# Prototype giao diện

Bản mẫu bấm thử được của KeyMesh v2. Dùng nó để duyệt và chỉnh giao diện trước khi code chính thức. Prototype không mã hoá, không lưu và không gọi mạng. Mọi dữ liệu đều là dữ liệu giả.

## Chạy

```bash
py -m http.server 5173 --directory design
```

Mở <http://localhost:5173/>. Trang này hiện khung desktop và khung điện thoại cạnh nhau. Thanh trên cùng có các nút để nhảy tới từng màn, đổi trạng thái đồng bộ và đổi chủ đề sáng/tối.

Muốn mở thẳng một màn thì dùng `prototype/app.html#s=<màn>&sync=<trạng thái>&theme=<light|dark>`. Các màn có sẵn: `unlock`, `login`, `signup`, `home`, `list`, `item`, `conflict`, `edit`, `new`, `expiring`, `trash`, `settings`, `sync`.

## File

| File | Nội dung |
|---|---|
| `index.html` | Trang duyệt: khung desktop + mobile, chọn màn và trạng thái |
| `prototype/styles.css` | Token màu, layout 3 cột (≥ 900px) và layout xếp chồng cho mobile. Dự định dùng lại cho `public/` |
| `prototype/data.js` | Dữ liệu giả, bám theo schema vault v2 ([03-data-model.md](../docs/03-data-model.md)) |
| `prototype/app.js` | Render và điều hướng giữa các màn |

Bố cục và nguyên tắc mobile theo [07-features.md](../docs/07-features.md#thiết-kế-giao-diện).

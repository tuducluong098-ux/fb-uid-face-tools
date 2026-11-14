# FB Toolkit Pro · Check Live UID & Tải Ảnh Mặt AI

Bộ công cụ trực tuyến gọn nhẹ, hiện đại được xây dựng bằng **Next.js 14 (App Router)**, **TypeScript** và **Tailwind CSS**.

---

## 🌟 Tính Năng Chính

### 1. 🔍 Check Live Facebook UID Hàng Loạt
- **Tự động ghi nhớ UID**: Toàn bộ danh sách UID nhập vào được tự động lưu trong `localStorage` trình duyệt. Mở lại web bất cứ lúc nào danh sách vẫn còn nguyên.
- **Quản lý nhóm UID**: Cho phép đặt tên và lưu lại nhiều nhóm danh sách khác nhau (VD: *Clone đợt 1, Dàn nick nuôi...*) để tải lại nhanh chỉ với 1 click.
- **Hỗ trợ mọi định dạng đầu vào**: Nhận diện tự động UID từ chuỗi thô:
  - `1000123456789`
  - `https://facebook.com/1000123456789`
  - `1000123456789|MatKhau|2FA|Cookie...`
- **Kiểm tra tốc độ cao không cần Access Token**: Gọi trực tiếp Facebook Graph API với cơ chế đa luồng song song, trả về trạng thái 🟢 **LIVE** / 🔴 **DIE** và ảnh đại diện (Avatar) của nick Live.
- **Thao tác nhanh**: Thống kê số lượng Live/Die, lọc danh sách, 1-click **Copy tất cả Live**, **Copy tất cả Die**, hoặc **Xuất file `.txt`**.

### 2. 👤 Tải Ảnh Mặt AI Chân Thực (`ThisPersonDoesNotExist`)
- **Ảnh khuôn mặt AI độ nét cao**: Sinh ngẫu nhiên khuôn mặt chân thực từ thuật toán StyleGAN.
- **Thao tác cực dễ**:
  - **Kéo thả trực tiếp**: Kéo ảnh thả thẳng ra Desktop hoặc Thư mục máy tính.
  - **1-Click Tải về**: Bấm nút *Tải ảnh này về máy* để tải trực tiếp file `.jpg` (đã có backend proxy bypass CORS).
- **Đổi mặt tức thì**: Nút bấm tạo ngay khuôn mặt mới hoặc bật chế độ tự động đổi mặt sau mỗi 5 giây.
- **Tải nhanh hàng loạt (File ZIP)**: Nút tải gói 5 ảnh hoặc 10 ảnh được tự động đóng gói sẵn vào 1 file nén `.ZIP`.
- **Bộ sưu tập lịch sử**: Lưu lại các ảnh vừa tạo trong phiên để bạn xem lại hoặc tải lại bất kỳ lúc nào.

---

## 🛠️ Công Nghệ Sử Dụng

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Ngôn ngữ**: TypeScript
- **Styling**: Tailwind CSS & Liquid Glass Dark Theme
- **Icons**: Lucide React
- **Nén file**: JSZip

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Cục Bộ

1. **Clone repository:**
   ```bash
   git clone git@github.com:tuducluong098-ux/fb-uid-face-tools.git
   cd fb-uid-face-tools
   ```

2. **Cài đặt thư viện:**
   ```bash
   npm install
   ```

3. **Chạy môi trường phát triển (Dev):**
   ```bash
   npm run dev
   ```
   Mở trình duyệt tại: [http://localhost:3000](http://localhost:3000)

4. **Build bản Production:**
   ```bash
   npm run build
   npm start
   ```

---

## 📄 Bản Quyền
Dự án được phát triển bởi **tuducluong098-ux**.

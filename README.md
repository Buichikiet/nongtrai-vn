# 🌱 Nông Trại Vui Vẻ

## Giới thiệu
Game nông trại online/offline siêu dễ thương với:
- 🏠 Xây nhà, trồng cây, chăn nuôi
- 🚗 Xe cộ, thú cưng, quần áo VIP
- 🌅 Ngày đêm chuyển mùa đẹp mắt
- 👥 Multiplayer qua WebSocket
- 🔐 Đăng nhập Google/Discord

## Cách chơi

### Offline (khuyến nghị)
1. Giải nén file
2. Chạy: 
pm start hoặc 
ode server.js
3. Mở trình duyệt: http://localhost:3000
4. Nhấn **Chơi offline**

### Online (cần cấu hình OAuth)
1. Tạo .env từ .env.example
2. Điền Google Client ID hoặc Discord Client ID
3. Chạy 
pm start
4. Truy cập server qua PUBLIC_URL

## Các lệnh
- Di chuyển: WASD hoặc phím mũi tên
- Tương tác: Click chuột hoặc E
- Đánh quái: Q

## Cài đặt
`ash
npm install
npm start
`

## Cấu hình OAuth Google
1. Vào https://console.cloud.google.com
2. Tạo project mới
3. Enable Google+ API
4. Tạo OAuth 2.0 Client ID
5. Thêm authorized redirect URI: http://localhost:3000/auth/google/callback

## Cấu hình Discord
1. Vào https://discord.com/developers/applications
2. Tạo application mới
3. Tạo OAuth2 redirect
4. Copy Client ID và Secret vào .env

## Admin Commands
- Set role: /api/admin/setrole?code=XXX&role=admin

## Credits
- Admin: Bùi Chí Kiệt
- Font: Fredoka, Baloo 2 (Google Fonts)

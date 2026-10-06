# HỆ THỐNG KIỂM TRA TRẮC NGHIỆM TRỰC TUYẾN

Ứng dụng web cho phép giáo viên tổ chức và quản lý các phiên kiểm tra trực tuyến, hỗ trợ đề thi trắc nghiệm, đúng/sai, trả lời ngắn và tự luận. Học sinh có thể làm bài trực tiếp trên máy tính với chế độ toàn màn hình và nộp bài tự động.

## Tính năng nổi bật
- Quản lý phiên kiểm tra với **Mã phiên tự tạo dễ nhớ**.
- Hỗ trợ xem đề thi và điền phiếu trả lời trực tuyến.
- Tự động chấm điểm cho câu hỏi trắc nghiệm, đúng/sai, trả lời ngắn.
- Đồng bộ và lưu trữ dữ liệu thời gian thực trên Firebase Firestore.
- Chế độ giám sát toàn màn hình chống gian lận.

## Cài đặt & Chạy ứng dụng
```bash
npm install
npm run dev
```

## Triển khai (Build & Deploy)
```bash
npm run build
```
Được tối ưu cho triển khai trên Vercel với cấu hình định tuyến SPA trong `vercel.json`.

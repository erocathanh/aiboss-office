// ⚠️ Tên bị chia sang tệp khác thì phải NHẬN QUA THAM SỐ — nếu không thì vật thử
//    KHÔNG qua nổi cổng kiểu, và một cổng đỏ thường trực dạy người ta thôi nhìn nó.
// VẬT THỬ — «sau khi chia», mảnh 1. CÙNG nội dung, KHÁC cách chia tệp.
import { useState, useEffect } from 'react';
export function Man({ b }: { b: string }) {
  const [a, datA] = useState(0);
  useEffect(() => { datA(1); }, [b]);
  return (
    <div className="khung">
      <span className="nhan">Xin chào</span>
    </div>
  );
}

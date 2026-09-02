// VẬT THỬ — «sau khi chia», mảnh 1. CÙNG nội dung, KHÁC cách chia tệp.
import { useState, useEffect } from 'react';
export function Man() {
  const [a, datA] = useState(0);
  useEffect(() => { datA(1); }, [b]);
  return (
    <div className="khung">
      <span className="nhan">Xin chào</span>
    </div>
  );
}

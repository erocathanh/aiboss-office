// ⚠️ Tên bị chia sang tệp khác thì phải NHẬN QUA THAM SỐ — nếu không thì vật thử
//    KHÔNG qua nổi cổng kiểu, và một cổng đỏ thường trực dạy người ta thôi nhìn nó.
// VẬT THỬ — «sau khi chia», mảnh 2.
import { useState, useCallback } from 'react';
export function Nut({ a }: { a: number }) {
  const [b, datB] = useState('x');
  const bam = useCallback(() => datB('y'), [a]);
  return (
    <button className="nut" onClick={bam}>Bấm đi</button>
  );
}

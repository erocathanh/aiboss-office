// VẬT THỬ — «trước khi chia»: MỘT component ôm hết.
import { useState, useEffect, useCallback } from 'react';
export function Man() {
  const [a, datA] = useState(0);
  const [b, datB] = useState('x');
  useEffect(() => { datA(1); }, [b]);
  const bam = useCallback(() => datB('y'), [a]);
  return (
    <div className="khung">
      <span className="nhan">Xin chào</span>
      <button className="nut" onClick={bam}>Bấm đi</button>
    </div>
  );
}

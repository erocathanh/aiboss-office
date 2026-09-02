// VẬT THỬ — «sau khi chia», mảnh 2.
import { useState, useCallback } from 'react';
export function Nut() {
  const [b, datB] = useState('x');
  const bam = useCallback(() => datB('y'), [a]);
  return (
    <button className="nut" onClick={bam}>Bấm đi</button>
  );
}

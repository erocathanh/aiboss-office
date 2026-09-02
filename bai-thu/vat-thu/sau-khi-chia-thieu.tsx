// VẬT THỬ — «sau khi chia» nhưng LÀM RƠI: thiếu nút bấm và một móc.
import { useState } from 'react';
export function Nut() {
  const [b, datB] = useState('x');
  return (<span className="nhan-phu">{String(b)}</span>);
}

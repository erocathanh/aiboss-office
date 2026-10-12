import duLieuCu from '../../du-lieu/nhan-su.json';
import dataSeatsRaw from '../../data/seats.json';
import dataDepartmentsRaw from '../../data/departments.json';
import officeConfigRaw from '../../config/office.json';
import { datNhanHangLoat } from './dat-nhan';

export interface PhongBan {
  ma: string;
  icon: string;
  ten: string;
  so_nhan_su: number;
}

export interface NhanSu {
  /** Technical name (slug) - used for session connection and lookup. */
  ten: string;
  /** Friendly label - primary display for users. */
  nhan: string;
  /** Pinned to top of list. */
  ghim?: boolean;
  /** Path to soul file. */
  soul?: string;
  /** Seat workspace directory. */
  thu_muc?: string;
  /** Pinned session id. */
  phien_ghim?: string;
  phong: string;
  ten_phong: string;
  vai: string;
  viet_tat: string;
  /** Searchable normalized string. */
  tim: string;
  icon?: string;
  status?: string;
}

/** Normalize strings for searching without accents. */
export function boDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function sinhVietTat(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 3);
}

export const officeConfig = officeConfigRaw;

interface SeatJson {
  seat_id: string;
  name: string;
  role: string;
  department: string;
  dir: string;
  icon?: string;
  status?: string;
  pinned_session?: string | null;
  example?: boolean;
}

interface DepartmentJson {
  id: string;
  name: string;
  seat_count: number;
  icon: string;
}

const hasNewData = Array.isArray(dataSeatsRaw) && dataSeatsRaw.length > 0;

let PHONG: PhongBan[];
let DS: NhanSu[];

if (hasNewData) {
  const depts = dataDepartmentsRaw as DepartmentJson[];
  const seats = dataSeatsRaw as SeatJson[];
  const deptMap = new Map(depts.map((d) => [d.id, d]));

  PHONG = depts.map((d) => ({
    ma: d.id,
    ten: d.name,
    icon: d.icon,
    so_nhan_su: d.seat_count ?? seats.filter((s) => s.department === d.id).length,
  }));

  DS = seats.map((s, index) => {
    const dept = deptMap.get(s.department);
    const tenPhong = dept ? dept.name : s.department;
    return {
      ten: s.seat_id,
      nhan: s.name,
      ghim: s.seat_id === 'marketing-lead' || index === 0,
      thu_muc: s.dir,
      phien_ghim: s.pinned_session ?? undefined,
      phong: s.department,
      ten_phong: tenPhong,
      vai: s.role,
      viet_tat: sinhVietTat(s.name),
      tim: boDau(`${s.name} ${s.seat_id} ${s.role} ${tenPhong}`),
      icon: s.icon,
      status: s.status,
    };
  });
} else {
  // Fallback to legacy du-lieu/nhan-su.json
  PHONG = (duLieuCu as { phong_ban: PhongBan[] }).phong_ban;
  const tenPhongTheoMa = new Map(PHONG.map((p) => [p.ma, p.ten]));
  type NhanSuTho = {
    ten: string;
    phong: string;
    vai: string;
    viet_tat: string;
    nhan?: string;
    ghim?: boolean;
    soul?: string;
    thu_muc?: string;
    phien_ghim?: string;
  };
  const THO = (duLieuCu as { nhan_su: NhanSuTho[] }).nhan_su;
  const coNhan = datNhanHangLoat(THO);
  const thoTheoTen = new Map(THO.map((n) => [n.ten, n]));

  DS = coNhan.map((n) => ({
    ten: n.ten,
    nhan: thoTheoTen.get(n.ten)?.nhan ?? n.nhan,
    ghim: thoTheoTen.get(n.ten)?.ghim === true,
    soul: thoTheoTen.get(n.ten)?.soul,
    thu_muc: thoTheoTen.get(n.ten)?.thu_muc,
    phien_ghim: thoTheoTen.get(n.ten)?.phien_ghim,
    phong: n.phong,
    ten_phong: tenPhongTheoMa.get(n.phong) ?? n.phong,
    vai: n.vai,
    viet_tat: n.viet_tat,
    tim: boDau(`${n.nhan} ${n.ten} ${n.vai} ${tenPhongTheoMa.get(n.phong) ?? ''}`),
  }));
}

const theoTen = new Map(DS.map((n) => [n.ten, n]));

export function dsPhongBan(): PhongBan[] {
  return PHONG;
}

export function dsNhanSu(): NhanSu[] {
  return [...DS].sort((a, b) => Number(b.ghim ?? false) - Number(a.ghim ?? false));
}

export function gheGhim(): NhanSu | undefined {
  return DS.find((n) => n.ghim);
}

export function timNhanSu(ten: string): NhanSu | undefined {
  return theoTen.get(ten);
}

export function tongSo() {
  return {
    nhan_su: DS.length,
    phong_ban: PHONG.length,
    truong_phong: DS.filter((n) => n.ghim || n.ten.endsWith('-lead') || n.vai.includes('Lead')).length,
  };
}

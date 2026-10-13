r"""Module chứa quy tắc nhận diện và xử lý PII (thông tin định danh cá nhân).

Dùng chung giữa:
- hook 5 (guard_customer_pii.py)
- mask_pii.py (công cụ che PII)
- inbox-reader (fetch_page_messages.py)

Cập nhật theo BỔ SUNG-01:
- Chuẩn hoá NFKC rồi NFC, xoá ký tự zero-width, gộp khoảng trắng liên tiếp.
- Quét thêm các biến thể giải mã urllib.parse.unquote và html.unescape.
- Mẫu SĐT di động chuẩn hoá giữ 84912345678, nhận diện đầu ngoặc (+84), 0084, dấu gạch nối.
- Mẫu SĐT bàn (mới): bắt buộc có 0 hoặc 84 ở đầu + 2\d + 8 chữ số.
- Mẫu Email: tên miền [\w-], TLD toàn chữ dài >= 2 ký tự.
- Loại bỏ chuỗi ảnh/tài nguyên (@2x.png, .jpg, .css, v.v.), chuỗi git@<host>:.
- Mẫu STK: cho phép 0-3 từ đứng giữa từ khoá và số tài khoản, nhận dấu '-' trong số.
- Bộ lọc bỏ qua: số tiền (nhóm nghìn, đ, đồng, VND), ngày tháng (dd-mm-yyyy).
"""

import re
import unicodedata
import urllib.parse
import html
import shlex
from typing import List, Tuple, Optional

# Biểu thức số điện thoại di động Việt Nam chuẩn
PHONE_MOBILE_REGEX = re.compile(
    r'(?<!\d)(?:(?:\+|00)?84[ .\-]?(?:\(0\)[ .\-]?)?|\(\+?84\)[ .\-]?|0)[35789](?:[ .\-]?\d){8}(?!\d)'
)

# Biểu thức số điện thoại bàn Việt Nam chuẩn (bắt buộc có 0 hoặc 84 ở đầu)
PHONE_LANDLINE_REGEX = re.compile(
    r'(?<!\d)(?:(?:\+|00)84[ .\-]?|0)2\d(?:[ .\-]?\d){8}(?!\d)'
)

# Biểu thức email
EMAIL_REGEX = re.compile(
    r'(?<![\w.-])([A-Za-z0-9._%+-]+@(?:[\w-]+\.)+[A-Za-z]{2,})(?![\w.-])'
)

# Danh sách tên miền email được phép bỏ qua (whitelist)
EMAIL_WHITELIST_SUFFIXES = (
    'example.com',
    'example.org',
    'example.net',
    '.invalid',
    'users.noreply.github.com',
)

# Biểu thức số tài khoản ngân hàng có ngữ cảnh (cho phép 0-3 từ chen giữa trên cùng một dòng)
BANK_ACCOUNT_REGEX = re.compile(
    r'(?i)(stk|số tài khoản|so tai khoan|tài khoản|tai khoan|tk)[ \t]*[:.\-]?(?:[ \t]*[^\d\s]+){0,3}[ \t]*(\d[\d .\-]{8,16}\d)'
)

# Biểu thức ngày tháng dạng dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy hoặc yyyy-mm-dd
DATE_PATTERN = re.compile(r'\b(?:\d{2}[.\-/]\d{2}[.\-/]\d{4}|\d{4}[.\-/]\d{2}[.\-/]\d{2})\b')

# Biểu thức số tiền định dạng nhóm nghìn
THOUSAND_GROUP_REGEX = re.compile(r'^\d{1,3}(?:\.\d{3})+$')


def clean_text(text: str) -> str:
    """Chuẩn hoá chuỗi văn bản: NFKC, NFC, xoá ký tự ẩn, gộp khoảng trắng."""
    if not text:
        return ""
    t = unicodedata.normalize('NFKC', text)
    t = unicodedata.normalize('NFC', t)
    for ch in ('\u200b', '\u200c', '\u200d', '\ufeff'):
        t = t.replace(ch, '')
    t = re.sub(r'[ \t]+', ' ', t)
    return t


def generate_text_variants(text: str) -> List[str]:
    """Sinh các biến thể văn bản đã chuẩn hoá, giải mã URL/HTML và gỡ nháy shell."""
    if not text:
        return []
    variants = set()

    c1 = clean_text(text)
    variants.add(c1)

    # Giải mã URL escape
    try:
        u_dec = urllib.parse.unquote(text)
        if u_dec != text:
            variants.add(clean_text(u_dec))
    except Exception:
        pass

    # Giải mã HTML entities
    try:
        h_dec = html.unescape(text)
        if h_dec != text:
            variants.add(clean_text(h_dec))
    except Exception:
        pass

    # Giải mã kết hợp URL + HTML
    try:
        uh_dec = urllib.parse.unquote(html.unescape(text))
        if uh_dec != text:
            variants.add(clean_text(uh_dec))
    except Exception:
        pass

    # Giải mã escape hex/octal và shlex gỡ nháy (với lệnh shell)
    try:
        if '\\x' in text or '\\0' in text:
            b_dec = bytes(text, 'utf-8').decode('unicode_escape', errors='ignore')
            variants.add(clean_text(b_dec))
    except Exception:
        pass

    try:
        if "'" in text or '"' in text:
            tokens = shlex.split(text)
            unquoted = ' '.join(tokens)
            variants.add(clean_text(unquoted))
    except Exception:
        pass

    return list(variants)


def is_whitelisted_email(email: str) -> bool:
    """Kiểm tra email có thuộc danh sách tên miền mẫu được phép không."""
    email_lower = email.lower()
    for suffix in EMAIL_WHITELIST_SUFFIXES:
        if suffix.startswith('.'):
            if email_lower.endswith(suffix):
                return True
        else:
            if email_lower.endswith('@' + suffix) or email_lower.endswith('.' + suffix):
                return True
    return False


def is_excluded_email(email: str, context: str = "") -> bool:
    """Kiểm tra xem chuỗi có phải là email bị loại bỏ không (ảnh @2x, css, js, git@host)."""
    em_lower = email.lower()
    # Loại bỏ ảnh/tài nguyên @2x.png, v.v.
    if re.search(r'@\d+x\.', em_lower):
        return True
    if re.search(r'\.(?:png|jpg|jpeg|webp|svg|gif|js|css)$', em_lower):
        return True
    # Loại bỏ git@<host>:
    if em_lower.startswith('git@') and (f'{email}:' in context or f'{em_lower}:' in context.lower()):
        return True
    return False


def is_money_value(number_str: str, end_pos: int, text: str) -> bool:
    """Kiểm tra xem chuỗi số có phải là số tiền (nhóm nghìn hoặc có hậu tố tiền tệ đ/đồng/VND)."""
    num_clean = number_str.strip()
    if THOUSAND_GROUP_REGEX.match(num_clean):
        return True

    suffix = text[end_pos:end_pos + 20].lstrip()
    if re.match(r'^(?:đ|đồng|vnd|vnđ)\b', suffix, re.IGNORECASE):
        return True

    return False


def is_date_overlap(start_pos: int, end_pos: int, text: str) -> bool:
    """Kiểm tra xem vị trí khớp có trùng hoặc lồng trong định dạng ngày tháng không."""
    for dm in DATE_PATTERN.finditer(text):
        if not (end_pos <= dm.start() or start_pos >= dm.end()):
            return True
    return False


def find_phones_in_string(t: str) -> List[str]:
    """Tìm số điện thoại di động và bàn trong một chuỗi đã chuẩn hoá."""
    phones = []
    # 1. Di động
    for m in PHONE_MOBILE_REGEX.finditer(t):
        val = m.group(0)
        # Bỏ qua nếu là số tiền hoặc ngày tháng
        if is_money_value(val, m.end(), t):
            continue
        if is_date_overlap(m.start(), m.end(), t):
            continue
        phones.append(val)

    # 2. Số bàn
    for m in PHONE_LANDLINE_REGEX.finditer(t):
        val = m.group(0)
        if is_money_value(val, m.end(), t):
            continue
        if is_date_overlap(m.start(), m.end(), t):
            continue
        phones.append(val)

    return phones


def find_emails_in_string(t: str) -> List[str]:
    """Tìm email khách trong một chuỗi đã chuẩn hoá."""
    emails = []
    for m in EMAIL_REGEX.finditer(t):
        val = m.group(1)
        if is_whitelisted_email(val):
            continue
        if is_excluded_email(val, t):
            continue
        emails.append(val)
    return emails


def find_bank_accounts_in_string(t: str) -> List[str]:
    """Tìm số tài khoản ngân hàng trong một chuỗi đã chuẩn hoá."""
    accounts = []
    for m in BANK_ACCOUNT_REGEX.finditer(t):
        num_str = m.group(2)
        # Bỏ qua nếu là số tiền hoặc ngày tháng
        if is_money_value(num_str, m.end(), t):
            continue
        if is_date_overlap(m.start(), m.end(), t):
            continue
        accounts.append(m.group(0))
    return accounts


def find_phones(text: str) -> List[str]:
    """Tìm tất cả số điện thoại trong chuỗi qua các biến thể."""
    results = set()
    for variant in generate_text_variants(text):
        for p in find_phones_in_string(variant):
            results.add(p)
    return list(results)


def find_emails(text: str) -> List[str]:
    """Tìm tất cả email trong chuỗi qua các biến thể."""
    results = set()
    for variant in generate_text_variants(text):
        for e in find_emails_in_string(variant):
            results.add(e)
    return list(results)


def find_bank_accounts(text: str) -> List[str]:
    """Tìm các số tài khoản ngân hàng qua các biến thể."""
    results = set()
    for variant in generate_text_variants(text):
        for b in find_bank_accounts_in_string(variant):
            results.add(b)
    return list(results)


def scan_pii(text: str) -> Tuple[bool, List[str]]:
    """Quét chuỗi tìm PII qua tất cả các biến thể đã chuẩn hoá.

    Trả về (has_pii, danh_sach_mo_ta_loi).
    """
    reasons = []

    phones = find_phones(text)
    if phones:
        reasons.append(f"phát hiện {len(phones)} số điện thoại")

    emails = find_emails(text)
    if emails:
        reasons.append(f"phát hiện {len(emails)} email khách")

    bank_accs = find_bank_accounts(text)
    if bank_accs:
        reasons.append(f"phát hiện {len(bank_accs)} số tài khoản ngân hàng")

    return (len(reasons) > 0, reasons)


def mask_pii(text: str, names: Optional[List[str]] = None) -> str:
    """Che toàn bộ SĐT, email, STK và tên khách hàng (nếu có danh sách)."""
    # Chuẩn hoá cơ bản NFC để đảm bảo xử lý đồng nhất
    masked = unicodedata.normalize('NFC', text)

    # 1. Che STK có ngữ cảnh trước (chỉ che khi không phải số tiền)
    def _mask_bank(match):
        raw = match.group(0)
        prefix = match.group(1)
        num_str = match.group(2)
        if is_money_value(num_str, match.end(), masked):
            return raw
        return f"{prefix}: [STK-ĐÃ-ẨN]"

    masked = BANK_ACCOUNT_REGEX.sub(_mask_bank, masked)

    # 2. Che SĐT di động (không che số tiền hay ngày tháng)
    def _mask_mobile(match):
        val = match.group(0)
        if is_money_value(val, match.end(), masked) or is_date_overlap(match.start(), match.end(), masked):
            return val
        return "[SĐT-ĐÃ-ẨN]"

    masked = PHONE_MOBILE_REGEX.sub(_mask_mobile, masked)

    # 3. Che SĐT bàn
    def _mask_landline(match):
        val = match.group(0)
        if is_money_value(val, match.end(), masked) or is_date_overlap(match.start(), match.end(), masked):
            return val
        return "[SĐT-ĐÃ-ẨN]"

    masked = PHONE_LANDLINE_REGEX.sub(_mask_landline, masked)

    # 4. Che Email (không che whitelist hay file ảnh/css/js/git)
    def _mask_email(match):
        em = match.group(1)
        if is_whitelisted_email(em) or is_excluded_email(em, masked):
            return match.group(0)
        return match.group(0).replace(em, "[EMAIL-ĐÃ-ẨN]")

    masked = EMAIL_REGEX.sub(_mask_email, masked)

    # 5. Che tên thật theo danh sách (nếu có)
    if names:
        sorted_names = sorted([n.strip() for n in names if n.strip()], key=len, reverse=True)
        for i, name in enumerate(sorted_names, 1):
            pattern = re.compile(re.escape(name), re.IGNORECASE)
            masked = pattern.sub(f"[Khách #{i:02d}]", masked)

    return masked

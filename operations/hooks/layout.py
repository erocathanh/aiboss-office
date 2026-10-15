"""layout.py — Bảng tên thư mục và tệp chuẩn hoá cho AIBOSS Office.

Được thiết kế để nhập vào các hook an toàn, giúp hook dùng cùng logic
giữa tiếng Việt (kho OPC gốc) và tiếng Anh (kho AIBOSS Office).
Mang ngược về OPC ở pha H4.
"""

# Tên thư mục cấp 1 & 2
PROJECTS_DIR = "projects"
INPUTS_DIR = "inputs"
WIP_DIR = "wip"
OUTPUTS_DIR = "outputs"
REFERENCES_DIR = "references"
TEMPLATES_DIR = "templates"
SAMPLE_GROUND_TRUTH_DIR = "_sample-ground-truth"

# Tên tệp nhật ký / tiến độ / chốt
CHANNEL_FILE = "CHANNEL.md"
PROGRESS_FILE = "PROGRESS.md"
FINAL_SUFFIX = "_final"

# Tên tương ứng ở kho gốc OPC (để hỗ trợ đối chiếu / ngược về OPC)
OPC_PROJECTS_DIR = "CAC-DU-AN"
OPC_INPUTS_DIR = "DAU-VAO"
OPC_WIP_DIR = "DANG-LAM"
OPC_OUTPUTS_DIR = "DAU-RA"
OPC_REFERENCES_DIR = "THAM-KHAO"
OPC_TEMPLATES_DIR = "BAN-MAU"
OPC_SAMPLE_GROUND_TRUTH_DIR = "DU-AN-MAU-SU-THAT"
OPC_CHANNEL_FILE = "nhat-ky.md"
OPC_PROGRESS_FILE = "BANG-DIEU-KHIEN.md"

# Bảng ánh xạ hai chiều
LAYOUT_MAP = {
    OPC_PROJECTS_DIR: PROJECTS_DIR,
    OPC_INPUTS_DIR: INPUTS_DIR,
    OPC_WIP_DIR: WIP_DIR,
    OPC_OUTPUTS_DIR: OUTPUTS_DIR,
    OPC_REFERENCES_DIR: REFERENCES_DIR,
    OPC_TEMPLATES_DIR: TEMPLATES_DIR,
    OPC_SAMPLE_GROUND_TRUTH_DIR: SAMPLE_GROUND_TRUTH_DIR,
    OPC_CHANNEL_FILE: CHANNEL_FILE,
    OPC_PROGRESS_FILE: PROGRESS_FILE,
}

REVERSE_MAP = {v: k for k, v in LAYOUT_MAP.items()}

PROJECTS_ROOT_ALL = (PROJECTS_DIR, OPC_PROJECTS_DIR)
INPUTS_DIR_ALL = (
    INPUTS_DIR,
    OPC_INPUTS_DIR,
    REFERENCES_DIR,
    OPC_REFERENCES_DIR,
    TEMPLATES_DIR,
    OPC_TEMPLATES_DIR,
)
OUTPUTS_DIR_ALL = (OUTPUTS_DIR, OPC_OUTPUTS_DIR)
SAMPLE_GROUND_TRUTH_ALL = (SAMPLE_GROUND_TRUTH_DIR, OPC_SAMPLE_GROUND_TRUTH_DIR)


def is_projects_root(name: str) -> bool:
    """Kiểm tra tên thư mục gốc dự án (projects hoặc CAC-DU-AN, không phân biệt hoa thường)."""
    return name.lower() in (PROJECTS_DIR.lower(), OPC_PROJECTS_DIR.lower())


def is_inputs_dir(name: str) -> bool:
    """Kiểm tra tên thư mục đầu vào/tham khảo/bản mẫu bất biến (không phân biệt hoa thường)."""
    return name.lower() in tuple(x.lower() for x in INPUTS_DIR_ALL)


def is_wip_dir(name: str) -> bool:
    """Kiểm tra tên thư mục đang làm (wip hoặc DANG-LAM, không phân biệt hoa thường)."""
    return name.lower() in (WIP_DIR.lower(), OPC_WIP_DIR.lower())


def is_outputs_dir(name: str) -> bool:
    """Kiểm tra tên thư mục đầu ra (outputs hoặc DAU-RA, không phân biệt hoa thường)."""
    return name.lower() in (OUTPUTS_DIR.lower(), OPC_OUTPUTS_DIR.lower())


def is_sample_ground_truth(name: str) -> bool:
    """Kiểm tra thư mục dự án mẫu sự thật (không khớp -2, không phân biệt hoa thường)."""
    return name.lower() in (SAMPLE_GROUND_TRUTH_DIR.lower(), OPC_SAMPLE_GROUND_TRUTH_DIR.lower())


def is_channel_file(name: str) -> bool:
    """Kiểm tra tệp nhật ký / kênh trao đổi dự án (chỉ cho phép nối thêm, không phân biệt hoa thường)."""
    return name.lower() in (CHANNEL_FILE.lower(), OPC_CHANNEL_FILE.lower())


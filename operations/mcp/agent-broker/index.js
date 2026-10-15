#!/usr/bin/env node
/**
 * Bundled AIBOSS Office MCP Agent Broker server.
 * Source: Copied from agent-broker-mcp (commit 0d1ed6c) on 2026-10-15, hardened in C2-broker v02.
 * Mailbox location: Self-anchored at startup to <REPO_ROOT>/operations/data/mailbox
 * (MCP_HOP_THU_DIR is only honored when its resolved realpath lies inside <REPO_ROOT>).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import {
  guiTin,
  nhanTin,
  danhDauDaDoc,
  soatHopThu,
  BrokerError,
  MA_LOI
} from './broker-core.js';

const server = new Server(
  {
    name: 'agent-broker',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

const CONG_CU = [
  {
    name: 'gui_tin',
    description: 'Đẩy một tin nhắn vào hộp thư chung liên-agent (Append-only NDJSON + Markdown mirror). Hộp thư của AIBOSS Office nằm tại operations/data/mailbox/ (định cấu hình qua biến môi trường MCP_HOP_THU_DIR).',
    inputSchema: {
      type: 'object',
      properties: {
        nguoi_gui: {
          type: 'string',
          description: 'Tên định danh ghế gửi (ví dụ: marketing-lead, content-writer)'
        },
        nguoi_nhan: {
          type: 'string',
          description: 'Tên định danh ghế nhận (ví dụ: content-writer, reviewer, tat-ca)'
        },
        tieu_de: {
          type: 'string',
          description: 'Tóm tắt nội dung tin nhắn (tối đa 150 ký tự)'
        },
        noi_dung: {
          type: 'string',
          description: 'Toàn văn nội dung trao đổi, đề bài, báo cáo hoặc kết quả'
        }
      },
      required: ['nguoi_gui', 'nguoi_nhan', 'tieu_de', 'noi_dung'],
      additionalProperties: false
    }
  },
  {
    name: 'nhan_tin',
    description: 'Lấy danh sách tin nhắn gửi cho ghế hiện tại từ hộp thư operations/data/mailbox/. Trả về so_tin: 0 nếu rỗng (không ném lỗi để tránh vòng lặp đốt tiền). ⚠️ Trả tin CHƯA ĐỌC CŨ NHẤT trước rồi DỪNG ở gioi_han: ghế nào tồn nhiều tin chưa ký sẽ KHÔNG thấy tin mới — truyền gioi_han=20 và ký nhận (danh_dau_da_doc) tin đã xử lý để với tới tin mới.',
    inputSchema: {
      type: 'object',
      properties: {
        nguoi_nhan: {
          type: 'string',
          description: 'Tên định danh ghế đang lấy tin (ví dụ: marketing-lead, content-writer)'
        },
        chi_tin_chua_doc: {
          type: 'boolean',
          description: 'Chỉ lấy các tin chưa được đánh dấu đã đọc (mặc định: true)',
          default: true
        },
        gioi_han: {
          type: 'number',
          description: 'Số tin tối đa trả về (mặc định: 5, tối đa: 20)',
          default: 5
        }
      },
      required: ['nguoi_nhan'],
      additionalProperties: false
    }
  },
  {
    name: 'danh_dau_da_doc',
    description: 'Xác nhận (ACK) đã đọc và nhận tin thành công.',
    inputSchema: {
      type: 'object',
      properties: {
        ma_tin: {
          type: 'string',
          description: 'Mã tin nhắn cần xác nhận'
        },
        nguoi_doc: {
          type: 'string',
          description: 'Tên định danh ghế xác nhận'
        }
      },
      required: ['ma_tin', 'nguoi_doc'],
      additionalProperties: false
    }
  },
  {
    name: 'soat_hop_thu',
    description: 'Quan sát trạng thái hàng đợi trong operations/data/mailbox/: tổng số tin, tin chưa đọc, phát hiện tin mồ côi quá hạn.',
    inputSchema: {
      type: 'object',
      properties: {
        nguong_treo_phut: {
          type: 'number',
          description: 'Số phút chưa đọc để coi là tin treo (mặc định: 15)',
          default: 15
        }
      },
      additionalProperties: false
    }
  }
];

const SCHEMA_KEYS_BY_TOOL = new Map(
  CONG_CU.map((t) => [t.name, new Set(Object.keys(t.inputSchema.properties || {}))])
);

function locVaKiemTraThamSo(toolName, rawArgs) {
  const allowedKeys = SCHEMA_KEYS_BY_TOOL.get(toolName);
  if (!allowedKeys) {
    throw new BrokerError('CONG_CU_KHONG_TON_TAI', `Không tìm thấy công cụ: ${toolName}`);
  }
  if (rawArgs === undefined || rawArgs === null) {
    return {};
  }
  if (typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    throw new BrokerError(MA_LOI.THAM_SO_KHONG_HOP_LE, 'Tham số công cụ phải là một đối tượng JSON');
  }
  const picked = {};
  for (const [key, val] of Object.entries(rawArgs)) {
    if (!allowedKeys.has(key)) {
      throw new BrokerError(MA_LOI.THAM_SO_KHONG_HOP_LE, `tham số không được phép: ${key}`);
    }
    picked[key] = val;
  }
  return picked;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: CONG_CU
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const pickedArgs = locVaKiemTraThamSo(name, args);
    let ketQua;
    switch (name) {
      case 'gui_tin':
        ketQua = await guiTin(pickedArgs);
        break;
      case 'nhan_tin':
        ketQua = await nhanTin(pickedArgs);
        break;
      case 'danh_dau_da_doc':
        ketQua = await danhDauDaDoc(pickedArgs);
        break;
      case 'soat_hop_thu':
        ketQua = await soatHopThu(pickedArgs);
        break;
      default:
        throw new BrokerError('CONG_CU_KHONG_TON_TAI', `Không tìm thấy công cụ: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(ketQua, null, 2)
        }
      ],
      isError: false
    };
  } catch (err) {
    const ma_loi = err instanceof BrokerError ? err.code : 'LOI_KHONG_XAC_DINH';
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              thanh_cong: false,
              ma_loi,
              ly_do: err.message
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
});

async function chay() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[agent-broker-mcp] Server đã khởi động thành công trên stdio.');
}

chay().catch((err) => {
  console.error('[agent-broker-mcp] Lỗi khởi động:', err);
  process.exit(1);
});

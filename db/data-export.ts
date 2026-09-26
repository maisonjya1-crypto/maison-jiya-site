type ExportRow = Record<string, unknown>;

export type PortableDataExport = {
  exportVersion: 1;
  source: "Maison Jiya";
  exportedAt: string;
  tables: Record<string, ExportRow[]>;
};

const EXPORT_QUERIES: Record<string, string> = {
  commandes: "SELECT * FROM orders ORDER BY id",
  clients: "SELECT * FROM customers ORDER BY id",
  produits: "SELECT * FROM products ORDER BY id",
  mouvements_stock: "SELECT * FROM stock_movements ORDER BY id",
  inventaires: "SELECT * FROM inventory_counts ORDER BY id",
  achats: "SELECT * FROM purchases ORDER BY id",
  depenses: "SELECT * FROM expenses ORDER BY expense_date DESC, id DESC",
  publicites: "SELECT * FROM ad_performance ORDER BY id",
  tresorerie_capital: "SELECT * FROM capital_ledger ORDER BY id",
  historique_commandes: "SELECT * FROM order_status_history ORDER BY id",
  evenements_transporteurs: "SELECT * FROM carrier_events ORDER BY id",
  journal_actions: "SELECT * FROM audit_logs ORDER BY id",
  membres: "SELECT id, username, display_name, role, is_active, created_at, updated_at FROM users ORDER BY id",
  parametres: "SELECT key, value, updated_at FROM settings WHERE key NOT LIKE 'security_%' AND key <> 'backup_webhook_url' ORDER BY key",
  boutique_produits: "SELECT * FROM storefront_product_settings ORDER BY product_id",
  boutique_offres: "SELECT * FROM storefront_offers ORDER BY id",
  boutique_composition_offres: "SELECT * FROM storefront_offer_items ORDER BY offer_id, product_id",
  boutique_medias: "SELECT * FROM storefront_media ORDER BY id",
  journal_sync_google_sheets: "SELECT * FROM google_sheets_sync_log ORDER BY id",
};

export async function buildPortableDataExport(database: D1Database): Promise<PortableDataExport> {
  const queries = Object.entries(EXPORT_QUERIES);
  const results = await database.batch(queries.map(([, query]) => database.prepare(query)));
  const entries = queries.map(([name], index) => [name, (results[index]?.results || []) as ExportRow[]] as const);
  return {
    exportVersion: 1,
    source: "Maison Jiya",
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(entries),
  };
}

function safeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  const text = safeCell(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tableCsv(rows: ExportRow[]) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!headers.length) return "\uFEFF";
  const lines = [headers, ...rows.map((row) => headers.map((header) => row[header]))];
  return `\uFEFF${lines.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function littleEndian(values: Array<[number, number]>) {
  const size = values.reduce((total, [, bytes]) => total + bytes, 0);
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const [value, bytes] of values) {
    if (bytes === 2) view.setUint16(offset, value, true);
    else view.setUint32(offset, value, true);
    offset += bytes;
  }
  return result;
}

function concat(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function buildCsvZip(data: PortableDataExport) {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const [name, rows] of Object.entries(data.tables)) {
    const filename = encoder.encode(`${name}.csv`);
    const content = encoder.encode(tableCsv(rows));
    const checksum = crc32(content);
    const localHeader = littleEndian([
      [0x04034b50, 4], [20, 2], [0x0800, 2], [0, 2], [0, 2], [0, 2],
      [checksum, 4], [content.length, 4], [content.length, 4], [filename.length, 2], [0, 2],
    ]);
    localChunks.push(localHeader, filename, content);

    const centralHeader = littleEndian([
      [0x02014b50, 4], [20, 2], [20, 2], [0x0800, 2], [0, 2], [0, 2], [0, 2],
      [checksum, 4], [content.length, 4], [content.length, 4], [filename.length, 2], [0, 2],
      [0, 2], [0, 2], [0, 2], [0, 4], [localOffset, 4],
    ]);
    centralChunks.push(centralHeader, filename);
    localOffset += localHeader.length + filename.length + content.length;
  }

  const centralDirectory = concat(centralChunks);
  const end = littleEndian([
    [0x06054b50, 4], [0, 2], [0, 2], [Object.keys(data.tables).length, 2],
    [Object.keys(data.tables).length, 2], [centralDirectory.length, 4], [localOffset, 4], [0, 2],
  ]);
  return concat([...localChunks, centralDirectory, end]);
}

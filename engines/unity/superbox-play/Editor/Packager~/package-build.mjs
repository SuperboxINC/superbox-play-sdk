// engines/unity/packager/main.ts
import { readFile as readFile4 } from "fs/promises";

// packages/package-core/src/encoding.ts
var ENCODING_HEAD_BYTES = 64;
var UNITY_MARK = /UnityWeb Compressed Content \((brotli|gzip)\)/;
function isGzip(head) {
  return head[0] === 31 && head[1] === 139;
}
function latin1(bytes) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return text;
}
function detectEncoding(path5, head) {
  const lower = path5.toLowerCase();
  if (lower.endsWith(".br")) return "br";
  if (lower.endsWith(".gz")) return isGzip(head) ? "gzip" : null;
  if (!lower.endsWith(".unityweb")) return null;
  const mark = UNITY_MARK.exec(latin1(head.subarray(0, ENCODING_HEAD_BYTES)));
  if (mark) return mark[1] === "brotli" ? "br" : "gzip";
  return isGzip(head) ? "gzip" : null;
}

// packages/package-core/src/errors.ts
var MESSAGES = {
  // ── 읽기 — ZIP
  ZIP_INVALID: "ZIP \uD615\uC2DD\uC774 \uC544\uB2C8\uAC70\uB098 \uD30C\uC77C \uB05D\uC774 \uC798\uB838\uC5B4\uC694.",
  ZIP_UNSUPPORTED: "ZIP64, \uBD84\uD560, \uC554\uD638\uD654, \uB370\uC774\uD130 \uC11C\uC220\uC790\uB97C \uC4F4 \uD30C\uC77C\uC740 \uBC1B\uC9C0 \uC54A\uC544\uC694.",
  NOT_STORED: "\uC555\uCD95\uB41C \uD56D\uBAA9\uC774 \uC788\uC5B4\uC694. .sbp\uC758 \uBAA8\uB4E0 \uD56D\uBAA9\uC740 \uC555\uCD95\uD558\uC9C0 \uC54A\uACE0 \uC800\uC7A5\uD574\uC57C \uD574\uC694.",
  FIRST_NOT_MANIFEST: "\uCCAB \uD56D\uBAA9\uC774 manifest.json\uC774 \uC544\uB2C8\uC5D0\uC694.",
  OUTSIDE_WEB: "web/ \uBC16\uC5D0 \uC788\uB294 \uD56D\uBAA9\uC774 \uC788\uC5B4\uC694.",
  SYMLINK: "\uC2EC\uBCFC\uB9AD \uB9C1\uD06C\uB294 \uBC1B\uC9C0 \uC54A\uC544\uC694.",
  ENTRY_CORRUPT: "ZIP \uD56D\uBAA9\uC758 \uD5E4\uB354\uAC00 \uBAA9\uB85D\uACFC \uB9DE\uC9C0 \uC54A\uAC70\uB098 \uD56D\uBAA9\uB07C\uB9AC \uACB9\uCCD0\uC694.",
  // ── 읽기 · 만들기 공통 — 빌드 규칙
  PATH_UNSAFE: "\uACBD\uB85C\uC5D0 \uC4F8 \uC218 \uC5C6\uB294 \uAE00\uC790\uAC00 \uC788\uAC70\uB098 \uD3F4\uB354 \uBC16\uC744 \uAC00\uB9AC\uCF1C\uC694.",
  RESERVED_NAME: "\uD328\uD0A4\uC9D5\uC5D0 \uC4F0\uB294 \uC774\uB984\uC774\uC5D0\uC694. sbp-manifest.json\uACFC sbp/\uB294 \uAC8C\uC784 \uD30C\uC77C \uC774\uB984\uC73C\uB85C \uC4F8 \uC218 \uC5C6\uC5B4\uC694.",
  DUPLICATE_PATH: "\uAC19\uC740 \uACBD\uB85C\uC758 \uD56D\uBAA9\uC774 \uB450 \uAC1C \uC788\uC5B4\uC694.",
  TOO_MANY_FILES: "\uD30C\uC77C\uC774 \uB108\uBB34 \uB9CE\uC544\uC694. 2,000\uAC1C\uAE4C\uC9C0 \uC62C\uB9B4 \uC218 \uC788\uC5B4\uC694.",
  TOO_LARGE: "\uC804\uCCB4 \uD06C\uAE30\uAC00 \uB108\uBB34 \uCEE4\uC694. 500MB\uAE4C\uC9C0 \uC62C\uB9B4 \uC218 \uC788\uC5B4\uC694.",
  ENTRY_MISSING: "\uC2DC\uC791 \uD30C\uC77C\uC774 \uC5C6\uC5B4\uC694.",
  // ── 읽기 — manifest
  MANIFEST_INVALID: "manifest.json\uC758 \uD56D\uBAA9\uC774 \uD615\uC2DD\uC5D0 \uB9DE\uC9C0 \uC54A\uC544\uC694.",
  FORMAT_UNSUPPORTED: "\uC774 \uB3C4\uAD6C\uAC00 \uBAA8\uB974\uB294 \uD328\uD0A4\uC9C0 \uD615\uC2DD\uC774\uC5D0\uC694. \uB3C4\uAD6C\uB97C \uCD5C\uC2E0 \uBC84\uC804\uC73C\uB85C \uC5C5\uB370\uC774\uD2B8\uD574 \uC8FC\uC138\uC694.",
  MANIFEST_MISMATCH: "manifest\uC640 \uD56D\uBAA9\uC758 \uACBD\uB85C\uB098 \uD06C\uAE30\uAC00 \uB2EC\uB77C\uC694.",
  HASH_MISMATCH: "\uD30C\uC77C \uB0B4\uC6A9\uC774 manifest\uC758 SHA-256\uACFC \uB2EC\uB77C\uC694.",
  // ── 만들기
  FOLDER_MISSING: "\uBE4C\uB4DC \uD3F4\uB354\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.",
  CONFIG_INVALID: "superbox.config.json\uC758 \uD56D\uBAA9\uC774 \uD615\uC2DD\uC5D0 \uB9DE\uC9C0 \uC54A\uC544\uC694.",
  ALREADY_INJECTED: "\uC774\uBBF8 \uD328\uD0A4\uC9D5\uB41C \uC2DC\uC791 \uD30C\uC77C\uC774\uC5D0\uC694. \uC5D4\uC9C4\uC5D0\uC11C \uB2E4\uC2DC \uBE4C\uB4DC\uD55C \uD3F4\uB354\uB97C \uB123\uC5B4 \uC8FC\uC138\uC694.",
  ENTRY_NOT_UTF8: "\uC2DC\uC791 \uD30C\uC77C\uC740 UTF-8\uC774\uC5B4\uC57C \uD574\uC694.",
  TEMPLATE_UNRESOLVED: "\uCE58\uD658\uB418\uC9C0 \uC54A\uC740 \uBE4C\uB4DC \uD15C\uD50C\uB9BF\uC774\uC5D0\uC694. \uB2E4\uB978 \uD50C\uB7AB\uD3FC \uC804\uC6A9 \uD15C\uD50C\uB9BF \uB300\uC2E0 \uAE30\uBCF8 \uD15C\uD50C\uB9BF\uC774\uB098 \uC790\uCCB4 \uD15C\uD50C\uB9BF\uC73C\uB85C \uB2E4\uC2DC \uBE4C\uB4DC\uD574 \uC8FC\uC138\uC694.",
  LOADING_ASSET_MISSING: "\uB85C\uB529 \uD654\uBA74 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.",
  LOADING_ASSET_INVALID: "\uB85C\uB529 \uADF8\uB9BC\uC740 PNG, JPG, WebP, SVG\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.",
  ZONE_INVALID: "\uAC8C\uC784\uC874 \uC8FC\uC18C\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694. https://\uD638\uC2A4\uD2B8 \uD615\uC2DD\uC774\uC5B4\uC57C \uD558\uACE0, http\uB294 localhost\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.",
  ENGINE_INVALID: "\uC5D4\uC9C4 \uC774\uB984\uC740 unity, cocos, phaser, html5 \uC911 \uD558\uB098\uC5EC\uC57C \uD574\uC694.",
  FILE_CHANGED: "\uD328\uD0A4\uC9D5\uD558\uB294 \uC911\uC5D0 \uD30C\uC77C\uC774 \uBC14\uB00C\uC5C8\uC5B4\uC694. \uB2E4\uC2DC \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.",
  RUNTIME_MISSING: "\uD328\uD0A4\uC9C0\uC5D0 \uBD80\uD2B8 \uB7F0\uD0C0\uC784\uC774 \uC5C6\uC5B4\uC694. \uB3C4\uAD6C\uB97C \uB2E4\uC2DC \uBE4C\uB4DC\uD574 \uC8FC\uC138\uC694."
};
var PackageError = class extends Error {
  code;
  detail;
  constructor(code, detail) {
    super(detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
    this.name = "PackageError";
    this.code = code;
    this.detail = detail;
  }
};

// packages/package-core/src/limits.ts
var MAX_BUILD_FILES = 2e3;
var MAX_BUILD_BYTES = 500 * 1024 * 1024;
var MAX_PATH_LENGTH = 255;
var MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
var MANIFEST_ENTRY = "manifest.json";
var WEB_PREFIX = "web/";
var RESERVED_FILE = "sbp-manifest.json";
var PACKAGING_DIR = "sbp/";
var DEFAULT_ENTRY = "index.html";
var PRODUCTION_ZONE_ORIGIN = "https://game.superboxgo.com";
var FORMAT_VERSION = 1;
var INJECTION_MARK = "<!-- sbp:v1 -->";
var DEFAULT_BACKGROUND_COLOR = "#0B0F19";
var DEFAULT_PRIMARY_COLOR = "#1B64DA";
var VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;
var COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
var SAFE_PATH_CHARS = /^[A-Za-z0-9._\-/ ()@]+$/;
function isSafeBuildPath(path5) {
  if (!path5 || path5.length > MAX_PATH_LENGTH || !SAFE_PATH_CHARS.test(path5)) return false;
  if (path5.startsWith("/") || path5.endsWith("/")) return false;
  return path5.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
function isReservedBuildPath(path5) {
  return path5 === RESERVED_FILE || path5.startsWith(PACKAGING_DIR);
}
function isZoneOrigin(value) {
  if (typeof value !== "string" || value.length > 200) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value;
  } catch {
    return false;
  }
}
function isLocalZoneOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

// packages/package-core/src/manifest.ts
var ENGINE_NAMES = ["unity", "cocos", "phaser", "html5"];
var ORIENTATIONS = ["portrait", "landscape", "auto"];
var LOADING_MODES = ["default", "theme", "custom"];
var FILE_ENCODINGS = ["br", "gzip"];
var SHA256_PATTERN = /^[0-9a-f]{64}$/;
var ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
var ASCII_LINE = /^[\x20-\x7E]+$/;
var UNSAFE_TITLE_CHARS = new RegExp("[\\p{Cc}\\p{Zl}\\p{Zp}\\u202A-\\u202E\\u2066-\\u2069]", "u");
var MAX_TITLE_LENGTH = 100;
var MAX_LABEL_LENGTH = 64;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPackageLabel(value) {
  return typeof value === "string" && value.length <= MAX_LABEL_LENGTH && ASCII_LINE.test(value) && value.trim() !== "";
}
function isSafeTitle(value) {
  return typeof value === "string" && value.length <= MAX_TITLE_LENGTH && value.trim() !== "" && !UNSAFE_TITLE_CHARS.test(value);
}
function invalid(field) {
  return new PackageError("MANIFEST_INVALID", field);
}
function pickEnum(values, value, field) {
  if (typeof value !== "string" || !values.includes(value)) throw invalid(field);
  return value;
}
function pickLabel(value, field) {
  if (!isPackageLabel(value)) throw invalid(field);
  return value;
}
function pickNullableLabel(value, field) {
  return value === null || value === void 0 ? null : pickLabel(value, field);
}
function pickNullableTitle(value) {
  if (value === null || value === void 0) return null;
  if (!isSafeTitle(value)) throw invalid("title");
  return value;
}
function pickRecord(value, field) {
  if (!isRecord(value)) throw invalid(field);
  return value;
}
function pickCount(value, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalid(field);
  return value;
}
function pickFile(raw, index) {
  const field = `files[${index}]`;
  const value = pickRecord(raw, field);
  const path5 = value.path;
  if (typeof path5 !== "string" || !isSafeBuildPath(path5)) throw new PackageError("PATH_UNSAFE", `${field}.path`);
  if (path5 === RESERVED_FILE) throw new PackageError("RESERVED_NAME", path5);
  const sha256 = value.sha256;
  if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)) throw invalid(`${field}.sha256`);
  const encoding = value.encoding ?? null;
  return {
    path: path5,
    size: pickCount(value.size, `${field}.size`),
    sha256,
    encoding: encoding === null ? null : pickEnum(FILE_ENCODINGS, encoding, `${field}.encoding`)
  };
}
function pickFiles(raw) {
  if (!Array.isArray(raw)) throw invalid("files");
  if (raw.length > MAX_BUILD_FILES) throw new PackageError("TOO_MANY_FILES", String(raw.length));
  const files = raw.map(pickFile);
  const seen = /* @__PURE__ */ new Set();
  for (const file of files) {
    if (seen.has(file.path)) throw new PackageError("DUPLICATE_PATH", file.path);
    seen.add(file.path);
  }
  return files;
}
function pickColor(value, field) {
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) throw invalid(field);
  return value;
}
function parseManifest(raw) {
  const value = pickRecord(raw, "manifest");
  if (value.format !== FORMAT_VERSION) {
    if (typeof value.format === "number") throw new PackageError("FORMAT_UNSUPPORTED", String(value.format));
    throw invalid("format");
  }
  const version = value.version;
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) throw invalid("version");
  const entry = value.entry;
  if (typeof entry !== "string" || !isSafeBuildPath(entry)) throw new PackageError("PATH_UNSAFE", "entry");
  if (!isZoneOrigin(value.zoneOrigin)) throw invalid("zoneOrigin");
  const createdAt = value.createdAt;
  if (typeof createdAt !== "string" || !ISO_INSTANT.test(createdAt) || Number.isNaN(Date.parse(createdAt))) throw invalid("createdAt");
  const engine = pickRecord(value.engine, "engine");
  const tool = pickRecord(value.tool, "tool");
  const loading = pickRecord(value.loading, "loading");
  const totals = pickRecord(value.totals, "totals");
  const files = pickFiles(value.files);
  const manifest = {
    format: FORMAT_VERSION,
    version,
    entry,
    title: pickNullableTitle(value.title),
    orientation: pickEnum(ORIENTATIONS, value.orientation, "orientation"),
    engine: {
      name: pickEnum(ENGINE_NAMES, engine.name, "engine.name"),
      version: pickNullableLabel(engine.version, "engine.version")
    },
    tool: {
      name: pickLabel(tool.name, "tool.name"),
      version: pickLabel(tool.version, "tool.version")
    },
    zoneOrigin: value.zoneOrigin,
    loading: {
      mode: pickEnum(LOADING_MODES, loading.mode, "loading.mode"),
      backgroundColor: pickColor(loading.backgroundColor, "loading.backgroundColor"),
      primaryColor: pickColor(loading.primaryColor, "loading.primaryColor")
    },
    createdAt,
    totals: { count: pickCount(totals.count, "totals.count"), bytes: pickCount(totals.bytes, "totals.bytes") },
    files
  };
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError("TOO_LARGE", String(bytes));
  if (manifest.totals.count !== files.length || manifest.totals.bytes !== bytes) throw invalid("totals");
  if (!files.some((file) => file.path === entry)) throw new PackageError("ENTRY_MISSING", entry);
  return manifest;
}

// packages/package-core/src/zip-format.ts
var LOCAL_SIGNATURE = 67324752;
var CENTRAL_SIGNATURE = 33639248;
var EOCD_SIGNATURE = 101010256;
var ZIP64_LOCATOR_SIGNATURE = 117853008;
var LOCAL_HEADER_SIZE = 30;
var CENTRAL_HEADER_SIZE = 46;
var EOCD_SIZE = 22;
var ZIP64_LOCATOR_SIZE = 20;
var MAX_COMMENT_SIZE = 65535;
var FLAG_ENCRYPTED = 1 << 0;
var FLAG_DATA_DESCRIPTOR = 1 << 3;
var FLAG_UTF8 = 1 << 11;
var VERSION_STORED = 10;
var MADE_BY_UNIX = 3 << 8 | VERSION_STORED;
var REGULAR_FILE_MODE = 33188;
var UNIX_HOST = 3;
var MODE_TYPE_MASK = 61440;
var MODE_REGULAR = 32768;
var MODE_SYMLINK = 40960;
var ZIP64_EXTRA_ID = 1;
function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function encodeLocalHeader(entry) {
  const out = new Uint8Array(LOCAL_HEADER_SIZE + entry.name.length);
  const v = view(out);
  v.setUint32(0, LOCAL_SIGNATURE, true);
  v.setUint16(4, VERSION_STORED, true);
  v.setUint16(6, FLAG_UTF8, true);
  v.setUint16(8, 0, true);
  v.setUint16(10, entry.dosTime, true);
  v.setUint16(12, entry.dosDate, true);
  v.setUint32(14, entry.crc32, true);
  v.setUint32(18, entry.size, true);
  v.setUint32(22, entry.size, true);
  v.setUint16(26, entry.name.length, true);
  v.setUint16(28, 0, true);
  out.set(entry.name, LOCAL_HEADER_SIZE);
  return out;
}
function encodeCentralHeader(entry, localOffset) {
  const out = new Uint8Array(CENTRAL_HEADER_SIZE + entry.name.length);
  const v = view(out);
  v.setUint32(0, CENTRAL_SIGNATURE, true);
  v.setUint16(4, MADE_BY_UNIX, true);
  v.setUint16(6, VERSION_STORED, true);
  v.setUint16(8, FLAG_UTF8, true);
  v.setUint16(10, 0, true);
  v.setUint16(12, entry.dosTime, true);
  v.setUint16(14, entry.dosDate, true);
  v.setUint32(16, entry.crc32, true);
  v.setUint32(20, entry.size, true);
  v.setUint32(24, entry.size, true);
  v.setUint16(28, entry.name.length, true);
  v.setUint16(30, 0, true);
  v.setUint16(32, 0, true);
  v.setUint16(34, 0, true);
  v.setUint16(36, 0, true);
  v.setUint32(38, REGULAR_FILE_MODE << 16 >>> 0, true);
  v.setUint32(42, localOffset, true);
  out.set(entry.name, CENTRAL_HEADER_SIZE);
  return out;
}
function encodeEocd(entryCount, centralSize, centralOffset) {
  const out = new Uint8Array(EOCD_SIZE);
  const v = view(out);
  v.setUint32(0, EOCD_SIGNATURE, true);
  v.setUint16(4, 0, true);
  v.setUint16(6, 0, true);
  v.setUint16(8, entryCount, true);
  v.setUint16(10, entryCount, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, centralOffset, true);
  v.setUint16(20, 0, true);
  return out;
}
function toDosDateTime(date) {
  const year = Math.max(date.getUTCFullYear(), 1980);
  return {
    dosDate: year - 1980 << 9 | date.getUTCMonth() + 1 << 5 | date.getUTCDate(),
    dosTime: date.getUTCHours() << 11 | date.getUTCMinutes() << 5 | date.getUTCSeconds() >> 1
  };
}
function findEocd(tail, tailOffset) {
  const v = view(tail);
  for (let i = tail.length - EOCD_SIZE; i >= 0; i -= 1) {
    if (v.getUint32(i, true) !== EOCD_SIGNATURE) continue;
    const commentLength = v.getUint16(i + 20, true);
    if (i + EOCD_SIZE + commentLength !== tail.length) continue;
    return {
      offset: tailOffset + i,
      diskNumber: v.getUint16(i + 4, true),
      centralDisk: v.getUint16(i + 6, true),
      entriesOnDisk: v.getUint16(i + 8, true),
      entries: v.getUint16(i + 10, true),
      centralSize: v.getUint32(i + 12, true),
      centralOffset: v.getUint32(i + 16, true)
    };
  }
  return null;
}
function hasZip64Extra(bytes, start, length) {
  const v = view(bytes);
  let at = start;
  const end = start + length;
  while (at + 4 <= end) {
    const id = v.getUint16(at, true);
    const size = v.getUint16(at + 2, true);
    if (id === ZIP64_EXTRA_ID) return true;
    at += 4 + size;
  }
  return false;
}
function parseCentralDirectory(bytes, expected) {
  const v = view(bytes);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries = [];
  let at = 0;
  for (let n = 0; n < expected; n += 1) {
    if (at + CENTRAL_HEADER_SIZE > bytes.length || v.getUint32(at, true) !== CENTRAL_SIGNATURE) return null;
    const nameLength = v.getUint16(at + 28, true);
    const extraLength = v.getUint16(at + 30, true);
    const commentLength = v.getUint16(at + 32, true);
    const next = at + CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;
    if (next > bytes.length) return null;
    let name;
    try {
      name = decoder.decode(bytes.subarray(at + CENTRAL_HEADER_SIZE, at + CENTRAL_HEADER_SIZE + nameLength));
    } catch {
      return null;
    }
    entries.push({
      name,
      flags: v.getUint16(at + 8, true),
      method: v.getUint16(at + 10, true),
      crc32: v.getUint32(at + 16, true),
      compressedSize: v.getUint32(at + 20, true),
      size: v.getUint32(at + 24, true),
      madeByHost: v.getUint16(at + 4, true) >>> 8,
      unixMode: v.getUint32(at + 38, true) >>> 16,
      localOffset: v.getUint32(at + 42, true),
      hasZip64Extra: hasZip64Extra(bytes, at + CENTRAL_HEADER_SIZE + nameLength, extraLength),
      nameLength
    });
    at = next;
  }
  return at === bytes.length ? entries : null;
}
function parseLocalHeader(bytes) {
  if (bytes.length < LOCAL_HEADER_SIZE) return null;
  const v = view(bytes);
  if (v.getUint32(0, true) !== LOCAL_SIGNATURE) return null;
  return {
    flags: v.getUint16(6, true),
    method: v.getUint16(8, true),
    crc32: v.getUint32(14, true),
    compressedSize: v.getUint32(18, true),
    size: v.getUint32(22, true),
    nameLength: v.getUint16(26, true),
    extraLength: v.getUint16(28, true)
  };
}

// packages/package-core/src/reader.ts
var MAX_OVERHEAD_PER_ENTRY = LOCAL_HEADER_SIZE + CENTRAL_HEADER_SIZE + MAX_PATH_LENGTH * 2;
var MAX_CENTRAL_BYTES = (MAX_BUILD_FILES + 1) * (CENTRAL_HEADER_SIZE + MAX_PATH_LENGTH + 64);
var MAX_PACKAGE_BYTES = MAX_BUILD_BYTES + MAX_MANIFEST_BYTES + (MAX_BUILD_FILES + 1) * MAX_OVERHEAD_PER_ENTRY + EOCD_SIZE;
var HEADER_READ_CONCURRENCY = 32;
async function readBytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}
async function readCentralEntries(blob) {
  const size = blob.size;
  if (size < EOCD_SIZE) throw new PackageError("ZIP_INVALID");
  if (size > MAX_PACKAGE_BYTES) throw new PackageError("TOO_LARGE", String(size));
  const tailStart = Math.max(0, size - EOCD_SIZE - MAX_COMMENT_SIZE);
  const eocd = findEocd(await readBytes(blob, tailStart, size), tailStart);
  if (!eocd) throw new PackageError("ZIP_INVALID");
  if (eocd.entries === 65535 || eocd.centralSize === 4294967295 || eocd.centralOffset === 4294967295) {
    throw new PackageError("ZIP_UNSUPPORTED", "ZIP64");
  }
  if (eocd.diskNumber !== 0 || eocd.centralDisk !== 0 || eocd.entriesOnDisk !== eocd.entries) {
    throw new PackageError("ZIP_UNSUPPORTED", "split");
  }
  if (eocd.offset >= ZIP64_LOCATOR_SIZE) {
    const locator = await readBytes(blob, eocd.offset - ZIP64_LOCATOR_SIZE, eocd.offset);
    if (new DataView(locator.buffer).getUint32(0, true) === ZIP64_LOCATOR_SIGNATURE) throw new PackageError("ZIP_UNSUPPORTED", "ZIP64");
  }
  if (eocd.entries === 0) throw new PackageError("FIRST_NOT_MANIFEST");
  if (eocd.entries > MAX_BUILD_FILES + 1) throw new PackageError("TOO_MANY_FILES", String(eocd.entries - 1));
  if (eocd.centralSize > MAX_CENTRAL_BYTES || eocd.centralOffset + eocd.centralSize !== eocd.offset) throw new PackageError("ZIP_INVALID");
  const entries = parseCentralDirectory(await readBytes(blob, eocd.centralOffset, eocd.offset), eocd.entries);
  if (!entries) throw new PackageError("ZIP_INVALID");
  return { entries, centralOffset: eocd.centralOffset };
}
function assertEntryAllowed(entry, index) {
  if (entry.flags & FLAG_ENCRYPTED) throw new PackageError("ZIP_UNSUPPORTED", "encrypted");
  if (entry.flags & FLAG_DATA_DESCRIPTOR) throw new PackageError("ZIP_UNSUPPORTED", "data descriptor");
  if (entry.hasZip64Extra || entry.size === 4294967295 || entry.compressedSize === 4294967295 || entry.localOffset === 4294967295) {
    throw new PackageError("ZIP_UNSUPPORTED", "ZIP64");
  }
  if (entry.method !== 0 || entry.compressedSize !== entry.size) throw new PackageError("NOT_STORED", entry.name);
  if (entry.madeByHost === UNIX_HOST) {
    const type = entry.unixMode & MODE_TYPE_MASK;
    if (type === MODE_SYMLINK) throw new PackageError("SYMLINK", entry.name);
    if (type !== 0 && type !== MODE_REGULAR) throw new PackageError("PATH_UNSAFE", entry.name);
  }
  if (index === 0) {
    if (entry.name !== MANIFEST_ENTRY || entry.localOffset !== 0) throw new PackageError("FIRST_NOT_MANIFEST", entry.name);
    return;
  }
  if (!entry.name.startsWith(WEB_PREFIX)) throw new PackageError("OUTSIDE_WEB", entry.name);
  const path5 = entry.name.slice(WEB_PREFIX.length);
  if (!isSafeBuildPath(path5)) throw new PackageError("PATH_UNSAFE", entry.name);
  if (path5 === RESERVED_FILE) throw new PackageError("RESERVED_NAME", entry.name);
}
async function locateEntry(blob, entry, limit) {
  const headerEnd = entry.localOffset + LOCAL_HEADER_SIZE + entry.nameLength;
  if (headerEnd > limit) throw new PackageError("ENTRY_CORRUPT", entry.name);
  const bytes = await readBytes(blob, entry.localOffset, headerEnd);
  const header = parseLocalHeader(bytes);
  if (!header) throw new PackageError("ENTRY_CORRUPT", entry.name);
  if (header.flags & FLAG_ENCRYPTED) throw new PackageError("ZIP_UNSUPPORTED", "encrypted");
  if (header.flags & FLAG_DATA_DESCRIPTOR) throw new PackageError("ZIP_UNSUPPORTED", "data descriptor");
  if (header.method !== 0) throw new PackageError("NOT_STORED", entry.name);
  if (header.size !== entry.size || header.compressedSize !== entry.size || header.crc32 !== entry.crc32 || header.nameLength !== entry.nameLength) {
    throw new PackageError("ENTRY_CORRUPT", entry.name);
  }
  const name = new TextDecoder().decode(bytes.subarray(LOCAL_HEADER_SIZE));
  if (name !== entry.name) throw new PackageError("ENTRY_CORRUPT", entry.name);
  return { entry, offset: headerEnd + header.extraLength };
}
async function locateAll(blob, entries, limit) {
  const located = [];
  for (let i = 0; i < entries.length; i += HEADER_READ_CONCURRENCY) {
    const chunk = entries.slice(i, i + HEADER_READ_CONCURRENCY);
    located.push(...await Promise.all(chunk.map((entry) => locateEntry(blob, entry, limit))));
  }
  return located;
}
function assertNoOverlap(located, limit) {
  const ordered = [...located].sort((a, b) => a.entry.localOffset - b.entry.localOffset);
  let cursor = 0;
  for (const { entry, offset } of ordered) {
    if (entry.localOffset < cursor || offset + entry.size > limit) throw new PackageError("ENTRY_CORRUPT", entry.name);
    cursor = offset + entry.size;
  }
}
async function readManifest(blob, located) {
  if (located.entry.size > MAX_MANIFEST_BYTES) throw new PackageError("MANIFEST_INVALID", "size");
  const bytes = await readBytes(blob, located.offset, located.offset + located.entry.size);
  let raw;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PackageError("MANIFEST_INVALID", "JSON");
  }
  return parseManifest(raw);
}
function assertMatches(manifest, webEntries) {
  if (manifest.files.length !== webEntries.size) throw new PackageError("MANIFEST_MISMATCH", "count");
  for (const file of manifest.files) {
    const located = webEntries.get(file.path);
    if (!located) throw new PackageError("MANIFEST_MISMATCH", file.path);
    if (located.entry.size !== file.size) throw new PackageError("MANIFEST_MISMATCH", file.path);
  }
}
async function readPackage(blob) {
  const { entries, centralOffset } = await readCentralEntries(blob);
  entries.forEach(assertEntryAllowed);
  const seen = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new PackageError("DUPLICATE_PATH", entry.name);
    seen.add(entry.name);
  }
  const bytes = entries.slice(1).reduce((sum, entry) => sum + entry.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError("TOO_LARGE", String(bytes));
  if (entries.length - 1 > MAX_BUILD_FILES) throw new PackageError("TOO_MANY_FILES", String(entries.length - 1));
  const located = await locateAll(blob, entries, centralOffset);
  assertNoOverlap(located, centralOffset);
  const manifestEntry = located[0];
  const manifest = await readManifest(blob, manifestEntry);
  const webEntries = new Map(located.slice(1).map((item) => [item.entry.name.slice(WEB_PREFIX.length), item]));
  assertMatches(manifest, webEntries);
  const files = manifest.files.map((file) => {
    const { offset } = webEntries.get(file.path);
    return { ...file, offset, slice: () => blob.slice(offset, offset + file.size) };
  });
  return {
    manifest,
    files,
    manifestFile: {
      path: RESERVED_FILE,
      size: manifestEntry.entry.size,
      slice: () => blob.slice(manifestEntry.offset, manifestEntry.offset + manifestEntry.entry.size)
    }
  };
}

// engines/unity/packager/package-build.ts
import { stat } from "fs/promises";
import path4 from "path";

// packages/package-core/src/warnings.ts
var MESSAGES2 = {
  VERSION_DEFAULTED: "\uC124\uC815\uC5D0 version\uC774 \uC5C6\uC5B4\uC11C 1.0.0\uC73C\uB85C \uB123\uC5C8\uC5B4\uC694. \uCF58\uC194\uC5D0\uC11C \uC62C\uB9B4 \uB54C \uBC14\uAFC0 \uC218 \uC788\uC5B4\uC694.",
  TITLE_MISSING: "\uC124\uC815\uC5D0 title\uC774 \uC5C6\uC5B4\uC11C \uAC8C\uC784\uC874\uC774 \uC774\uB984\uC744 \uC54C\uB824 \uC904 \uB54C\uAE4C\uC9C0 \uB85C\uB529 \uD654\uBA74\uC758 \uC774\uB984\uC774 \uBE44\uC5B4 \uC788\uC5B4\uC694.",
  VIEWPORT_KEPT: "\uC2DC\uC791 \uD30C\uC77C\uC758 viewport\uB97C \uADF8\uB300\uB85C \uB480\uC5B4\uC694. \uD540\uCE58 \uC90C\uACFC \uB178\uCE58 \uC601\uC5ED\uC744 \uB9C9\uC73C\uB824\uBA74 viewport-fit=cover, user-scalable=no\uB97C \uB123\uC5B4 \uC8FC\uC138\uC694.",
  LOADING_HTML_DOCUMENT: "loading.html\uC740 \uC870\uAC01\uC774\uC5B4\uC57C \uD574\uC694. <html>, <head>, <body> \uD0DC\uADF8\uB97C \uBE7C \uC8FC\uC138\uC694.",
  SDK_TAG_DEFERRED: "Play SDK \uD0DC\uADF8\uC5D0 async\uB098 defer\uAC00 \uC788\uC5B4\uC694. \uAC8C\uC784 \uCF54\uB4DC\uAC00 SBPlay\uB97C \uBA3C\uC800 \uBD80\uB974\uBA74 \uC2E4\uD328\uD560 \uC218 \uC788\uC5B4\uC694.",
  SYMBOLS_INCLUDED: "Unity \uC2EC\uBCFC \uD30C\uC77C\uC774 \uB4E4\uC5B4 \uC788\uC5B4\uC694. \uC6B4\uC601\uC5D0\uB294 \uD544\uC694\uD558\uC9C0 \uC54A\uC73C\uB2C8 Debug Symbols\uB97C \uB044\uBA74 \uD328\uD0A4\uC9C0\uAC00 \uC791\uC544\uC838\uC694.",
  UNCOMPRESSED_LARGE: "\uC555\uCD95\uB418\uC9C0 \uC54A\uC740 \uD070 \uD30C\uC77C\uC774 \uC788\uC5B4\uC694. \uC5D4\uC9C4 \uBE4C\uB4DC \uC124\uC815\uC5D0\uC11C Brotli\uB098 Gzip\uC744 \uCF1C\uBA74 \uB85C\uB529\uC774 \uBE68\uB77C\uC838\uC694.",
  LOCAL_ZONE: "\uB85C\uCEEC \uAC8C\uC784\uC874 \uC8FC\uC18C\uB85C \uB9CC\uB4E4\uC5C8\uC5B4\uC694. \uC774 \uD328\uD0A4\uC9C0\uB294 \uC6B4\uC601\uC5D0 \uC62C\uB9B4 \uC218 \uC5C6\uC5B4\uC694.",
  DEBUG_CONSOLE_ON: "\uC9C4\uB2E8 \uCF58\uC194\uC774 \uCF1C\uC838 \uC788\uC5B4\uC694. \uC6B4\uC601\uC5D0 \uB0BC \uD328\uD0A4\uC9C0\uC5D0\uC11C\uB294 \uAEBC \uC8FC\uC138\uC694.",
  CONFIG_UNKNOWN_KEY: "\uC124\uC815 \uD30C\uC77C\uC5D0 \uBAA8\uB974\uB294 \uD56D\uBAA9\uC774 \uC788\uC5B4\uC11C \uBB34\uC2DC\uD588\uC5B4\uC694.",
  OTHER_PLATFORM_TEMPLATE: "\uB2E4\uB978 \uD50C\uB7AB\uD3FC \uC804\uC6A9 \uD15C\uD50C\uB9BF\uC774 \uC785\uD600\uC838 \uC788\uC5B4\uC694. \uB85C\uB529 \uD654\uBA74\uC774 \uB450 \uAC1C\uAC00 \uB418\uACE0 \uADF8 \uD50C\uB7AB\uD3FC\uC758 \uBE0C\uB9AC\uC9C0\uAC00 \uC5C6\uC5B4 \uBA48\uCD9C \uC218 \uC788\uC73C\uB2C8, \uAE30\uBCF8 \uD15C\uD50C\uB9BF\uC774\uB098 \uC790\uCCB4 \uD15C\uD50C\uB9BF\uC73C\uB85C \uB2E4\uC2DC \uBE4C\uB4DC\uD574 \uC8FC\uC138\uC694."
};
function warning(code, detail) {
  return { code, message: detail ? `${MESSAGES2[code]} (${detail})` : MESSAGES2[code] };
}

// packages/package-core/src/config.ts
var CONFIG_FILE = "superbox.config.json";
var MAX_TITLE_LENGTH2 = 100;
var MAX_TIPS = 10;
var MAX_TIP_LENGTH = 80;
var MAX_PATH_LENGTH2 = 255;
var MIN_PIXEL_RATIO = 0.5;
var MAX_PIXEL_RATIO = 4;
var TOP_KEYS = ["version", "title", "orientation", "engine", "loading", "runtime"];
var LOADING_KEYS = ["backgroundColor", "primaryColor", "image", "tips", "html"];
var RUNTIME_KEYS = ["earlyFetch", "maxDevicePixelRatio", "watchdog", "debugConsole"];
function invalid2(field) {
  return new PackageError("CONFIG_INVALID", field);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownKeys(value, known, prefix) {
  return Object.keys(value).filter((key) => !known.includes(key) && !key.startsWith("$")).map((key) => warning("CONFIG_UNKNOWN_KEY", `${prefix}${key}`));
}
function optionalString(value, field, maxLength) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw invalid2(field);
  return value;
}
function optionalBoolean(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "boolean") throw invalid2(field);
  return value;
}
function optionalEnum(values, value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !values.includes(value)) throw invalid2(field);
  return value;
}
function optionalColor(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) throw invalid2(field);
  return value;
}
function parseTips(value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length > MAX_TIPS) throw invalid2("loading.tips");
  return value.map((tip, index) => {
    if (typeof tip !== "string" || !tip.trim() || tip.length > MAX_TIP_LENGTH) throw invalid2(`loading.tips[${index}]`);
    return tip;
  });
}
function parsePixelRatio(value) {
  if (value === void 0 || value === "auto") return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_PIXEL_RATIO || value > MAX_PIXEL_RATIO) {
    throw invalid2("runtime.maxDevicePixelRatio");
  }
  return value;
}
function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0));
}
function parseConfig(raw) {
  if (!isRecord2(raw)) throw invalid2("(root)");
  const loading = raw.loading;
  const runtime = raw.runtime;
  if (loading !== void 0 && !isRecord2(loading)) throw invalid2("loading");
  if (runtime !== void 0 && !isRecord2(runtime)) throw invalid2("runtime");
  const version = optionalString(raw.version, "version", 32);
  if (version !== void 0 && !VERSION_PATTERN.test(version)) throw invalid2("version");
  const title = optionalString(raw.title, "title", MAX_TITLE_LENGTH2);
  if (title !== void 0 && !isSafeTitle(title)) throw invalid2("title");
  const config = withoutUndefined({
    version,
    title,
    orientation: optionalEnum(ORIENTATIONS, raw.orientation, "orientation"),
    engine: optionalEnum(ENGINE_NAMES, raw.engine, "engine"),
    loading: loading ? withoutUndefined({
      backgroundColor: optionalColor(loading.backgroundColor, "loading.backgroundColor"),
      primaryColor: optionalColor(loading.primaryColor, "loading.primaryColor"),
      image: optionalString(loading.image, "loading.image", MAX_PATH_LENGTH2),
      tips: parseTips(loading.tips),
      html: optionalString(loading.html, "loading.html", MAX_PATH_LENGTH2)
    }) : void 0,
    runtime: runtime ? withoutUndefined({
      earlyFetch: optionalBoolean(runtime.earlyFetch, "runtime.earlyFetch"),
      maxDevicePixelRatio: parsePixelRatio(runtime.maxDevicePixelRatio),
      watchdog: optionalBoolean(runtime.watchdog, "runtime.watchdog"),
      debugConsole: optionalBoolean(runtime.debugConsole, "runtime.debugConsole")
    }) : void 0
  });
  return {
    config,
    warnings: [
      ...unknownKeys(raw, TOP_KEYS, ""),
      ...loading ? unknownKeys(loading, LOADING_KEYS, "loading.") : [],
      ...runtime ? unknownKeys(runtime, RUNTIME_KEYS, "runtime.") : []
    ]
  };
}
function loadingModeOf(config) {
  var _a;
  const loading = config.loading;
  if (loading == null ? void 0 : loading.html) return "custom";
  if ((loading == null ? void 0 : loading.backgroundColor) || (loading == null ? void 0 : loading.primaryColor) || (loading == null ? void 0 : loading.image) || ((_a = loading == null ? void 0 : loading.tips) == null ? void 0 : _a.length)) return "theme";
  return "default";
}

// packages/package-core/src/crc32.ts
var TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
var CRC32_INITIAL = 4294967295;
function crc32Update(state, bytes) {
  let crc = state;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = TABLE[(crc ^ bytes[i]) & 255] ^ crc >>> 8;
  }
  return crc >>> 0;
}
function crc32Finish(state) {
  return (state ^ 4294967295) >>> 0;
}

// packages/package-core/src/early-fetch.ts
var UNITY_TARGET = /(^|\/)[^/]+\.(data|wasm)(\.(br|gz|unityweb))?$/;
var COCOS_TARGET = /^cocos-js\/assets\/[^/]+\.wasm$/;
var COCOS_MIN_BYTES = 100 * 1024;
function basename(path5) {
  return path5.split("/").pop() ?? path5;
}
function referencedAsIs(html, path5) {
  const name = basename(path5);
  return ['"', "'", "`"].some((quote) => html.includes(name + quote));
}
function earlyFetchList(engine, files, entryHtml) {
  if (engine === "unity") return files.filter((file) => UNITY_TARGET.test(file.path) && referencedAsIs(entryHtml, file.path)).map((file) => file.path);
  if (engine === "cocos") return files.filter((file) => COCOS_TARGET.test(file.path) && file.size >= COCOS_MIN_BYTES).map((file) => file.path);
  return [];
}

// packages/package-core/src/engine.ts
var UNITY_LOADER = /(^|\/)[^/]+\.loader\.js$/;
var UNITY_FRAMEWORK = /(^|\/)[^/]+\.framework\.js(\.(br|gz|unityweb))?$/;
var COCOS_ENGINE = /^cocos-js\/(cc|_virtual_cc)[-.\w]*\.js$/;
var COCOS_SETTINGS = /^src\/settings(\.[0-9a-f]+)?\.json$/;
var COCOS2_ENGINE = /^cocos2d-js(-min)?(\.[0-9a-f]+)?\.js$/;
var PHASER_FILE = /(^|\/)phaser([-.][\w.-]*)?\.js$/i;
var PHASER_VERSION = /VERSION:\s*["'](\d+\.\d+\.\d+[^"']*)["']\s*,\s*LOG_VERSION/;
var MAX_SCANNED_SCRIPTS = 6;
var MAX_SCRIPT_BYTES = 32 * 1024 * 1024;
var MAX_SETTINGS_BYTES = 256 * 1024;
function isUnityBuild(probe) {
  const hasLoader = probe.files.some((file) => UNITY_LOADER.test(file.path));
  if (!hasLoader) return false;
  return probe.entryHtml.includes("createUnityInstance") || probe.files.some((file) => UNITY_FRAMEWORK.test(file.path));
}
function isCocosBuild(probe) {
  return probe.files.some((file) => COCOS_ENGINE.test(file.path) || COCOS2_ENGINE.test(file.path));
}
async function cocosVersion(probe) {
  var _a;
  const settings = probe.files.find((file) => COCOS_SETTINGS.test(file.path));
  if (!settings) return null;
  const text = await probe.readText(settings.path, MAX_SETTINGS_BYTES);
  return text ? ((_a = /"CocosEngine"\s*:\s*"([^"]{1,64})"/.exec(text)) == null ? void 0 : _a[1]) ?? null : null;
}
async function phaserVersion(probe) {
  var _a;
  const scripts = probe.files.filter((file) => /\.m?js$/i.test(file.path) && file.size <= MAX_SCRIPT_BYTES).sort((a, b) => b.size - a.size).slice(0, MAX_SCANNED_SCRIPTS);
  const named = scripts.find((file) => PHASER_FILE.test(file.path));
  for (const script of named ? [named, ...scripts.filter((file) => file !== named)] : scripts) {
    const text = await probe.readText(script.path, MAX_SCRIPT_BYTES);
    if (!text) continue;
    const version = (_a = PHASER_VERSION.exec(text)) == null ? void 0 : _a[1];
    if (version) return { found: true, version: version.slice(0, 64) };
  }
  return { found: Boolean(named), version: null };
}
async function detectEngine(probe) {
  var _a;
  if (isUnityBuild(probe)) return { name: "unity", version: await ((_a = probe.readUnityVersion) == null ? void 0 : _a.call(probe)) ?? null };
  if (isCocosBuild(probe)) return { name: "cocos", version: await cocosVersion(probe) };
  const phaser = await phaserVersion(probe);
  if (phaser.found) return { name: "phaser", version: phaser.version };
  return { name: "html5", version: null };
}

// packages/package-core/src/html-scan.ts
var RAW_TEXT = /* @__PURE__ */ new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);
var INERT = /* @__PURE__ */ new Set(["template", "noscript"]);
var NAME_START = /[A-Za-z]/;
var SPACE = /[\s]/;
function skipSpace(html, from) {
  let at = from;
  while (at < html.length && SPACE.test(html[at])) at += 1;
  return at;
}
function readAttr(html, from) {
  let at = from;
  while (at < html.length && !SPACE.test(html[at]) && !"=>/".includes(html[at])) at += 1;
  if (at === from) at += 1;
  const name = html.slice(from, at).toLowerCase();
  let cursor = skipSpace(html, at);
  if (html[cursor] !== "=") return { attr: { name, value: "", valueStart: -1, valueEnd: -1 }, next: at };
  cursor = skipSpace(html, cursor + 1);
  const quote = html[cursor];
  if (quote === '"' || quote === "'") {
    const valueStart2 = cursor + 1;
    const close = html.indexOf(quote, valueStart2);
    const valueEnd = close === -1 ? html.length : close;
    return { attr: { name, value: html.slice(valueStart2, valueEnd), valueStart: valueStart2, valueEnd }, next: close === -1 ? html.length : close + 1 };
  }
  const valueStart = cursor;
  while (cursor < html.length && !SPACE.test(html[cursor]) && html[cursor] !== ">") cursor += 1;
  return { attr: { name, value: html.slice(valueStart, cursor), valueStart, valueEnd: cursor }, next: cursor };
}
function readTagBody(html, from) {
  const attrs = [];
  let at = from;
  while (at < html.length) {
    at = skipSpace(html, at);
    if (html[at] === ">") return { attrs, end: at + 1 };
    if (html[at] === "/") {
      at += 1;
      continue;
    }
    if (at >= html.length) break;
    const { attr, next } = readAttr(html, at);
    attrs.push(attr);
    at = next;
  }
  return { attrs, end: html.length };
}
function findRawClose(html, name, from) {
  var _a;
  const pattern = new RegExp(`</${name}(?=[\\s/>])`, "gi");
  pattern.lastIndex = from;
  return ((_a = pattern.exec(html)) == null ? void 0 : _a.index) ?? html.length;
}
function scanTags(html) {
  const tags = [];
  let inertDepth = 0;
  let at = 0;
  while (at < html.length) {
    const lt = html.indexOf("<", at);
    if (lt === -1) break;
    if (html.startsWith("<!--", lt)) {
      const close = html.indexOf("-->", lt + 4);
      at = close === -1 ? html.length : close + 3;
      continue;
    }
    const next = html[lt + 1];
    if (next === "!" || next === "?") {
      const close = html.indexOf(">", lt);
      at = close === -1 ? html.length : close + 1;
      continue;
    }
    const closing = next === "/";
    const nameStart = lt + (closing ? 2 : 1);
    if (!NAME_START.test(html[nameStart] ?? "")) {
      at = lt + 1;
      continue;
    }
    let nameEnd = nameStart;
    while (nameEnd < html.length && !SPACE.test(html[nameEnd]) && !"/>".includes(html[nameEnd])) nameEnd += 1;
    const name = html.slice(nameStart, nameEnd).toLowerCase();
    const { attrs, end } = readTagBody(html, nameEnd);
    if (closing && INERT.has(name)) inertDepth = Math.max(0, inertDepth - 1);
    tags.push({ name, closing, start: lt, end, attrs, inert: inertDepth > 0 });
    if (!closing && INERT.has(name)) inertDepth += 1;
    at = !closing && RAW_TEXT.has(name) ? findRawClose(html, name, end) : end;
  }
  return tags;
}
function attrValue(tag, name) {
  var _a;
  return ((_a = tag.attrs.find((attr) => attr.name === name)) == null ? void 0 : _a.value) ?? null;
}

// packages/package-core/src/inject.ts
var SDK_PATH = "/sdk/play/v1.js";
var DEBUG_CONSOLE_PATH = `${PACKAGING_DIR}debug-console.js`;
var DEFAULT_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no";
var HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var LINE_SEPARATOR = String.fromCharCode(8232);
var PARAGRAPH_SEPARATOR = String.fromCharCode(8233);
function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").split(LINE_SEPARATOR).join("\\u2028").split(PARAGRAPH_SEPARATOR).join("\\u2029");
}
function isInlineSafe(script) {
  return !/<\/script|<!--/i.test(script);
}
function hexToGlow(color) {
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${value >> 16 & 255},${value >> 8 & 255},${value & 255},.24)`;
}
function firstGrapheme(text) {
  return Array.from(text.trim())[0] ?? "";
}
function renderLoadingHtml(template, boot) {
  const vars = `--sbp-bg:${boot.backgroundColor};--sbp-primary:${boot.primaryColor};--sbp-glow:${hexToGlow(boot.primaryColor)}`;
  const icon = boot.iconUrl ? `<img src="${escapeHtml(boot.iconUrl)}" alt="">` : "";
  const letter = firstGrapheme(boot.title ?? "");
  const values = {
    "%%MODE%%": boot.mode,
    "%%VARS%%": vars,
    "%%LETTER%%": escapeHtml(letter),
    "%%ICON%%": icon,
    "%%ICONATTR%%": icon || letter ? "" : " hidden",
    "%%TITLE%%": escapeHtml(boot.title ?? ""),
    "%%TIP%%": escapeHtml(boot.tips[0] ?? "")
  };
  return template.replace(/%%[A-Z]+%%/g, (token) => values[token] ?? "");
}
function renderCustomLoading(customHtml, boot) {
  const style = `position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;background:${boot.backgroundColor};transition:opacity .3s`;
  return `<div id="sbp-loading" data-mode="custom" style="${style}">${customHtml}</div>`;
}
function renderBootScript(boot, bootJs) {
  return `<script>window.SBPlayBoot={config:${jsonForScript(boot)}};${bootJs}</script>`;
}
function assertUtf8(tags) {
  var _a;
  for (const tag of tags) {
    if (tag.name !== "meta" || tag.closing) continue;
    const charset = attrValue(tag, "charset") ?? ((_a = /charset=([^;\s]+)/i.exec(attrValue(tag, "content") ?? "")) == null ? void 0 : _a[1]);
    if (charset && !/^utf-?8$/i.test(charset)) throw new PackageError("ENTRY_NOT_UTF8", charset);
  }
}
function viewportEdit(tags) {
  const viewport = tags.find((tag) => {
    var _a;
    return tag.name === "meta" && !tag.closing && ((_a = attrValue(tag, "name")) == null ? void 0 : _a.toLowerCase()) === "viewport";
  });
  if (!viewport) return { meta: `<meta name="viewport" content="${DEFAULT_VIEWPORT}">`, warnings: [] };
  const content = (attrValue(viewport, "content") ?? "").toLowerCase().replace(/\s/g, "");
  const complete = content.includes("viewport-fit=cover") && content.includes("user-scalable=no");
  return { meta: "", warnings: complete ? [] : [warning("VIEWPORT_KEPT", content)] };
}
function headInsertAt(html, tags) {
  const firstScript = tags.find((tag) => tag.name === "script" && !tag.closing && !tag.inert);
  const head = tags.find((tag) => tag.name === "head" && !tag.closing);
  const limit = firstScript ? firstScript.start : html.length;
  if (head && head.end <= limit) return head.end;
  const root = tags.find((tag) => tag.name === "html" && !tag.closing);
  if (root && root.end <= limit) return root.end;
  const firstTag = tags[0];
  return firstTag ? Math.min(firstTag.start, limit) : 0;
}
var HEAD_ONLY = /* @__PURE__ */ new Set(["html", "head", "meta", "title", "link", "style", "script", "base", "noscript", "template"]);
function bodyInsertAt(html, tags) {
  const body = tags.find((tag) => tag.name === "body" && !tag.closing);
  if (body) return body.end;
  const headClose = tags.find((tag) => tag.name === "head" && tag.closing);
  if (headClose) return headClose.end;
  const firstBodyTag = tags.find((tag) => !tag.closing && !tag.inert && !HEAD_ONLY.has(tag.name));
  return firstBodyTag ? firstBodyTag.start : html.length;
}
function isSdkScript(tag) {
  if (tag.name !== "script" || tag.closing) return false;
  return /(^|\/)sdk\/play\/v1\.js([?#]|$)/.test(attrValue(tag, "src") ?? "");
}
function sdkEdit(html, tags, zoneOrigin) {
  const sdkUrl = `${zoneOrigin}${SDK_PATH}`;
  const existing = tags.find((tag2) => isSdkScript(tag2) && !tag2.inert);
  if (existing) {
    const src = existing.attrs.find((attr) => attr.name === "src");
    if (src && src.valueStart >= 0) {
      const late = existing.attrs.some((attr) => attr.name === "async" || attr.name === "defer");
      return {
        edit: { at: src.valueStart, remove: src.valueEnd - src.valueStart, text: escapeHtml(sdkUrl) },
        warnings: late ? [warning("SDK_TAG_DEFERRED")] : []
      };
    }
  }
  const tag = `<script src="${escapeHtml(sdkUrl)}"></script>`;
  const firstScript = tags.find((candidate) => candidate.name === "script" && !candidate.closing && !candidate.inert);
  if (firstScript) return { edit: { at: firstScript.start, remove: 0, text: tag }, warnings: [] };
  const bodyClose = tags.find((candidate) => candidate.name === "body" && candidate.closing);
  return { edit: { at: bodyClose ? bodyClose.start : html.length, remove: 0, text: tag }, warnings: [] };
}
function applyEdits(html, edits) {
  const ordered = edits.map((edit, index) => ({ edit, index })).sort((a, b) => a.edit.at - b.edit.at || a.index - b.index);
  let out = "";
  let cursor = 0;
  for (const { edit } of ordered) {
    out += html.slice(cursor, edit.at) + edit.text;
    cursor = edit.at + edit.remove;
  }
  return out + html.slice(cursor);
}
function injectEntry(input) {
  const { html, boot, runtime } = input;
  if (html.includes(INJECTION_MARK)) throw new PackageError("ALREADY_INJECTED");
  if (!isInlineSafe(runtime.bootJs)) throw new PackageError("RUNTIME_MISSING", "boot script is not inline safe");
  const tags = scanTags(html);
  assertUtf8(tags);
  const viewport = viewportEdit(tags);
  const sdk = sdkEdit(html, tags, boot.zoneOrigin);
  const debugTag = input.debugConsole ? `<script src="${DEBUG_CONSOLE_PATH}"></script>` : "";
  const head = `${INJECTION_MARK}<meta charset="utf-8">${viewport.meta}${renderBootScript(boot, runtime.bootJs)}${debugTag}`;
  const loading = input.customLoadingHtml === null ? renderLoadingHtml(runtime.loadingTemplate, boot) : renderCustomLoading(input.customLoadingHtml, boot);
  const body = `${loading}<script>try{SBPlayBoot.shell()}catch(e){}</script>`;
  return {
    html: applyEdits(html, [
      { at: headInsertAt(html, tags), remove: 0, text: head },
      { at: bodyInsertAt(html, tags), remove: 0, text: body },
      sdk.edit
    ]),
    warnings: [...viewport.warnings, ...sdk.warnings]
  };
}

// packages/package-core/src/sdk-policy.ts
var SDK_POLICY_URL = "https://raw.githubusercontent.com/SuperboxINC/superbox-play-sdk/main/sdk-policy.json";
var SCHEMA_VERSION = 1;
var VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
function isVersion(value) {
  return typeof value === "string" && VERSION.test(value);
}
function isText(value) {
  return typeof value === "string";
}
function isLower(version, than) {
  const parts = version.split(".").map(Number);
  const others = than.split(".").map(Number);
  for (let index = 0; index < parts.length; index += 1) {
    const difference = (parts[index] ?? 0) - (others[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return false;
}
function parseSdkPolicy(value) {
  if (typeof value !== "object" || value === null) return null;
  const { schemaVersion, minVersion, recommendedVersion, deniedVersions } = value;
  if (schemaVersion !== SCHEMA_VERSION || !isVersion(minVersion) || !isVersion(recommendedVersion)) return null;
  return { minVersion, recommendedVersion, deniedVersions: Array.isArray(deniedVersions) ? deniedVersions.filter(isText) : [] };
}
function evaluateSdkPolicy(policy, version) {
  const latestVersion = policy.recommendedVersion;
  if (policy.deniedVersions.includes(version)) return { kind: "blocked", latestVersion, message: `\uC774 \uB3C4\uAD6C \uBC84\uC804(${version})\uC740 \uBB38\uC81C\uAC00 \uC788\uC5B4 \uC4F8 \uC218 \uC5C6\uC5B4\uC694. \uCD5C\uC2E0 \uBC84\uC804\uC73C\uB85C \uC5C5\uB370\uC774\uD2B8\uD574 \uC8FC\uC138\uC694.` };
  if (!isVersion(version)) return { kind: "ok" };
  if (isLower(version, policy.minVersion)) return { kind: "blocked", latestVersion, message: `\uC774 \uB3C4\uAD6C \uBC84\uC804(${version})\uC740 \uC9C0\uC6D0\uC774 \uB05D\uB0AC\uC5B4\uC694. ${policy.minVersion} \uC774\uC0C1\uC73C\uB85C \uC5C5\uB370\uC774\uD2B8\uD574 \uC8FC\uC138\uC694.` };
  if (isLower(version, latestVersion)) return { kind: "update-recommended", latestVersion, message: `\uC0C8 \uBC84\uC804\uC774 \uB098\uC654\uC5B4\uC694. \uC5C5\uB370\uC774\uD2B8\uB97C \uAD8C\uD574\uC694. (\uC9C0\uAE08 ${version} \xB7 \uCD5C\uC2E0 ${latestVersion})` };
  return { kind: "ok" };
}

// packages/package-core/src/runtime-assets.generated.ts
var BOOT_JS = '"use strict";(()=>{function A(e){let{win:t,loading:o}=e,n=e.now(),i=!1,l=()=>{var r,g,s;return!!((s=(g=(r=t.cc)==null?void 0:r.director)==null?void 0:g.getScene)!=null&&s.call(g))},d=t.console,a=d.error;d.error=(...r)=>{let[g]=r;r.length===1&&g instanceof Error&&!l()&&o.fail(e.classify(g.message),g.message),a.apply(d,r)};let c=e.setInterval(()=>{if(o.isComplete()||!o.api.autoComplete){e.clearInterval(c);return}t.cc&&!i&&(i=!0,o.api.progress(.3));let r=e.now()-n>6e4;!l()&&!r||(e.clearInterval(c),(l()||!o.hasFailed())&&o.api.complete())},100)}var q=()=>{};function x(e,t){try{return typeof e=="string"?new URL(e,t).href:e instanceof URL?e.href:e.url}catch{return null}}function X(e,t){let o=typeof e=="object"&&"method"in e?e.method:"GET";return((t==null?void 0:t.method)??o).toUpperCase()}function Z(e){e.then(t=>{var o;return(o=t==null?void 0:t.body)==null?void 0:o.cancel()}).catch(()=>{})}function R(e,t,o){if(o||t.length===0||typeof e.fetch!="function")return q;let n=e.fetch,i=(c,r)=>n.call(e,c,r),l=new Map;for(let c of t){let r=x(c,e.location.href);r&&l.set(r,i(c).catch(()=>null))}let d=(c,r)=>{let g=x(c,e.location.href),s=g&&X(c,r)==="GET"?l.get(g):void 0;return!g||!s?i(c,r):(l.delete(g),l.size===0&&a(),s.then(m=>m&&m.ok&&!m.bodyUsed?m:i(c,r)))},a=()=>{e.fetch===d&&(e.fetch=n)};return e.fetch=d,()=>{a();for(let c of l.values())Z(c);l.clear()}}var Y=/webgl|glctx|gl context|context lost/i,Q=/^script error\\.?$|ResizeObserver loop/i,J=/\\/sdk\\/play\\/v1\\.js([?#]|$)/,ee=/dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|unable to (?:load|resolve) (?:specifier|bare)/i;function _(e,t){return o=>Y.test(o)||t()?"WEBGL_CONTEXT":e.engine==="html5"?"UNKNOWN":"ENGINE_INIT"}function T(e,t){try{return new URL(e,t.location.href).origin===t.location.origin}catch{return!1}}function M(e,t,o){let{win:n,loading:i}=e,l=d=>{let a=d.src;!a||J.test(a)||!T(a,n)||i.fail("SCRIPT_LOAD",a)};n.addEventListener("error",d=>{if(i.isComplete())return;let a=d.target;if(a instanceof HTMLScriptElement){l(a);return}if(a instanceof Element)return;let{message:c,filename:r}=d;!c||Q.test(c)||r&&!T(r,n)||i.fail(t(c),c)},!0),n.addEventListener("unhandledrejection",d=>{if(i.isComplete())return;let a=d.reason,c=a instanceof Error?`${a.name}: ${a.message}`:String(a);ee.test(c)&&i.fail("SCRIPT_LOAD",c)}),n.addEventListener("webglcontextcreationerror",o,!0)}var te=["mousedown","mouseup","click"];function w(e){Object.defineProperty(e,"preventDefault",{value:()=>{},configurable:!0})}function P(e,t,o){let n=!1,i=0,l=r=>{let g=r.target;n=!t.hasFocus()&&r.cancelable&&r.touches.length===1&&(g==null?void 0:g.tagName)==="CANVAS",n&&w(r)},d=r=>{n&&(n=!1,w(r),i=o()+800)},a=()=>{n=!1},c=r=>{!r.isTrusted||o()>=i||(r.type==="mousedown"&&r.preventDefault(),r.stopImmediatePropagation())};e.addEventListener("touchstart",l,!0),e.addEventListener("touchend",d,!0),e.addEventListener("touchcancel",a,!0);for(let r of te)e.addEventListener(r,c,!0)}function oe(e){return e instanceof Error?e.message:typeof e=="string"?e:String(e)}function k(e){let t=e.appInfo,o=0,n=!1,i=e.now(),l=-1/0,d=!1,a=!1,c=null,r=[],g=[],s=[],m=[],p=(u,f)=>{try{u(f)}catch(b){e.report(b)}},E=()=>{let u=l+100-e.now();u<=0?(l=e.now(),e.post({stage:"progress",progress:o})):d||(d=!0,e.later(()=>{d=!1,a||E()},u))},h=(u,f)=>{if(!(a||c)){c={code:u,message:f.slice(0,200)},e.view.showError(c,t),e.post({stage:"error",...c});for(let b of m)p(b,c)}};return{api:{get appInfo(){return t},autoComplete:!0,onReady(u){r.push(u),p(u,t)},onProgress(u){g.push(u),n&&p(u,o)},onComplete(u){a?p(u,void 0):s.push(u)},onError(u){m.push(u),c&&p(u,c)},progress(u){if(a||typeof u!="number"||!Number.isFinite(u))return;let f=Math.min(1,Math.max(0,u)),b=!n;if(n=!0,!(f<=o&&!b)){f>o&&(i=e.now()),o=Math.max(o,f),e.view.setProgress(o),E();for(let j of g)p(j,o)}},complete(){if(!a){a=!0,o=1,n=!0,e.view.setProgress(1),e.post({stage:"ready",elapsedMs:Math.round(e.now())}),e.view.hide(),c&&e.view.hideError();for(let u of g)p(u,1);for(let u of s.splice(0))p(u,void 0)}},error(u){let f=oe(u);h(e.classify(f),f)},hide(){e.view.hide()}},fail:h,setAppInfo(u){t={...t,...u},e.view.setAppInfo(t);for(let f of r)p(f,t)},isComplete:()=>a,hasFailed:()=>c!==null,hasProgress:()=>n,lastProgress:()=>o,lastMoveAt:()=>i}}var ne=/Mali-[34]|Mali-T[0-7]|Adreno (?:\\(TM\\) )?[2-4]\\d\\d|PowerVR SGX|PowerVR Rogue G|Intel\\(R\\) HD Graphics [2-5]/i;function O(e,t){let o=t.devicePixelRatio||1;return e!=="auto"?Math.min(e,o):t.mobile?ne.test(t.renderer)||t.memoryGb!==void 0&&t.memoryGb<=2||t.cores!==void 0&&t.cores<=2?1:(t.ios?(t.cores??0)>=6:(t.memoryGb??0)>=6)?o:Math.min(o,2):null}var U="sbp.reload";function B(e){try{let t=e(),o=Number.parseInt(t.getItem(U)??"0",10),n=Number.isFinite(o)?o:2;return n>=2?!1:(t.setItem(U,String(n+1)),!0)}catch{return!1}}function re(e,t){if(t===null)return e;let o=e==null?void 0:e.devicePixelRatio;return{...e,devicePixelRatio:typeof o=="number"?Math.min(o,t):t}}function ie(e,t){let{loading:o}=t;return function(i,l,d){o.api.autoComplete=!1,o.api.progress(0);let a=null;try{a=t.pixelRatio()}catch{a=null}let c=r=>{o.api.progress(r),d==null||d(r)};return e.call(this,i,re(l,a),c).then(r=>(t.afterFrame(()=>o.api.complete()),r),r=>{let g=r instanceof Error?r.message:String(r);throw o.fail(t.classify(g),g),r})}}function F(e){let{win:t,doc:o,loading:n}=e,i=!1,l,d=()=>{o.removeEventListener("load",a,!0),e.clearInterval(l)},a=()=>{if(i)return;let r=t.createUnityInstance;typeof r=="function"&&(i=!0,t.createUnityInstance=ie(r,e),d())},c=e.now();o.addEventListener("load",a,!0),l=e.setInterval(()=>{a(),!i&&(n.isComplete()||e.now()-c>3e4)&&d()},50)}var G=\'-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif\',ae="\\uAC8C\\uC784\\uC744 \\uBD88\\uB7EC\\uC624\\uC9C0 \\uBABB\\uD588\\uC5B4\\uC694",se="\\uB2E4\\uC2DC \\uC2DC\\uB3C4",le="\\uB124\\uD2B8\\uC6CC\\uD06C \\uC0C1\\uD0DC\\uB97C \\uD655\\uC778\\uD558\\uACE0 \\uB2E4\\uC2DC \\uC2DC\\uB3C4\\uD574 \\uC8FC\\uC138\\uC694.",ce="\\uB2E4\\uB978 \\uC571\\uC744 \\uB2EB\\uACE0 \\uB2E4\\uC2DC \\uC2DC\\uB3C4\\uD574 \\uC8FC\\uC138\\uC694.";function de(e){let t=Number.parseInt(e.slice(1),16);return`rgba(${t>>16&255},${t>>8&255},${t&255},.24)`}function W(e){return Array.from((e??"").trim())[0]??""}function N(e,t,o){let n=null,i,l=null,d=-1,a=s=>(n==null?void 0:n.querySelector(s))??null,c=s=>{let m=()=>s.remove();s.addEventListener("error",m),s.complete&&s.naturalWidth===0&&s.getAttribute("src")&&m()},r=()=>{let s=a(".sbp-tip");if(!s||t.tips.length<2)return;let m=0;i=setInterval(()=>{m=(m+1)%t.tips.length,s.style.opacity="0",setTimeout(()=>{s.textContent=t.tips[m]??"",s.style.opacity=""},200)},4e3)},g=s=>{let m=a(".sbp-bar");if(!m)return;m.setAttribute("data-on",""),m.setAttribute("aria-valuenow",String(Math.round(s*100)));let p=m.firstElementChild;p&&(p.style.transform=`scaleX(${s})`)};return{attach(){if(n=e.getElementById("sbp-loading"),!n)return;let s=a(".sbp-icon img");s&&c(s),r(),d>=0&&g(d)},setProgress(s){d=s,g(s)},setAppInfo(s){var h;if(!n||n.getAttribute("data-mode")==="custom")return;n.style.setProperty("--sbp-bg",s.backgroundColor),n.style.setProperty("--sbp-primary",s.primaryColor),n.style.setProperty("--sbp-glow",de(s.primaryColor));let m=a(".sbp-name");m&&(m.textContent=s.title??"");let p=a(".sbp-icon span");p&&(p.textContent=W(s.title));let E=a(".sbp-icon");if(E&&(E.hidden=!s.iconUrl&&!W(s.title),s.iconUrl&&!t.iconUrl)){(h=a(".sbp-icon img"))==null||h.remove();let y=e.createElement("img");y.alt="",y.src=s.iconUrl,E.appendChild(y),c(y)}},hide(){i!==void 0&&clearInterval(i);let s=n??e.getElementById("sbp-loading");s&&(n=null,s.style.opacity="0",s.style.pointerEvents="none",setTimeout(()=>s.remove(),360))},showError(s,m){if(l)return;let p=e.createElement("div");p.id="sbp-error",p.setAttribute("role","alert"),p.style.cssText=`position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:${m.backgroundColor};color:#f2f4f6;font:400 14px/1.5 ${G};text-align:center;word-break:keep-all`;let E=e.createElement("p");E.textContent=ae,E.style.cssText="margin:0;font-size:17px;font-weight:600;line-height:26px";let h=e.createElement("p");h.textContent=s.code==="WEBGL_CONTEXT"?ce:le,h.style.cssText="margin:6px 0 0;color:rgba(255,255,255,.62);font-size:13px";let y=e.createElement("button");y.type="button",y.textContent=se,y.style.cssText=`margin-top:22px;min-width:132px;min-height:44px;padding:0 24px;border:0;border-radius:12px;background:${m.primaryColor};color:#fff;font:600 15px/1 ${G};cursor:pointer`,y.addEventListener("click",o),p.append(E,h,y),(e.body??e.documentElement).appendChild(p),l=p},hideError(){l==null||l.remove(),l=null}}}function D(e){let t=e.now(),o=e.resourceCount(),n=e.setInterval(()=>{let{loading:i}=e;if(i.isComplete()||i.hasFailed()){e.clearInterval(n);return}let l=e.resourceCount();(l!==o||e.isHidden())&&(o=l,t=e.now()),!(!i.hasProgress()||i.lastProgress()>=.9)&&(e.now()-Math.max(t,i.lastMoveAt())<6e4||(e.clearInterval(n),e.reload()||i.fail("WATCHDOG","loading stalled")))},1e4)}var ue=["www","api","cdn","console","games","static","admin","assets","play","sdk","test","developers","docs","mail","play-api","console-api","admin-api"],fe=/^[a-z0-9-]+$/,pe=/^[\\d.]+$/;function I(e,t){let o,n;try{o=new URL(e),n=new URL(t)}catch{return!1}if(o.origin!==e||o.protocol!==n.protocol||o.port!==n.port)return!1;let i=o.hostname,l=n.hostname;if(i===l)return!0;let d=l.split("."),a=l==="localhost"?l:d.length>2&&!pe.test(l)?d.slice(1).join("."):"";if(!a||!i.endsWith(`.${a}`))return!1;let c=i.slice(0,-a.length-1);return fe.test(c)&&!ue.includes(c)}function H(e,t){if(!e)return"*";let o=e[0];return o!==void 0&&I(o,t)?o:null}function V(e,t){return t!=="*"||!("message"in e)?e:Object.fromEntries(Object.entries(e).filter(([o])=>o!=="message"))}var ge=120,$=/^#[0-9A-Fa-f]{6}$/,me=/iPhone|iPad|iPod/i,K=/Android/i;function L(e){try{e()}catch{}}function v(e,t){let o=!1,n=()=>{o||(o=!0,t())};L(()=>e.requestAnimationFrame(()=>e.requestAnimationFrame(n))),e.setTimeout(n,ge)}function z(e,t){try{return e.performance.getEntriesByType(t)}catch{return[]}}function ye(e){var t;return((t=z(e,"navigation")[0])==null?void 0:t.type)==="reload"}function Ee(e){var t;try{let o=e.createElement("canvas").getContext("webgl");if(!o)return"";let n=o.getExtension("WEBGL_debug_renderer_info"),i=n?String(o.getParameter(n.UNMASKED_RENDERER_WEBGL)):"";return(t=o.getExtension("WEBGL_lose_context"))==null||t.loseContext(),i}catch{return""}}function Le(e,t){let o=e.navigator.userAgent,n=me.test(o),i=n||K.test(o),l=e.navigator;return O(t.maxDevicePixelRatio,{devicePixelRatio:e.devicePixelRatio,mobile:i,ios:n,memoryGb:l.deviceMemory,cores:l.hardwareConcurrency,renderer:i&&t.maxDevicePixelRatio==="auto"?Ee(e.document):""})}function he(e){if(typeof e!="object"||e===null)return null;let t=e;if(t.type!=="sbx.appInfo"||t.v!==1)return null;let o={};return typeof t.title=="string"&&t.title.length<=100&&(o.title=t.title),typeof t.iconUrl=="string"&&/^https?:\\/\\//.test(t.iconUrl)&&(o.iconUrl=t.iconUrl),typeof t.primaryColor=="string"&&$.test(t.primaryColor)&&(o.primaryColor=t.primaryColor),typeof t.backgroundColor=="string"&&$.test(t.backgroundColor)&&(o.backgroundColor=t.backgroundColor),o}function be(e,t,o){e.addEventListener("message",n=>{if(n.source!==e.parent||!I(n.origin,t.zoneOrigin))return;let i=he(n.data);i&&o.setAppInfo(i)})}function Ce(e,t){let{config:o}=t,n=e.document,i=e.parent!==e?H(e.location.ancestorOrigins,o.zoneOrigin):null,l=()=>e.performance.now(),d=!1,a=f=>{i!==null&&L(()=>e.parent.postMessage({type:"sbx.loading",v:1,...V(f,i)},i))},c=!1,r=[],g=f=>{c?a(f):r.push(f)},s=_(o,()=>d),m=N(n,o,()=>e.location.reload()),p=k({appInfo:{title:o.title,iconUrl:o.iconUrl,primaryColor:o.primaryColor,backgroundColor:o.backgroundColor},view:m,post:g,now:l,later:(f,b)=>e.setTimeout(f,b),report:f=>L(()=>console.error(f)),classify:s});e.SBPlayLoading=p.api;let E=!1,h=()=>{E||(E=!0,L(()=>m.attach()),v(e,()=>{a({stage:"shell"}),c=!0;for(let f of r.splice(0))a(f)}))};t.shell=h,n.addEventListener("DOMContentLoaded",h);let y;Object.defineProperty(t,"pixelRatio",{configurable:!0,get(){return y??(y=Le(e,o)),y}}),L(()=>M({win:e,config:o,loading:p},s,()=>{d=!0})),L(()=>{let f=R(e,o.earlyFetch,ye(e));p.api.onComplete(f)}),L(()=>{let f=e.navigator.audioSession;f&&(f.type="ambient")}),L(()=>{K.test(e.navigator.userAgent)&&P(e,n,l)}),i!==null&&L(()=>be(e,o,p));let u={setInterval:(f,b)=>e.setInterval(f,b),clearInterval:f=>e.clearInterval(f)};o.watchdog&&L(()=>D({loading:p,now:l,isHidden:()=>n.hidden,resourceCount:()=>z(e,"resource").length,reload:()=>B(()=>e.sessionStorage)?(e.location.reload(),!0):!1,...u})),o.engine==="unity"&&L(()=>F({win:e,doc:n,loading:p,now:l,classify:s,pixelRatio:()=>t.pixelRatio??null,afterFrame:f=>v(e,f),...u})),o.engine==="cocos"&&L(()=>A({win:e,loading:p,now:l,classify:s,...u})),e.addEventListener("load",()=>{o.engine!=="cocos"&&v(e,()=>{p.api.autoComplete&&!p.hasFailed()&&p.api.complete()})})}var S=window,C=S.SBPlayBoot;C!=null&&C.config&&!S.SBPlayLoading&&L(()=>Ce(S,C));})();';
var LOADING_TEMPLATE = '<div id="sbp-loading" data-mode="%%MODE%%" style="%%VARS%%"><style>#sbp-loading{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(72vmax 46vmax at 50% 38%,var(--sbp-glow),transparent 70%),var(--sbp-bg);color:#f2f4f6;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,Apple SD Gothic Neo,Noto Sans KR,Segoe UI,sans-serif;text-align:center;-webkit-user-select:none;user-select:none;transition:opacity .3s cubic-bezier(.16,1,.3,1)}#sbp-loading *{box-sizing:border-box;margin:0;padding:0}#sbp-loading .sbp-col{display:flex;flex-direction:column;align-items:center;margin-top:-5vh;animation:sbp-in .5s cubic-bezier(.16,1,.3,1) both}#sbp-loading .sbp-icon{position:relative;display:flex;align-items:center;justify-content:center;width:72px;height:72px;overflow:hidden;border-radius:18px;background:linear-gradient(150deg,var(--sbp-primary),var(--sbp-bg) 150%);box-shadow:0 12px 32px #00000073,inset 0 0 0 1px #ffffff1a;font-size:30px;font-weight:700}#sbp-loading .sbp-icon[hidden]{display:none}#sbp-loading .sbp-icon img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}#sbp-loading .sbp-name{min-height:26px;max-width:76vw;margin-top:18px;overflow:hidden;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:26px;text-overflow:ellipsis;white-space:nowrap}#sbp-loading .sbp-bar{position:relative;width:min(200px,52vw);height:3px;margin-top:18px;overflow:hidden;border-radius:2px;background:#ffffff1f}#sbp-loading .sbp-bar i{position:absolute;top:0;left:0;width:100%;height:100%;border-radius:2px;background:var(--sbp-primary);box-shadow:0 0 12px var(--sbp-primary);transform:scaleX(0);transform-origin:left center;transition:transform .2s linear}#sbp-loading .sbp-bar:not([data-on]) i{width:34%;transform:translate(-100%);animation:sbp-idle 1.5s ease-in-out infinite}#sbp-loading .sbp-tip{position:absolute;right:24px;bottom:calc(env(safe-area-inset-bottom,0px) + 44px);left:24px;color:#fff9;word-break:keep-all;transition:opacity .2s}@keyframes sbp-idle{to{transform:translate(300%)}}@keyframes sbp-in{0%{opacity:0;transform:translateY(8px)}}@media(prefers-reduced-motion:reduce){#sbp-loading,#sbp-loading *{animation:none!important;transition:none!important}#sbp-loading .sbp-bar:not([data-on]) i{width:100%;opacity:.35;transform:none}}</style><div class="sbp-col"><div class="sbp-icon"%%ICONATTR%%><span>%%LETTER%%</span>%%ICON%%</div><p class="sbp-name">%%TITLE%%</p><div class="sbp-bar" role="progressbar" aria-label="\uAC8C\uC784 \uBD88\uB7EC\uC624\uB294 \uC911" aria-valuemin="0" aria-valuemax="100"><i></i></div></div><p class="sbp-tip">%%TIP%%</p></div>';
var DEBUG_CONSOLE_JS = '"use strict";(()=>{var c=["log","info","warn","error"],s="font:12px/1.4 ui-monospace,Menlo,Consolas,monospace",t=[],r=null;function a(n){if(n instanceof Error)return n.stack??n.message;if(typeof n=="string")return n;try{return JSON.stringify(n)}catch{return String(n)}}function i(n,e){t.push(`[${n}] ${e.map(a).join(" ")}`),t.length>300&&t.shift(),r&&r.style.display!=="none"&&(r.textContent=t.join(`\n`))}for(let n of c){let e=console[n].bind(console);console[n]=(...o)=>{i(n,o),e(...o)}}window.addEventListener("error",n=>{let e=n.target;i("error",[n.message||`load failed: ${(e==null?void 0:e.src)??(e==null?void 0:e.href)??""}`])},!0);window.addEventListener("unhandledrejection",n=>i("rejection",[n.reason]));function d(){let n=document.createElement("button");n.type="button",n.textContent="log",n.style.cssText=`position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:6px 10px;border:0;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;${s}`;let e=document.createElement("pre");e.style.cssText=`display:none;position:fixed;left:8px;right:8px;bottom:44px;top:40%;z-index:2147483647;margin:0;padding:10px;overflow:auto;border-radius:10px;background:rgba(0,0,0,.88);color:#e8eaed;white-space:pre-wrap;word-break:break-all;${s}`,n.addEventListener("click",()=>{let o=e.style.display==="none";e.style.display=o?"block":"none",o&&(e.textContent=t.join(`\n`))}),r=e,document.documentElement.append(e,n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",d):d();})();';

// packages/package-core/src/node/create-package.ts
import { mkdir, readFile as readFile3, rename, rm } from "fs/promises";
import path3 from "path";

// packages/package-core/src/node/file-blob.ts
import { open } from "fs/promises";
async function readRange(handle, start, end) {
  const buffer = new Uint8Array(Math.max(0, end - start));
  let read = 0;
  while (read < buffer.length) {
    const { bytesRead } = await handle.read(buffer, read, buffer.length - read, start + read);
    if (bytesRead === 0) break;
    read += bytesRead;
  }
  return buffer.buffer.slice(0, read);
}
async function openFileBlob(path5) {
  const handle = await open(path5, "r");
  const { size } = await handle.stat();
  return {
    size,
    slice: (start, end) => ({ start, end, arrayBuffer: () => readRange(handle, start, Math.min(end, size)) }),
    close: () => handle.close()
  };
}

// packages/package-core/src/node/hash-file.ts
import { createHash } from "crypto";
import { createReadStream } from "fs";
function digestBytes(bytes) {
  return {
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    crc32: crc32Finish(crc32Update(CRC32_INITIAL, bytes)),
    head: bytes.subarray(0, ENCODING_HEAD_BYTES)
  };
}
async function digestFile(path5) {
  const hash = createHash("sha256");
  let crc = CRC32_INITIAL;
  let size = 0;
  let head = new Uint8Array(0);
  for await (const chunk of createReadStream(path5)) {
    const bytes = chunk;
    hash.update(bytes);
    crc = crc32Update(crc, bytes);
    if (head.length < ENCODING_HEAD_BYTES) {
      const next = new Uint8Array(Math.min(ENCODING_HEAD_BYTES, head.length + bytes.length));
      next.set(head);
      next.set(bytes.subarray(0, next.length - head.length), head.length);
      head = next;
    }
    size += bytes.length;
  }
  return { size, sha256: hash.digest("hex"), crc32: crc32Finish(crc), head };
}

// packages/package-core/src/node/prepare.ts
import { open as open3, readFile as readFile2 } from "fs/promises";
import path2 from "path";

// packages/package-core/src/node/unity-version.ts
import { open as open2, readFile } from "fs/promises";
import { brotliDecompress, constants, gunzip } from "zlib";
var DATA_FILE = /(^|\/)[^/]+\.data(\.(br|gz|unityweb))?$/;
var VERSION2 = /\b(?:20\d\d|[6-9]\d{3})\.\d+\.\d+[abfp]\d+\b/;
var HEAD_BYTES = 256 * 1024;
function decompressHead(bytes, encoding) {
  return new Promise((resolve) => {
    const options = { finishFlush: encoding === "br" ? constants.BROTLI_OPERATION_FLUSH : constants.Z_SYNC_FLUSH };
    const done = (error, out) => resolve(error ? Buffer.alloc(0) : out);
    if (encoding === "br") brotliDecompress(bytes, options, done);
    else gunzip(bytes, options, done);
  });
}
async function readHead(path5) {
  const handle = await open2(path5, "r");
  try {
    const buffer = new Uint8Array(HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
async function versionFromBuildInfo(files) {
  const info = files.find((file) => file.path === ".ait-build-info.json");
  if (!info) return null;
  try {
    const parsed = JSON.parse(await readFile(info.absolute, "utf8"));
    const version = parsed.unityVersion;
    return typeof version === "string" && VERSION2.test(version) ? version : null;
  } catch {
    return null;
  }
}
async function readUnityVersion(files) {
  var _a;
  const fromInfo = await versionFromBuildInfo(files);
  if (fromInfo) return fromInfo;
  const data = files.find((file) => DATA_FILE.test(file.path));
  if (!data) return null;
  try {
    const head = await readHead(data.absolute);
    const encoding = detectEncoding(data.path, head.subarray(0, ENCODING_HEAD_BYTES));
    const text = encoding ? await decompressHead(head, encoding) : Buffer.from(head);
    return ((_a = VERSION2.exec(text.toString("latin1"))) == null ? void 0 : _a[0]) ?? null;
  } catch {
    return null;
  }
}

// packages/package-core/src/node/walk.ts
import { lstat, readdir } from "fs/promises";
import path from "path";
var IGNORED_NAMES = /* @__PURE__ */ new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
var IGNORED_FOLDERS = /* @__PURE__ */ new Set([".git", "__MACOSX"]);
function isSkipped(name, keepMaps) {
  if (IGNORED_NAMES.has(name)) return true;
  if (name.endsWith(".meta")) return true;
  return !keepMaps && name.endsWith(".map");
}
async function walkBuildFolder(folder, options = {}) {
  const root = path.resolve(folder);
  const stat2 = await lstat(root).catch(() => null);
  if (!(stat2 == null ? void 0 : stat2.isDirectory())) throw new PackageError("FOLDER_MISSING", folder);
  const ignore = new Set((options.ignore ?? []).map((item) => path.resolve(item)));
  const files = [];
  const visit = async (dir, prefix) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relative = `${prefix}${entry.name}`;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new PackageError("SYMLINK", relative);
      if (entry.isDirectory()) {
        if (!IGNORED_FOLDERS.has(entry.name)) await visit(absolute, `${relative}/`);
        continue;
      }
      if (!entry.isFile() || isSkipped(entry.name, options.keepMaps ?? false)) continue;
      if (relative === CONFIG_FILE || ignore.has(absolute)) continue;
      files.push({ path: relative, absolute, size: (await lstat(absolute)).size });
    }
  };
  await visit(root, "");
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

// packages/package-core/src/node/prepare.ts
var DEFAULT_VERSION = "1.0.0";
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
var UNRESOLVED_TEMPLATE = /%(?:UNITY|AIT)_[A-Z_]+%/;
var OTHER_PLATFORM_TEMPLATE = /window\.AITLoading\b|window\.AppsInToss\b|__AIT_/;
var LOADING_DOCUMENT_TAGS = /<(?:html|head|body)[\s>]/i;
function assertZoneOrigin(zoneOrigin) {
  if (!isZoneOrigin(zoneOrigin) || zoneOrigin.startsWith("http:") && !isLocalZoneOrigin(zoneOrigin)) {
    throw new PackageError("ZONE_INVALID", zoneOrigin);
  }
}
function assertFileRules(files) {
  const unsafe = files.filter((file) => !isSafeBuildPath(file.path));
  if (unsafe.length) throw new PackageError("PATH_UNSAFE", unsafe.slice(0, 5).map((file) => file.path).join(", "));
  const reserved = files.find((file) => isReservedBuildPath(file.path));
  if (reserved) throw new PackageError("RESERVED_NAME", reserved.path);
  if (files.length > MAX_BUILD_FILES) throw new PackageError("TOO_MANY_FILES", String(files.length));
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError("TOO_LARGE", String(bytes));
}
async function readTextHead(file, maxBytes) {
  const handle = await open3(file.absolute, "r");
  try {
    const buffer = new Uint8Array(Math.min(maxBytes, file.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return Buffer.from(buffer.subarray(0, bytesRead)).toString("latin1");
  } finally {
    await handle.close();
  }
}
async function resolveEngine(files, html, options) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const guess = await detectEngine({
    files,
    entryHtml: html,
    readText: async (filePath, maxBytes) => {
      const file = byPath.get(filePath);
      return file ? readTextHead(file, maxBytes) : null;
    },
    readUnityVersion: () => readUnityVersion(files)
  });
  const forced = options.engine ?? options.config.engine;
  if (forced && forced !== guess.name) return { name: forced, version: null };
  return isPackageLabel(guess.version) ? guess : { name: guess.name, version: null };
}
async function readLoadingAsset(configDir, relative) {
  const absolute = path2.resolve(configDir, relative);
  try {
    return await readFile2(absolute);
  } catch {
    throw new PackageError("LOADING_ASSET_MISSING", relative);
  }
}
async function collectLoadingAssets(options) {
  const loading = options.config.loading;
  const extras = [];
  const warnings = [];
  let iconUrl = null;
  let customHtml = null;
  if (loading == null ? void 0 : loading.image) {
    const extension = path2.extname(loading.image).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new PackageError("LOADING_ASSET_INVALID", loading.image);
    iconUrl = `${PACKAGING_DIR}loading-image${extension}`;
    extras.push({ path: iconUrl, source: { kind: "bytes", bytes: await readLoadingAsset(options.configDir, loading.image) } });
  }
  if (loading == null ? void 0 : loading.html) {
    const bytes = await readLoadingAsset(options.configDir, loading.html);
    customHtml = Buffer.from(bytes).toString("utf8");
    if (LOADING_DOCUMENT_TAGS.test(customHtml)) warnings.push(warning("LOADING_HTML_DOCUMENT"));
    extras.push({ path: `${PACKAGING_DIR}loading.html`, source: { kind: "bytes", bytes } });
  }
  return { iconUrl, customHtml, extras, warnings };
}
async function prepareBuild(options) {
  var _a, _b, _c, _d;
  if (!options.allowAnyZone) assertZoneOrigin(options.zoneOrigin);
  const walked = await walkBuildFolder(options.folder, {
    ...options.keepMaps === void 0 ? {} : { keepMaps: options.keepMaps },
    ...options.ignore === void 0 ? {} : { ignore: options.ignore }
  });
  const entryFile = walked.find((file) => file.path === DEFAULT_ENTRY);
  if (!entryFile) {
    assertFileRules(walked);
    throw new PackageError("ENTRY_MISSING", DEFAULT_ENTRY);
  }
  const html = await readFile2(entryFile.absolute, "utf8");
  if (UNRESOLVED_TEMPLATE.test(html)) throw new PackageError("TEMPLATE_UNRESOLVED", (_a = UNRESOLVED_TEMPLATE.exec(html)) == null ? void 0 : _a[0]);
  assertFileRules(walked);
  const engine = await resolveEngine(walked, html, options);
  const assets = await collectLoadingAssets(options);
  const { config } = options;
  const runtimeConfig = config.runtime ?? {};
  const debugConsole = runtimeConfig.debugConsole ?? false;
  const loading = {
    mode: loadingModeOf(config),
    backgroundColor: ((_b = config.loading) == null ? void 0 : _b.backgroundColor) ?? DEFAULT_BACKGROUND_COLOR,
    primaryColor: ((_c = config.loading) == null ? void 0 : _c.primaryColor) ?? DEFAULT_PRIMARY_COLOR
  };
  const boot = {
    zoneOrigin: options.zoneOrigin,
    engine: engine.name,
    mode: loading.mode,
    title: config.title ?? null,
    iconUrl: assets.iconUrl,
    primaryColor: loading.primaryColor,
    backgroundColor: loading.backgroundColor,
    tips: ((_d = config.loading) == null ? void 0 : _d.tips) ?? [],
    earlyFetch: runtimeConfig.earlyFetch === false ? [] : earlyFetchList(engine.name, walked, html),
    maxDevicePixelRatio: runtimeConfig.maxDevicePixelRatio ?? "auto",
    watchdog: runtimeConfig.watchdog ?? true
  };
  const injected = injectEntry({ html, boot, customLoadingHtml: assets.customHtml, debugConsole, runtime: options.runtime });
  const packagingFiles = debugConsole ? [...assets.extras, { path: DEBUG_CONSOLE_PATH, source: { kind: "bytes", bytes: new TextEncoder().encode(options.runtime.debugConsoleJs) } }] : assets.extras;
  const gameFiles = walked.map(
    (file) => file.path === DEFAULT_ENTRY ? { path: file.path, source: { kind: "bytes", bytes: new TextEncoder().encode(injected.html) } } : { path: file.path, source: { kind: "file", path: file.absolute } }
  );
  const warnings = [
    ...injected.warnings,
    ...assets.warnings,
    ...config.version ? [] : [warning("VERSION_DEFAULTED")],
    ...config.title ? [] : [warning("TITLE_MISSING")],
    ...isLocalZoneOrigin(options.zoneOrigin) ? [warning("LOCAL_ZONE")] : [],
    ...debugConsole ? [warning("DEBUG_CONSOLE_ON")] : [],
    ...OTHER_PLATFORM_TEMPLATE.test(html) ? [warning("OTHER_PLATFORM_TEMPLATE")] : []
  ];
  return {
    engine,
    entry: DEFAULT_ENTRY,
    title: config.title ?? null,
    version: config.version ?? DEFAULT_VERSION,
    orientation: config.orientation ?? "auto",
    loading,
    files: [...gameFiles, ...packagingFiles].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    warnings
  };
}

// packages/package-core/src/node/zip-writer.ts
import { createReadStream as createReadStream2 } from "fs";
import { open as open4 } from "fs/promises";
var encoder = new TextEncoder();
async function writeAll(handle, bytes) {
  let written = 0;
  while (written < bytes.length) {
    const result = await handle.write(bytes, written, bytes.length - written);
    written += result.bytesWritten;
  }
}
async function writeSource(handle, entry) {
  if (entry.source.kind === "bytes") {
    await writeAll(handle, entry.source.bytes);
    return;
  }
  let written = 0;
  for await (const chunk of createReadStream2(entry.source.path)) {
    const bytes = chunk;
    written += bytes.length;
    await writeAll(handle, bytes);
  }
  if (written !== entry.size) throw new PackageError("FILE_CHANGED", entry.name);
}
async function writeStoredZip(outPath, entries, times) {
  const handle = await open4(outPath, "w");
  try {
    const centrals = [];
    let offset = 0;
    for (const entry of entries) {
      const header = { name: encoder.encode(entry.name), crc32: entry.crc32, size: entry.size, ...times };
      const local = encodeLocalHeader(header);
      await writeAll(handle, local);
      await writeSource(handle, entry);
      centrals.push(encodeCentralHeader(header, offset));
      offset += local.length + entry.size;
    }
    const centralOffset = offset;
    let centralSize = 0;
    for (const central of centrals) {
      await writeAll(handle, central);
      centralSize += central.length;
    }
    await writeAll(handle, encodeEocd(entries.length, centralSize, centralOffset));
    return centralOffset + centralSize + 22;
  } finally {
    await handle.close();
  }
}

// packages/package-core/src/node/create-package.ts
var BUNDLED_RUNTIME = { bootJs: BOOT_JS, loadingTemplate: LOADING_TEMPLATE, debugConsoleJs: DEBUG_CONSOLE_JS };
var LARGEST_COUNT = 10;
var LARGE_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
var COMPRESSIBLE = /\.(wasm|data|js|json)$/i;
var SYMBOLS_FILE = /\.symbols\.json(\.(br|gz|unityweb))?$/;
async function loadConfigFile(configPath) {
  let text;
  try {
    text = await readFile3(configPath, "utf8");
  } catch {
    throw new PackageError("CONFIG_INVALID", `${configPath}\uB97C \uC77D\uC744 \uC218 \uC5C6\uC5B4\uC694`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PackageError("CONFIG_INVALID", `${CONFIG_FILE} JSON`);
  }
  return parseConfig(raw);
}
async function digestPrepared(file) {
  return file.source.kind === "bytes" ? digestBytes(file.source.bytes) : digestFile(file.source.path);
}
function postWarnings(files) {
  const warnings = [];
  const symbols = files.find((file) => SYMBOLS_FILE.test(file.path));
  if (symbols) warnings.push(warning("SYMBOLS_INCLUDED", symbols.path));
  const large = files.find((file) => file.encoding === null && file.size >= LARGE_UNCOMPRESSED_BYTES && COMPRESSIBLE.test(file.path));
  if (large) warnings.push(warning("UNCOMPRESSED_LARGE", large.path));
  return warnings;
}
async function createPackage(options) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const outPath = path3.resolve(options.out);
  const zoneOrigin = options.zoneOrigin ?? PRODUCTION_ZONE_ORIGIN;
  const prepared = await prepareBuild({
    folder: options.folder,
    config: options.config ?? {},
    configDir: options.configDir ?? process.cwd(),
    zoneOrigin,
    ...options.engine === void 0 ? {} : { engine: options.engine },
    ...options.keepMaps === void 0 ? {} : { keepMaps: options.keepMaps },
    ignore: [outPath],
    runtime: BUNDLED_RUNTIME
  });
  const digests = /* @__PURE__ */ new Map();
  for (const file of prepared.files) digests.set(file.path, await digestPrepared(file));
  const files = prepared.files.map((file) => {
    const digest = digests.get(file.path);
    return { path: file.path, size: digest.size, sha256: digest.sha256, encoding: detectEncoding(file.path, digest.head) };
  });
  if (files.length > MAX_BUILD_FILES) throw new PackageError("TOO_MANY_FILES", String(files.length));
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_BUILD_BYTES) throw new PackageError("TOO_LARGE", String(bytes));
  const manifest = parseManifest({
    format: FORMAT_VERSION,
    version: prepared.version,
    entry: prepared.entry,
    title: prepared.title,
    orientation: prepared.orientation,
    engine: prepared.engine,
    tool: options.tool,
    zoneOrigin,
    loading: prepared.loading,
    createdAt: now.toISOString(),
    totals: { count: files.length, bytes },
    files
  });
  const manifestBytes = new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}
`);
  const entries = [
    { name: MANIFEST_ENTRY, size: manifestBytes.length, crc32: digestBytes(manifestBytes).crc32, source: { kind: "bytes", bytes: manifestBytes } },
    ...prepared.files.map((file) => {
      const digest = digests.get(file.path);
      return { name: `${WEB_PREFIX}${file.path}`, size: digest.size, crc32: digest.crc32, source: file.source };
    })
  ];
  await mkdir(path3.dirname(outPath), { recursive: true });
  const temporary = `${outPath}.${process.pid}.tmp`;
  try {
    const packageBytes = await writeStoredZip(temporary, entries, toDosDateTime(now));
    const blob = await openFileBlob(temporary);
    try {
      await readPackage(blob);
    } finally {
      await blob.close();
    }
    await rename(temporary, outPath);
    return {
      manifest,
      outPath,
      packageBytes,
      largest: [...files].sort((a, b) => b.size - a.size).slice(0, LARGEST_COUNT),
      warnings: [...prepared.warnings, ...postWarnings(files)]
    };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

// packages/package-core/src/node/sdk-policy-check.ts
import { get as httpGet } from "http";
import { get as httpsGet } from "https";
var SDK_POLICY_URL_ENV = "SUPERBOX_PLAY_POLICY_URL";
var POLICY_OFF = "off";
var DEFAULT_TIMEOUT_MS = 2e3;
var MAX_POLICY_CHARS = 16 * 1024;
var OK = { kind: "ok" };
function readJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("http:") ? httpGet : httpsGet;
    const request = get(url, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`status ${response.statusCode}`));
        return;
      }
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
        if (text.length > MAX_POLICY_CHARS) request.destroy(new Error("too large"));
      });
      response.on("end", () => {
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
      response.on("error", reject);
    });
    const deadline = setTimeout(() => {
      reject(new Error("timeout"));
      request.destroy();
    }, timeoutMs);
    request.on("close", () => clearTimeout(deadline));
    request.on("error", reject);
  });
}
async function inspectSdkPolicy(version, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const configured = process.env[SDK_POLICY_URL_ENV];
  if (configured === POLICY_OFF) return { verdict: OK, policy: "off" };
  const policy = await readJson(configured || SDK_POLICY_URL, timeoutMs).then(parseSdkPolicy, () => null);
  return policy ? { verdict: evaluateSdkPolicy(policy, version), policy: "read" } : { verdict: OK, policy: "unreadable" };
}

// packages/package-core/src/node/verify.ts
var CHUNK_BYTES = 4 * 1024 * 1024;

// engines/unity/superbox-play/package.json
var package_default = {
  name: "com.superbox.play",
  version: "0.2.2",
  licensesUrl: "https://github.com/SuperboxINC/superbox-play-sdk/blob/main/LICENSE",
  displayName: "Superbox Play SDK",
  description: "\uC288\uD37C\uBC15\uC2A4 \uD50C\uB808\uC774 \uAC8C\uC784\uC13C\uD130\uC6A9 Unity SDK\uC608\uC694. \uAD11\uACE0, \uC778\uC571 \uACB0\uC81C, \uB85C\uADF8\uC778, \uD3EC\uC778\uD2B8 \uBBF8\uC158, \uC548\uC804 \uC601\uC5ED\uC744 C#\uC73C\uB85C \uD638\uCD9C\uD574\uC694. WebGL \uBE4C\uB4DC\uC5D0\uC11C \uB3D9\uC791\uD558\uACE0 \uC5D0\uB514\uD130\uC5D0\uC11C\uB294 \uC2DC\uBBAC\uB808\uC774\uC158\uB3FC\uC694.",
  unity: "2021.3",
  author: {
    name: "Superbox"
  },
  repository: {
    type: "git",
    url: "https://github.com/SuperboxINC/superbox-play-sdk.git"
  },
  dependencies: {
    "com.unity.nuget.newtonsoft-json": "3.2.1"
  },
  samples: [
    {
      displayName: "Quick Start",
      description: "\uCD08\uAE30\uD654, \uBCF4\uC0C1\uD615 \uAD11\uACE0, \uACB0\uC81C, \uBBF8\uC158\uC744 \uD638\uCD9C\uD558\uB294 \uC608\uC81C\uC608\uC694. \uBE48 GameObject\uC5D0 \uBD99\uC774\uBA74 \uB3FC\uC694.",
      path: "Samples~/QuickStart"
    }
  ]
};

// engines/unity/packager/package-build.ts
var DEFAULT_VERSION2 = "1.0.0";
var MAX_TITLE_LENGTH3 = 100;
function withPlayerSettings(config, request) {
  const version = config.version ?? (request.version && VERSION_PATTERN.test(request.version) ? request.version : void 0);
  const playerTitle = request.title && request.title.length <= MAX_TITLE_LENGTH3 ? request.title : void 0;
  const title = config.title ?? playerTitle;
  return { ...config, ...version === void 0 ? {} : { version }, ...title === void 0 ? {} : { title }, engine: "unity" };
}
async function unityPolicyAnswer() {
  const { verdict, policy } = await inspectSdkPolicy(package_default.version);
  if (verdict.kind === "ok") return { ok: true, blocked: false, message: "", latestVersion: "", policy };
  return { ok: true, blocked: verdict.kind === "blocked", message: verdict.message, latestVersion: verdict.latestVersion, policy };
}
async function loadUnityConfig(request) {
  const configPath = path4.join(request.projectDir, CONFIG_FILE);
  const hasConfig = await stat(configPath).then(() => true, () => false);
  const loaded = hasConfig ? await loadConfigFile(configPath) : { config: {}, warnings: [] };
  return { config: withPlayerSettings(loaded.config, request), warnings: loaded.warnings };
}
async function packageUnityBuild(request) {
  const loaded = await loadUnityConfig(request);
  const { config } = loaded;
  const report = await createPackage({
    folder: request.folder,
    out: `${path4.resolve(request.folder)}-${config.version ?? DEFAULT_VERSION2}.sbp`,
    config,
    configDir: request.projectDir,
    engine: "unity",
    ...request.zoneOrigin ? { zoneOrigin: request.zoneOrigin } : {},
    ...request.now === void 0 ? {} : { now: request.now },
    tool: { name: "superbox-play", version: package_default.version }
  });
  return { ...report, warnings: [...loaded.warnings, ...report.warnings] };
}

// engines/unity/packager/main.ts
function answer(result) {
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function run() {
  try {
    const request = JSON.parse(await readFile4(process.argv[2] ?? "", "utf8"));
    if (request.policyOnly) {
      answer(await unityPolicyAnswer());
      return;
    }
    const report = await packageUnityBuild(request);
    answer({ ok: true, outPath: report.outPath, files: report.manifest.totals.count, bytes: report.packageBytes, warnings: report.warnings });
  } catch (error) {
    answer({ ok: false, code: error instanceof PackageError ? error.code : "INTERNAL", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}
void run();

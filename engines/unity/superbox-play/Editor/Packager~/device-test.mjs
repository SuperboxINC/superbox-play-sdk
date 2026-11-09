// engines/unity/packager/device-test-main.ts
import { readFile as readFile5 } from "fs/promises";
import path5 from "path";
import { fileURLToPath } from "url";

// packages/package-core/src/content-type.ts
var CONTENT_TYPES = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "application/javascript",
  mjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  wasm: "application/wasm",
  data: "application/octet-stream",
  unityweb: "application/octet-stream",
  bin: "application/octet-stream",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2"
};
var DEFAULT_TYPE = "application/octet-stream";
function contentTypeFor(path6, encoding) {
  const parts = (path6.toLowerCase().split("/").pop() ?? "").split(".");
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const extension = (encoding ? parts[parts.length - 2] : last) ?? "";
  return Object.hasOwn(CONTENT_TYPES, extension) ? CONTENT_TYPES[extension] : DEFAULT_TYPE;
}

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
function detectEncoding(path6, head) {
  const lower = path6.toLowerCase();
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
var RESERVED_FILE = "sbp-manifest.json";
var PACKAGING_DIR = "sbp/";
var DEFAULT_ENTRY = "index.html";
var INJECTION_MARK = "<!-- sbp:v1 -->";
var DEFAULT_BACKGROUND_COLOR = "#0B0F19";
var DEFAULT_PRIMARY_COLOR = "#1B64DA";
var VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/;
var COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
var SAFE_PATH_CHARS = /^[A-Za-z0-9._\-/ ()@]+$/;
function isSafeBuildPath(path6) {
  if (!path6 || path6.length > MAX_PATH_LENGTH || !SAFE_PATH_CHARS.test(path6)) return false;
  if (path6.startsWith("/") || path6.endsWith("/")) return false;
  return path6.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
function isReservedBuildPath(path6) {
  return path6 === RESERVED_FILE || path6.startsWith(PACKAGING_DIR);
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
var ASCII_LINE = /^[\x20-\x7E]+$/;
var UNSAFE_TITLE_CHARS = new RegExp("[\\p{Cc}\\p{Zl}\\p{Zp}\\u202A-\\u202E\\u2066-\\u2069]", "u");
var MAX_TITLE_LENGTH = 100;
var MAX_LABEL_LENGTH = 64;
function isPackageLabel(value) {
  return typeof value === "string" && value.length <= MAX_LABEL_LENGTH && ASCII_LINE.test(value) && value.trim() !== "";
}
function isSafeTitle(value) {
  return typeof value === "string" && value.length <= MAX_TITLE_LENGTH && value.trim() !== "" && !UNSAFE_TITLE_CHARS.test(value);
}

// packages/package-core/src/zip-format.ts
var LOCAL_HEADER_SIZE = 30;
var CENTRAL_HEADER_SIZE = 46;
var EOCD_SIZE = 22;
var FLAG_ENCRYPTED = 1 << 0;
var FLAG_DATA_DESCRIPTOR = 1 << 3;
var FLAG_UTF8 = 1 << 11;
var VERSION_STORED = 10;
var MADE_BY_UNIX = 3 << 8 | VERSION_STORED;

// packages/package-core/src/reader.ts
var MAX_OVERHEAD_PER_ENTRY = LOCAL_HEADER_SIZE + CENTRAL_HEADER_SIZE + MAX_PATH_LENGTH * 2;
var MAX_CENTRAL_BYTES = (MAX_BUILD_FILES + 1) * (CENTRAL_HEADER_SIZE + MAX_PATH_LENGTH + 64);
var MAX_PACKAGE_BYTES = MAX_BUILD_BYTES + MAX_MANIFEST_BYTES + (MAX_BUILD_FILES + 1) * MAX_OVERHEAD_PER_ENTRY + EOCD_SIZE;

// engines/unity/packager/device-test.ts
import { stat as stat2 } from "fs/promises";
import { networkInterfaces } from "os";

// packages/cli/src/dev-server.ts
import { createReadStream } from "fs";
import { lstat as lstat2, open as open3, readFile as readFile4, realpath } from "fs/promises";
import { createServer } from "http";
import path3 from "path";
import { promisify } from "util";
import { brotliDecompress as brotliDecompress2, gunzip as gunzip2 } from "zlib";

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
function invalid(field) {
  return new PackageError("CONFIG_INVALID", field);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function unknownKeys(value, known, prefix) {
  return Object.keys(value).filter((key) => !known.includes(key) && !key.startsWith("$")).map((key) => warning("CONFIG_UNKNOWN_KEY", `${prefix}${key}`));
}
function optionalString(value, field, maxLength) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw invalid(field);
  return value;
}
function optionalBoolean(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "boolean") throw invalid(field);
  return value;
}
function optionalEnum(values, value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !values.includes(value)) throw invalid(field);
  return value;
}
function optionalColor(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !COLOR_PATTERN.test(value)) throw invalid(field);
  return value;
}
function parseTips(value) {
  if (value === void 0) return void 0;
  if (!Array.isArray(value) || value.length > MAX_TIPS) throw invalid("loading.tips");
  return value.map((tip, index) => {
    if (typeof tip !== "string" || !tip.trim() || tip.length > MAX_TIP_LENGTH) throw invalid(`loading.tips[${index}]`);
    return tip;
  });
}
function parsePixelRatio(value) {
  if (value === void 0 || value === "auto") return value;
  if (typeof value !== "number" || !Number.isFinite(value) || value < MIN_PIXEL_RATIO || value > MAX_PIXEL_RATIO) {
    throw invalid("runtime.maxDevicePixelRatio");
  }
  return value;
}
function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0));
}
function parseConfig(raw) {
  if (!isRecord(raw)) throw invalid("(root)");
  const loading = raw.loading;
  const runtime = raw.runtime;
  if (loading !== void 0 && !isRecord(loading)) throw invalid("loading");
  if (runtime !== void 0 && !isRecord(runtime)) throw invalid("runtime");
  const version = optionalString(raw.version, "version", 32);
  if (version !== void 0 && !VERSION_PATTERN.test(version)) throw invalid("version");
  const title = optionalString(raw.title, "title", MAX_TITLE_LENGTH2);
  if (title !== void 0 && !isSafeTitle(title)) throw invalid("title");
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

// packages/package-core/src/early-fetch.ts
var UNITY_TARGET = /(^|\/)[^/]+\.(data|wasm)(\.(br|gz|unityweb))?$/;
var COCOS_TARGET = /^cocos-js\/assets\/[^/]+\.wasm$/;
var COCOS_MIN_BYTES = 100 * 1024;
function basename(path6) {
  return path6.split("/").pop() ?? path6;
}
function referencedAsIs(html, path6) {
  const name = basename(path6);
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

// packages/package-core/src/runtime-assets.generated.ts
var BOOT_JS = '"use strict";(()=>{function A(e){let{win:t,loading:o}=e,n=e.now(),i=!1,l=()=>{var r,g,s;return!!((s=(g=(r=t.cc)==null?void 0:r.director)==null?void 0:g.getScene)!=null&&s.call(g))},d=t.console,a=d.error;d.error=(...r)=>{let[g]=r;r.length===1&&g instanceof Error&&!l()&&o.fail(e.classify(g.message),g.message),a.apply(d,r)};let c=e.setInterval(()=>{if(o.isComplete()||!o.api.autoComplete){e.clearInterval(c);return}t.cc&&!i&&(i=!0,o.api.progress(.3));let r=e.now()-n>6e4;!l()&&!r||(e.clearInterval(c),(l()||!o.hasFailed())&&o.api.complete())},100)}var q=()=>{};function x(e,t){try{return typeof e=="string"?new URL(e,t).href:e instanceof URL?e.href:e.url}catch{return null}}function X(e,t){let o=typeof e=="object"&&"method"in e?e.method:"GET";return((t==null?void 0:t.method)??o).toUpperCase()}function Z(e){e.then(t=>{var o;return(o=t==null?void 0:t.body)==null?void 0:o.cancel()}).catch(()=>{})}function R(e,t,o){if(o||t.length===0||typeof e.fetch!="function")return q;let n=e.fetch,i=(c,r)=>n.call(e,c,r),l=new Map;for(let c of t){let r=x(c,e.location.href);r&&l.set(r,i(c).catch(()=>null))}let d=(c,r)=>{let g=x(c,e.location.href),s=g&&X(c,r)==="GET"?l.get(g):void 0;return!g||!s?i(c,r):(l.delete(g),l.size===0&&a(),s.then(m=>m&&m.ok&&!m.bodyUsed?m:i(c,r)))},a=()=>{e.fetch===d&&(e.fetch=n)};return e.fetch=d,()=>{a();for(let c of l.values())Z(c);l.clear()}}var Y=/webgl|glctx|gl context|context lost/i,Q=/^script error\\.?$|ResizeObserver loop/i,J=/\\/sdk\\/play\\/v1\\.js([?#]|$)/,ee=/dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|unable to (?:load|resolve) (?:specifier|bare)/i;function _(e,t){return o=>Y.test(o)||t()?"WEBGL_CONTEXT":e.engine==="html5"?"UNKNOWN":"ENGINE_INIT"}function T(e,t){try{return new URL(e,t.location.href).origin===t.location.origin}catch{return!1}}function M(e,t,o){let{win:n,loading:i}=e,l=d=>{let a=d.src;!a||J.test(a)||!T(a,n)||i.fail("SCRIPT_LOAD",a)};n.addEventListener("error",d=>{if(i.isComplete())return;let a=d.target;if(a instanceof HTMLScriptElement){l(a);return}if(a instanceof Element)return;let{message:c,filename:r}=d;!c||Q.test(c)||r&&!T(r,n)||i.fail(t(c),c)},!0),n.addEventListener("unhandledrejection",d=>{if(i.isComplete())return;let a=d.reason,c=a instanceof Error?`${a.name}: ${a.message}`:String(a);ee.test(c)&&i.fail("SCRIPT_LOAD",c)}),n.addEventListener("webglcontextcreationerror",o,!0)}var te=["mousedown","mouseup","click"];function w(e){Object.defineProperty(e,"preventDefault",{value:()=>{},configurable:!0})}function P(e,t,o){let n=!1,i=0,l=r=>{let g=r.target;n=!t.hasFocus()&&r.cancelable&&r.touches.length===1&&(g==null?void 0:g.tagName)==="CANVAS",n&&w(r)},d=r=>{n&&(n=!1,w(r),i=o()+800)},a=()=>{n=!1},c=r=>{!r.isTrusted||o()>=i||(r.type==="mousedown"&&r.preventDefault(),r.stopImmediatePropagation())};e.addEventListener("touchstart",l,!0),e.addEventListener("touchend",d,!0),e.addEventListener("touchcancel",a,!0);for(let r of te)e.addEventListener(r,c,!0)}function oe(e){return e instanceof Error?e.message:typeof e=="string"?e:String(e)}function k(e){let t=e.appInfo,o=0,n=!1,i=e.now(),l=-1/0,d=!1,a=!1,c=null,r=[],g=[],s=[],m=[],p=(u,f)=>{try{u(f)}catch(b){e.report(b)}},E=()=>{let u=l+100-e.now();u<=0?(l=e.now(),e.post({stage:"progress",progress:o})):d||(d=!0,e.later(()=>{d=!1,a||E()},u))},h=(u,f)=>{if(!(a||c)){c={code:u,message:f.slice(0,200)},e.view.showError(c,t),e.post({stage:"error",...c});for(let b of m)p(b,c)}};return{api:{get appInfo(){return t},autoComplete:!0,onReady(u){r.push(u),p(u,t)},onProgress(u){g.push(u),n&&p(u,o)},onComplete(u){a?p(u,void 0):s.push(u)},onError(u){m.push(u),c&&p(u,c)},progress(u){if(a||typeof u!="number"||!Number.isFinite(u))return;let f=Math.min(1,Math.max(0,u)),b=!n;if(n=!0,!(f<=o&&!b)){f>o&&(i=e.now()),o=Math.max(o,f),e.view.setProgress(o),E();for(let j of g)p(j,o)}},complete(){if(!a){a=!0,o=1,n=!0,e.view.setProgress(1),e.post({stage:"ready",elapsedMs:Math.round(e.now())}),e.view.hide(),c&&e.view.hideError();for(let u of g)p(u,1);for(let u of s.splice(0))p(u,void 0)}},error(u){let f=oe(u);h(e.classify(f),f)},hide(){e.view.hide()}},fail:h,setAppInfo(u){t={...t,...u},e.view.setAppInfo(t);for(let f of r)p(f,t)},isComplete:()=>a,hasFailed:()=>c!==null,hasProgress:()=>n,lastProgress:()=>o,lastMoveAt:()=>i}}var ne=/Mali-[34]|Mali-T[0-7]|Adreno (?:\\(TM\\) )?[2-4]\\d\\d|PowerVR SGX|PowerVR Rogue G|Intel\\(R\\) HD Graphics [2-5]/i;function O(e,t){let o=t.devicePixelRatio||1;return e!=="auto"?Math.min(e,o):t.mobile?ne.test(t.renderer)||t.memoryGb!==void 0&&t.memoryGb<=2||t.cores!==void 0&&t.cores<=2?1:(t.ios?(t.cores??0)>=6:(t.memoryGb??0)>=6)?o:Math.min(o,2):null}var U="sbp.reload";function B(e){try{let t=e(),o=Number.parseInt(t.getItem(U)??"0",10),n=Number.isFinite(o)?o:2;return n>=2?!1:(t.setItem(U,String(n+1)),!0)}catch{return!1}}function re(e,t){if(t===null)return e;let o=e==null?void 0:e.devicePixelRatio;return{...e,devicePixelRatio:typeof o=="number"?Math.min(o,t):t}}function ie(e,t){let{loading:o}=t;return function(i,l,d){o.api.autoComplete=!1,o.api.progress(0);let a=null;try{a=t.pixelRatio()}catch{a=null}let c=r=>{o.api.progress(r),d==null||d(r)};return e.call(this,i,re(l,a),c).then(r=>(t.afterFrame(()=>o.api.complete()),r),r=>{let g=r instanceof Error?r.message:String(r);throw o.fail(t.classify(g),g),r})}}function F(e){let{win:t,doc:o,loading:n}=e,i=!1,l,d=()=>{o.removeEventListener("load",a,!0),e.clearInterval(l)},a=()=>{if(i)return;let r=t.createUnityInstance;typeof r=="function"&&(i=!0,t.createUnityInstance=ie(r,e),d())},c=e.now();o.addEventListener("load",a,!0),l=e.setInterval(()=>{a(),!i&&(n.isComplete()||e.now()-c>3e4)&&d()},50)}var G=\'-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif\',ae="\\uAC8C\\uC784\\uC744 \\uBD88\\uB7EC\\uC624\\uC9C0 \\uBABB\\uD588\\uC5B4\\uC694",se="\\uB2E4\\uC2DC \\uC2DC\\uB3C4",le="\\uB124\\uD2B8\\uC6CC\\uD06C \\uC0C1\\uD0DC\\uB97C \\uD655\\uC778\\uD558\\uACE0 \\uB2E4\\uC2DC \\uC2DC\\uB3C4\\uD574 \\uC8FC\\uC138\\uC694.",ce="\\uB2E4\\uB978 \\uC571\\uC744 \\uB2EB\\uACE0 \\uB2E4\\uC2DC \\uC2DC\\uB3C4\\uD574 \\uC8FC\\uC138\\uC694.";function de(e){let t=Number.parseInt(e.slice(1),16);return`rgba(${t>>16&255},${t>>8&255},${t&255},.24)`}function W(e){return Array.from((e??"").trim())[0]??""}function N(e,t,o){let n=null,i,l=null,d=-1,a=s=>(n==null?void 0:n.querySelector(s))??null,c=s=>{let m=()=>s.remove();s.addEventListener("error",m),s.complete&&s.naturalWidth===0&&s.getAttribute("src")&&m()},r=()=>{let s=a(".sbp-tip");if(!s||t.tips.length<2)return;let m=0;i=setInterval(()=>{m=(m+1)%t.tips.length,s.style.opacity="0",setTimeout(()=>{s.textContent=t.tips[m]??"",s.style.opacity=""},200)},4e3)},g=s=>{let m=a(".sbp-bar");if(!m)return;m.setAttribute("data-on",""),m.setAttribute("aria-valuenow",String(Math.round(s*100)));let p=m.firstElementChild;p&&(p.style.transform=`scaleX(${s})`)};return{attach(){if(n=e.getElementById("sbp-loading"),!n)return;let s=a(".sbp-icon img");s&&c(s),r(),d>=0&&g(d)},setProgress(s){d=s,g(s)},setAppInfo(s){var h;if(!n||n.getAttribute("data-mode")==="custom")return;n.style.setProperty("--sbp-bg",s.backgroundColor),n.style.setProperty("--sbp-primary",s.primaryColor),n.style.setProperty("--sbp-glow",de(s.primaryColor));let m=a(".sbp-name");m&&(m.textContent=s.title??"");let p=a(".sbp-icon span");p&&(p.textContent=W(s.title));let E=a(".sbp-icon");if(E&&(E.hidden=!s.iconUrl&&!W(s.title),s.iconUrl&&!t.iconUrl)){(h=a(".sbp-icon img"))==null||h.remove();let y=e.createElement("img");y.alt="",y.src=s.iconUrl,E.appendChild(y),c(y)}},hide(){i!==void 0&&clearInterval(i);let s=n??e.getElementById("sbp-loading");s&&(n=null,s.style.opacity="0",s.style.pointerEvents="none",setTimeout(()=>s.remove(),360))},showError(s,m){if(l)return;let p=e.createElement("div");p.id="sbp-error",p.setAttribute("role","alert"),p.style.cssText=`position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;background:${m.backgroundColor};color:#f2f4f6;font:400 14px/1.5 ${G};text-align:center;word-break:keep-all`;let E=e.createElement("p");E.textContent=ae,E.style.cssText="margin:0;font-size:17px;font-weight:600;line-height:26px";let h=e.createElement("p");h.textContent=s.code==="WEBGL_CONTEXT"?ce:le,h.style.cssText="margin:6px 0 0;color:rgba(255,255,255,.62);font-size:13px";let y=e.createElement("button");y.type="button",y.textContent=se,y.style.cssText=`margin-top:22px;min-width:132px;min-height:44px;padding:0 24px;border:0;border-radius:12px;background:${m.primaryColor};color:#fff;font:600 15px/1 ${G};cursor:pointer`,y.addEventListener("click",o),p.append(E,h,y),(e.body??e.documentElement).appendChild(p),l=p},hideError(){l==null||l.remove(),l=null}}}function D(e){let t=e.now(),o=e.resourceCount(),n=e.setInterval(()=>{let{loading:i}=e;if(i.isComplete()||i.hasFailed()){e.clearInterval(n);return}let l=e.resourceCount();(l!==o||e.isHidden())&&(o=l,t=e.now()),!(!i.hasProgress()||i.lastProgress()>=.9)&&(e.now()-Math.max(t,i.lastMoveAt())<6e4||(e.clearInterval(n),e.reload()||i.fail("WATCHDOG","loading stalled")))},1e4)}var ue=["www","api","cdn","console","games","static","admin","assets","play","sdk","test","developers","docs","mail","play-api","console-api","admin-api"],fe=/^[a-z0-9-]+$/,pe=/^[\\d.]+$/;function I(e,t){let o,n;try{o=new URL(e),n=new URL(t)}catch{return!1}if(o.origin!==e||o.protocol!==n.protocol||o.port!==n.port)return!1;let i=o.hostname,l=n.hostname;if(i===l)return!0;let d=l.split("."),a=l==="localhost"?l:d.length>2&&!pe.test(l)?d.slice(1).join("."):"";if(!a||!i.endsWith(`.${a}`))return!1;let c=i.slice(0,-a.length-1);return fe.test(c)&&!ue.includes(c)}function H(e,t){if(!e)return"*";let o=e[0];return o!==void 0&&I(o,t)?o:null}function V(e,t){return t!=="*"||!("message"in e)?e:Object.fromEntries(Object.entries(e).filter(([o])=>o!=="message"))}var ge=120,$=/^#[0-9A-Fa-f]{6}$/,me=/iPhone|iPad|iPod/i,K=/Android/i;function L(e){try{e()}catch{}}function v(e,t){let o=!1,n=()=>{o||(o=!0,t())};L(()=>e.requestAnimationFrame(()=>e.requestAnimationFrame(n))),e.setTimeout(n,ge)}function z(e,t){try{return e.performance.getEntriesByType(t)}catch{return[]}}function ye(e){var t;return((t=z(e,"navigation")[0])==null?void 0:t.type)==="reload"}function Ee(e){var t;try{let o=e.createElement("canvas").getContext("webgl");if(!o)return"";let n=o.getExtension("WEBGL_debug_renderer_info"),i=n?String(o.getParameter(n.UNMASKED_RENDERER_WEBGL)):"";return(t=o.getExtension("WEBGL_lose_context"))==null||t.loseContext(),i}catch{return""}}function Le(e,t){let o=e.navigator.userAgent,n=me.test(o),i=n||K.test(o),l=e.navigator;return O(t.maxDevicePixelRatio,{devicePixelRatio:e.devicePixelRatio,mobile:i,ios:n,memoryGb:l.deviceMemory,cores:l.hardwareConcurrency,renderer:i&&t.maxDevicePixelRatio==="auto"?Ee(e.document):""})}function he(e){if(typeof e!="object"||e===null)return null;let t=e;if(t.type!=="sbx.appInfo"||t.v!==1)return null;let o={};return typeof t.title=="string"&&t.title.length<=100&&(o.title=t.title),typeof t.iconUrl=="string"&&/^https?:\\/\\//.test(t.iconUrl)&&(o.iconUrl=t.iconUrl),typeof t.primaryColor=="string"&&$.test(t.primaryColor)&&(o.primaryColor=t.primaryColor),typeof t.backgroundColor=="string"&&$.test(t.backgroundColor)&&(o.backgroundColor=t.backgroundColor),o}function be(e,t,o){e.addEventListener("message",n=>{if(n.source!==e.parent||!I(n.origin,t.zoneOrigin))return;let i=he(n.data);i&&o.setAppInfo(i)})}function Ce(e,t){let{config:o}=t,n=e.document,i=e.parent!==e?H(e.location.ancestorOrigins,o.zoneOrigin):null,l=()=>e.performance.now(),d=!1,a=f=>{i!==null&&L(()=>e.parent.postMessage({type:"sbx.loading",v:1,...V(f,i)},i))},c=!1,r=[],g=f=>{c?a(f):r.push(f)},s=_(o,()=>d),m=N(n,o,()=>e.location.reload()),p=k({appInfo:{title:o.title,iconUrl:o.iconUrl,primaryColor:o.primaryColor,backgroundColor:o.backgroundColor},view:m,post:g,now:l,later:(f,b)=>e.setTimeout(f,b),report:f=>L(()=>console.error(f)),classify:s});e.SBPlayLoading=p.api;let E=!1,h=()=>{E||(E=!0,L(()=>m.attach()),v(e,()=>{a({stage:"shell"}),c=!0;for(let f of r.splice(0))a(f)}))};t.shell=h,n.addEventListener("DOMContentLoaded",h);let y;Object.defineProperty(t,"pixelRatio",{configurable:!0,get(){return y??(y=Le(e,o)),y}}),L(()=>M({win:e,config:o,loading:p},s,()=>{d=!0})),L(()=>{let f=R(e,o.earlyFetch,ye(e));p.api.onComplete(f)}),L(()=>{let f=e.navigator.audioSession;f&&(f.type="ambient")}),L(()=>{K.test(e.navigator.userAgent)&&P(e,n,l)}),i!==null&&L(()=>be(e,o,p));let u={setInterval:(f,b)=>e.setInterval(f,b),clearInterval:f=>e.clearInterval(f)};o.watchdog&&L(()=>D({loading:p,now:l,isHidden:()=>n.hidden,resourceCount:()=>z(e,"resource").length,reload:()=>B(()=>e.sessionStorage)?(e.location.reload(),!0):!1,...u})),o.engine==="unity"&&L(()=>F({win:e,doc:n,loading:p,now:l,classify:s,pixelRatio:()=>t.pixelRatio??null,afterFrame:f=>v(e,f),...u})),o.engine==="cocos"&&L(()=>A({win:e,loading:p,now:l,classify:s,...u})),e.addEventListener("load",()=>{o.engine!=="cocos"&&v(e,()=>{p.api.autoComplete&&!p.hasFailed()&&p.api.complete()})})}var S=window,C=S.SBPlayBoot;C!=null&&C.config&&!S.SBPlayLoading&&L(()=>Ce(S,C));})();';
var LOADING_TEMPLATE = '<div id="sbp-loading" data-mode="%%MODE%%" style="%%VARS%%"><style>#sbp-loading{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(72vmax 46vmax at 50% 38%,var(--sbp-glow),transparent 70%),var(--sbp-bg);color:#f2f4f6;font:400 13px/1.5 -apple-system,BlinkMacSystemFont,Apple SD Gothic Neo,Noto Sans KR,Segoe UI,sans-serif;text-align:center;-webkit-user-select:none;user-select:none;transition:opacity .3s cubic-bezier(.16,1,.3,1)}#sbp-loading *{box-sizing:border-box;margin:0;padding:0}#sbp-loading .sbp-col{display:flex;flex-direction:column;align-items:center;margin-top:-5vh;animation:sbp-in .5s cubic-bezier(.16,1,.3,1) both}#sbp-loading .sbp-icon{position:relative;display:flex;align-items:center;justify-content:center;width:72px;height:72px;overflow:hidden;border-radius:18px;background:linear-gradient(150deg,var(--sbp-primary),var(--sbp-bg) 150%);box-shadow:0 12px 32px #00000073,inset 0 0 0 1px #ffffff1a;font-size:30px;font-weight:700}#sbp-loading .sbp-icon[hidden]{display:none}#sbp-loading .sbp-icon img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}#sbp-loading .sbp-name{min-height:26px;max-width:76vw;margin-top:18px;overflow:hidden;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:26px;text-overflow:ellipsis;white-space:nowrap}#sbp-loading .sbp-bar{position:relative;width:min(200px,52vw);height:3px;margin-top:18px;overflow:hidden;border-radius:2px;background:#ffffff1f}#sbp-loading .sbp-bar i{position:absolute;top:0;left:0;width:100%;height:100%;border-radius:2px;background:var(--sbp-primary);box-shadow:0 0 12px var(--sbp-primary);transform:scaleX(0);transform-origin:left center;transition:transform .2s linear}#sbp-loading .sbp-bar:not([data-on]) i{width:34%;transform:translate(-100%);animation:sbp-idle 1.5s ease-in-out infinite}#sbp-loading .sbp-tip{position:absolute;right:24px;bottom:calc(env(safe-area-inset-bottom,0px) + 44px);left:24px;color:#fff9;word-break:keep-all;transition:opacity .2s}@keyframes sbp-idle{to{transform:translate(300%)}}@keyframes sbp-in{0%{opacity:0;transform:translateY(8px)}}@media(prefers-reduced-motion:reduce){#sbp-loading,#sbp-loading *{animation:none!important;transition:none!important}#sbp-loading .sbp-bar:not([data-on]) i{width:100%;opacity:.35;transform:none}}</style><div class="sbp-col"><div class="sbp-icon"%%ICONATTR%%><span>%%LETTER%%</span>%%ICON%%</div><p class="sbp-name">%%TITLE%%</p><div class="sbp-bar" role="progressbar" aria-label="\uAC8C\uC784 \uBD88\uB7EC\uC624\uB294 \uC911" aria-valuemin="0" aria-valuemax="100"><i></i></div></div><p class="sbp-tip">%%TIP%%</p></div>';
var DEBUG_CONSOLE_JS = '"use strict";(()=>{var c=["log","info","warn","error"],s="font:12px/1.4 ui-monospace,Menlo,Consolas,monospace",t=[],r=null;function a(n){if(n instanceof Error)return n.stack??n.message;if(typeof n=="string")return n;try{return JSON.stringify(n)}catch{return String(n)}}function i(n,e){t.push(`[${n}] ${e.map(a).join(" ")}`),t.length>300&&t.shift(),r&&r.style.display!=="none"&&(r.textContent=t.join(`\n`))}for(let n of c){let e=console[n].bind(console);console[n]=(...o)=>{i(n,o),e(...o)}}window.addEventListener("error",n=>{let e=n.target;i("error",[n.message||`load failed: ${(e==null?void 0:e.src)??(e==null?void 0:e.href)??""}`])},!0);window.addEventListener("unhandledrejection",n=>i("rejection",[n.reason]));function d(){let n=document.createElement("button");n.type="button",n.textContent="log",n.style.cssText=`position:fixed;left:8px;bottom:8px;z-index:2147483647;padding:6px 10px;border:0;border-radius:8px;background:rgba(0,0,0,.72);color:#fff;${s}`;let e=document.createElement("pre");e.style.cssText=`display:none;position:fixed;left:8px;right:8px;bottom:44px;top:40%;z-index:2147483647;margin:0;padding:10px;overflow:auto;border-radius:10px;background:rgba(0,0,0,.88);color:#e8eaed;white-space:pre-wrap;word-break:break-all;${s}`,n.addEventListener("click",()=>{let o=e.style.display==="none";e.style.display=o?"block":"none",o&&(e.textContent=t.join(`\n`))}),r=e,document.documentElement.append(e,n)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",d):d();})();';

// packages/package-core/src/node/create-package.ts
import { mkdir, readFile as readFile3, rename, rm } from "fs/promises";

// packages/package-core/src/node/prepare.ts
import { open as open2, readFile as readFile2 } from "fs/promises";
import path2 from "path";

// packages/package-core/src/node/unity-version.ts
import { open, readFile } from "fs/promises";
import { brotliDecompress, constants, gunzip } from "zlib";
var DATA_FILE = /(^|\/)[^/]+\.data(\.(br|gz|unityweb))?$/;
var VERSION = /\b(?:20\d\d|[6-9]\d{3})\.\d+\.\d+[abfp]\d+\b/;
var HEAD_BYTES = 256 * 1024;
function decompressHead(bytes, encoding) {
  return new Promise((resolve) => {
    const options = { finishFlush: encoding === "br" ? constants.BROTLI_OPERATION_FLUSH : constants.Z_SYNC_FLUSH };
    const done = (error, out) => resolve(error ? Buffer.alloc(0) : out);
    if (encoding === "br") brotliDecompress(bytes, options, done);
    else gunzip(bytes, options, done);
  });
}
async function readHead(path6) {
  const handle = await open(path6, "r");
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
    return typeof version === "string" && VERSION.test(version) ? version : null;
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
    return ((_a = VERSION.exec(text.toString("latin1"))) == null ? void 0 : _a[0]) ?? null;
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
  const stat3 = await lstat(root).catch(() => null);
  if (!(stat3 == null ? void 0 : stat3.isDirectory())) throw new PackageError("FOLDER_MISSING", folder);
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
  const handle = await open2(file.absolute, "r");
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
var encoder = new TextEncoder();

// packages/package-core/src/node/create-package.ts
var BUNDLED_RUNTIME = { bootJs: BOOT_JS, loadingTemplate: LOADING_TEMPLATE, debugConsoleJs: DEBUG_CONSOLE_JS };
var LARGE_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;
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

// packages/package-core/src/node/sdk-policy-check.ts
var MAX_POLICY_CHARS = 16 * 1024;

// packages/package-core/src/node/verify.ts
var CHUNK_BYTES = 4 * 1024 * 1024;

// packages/cli/src/errors.ts
var EXIT_FAILED = 1;
var EXIT_USAGE = 2;
var EXIT_CONFIG = 3;
var EXIT_INPUT = 4;
var EXIT_SERVER = 5;
var EXIT_AUTH = 6;
var EXIT_REJECTED = 7;
var EXIT_LATER = 8;
var CLI_ERRORS = {
  USAGE: { message: "\uBA85\uB839\uC774\uB098 \uC635\uC158\uC774 \uD2C0\uB838\uC5B4\uC694. superbox-play --help\uB85C \uC0AC\uC6A9\uBC95\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", exit: EXIT_USAGE },
  SDK_VERSION_BLOCKED: { message: "\uB3C4\uAD6C\uB97C \uC5C5\uB370\uC774\uD2B8\uD574\uC57C \uD574\uC694.", exit: EXIT_FAILED },
  CONFIG_EXISTS: { message: "\uC124\uC815 \uD30C\uC77C\uC774 \uC774\uBBF8 \uC788\uC5B4\uC694. \uB36E\uC5B4\uC4F0\uB824\uBA74 --force\uB97C \uBD99\uC5EC \uC8FC\uC138\uC694.", exit: EXIT_CONFIG },
  CONFIG_NOT_FOUND: { message: "--config\uB85C \uC9C0\uC815\uD55C \uC124\uC815 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", exit: EXIT_CONFIG },
  FILE_NOT_FOUND: { message: "\uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", exit: EXIT_INPUT },
  PORT_IN_USE: { message: "\uD3EC\uD2B8\uB97C \uC4F8 \uC218 \uC5C6\uC5B4\uC694. --port\uB85C \uB2E4\uB978 \uBC88\uD638\uB97C \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.", exit: EXIT_SERVER },
  PORT_INVALID: { message: "\uD3EC\uD2B8\uB294 1~65535 \uC0AC\uC774\uC758 \uC22B\uC790\uC5EC\uC57C \uD574\uC694.", exit: EXIT_USAGE },
  SDK_MISSING: { message: "Play SDK \uC0AC\uBCF8\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694. \uB3C4\uAD6C\uB97C \uB2E4\uC2DC \uBE4C\uB4DC\uD558\uAC70\uB098 --zone\uC744 \uC9C0\uC815\uD574 \uC8FC\uC138\uC694.", exit: EXIT_SERVER },
  // ── deploy — 입력
  API_KEY_MISSING: { message: "API \uD0A4\uAC00 \uC5C6\uC5B4\uC694. \uCF58\uC194 \u2018\uC5F0\uB3D9\u2019\uC5D0\uC11C \uB9CC\uB4E0 \uD0A4\uB97C \uD658\uACBD \uBCC0\uC218 SUPERBOX_PLAY_API_KEY\uC5D0 \uB123\uC5B4 \uC8FC\uC138\uC694.", exit: EXIT_AUTH },
  CONSOLE_ORIGIN_INVALID: { message: "\uCF58\uC194 \uC8FC\uC18C\uAC00 \uD2C0\uB838\uC5B4\uC694. https://\uD638\uC2A4\uD2B8 \uD615\uC2DD\uC774\uC5B4\uC57C \uD558\uACE0, http\uB294 localhost\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.", exit: EXIT_USAGE },
  // ── deploy — API 키(권한은 발급한 뒤 바꿀 수 없다 — 새로 발급한다)
  CONSOLE_API_KEY_INVALID: { message: "API \uD0A4\uB97C \uC4F8 \uC218 \uC5C6\uC5B4\uC694. \uD2C0\uB838\uAC70\uB098 \uD3D0\uAE30\uB41C \uD0A4\uC608\uC694. \uCF58\uC194 \u2018\uC5F0\uB3D9\u2019\uC5D0\uC11C \uC0C8\uB85C \uBC1C\uAE09\uD574 \uC8FC\uC138\uC694.", exit: EXIT_AUTH },
  CONSOLE_API_KEY_EXPIRED: { message: "API \uD0A4\uAC00 \uB9CC\uB8CC\uB410\uC5B4\uC694. \uCF58\uC194 \u2018\uC5F0\uB3D9\u2019\uC5D0\uC11C \uC0C8\uB85C \uB9CC\uB4E4\uC5B4 \uC8FC\uC138\uC694.", exit: EXIT_AUTH },
  CONSOLE_API_KEY_SCOPE: { message: "\uC774 API \uD0A4\uC5D0\uB294 \uC774 \uC791\uC5C5\uC744 \uD560 \uAD8C\uD55C\uC774 \uC5C6\uC5B4\uC694. \uCF58\uC194 \u2018\uC5F0\uB3D9\u2019\uC5D0\uC11C \uD544\uC694\uD55C \uAD8C\uD55C\uC73C\uB85C \uD0A4\uB97C \uC0C8\uB85C \uBC1C\uAE09\uD574 \uC8FC\uC138\uC694.", exit: EXIT_AUTH },
  // ── deploy — 서버 거절(게임 · 채널 · 운영 종료)
  PLAY_GAME_NOT_FOUND: { message: "\uAC8C\uC784\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694. \uAC8C\uC784 ID\uC640 API \uD0A4\uC758 \uC870\uC9C1\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_NOT_FOUND: { message: "\uBE4C\uB4DC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC5B4\uC694.", exit: EXIT_REJECTED },
  CONSOLE_CHANNEL_NOT_ALLOWED: { message: "\uC785\uC810 \uD5C8\uAC00\uB97C \uBC1B\uC9C0 \uC54A\uC740 \uCC44\uB110\uC774\uB77C \uBE4C\uB4DC\uB97C \uC62C\uB9AC\uAC70\uB098 \uCD9C\uC2DC\uD560 \uC218 \uC5C6\uC5B4\uC694. \uCC44\uB110 \uD0A4\uC640 \uC870\uC9C1\uC758 \uC785\uC810 \uD5C8\uAC00\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  CONSOLE_CHANNEL_PAUSED: { message: "\uC288\uD37C\uBC15\uC2A4\uAC00 \uC774 \uCC44\uB110\uC5D0\uC11C \uAC8C\uC784\uC744 \uCC28\uB2E8\uD574 \uC9C0\uAE08\uC740 \uC62C\uB9AC\uAC70\uB098 \uCD9C\uC2DC\uD560 \uC218 \uC5C6\uC5B4\uC694. \uCF58\uC194\uC5D0\uC11C \uC0AC\uC720\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  CONSOLE_GAME_CLOSING: { message: "\uC6B4\uC601 \uC885\uB8CC \uC608\uC815\uC778 \uAC8C\uC784\uC774\uB77C \uC774 \uC791\uC5C5\uC744 \uD560 \uC218 \uC5C6\uC5B4\uC694. \uC885\uB8CC \uC2E0\uCCAD\uC744 \uCDE8\uC18C\uD558\uBA74 \uB2E4\uC2DC \uD560 \uC218 \uC788\uC5B4\uC694.", exit: EXIT_REJECTED },
  CONSOLE_GAME_CLOSED: { message: "\uC6B4\uC601\uC774 \uB05D\uB09C \uAC8C\uC784\uC774\uB77C \uB354 \uBCC0\uACBD\uD560 \uC218 \uC5C6\uC5B4\uC694.", exit: EXIT_REJECTED },
  // ── deploy — 서버 거절(버전 · 패키지 · 파일)
  PLAY_BUILD_VERSION_TAKEN: { message: "\uC774 \uCC44\uB110\uC5D0 \uAC19\uC740 \uBC84\uC804\uC774 \uC774\uBBF8 \uC788\uC5B4\uC694. \uC62C\uB9AC\uB2E4 \uB05D\uB098\uC9C0 \uC54A\uC740 \uBE4C\uB4DC\uC77C \uC218\uB3C4 \uC788\uC5B4\uC694. version\uC744 \uC62C\uB824 \uD328\uD0A4\uC9C0\uB97C \uB2E4\uC2DC \uB9CC\uB4E4\uC5B4 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_PACKAGE_INVALID: { message: "\uC11C\uBC84\uAC00 \uD328\uD0A4\uC9C0 \uC815\uBCF4\uB97C \uBC1B\uC9C0 \uC54A\uC558\uC5B4\uC694. \uB3C4\uAD6C\uB97C \uC5C5\uB370\uC774\uD2B8\uD558\uACE0 \uD328\uD0A4\uC9C0\uB97C \uB2E4\uC2DC \uB9CC\uB4E4\uC5B4 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_PACKAGE_ZONE_NOT_ALLOWED: { message: "\uC774 \uAC8C\uC784\uC874 \uC8FC\uC18C\uB85C \uB9CC\uB4E0 \uD328\uD0A4\uC9C0\uB294 \uC5EC\uAE30\uC5D0 \uC62C\uB9B4 \uC218 \uC5C6\uC5B4\uC694. build --zone\uC744 \uB9DE\uCDB0 \uD328\uD0A4\uC9C0\uB97C \uB2E4\uC2DC \uB9CC\uB4E4\uC5B4 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_PATH_RESERVED: { message: "\uC11C\uBC84\uAC00 \uC4F0\uB294 \uC774\uB984\uC758 \uD30C\uC77C\uC774 \uC788\uC5B4\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_PATH_INVALID: { message: "\uC11C\uBC84\uAC00 \uBC1B\uC9C0 \uC54A\uB294 \uD30C\uC77C \uACBD\uB85C\uAC00 \uC788\uC5B4\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_ENTRY_MISSING: { message: "\uC2DC\uC791 \uD30C\uC77C\uC774 \uC62C\uB77C\uAC00\uC9C0 \uC54A\uC558\uC5B4\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_TOO_LARGE: { message: "\uC11C\uBC84\uC758 \uBE4C\uB4DC \uD06C\uAE30 \uD55C\uB3C4\uB97C \uB118\uC5C8\uC5B4\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_UPLOAD_INCOMPLETE: { message: "\uC62C\uB77C\uAC04 \uD30C\uC77C\uC774 \uC120\uC5B8\uBCF4\uB2E4 \uC801\uC5B4\uC694. version\uC744 \uC62C\uB824 \uB2E4\uC2DC \uC62C\uB824 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  PLAY_BUILD_UPLOAD_EXCESS: { message: "\uC62C\uB77C\uAC04 \uD30C\uC77C\uC774 \uC120\uC5B8\uBCF4\uB2E4 \uB9CE\uC544\uC694. version\uC744 \uC62C\uB824 \uB2E4\uC2DC \uC62C\uB824 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  // ── 그 밖의 거절
  API_REJECTED: { message: "\uC11C\uBC84\uAC00 \uC694\uCCAD\uC744 \uBC1B\uC9C0 \uC54A\uC558\uC5B4\uC694.", exit: EXIT_REJECTED },
  UPLOAD_REJECTED: { message: "\uC800\uC7A5\uC18C\uAC00 \uD30C\uC77C\uC744 \uBC1B\uC9C0 \uC54A\uC558\uC5B4\uC694. \uC5C5\uB85C\uB4DC \uC8FC\uC18C\uAC00 \uB9CC\uB8CC\uB410\uC744 \uC218 \uC788\uC5B4\uC694. version\uC744 \uC62C\uB824 \uB2E4\uC2DC \uC62C\uB824 \uC8FC\uC138\uC694.", exit: EXIT_REJECTED },
  // ── deploy — 패키지
  PACKAGE_CORRUPT: { message: "\uD328\uD0A4\uC9C0\uAC00 \uC190\uC0C1\uB410\uC5B4\uC694. \uD328\uD0A4\uC9C0\uB97C \uB2E4\uC2DC \uB9CC\uB4E4\uC5B4 \uC62C\uB824 \uC8FC\uC138\uC694.", exit: EXIT_FAILED },
  SERVER_RESPONSE_INVALID: { message: "\uC11C\uBC84 \uC751\uB2F5\uC744 \uC77D\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB3C4\uAD6C\uB97C \uC5C5\uB370\uC774\uD2B8\uD574 \uC8FC\uC138\uC694.", exit: EXIT_FAILED },
  // ── deploy — 잠시 뒤(키마다 분당 한도 · 빌드 만들기는 발급 한도도)
  CONSOLE_API_KEY_RATE_LIMITED: { message: "\uC774 API \uD0A4\uB85C \uB108\uBB34 \uC790\uC8FC \uD638\uCD9C\uD588\uC5B4\uC694. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.", exit: EXIT_LATER },
  CONSOLE_ISSUE_RATE_LIMITED: { message: "\uBE4C\uB4DC\uB97C \uB108\uBB34 \uC790\uC8FC \uB9CC\uB4E4\uC5C8\uC5B4\uC694. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.", exit: EXIT_LATER },
  SERVER_UNAVAILABLE: { message: "\uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.", exit: EXIT_LATER },
  UPLOAD_FAILED: { message: "\uD30C\uC77C\uC744 \uC62C\uB9AC\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB124\uD2B8\uC6CC\uD06C\uB97C \uD655\uC778\uD558\uACE0 version\uC744 \uC62C\uB824 \uB2E4\uC2DC \uC62C\uB824 \uC8FC\uC138\uC694.", exit: EXIT_LATER }
};
var CliError = class extends Error {
  code;
  detail;
  constructor(code, detail) {
    super(detail ? `${CLI_ERRORS[code].message} (${detail})` : CLI_ERRORS[code].message);
    this.name = "CliError";
    this.code = code;
    this.detail = detail;
  }
};
function describeError(error) {
  if (error instanceof CliError || error instanceof PackageError) return `\uC624\uB958 [${error.code}] ${error.message}`;
  return `\uC624\uB958 [INTERNAL] ${error instanceof Error ? error.message : String(error)}`;
}

// packages/cli/src/dev-server.ts
var DEFAULT_DEV_PORT = 8300;
var PORT_TRIES = 11;
var SDK_ROUTE = "/sdk/play/v1.js";
var ENTRY_ROUTE = "/index.html";
var VALID_HOST_HEADER = /^[A-Za-z0-9.:[\]-]+$/;
var LOOPBACK_HOSTS = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1"]);
var DECODERS = { br: promisify(brotliDecompress2), gzip: promisify(gunzip2) };
var MAX_DECODED_BYTES = 1024 * 1024 * 1024;
function send(response, status, type, body, head) {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(head ? void 0 : body);
}
async function readFirstExisting(paths) {
  for (const candidate of paths) {
    const bytes = await readFile4(candidate).catch(() => null);
    if (bytes) return bytes;
  }
  return null;
}
async function fileHead(file) {
  const handle = await open3(file, "r");
  try {
    const buffer = new Uint8Array(ENCODING_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, ENCODING_HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
function originOf(request, fallback) {
  const host = request.headers.host;
  return host && VALID_HOST_HEADER.test(host) ? `http://${host}` : fallback;
}
function preparedBytes(file) {
  return (file == null ? void 0 : file.source.kind) === "bytes" ? file.source.bytes : null;
}
function isHidden(relative) {
  return relative.split("/").some((segment) => segment.startsWith("."));
}
async function startDevServer(options) {
  const root = path3.resolve(options.folder);
  const servesOtherDevices = !LOOPBACK_HOSTS.has(options.host);
  const decodedFiles = /* @__PURE__ */ new Map();
  let ownOrigin = "";
  const isInsideRoot = (absolute) => Promise.all([realpath(root), realpath(path3.dirname(absolute))]).then(
    ([realRoot, realParent]) => realParent === realRoot || realParent.startsWith(realRoot + path3.sep),
    () => false
  );
  const decodedBytes = (absolute, encoding, info) => {
    const known = decodedFiles.get(absolute);
    if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) return known.bytes;
    const bytes = readFile4(absolute).then((source) => DECODERS[encoding](source, { maxOutputLength: MAX_DECODED_BYTES })).catch(() => null);
    decodedFiles.set(absolute, { mtimeMs: info.mtimeMs, size: info.size, bytes });
    return bytes;
  };
  const serveStatic = async (relative, response, head) => {
    const absolute = path3.resolve(root, relative);
    if (!absolute.startsWith(root + path3.sep)) {
      send(response, 403, "text/plain; charset=utf-8", "forbidden", head);
      return;
    }
    const info = await lstat2(absolute).catch(() => null);
    if (!(info == null ? void 0 : info.isFile()) || !await isInsideRoot(absolute)) {
      send(response, 404, "text/plain; charset=utf-8", "not found", head);
      return;
    }
    const encoding = detectEncoding(relative, await fileHead(absolute));
    if (encoding && servesOtherDevices) {
      const decoded = await decodedBytes(absolute, encoding, info);
      if (decoded) {
        response.writeHead(200, { "Content-Type": contentTypeFor(relative, encoding), "Cache-Control": "no-store", "Content-Length": decoded.length });
        response.end(head ? void 0 : decoded);
        return;
      }
    }
    response.writeHead(200, {
      "Content-Type": contentTypeFor(relative, encoding),
      "Cache-Control": "no-store",
      "Content-Length": info.size,
      ...encoding ? { "Content-Encoding": encoding } : {}
    });
    if (head) {
      response.end();
      return;
    }
    createReadStream(absolute).on("error", () => response.destroy()).pipe(response);
  };
  const prepare = async (request) => {
    const { config, configDir } = await options.loadConfig();
    const prepared = await prepareBuild({
      folder: root,
      config,
      configDir,
      zoneOrigin: options.zoneOrigin ?? originOf(request, ownOrigin),
      // 휴대폰에서 LAN 주소로 열어 보는 경우 — 패키지와 달리 http 출처도 받는다
      allowAnyZone: options.zoneOrigin === void 0,
      ...options.engine === void 0 ? {} : { engine: options.engine },
      keepMaps: options.keepMaps ?? true,
      runtime: BUNDLED_RUNTIME
    });
    return prepared.files;
  };
  const handle = async (request, response) => {
    const method = request.method ?? "GET";
    const head = method === "HEAD";
    if (method !== "GET" && !head) {
      send(response, 405, "text/plain; charset=utf-8", "method not allowed", head);
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
    } catch {
      send(response, 400, "text/plain; charset=utf-8", "bad request", head);
      return;
    }
    if (pathname === SDK_ROUTE && options.zoneOrigin === void 0) {
      const sdk = await readFirstExisting(options.sdkPaths);
      if (!sdk) {
        send(response, 500, "text/plain; charset=utf-8", new CliError("SDK_MISSING").message, head);
        return;
      }
      send(response, 200, "application/javascript", sdk, head);
      return;
    }
    const route = pathname === "/" ? ENTRY_ROUTE : pathname;
    const relative = route.slice(1);
    if (!isSafeBuildPath(relative) || servesOtherDevices && isHidden(relative)) {
      send(response, 404, "text/plain; charset=utf-8", "not found", head);
      return;
    }
    if (relative === "index.html" || relative.startsWith("sbp/")) {
      const files = await prepare(request);
      const bytes = preparedBytes(files.find((file) => file.path === relative));
      if (bytes) {
        send(response, 200, contentTypeFor(relative, null), bytes, head);
        return;
      }
      send(response, 404, "text/plain; charset=utf-8", "not found", head);
      return;
    }
    await serveStatic(relative, response, head);
  };
  const server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const status = error instanceof PackageError ? 422 : 500;
      send(response, status, "text/plain; charset=utf-8", describeError(error), false);
    });
  });
  const listen = (port2) => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port2, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  let port = options.port;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await listen(port);
      break;
    } catch (error) {
      const inUse = error.code === "EADDRINUSE";
      if (!inUse) throw error;
      if (options.fixedPort || attempt + 1 >= PORT_TRIES) throw new CliError("PORT_IN_USE", String(port));
      port += 1;
    }
  }
  const address = server.address();
  const displayHost = options.host === "0.0.0.0" || options.host === "::" ? "localhost" : options.host;
  ownOrigin = `http://${displayHost}:${address.port}`;
  return {
    url: `${ownOrigin}/`,
    port: address.port,
    close: () => new Promise((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    })
  };
}

// node_modules/uqr/dist/index.mjs
var QrCodeDataType = /* @__PURE__ */ ((QrCodeDataType2) => {
  QrCodeDataType2[QrCodeDataType2["Border"] = -1] = "Border";
  QrCodeDataType2[QrCodeDataType2["Data"] = 0] = "Data";
  QrCodeDataType2[QrCodeDataType2["Function"] = 1] = "Function";
  QrCodeDataType2[QrCodeDataType2["Position"] = 2] = "Position";
  QrCodeDataType2[QrCodeDataType2["Timing"] = 3] = "Timing";
  QrCodeDataType2[QrCodeDataType2["Alignment"] = 4] = "Alignment";
  return QrCodeDataType2;
})(QrCodeDataType || {});
var LOW = [0, 1];
var MEDIUM = [1, 0];
var QUARTILE = [2, 3];
var HIGH = [3, 2];
var EccMap = {
  L: LOW,
  M: MEDIUM,
  Q: QUARTILE,
  H: HIGH
};
var NUMERIC_REGEX = /^\d*$/;
var ALPHANUMERIC_REGEX = /^[A-Z0-9 $%*+./:-]*$/;
var ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
var MIN_VERSION = 1;
var MAX_VERSION = 40;
var PENALTY_N1 = 3;
var PENALTY_N2 = 3;
var PENALTY_N3 = 40;
var PENALTY_N4 = 10;
var ECC_CODEWORDS_PER_BLOCK = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  // 0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // Low
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  // Medium
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  // Quartile
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  // High
];
var NUM_ERROR_CORRECTION_BLOCKS = [
  // Version: (note that index 0 is for padding, and is set to an illegal value)
  // 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40    Error correction level
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  // Low
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  // Medium
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  // Quartile
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  // High
];
var QrCode = class {
  /* -- Constructor (low level) and fields -- */
  // Creates a new QR Code with the given version number,
  // error correction level, data codeword bytes, and mask number.
  // This is a low-level API that most users should not use directly.
  // A mid-level API is the encodeSegments() function.
  constructor(version, ecc, dataCodewords, msk) {
    this.version = version;
    this.ecc = ecc;
    if (version < MIN_VERSION || version > MAX_VERSION)
      throw new RangeError("Version value out of range");
    if (msk < -1 || msk > 7)
      throw new RangeError("Mask value out of range");
    this.size = version * 4 + 17;
    const row = Array.from({ length: this.size }).fill(false);
    for (let i = 0; i < this.size; i++) {
      this.modules.push(row.slice());
      this.types.push(row.map(() => 0));
    }
    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    if (msk === -1) {
      let minPenalty = 1e9;
      for (let i = 0; i < 8; i++) {
        this.applyMask(i);
        this.drawFormatBits(i);
        const penalty = this.getPenaltyScore();
        if (penalty < minPenalty) {
          msk = i;
          minPenalty = penalty;
        }
        this.applyMask(i);
      }
    }
    this.mask = msk;
    this.applyMask(msk);
    this.drawFormatBits(msk);
  }
  /* -- Fields -- */
  // The width and height of this QR Code, measured in modules, between
  // 21 and 177 (inclusive). This is equal to version * 4 + 17.
  size;
  // The index of the mask pattern used in this QR Code, which is between 0 and 7 (inclusive).
  // Even if a QR Code is created with automatic masking requested (mask = -1),
  // the resulting object still has a mask value between 0 and 7.
  mask;
  // The modules of this QR Code (false = light, true = dark).
  // Immutable after constructor finishes. Accessed through getModule().
  modules = [];
  types = [];
  /* -- Accessor methods -- */
  // Returns the color of the module (pixel) at the given coordinates, which is false
  // for light or true for dark. The top left corner has the coordinates (x=0, y=0).
  // If the given coordinates are out of bounds, then false (light) is returned.
  getModule(x, y) {
    return x >= 0 && x < this.size && y >= 0 && y < this.size && this.modules[y][x];
  }
  /* -- Private helper methods for constructor: Drawing function modules -- */
  // Reads this object's version field, and draws and marks all function modules.
  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0, QrCodeDataType.Timing);
      this.setFunctionModule(i, 6, i % 2 === 0, QrCodeDataType.Timing);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);
    const alignPatPos = this.getAlignmentPatternPositions();
    const numAlign = alignPatPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (!(i === 0 && j === 0 || i === 0 && j === numAlign - 1 || i === numAlign - 1 && j === 0))
          this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j]);
      }
    }
    this.drawFormatBits(0);
    this.drawVersion();
  }
  // Draws two copies of the format bits (with its own error correction code)
  // based on the given mask and this object's error correction level field.
  drawFormatBits(mask) {
    const data = this.ecc[1] << 3 | mask;
    let rem = data;
    for (let i = 0; i < 10; i++)
      rem = rem << 1 ^ (rem >>> 9) * 1335;
    const bits = (data << 10 | rem) ^ 21522;
    for (let i = 0; i <= 5; i++)
      this.setFunctionModule(8, i, getBit(bits, i));
    this.setFunctionModule(8, 7, getBit(bits, 6));
    this.setFunctionModule(8, 8, getBit(bits, 7));
    this.setFunctionModule(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i++)
      this.setFunctionModule(14 - i, 8, getBit(bits, i));
    for (let i = 0; i < 8; i++)
      this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i++)
      this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i));
    this.setFunctionModule(8, this.size - 8, true);
  }
  // Draws two copies of the version bits (with its own error correction code),
  // based on this object's version field, iff 7 <= version <= 40.
  drawVersion() {
    if (this.version < 7)
      return;
    let rem = this.version;
    for (let i = 0; i < 12; i++)
      rem = rem << 1 ^ (rem >>> 11) * 7973;
    const bits = this.version << 12 | rem;
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i);
      const a = this.size - 11 + i % 3;
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, color);
      this.setFunctionModule(b, a, color);
    }
  }
  // Draws a 9*9 finder pattern including the border separator,
  // with the center module at (x, y). Modules can be out of bounds.
  drawFinderPattern(x, y) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4, QrCodeDataType.Position);
      }
    }
  }
  // Draws a 5*5 alignment pattern, with the center module
  // at (x, y). All modules must be in bounds.
  drawAlignmentPattern(x, y) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunctionModule(
          x + dx,
          y + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
          QrCodeDataType.Alignment
        );
      }
    }
  }
  // Sets the color of a module and marks it as a function module.
  // Only used by the constructor. Coordinates must be in bounds.
  setFunctionModule(x, y, isDark, type = QrCodeDataType.Function) {
    this.modules[y][x] = isDark;
    this.types[y][x] = type;
  }
  /* -- Private helper methods for constructor: Codewords and masking -- */
  // Returns a new byte string representing the given data with the appropriate error correction
  // codewords appended to it, based on this object's version and error correction level.
  addEccAndInterleave(data) {
    const ver = this.version;
    const ecl = this.ecc;
    if (data.length !== getNumDataCodewords(ver, ecl))
      throw new RangeError("Invalid argument");
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl[0]][ver];
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl[0]][ver];
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - rawCodewords % numBlocks;
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);
    const blocks = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks)
        dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const result = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks)
          result.push(block[i]);
      });
    }
    return result;
  }
  // Draws the given sequence of 8-bit codewords (data and error correction) onto the entire
  // data area of this QR Code. Function modules need to be marked off before this is called.
  drawCodewords(data) {
    if (data.length !== Math.floor(getNumRawDataModules(this.version) / 8))
      throw new RangeError("Invalid argument");
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6)
        right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = (right + 1 & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.types[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }
  // XORs the codeword modules in this QR Code with the given mask pattern.
  // The function modules must be marked and the codeword bits must be drawn
  // before masking. Due to the arithmetic of XOR, calling applyMask() with
  // the same mask value a second time will undo the mask. A final well-formed
  // QR Code needs exactly one (not zero, two, etc.) mask applied.
  applyMask(mask) {
    if (mask < 0 || mask > 7)
      throw new RangeError("Mask value out of range");
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert;
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0;
            break;
          case 1:
            invert = y % 2 === 0;
            break;
          case 2:
            invert = x % 3 === 0;
            break;
          case 3:
            invert = (x + y) % 3 === 0;
            break;
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
            break;
          case 5:
            invert = x * y % 2 + x * y % 3 === 0;
            break;
          case 6:
            invert = (x * y % 2 + x * y % 3) % 2 === 0;
            break;
          case 7:
            invert = ((x + y) % 2 + x * y % 3) % 2 === 0;
            break;
          default:
            throw new Error("Unreachable");
        }
        if (!this.types[y][x] && invert)
          this.modules[y][x] = !this.modules[y][x];
      }
    }
  }
  // Calculates and returns the penalty score based on state of this QR Code's current modules.
  // This is used by the automatic mask choice algorithm to find the mask pattern that yields the lowest score.
  getPenaltyScore() {
    let result = 0;
    for (let y = 0; y < this.size; y++) {
      let runColor = false;
      let runX = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let x = 0; x < this.size; x++) {
        if (this.modules[y][x] === runColor) {
          runX++;
          if (runX === 5)
            result += PENALTY_N1;
          else if (runX > 5)
            result++;
        } else {
          this.finderPenaltyAddHistory(runX, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runX = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runX, runHistory) * PENALTY_N3;
    }
    for (let x = 0; x < this.size; x++) {
      let runColor = false;
      let runY = 0;
      const runHistory = [0, 0, 0, 0, 0, 0, 0];
      for (let y = 0; y < this.size; y++) {
        if (this.modules[y][x] === runColor) {
          runY++;
          if (runY === 5)
            result += PENALTY_N1;
          else if (runY > 5)
            result++;
        } else {
          this.finderPenaltyAddHistory(runY, runHistory);
          if (!runColor)
            result += this.finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
          runColor = this.modules[y][x];
          runY = 1;
        }
      }
      result += this.finderPenaltyTerminateAndCount(runColor, runY, runHistory) * PENALTY_N3;
    }
    for (let y = 0; y < this.size - 1; y++) {
      for (let x = 0; x < this.size - 1; x++) {
        const color = this.modules[y][x];
        if (color === this.modules[y][x + 1] && color === this.modules[y + 1][x] && color === this.modules[y + 1][x + 1]) {
          result += PENALTY_N2;
        }
      }
    }
    let dark = 0;
    for (const row of this.modules)
      dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark);
    const total = this.size * this.size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * PENALTY_N4;
    return result;
  }
  /* -- Private helper functions -- */
  // Returns an ascending list of positions of alignment patterns for this version number.
  // Each position is in the range [0,177), and are used on both the x and y axes.
  // This could be implemented as lookup table of 40 variable-length lists of integers.
  getAlignmentPatternPositions() {
    if (this.version === 1) {
      return [];
    } else {
      const numAlign = Math.floor(this.version / 7) + 2;
      const step = this.version === 32 ? 26 : Math.ceil((this.version * 4 + 4) / (numAlign * 2 - 2)) * 2;
      const result = [6];
      for (let pos = this.size - 7; result.length < numAlign; pos -= step)
        result.splice(1, 0, pos);
      return result;
    }
  }
  // Can only be called immediately after a light run is added, and
  // returns either 0, 1, or 2. A helper function for getPenaltyScore().
  finderPenaltyCountPatterns(runHistory) {
    const n = runHistory[1];
    const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
  }
  // Must be called at the end of a line (row or column) of modules. A helper function for getPenaltyScore().
  finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory) {
    if (currentRunColor) {
      this.finderPenaltyAddHistory(currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += this.size;
    this.finderPenaltyAddHistory(currentRunLength, runHistory);
    return this.finderPenaltyCountPatterns(runHistory);
  }
  // Pushes the given value to the front and drops the last value. A helper function for getPenaltyScore().
  finderPenaltyAddHistory(currentRunLength, runHistory) {
    if (runHistory[0] === 0)
      currentRunLength += this.size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }
};
function appendBits(val, len, bb) {
  if (len < 0 || len > 31 || val >>> len !== 0)
    throw new RangeError("Value out of range");
  for (let i = len - 1; i >= 0; i--)
    bb.push(val >>> i & 1);
}
function getBit(x, i) {
  return (x >>> i & 1) !== 0;
}
var QrSegment = class {
  // Creates a new QR Code segment with the given attributes and data.
  // The character count (numChars) must agree with the mode and the bit buffer length,
  // but the constraint isn't checked. The given bit buffer is cloned and stored.
  constructor(mode, numChars, bitData) {
    this.mode = mode;
    this.numChars = numChars;
    this.bitData = bitData;
    if (numChars < 0)
      throw new RangeError("Invalid argument");
    this.bitData = bitData.slice();
  }
  /* -- Methods -- */
  // Returns a new copy of the data bits of this segment.
  getData() {
    return this.bitData.slice();
  }
};
var MODE_NUMERIC = [1, 10, 12, 14];
var MODE_ALPHANUMERIC = [2, 9, 11, 13];
var MODE_BYTE = [4, 8, 16, 16];
function numCharCountBits(mode, ver) {
  return mode[Math.floor((ver + 7) / 17) + 1];
}
function makeBytes(data) {
  const bb = [];
  for (const b of data)
    appendBits(b, 8, bb);
  return new QrSegment(MODE_BYTE, data.length, bb);
}
function makeNumeric(digits) {
  if (!isNumeric(digits))
    throw new RangeError("String contains non-numeric characters");
  const bb = [];
  for (let i = 0; i < digits.length; ) {
    const n = Math.min(digits.length - i, 3);
    appendBits(Number.parseInt(digits.substring(i, i + n), 10), n * 3 + 1, bb);
    i += n;
  }
  return new QrSegment(MODE_NUMERIC, digits.length, bb);
}
function makeAlphanumeric(text) {
  if (!isAlphanumeric(text))
    throw new RangeError("String contains unencodable characters in alphanumeric mode");
  const bb = [];
  let i;
  for (i = 0; i + 2 <= text.length; i += 2) {
    let temp = ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)) * 45;
    temp += ALPHANUMERIC_CHARSET.indexOf(text.charAt(i + 1));
    appendBits(temp, 11, bb);
  }
  if (i < text.length)
    appendBits(ALPHANUMERIC_CHARSET.indexOf(text.charAt(i)), 6, bb);
  return new QrSegment(MODE_ALPHANUMERIC, text.length, bb);
}
function makeSegments(text) {
  if (text === "")
    return [];
  else if (isNumeric(text))
    return [makeNumeric(text)];
  else if (isAlphanumeric(text))
    return [makeAlphanumeric(text)];
  else
    return [makeBytes(toUtf8ByteArray(text))];
}
function isNumeric(text) {
  return NUMERIC_REGEX.test(text);
}
function isAlphanumeric(text) {
  return ALPHANUMERIC_REGEX.test(text);
}
function getTotalBits(segs, version) {
  let result = 0;
  for (const seg of segs) {
    const ccbits = numCharCountBits(seg.mode, version);
    if (seg.numChars >= 1 << ccbits)
      return Number.POSITIVE_INFINITY;
    result += 4 + ccbits + seg.bitData.length;
  }
  return result;
}
function toUtf8ByteArray(str) {
  str = encodeURI(str);
  const result = [];
  for (let i = 0; i < str.length; i++) {
    if (str.charAt(i) !== "%") {
      result.push(str.charCodeAt(i));
    } else {
      result.push(Number.parseInt(str.substring(i + 1, i + 3), 16));
      i += 2;
    }
  }
  return result;
}
function getNumRawDataModules(ver) {
  if (ver < MIN_VERSION || ver > MAX_VERSION)
    throw new RangeError("Version number out of range");
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7)
      result -= 36;
  }
  return result;
}
function getNumDataCodewords(ver, ecl) {
  return Math.floor(getNumRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[ecl[0]][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl[0]][ver];
}
function reedSolomonComputeDivisor(degree) {
  if (degree < 1 || degree > 255)
    throw new RangeError("Degree out of range");
  const result = [];
  for (let i = 0; i < degree - 1; i++)
    result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < result.length)
        result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 2);
  }
  return result;
}
function reedSolomonComputeRemainder(data, divisor) {
  const result = divisor.map((_) => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => result[i] ^= reedSolomonMultiply(coef, factor));
  }
  return result;
}
function reedSolomonMultiply(x, y) {
  if (x >>> 8 !== 0 || y >>> 8 !== 0)
    throw new RangeError("Byte out of range");
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = z << 1 ^ (z >>> 7) * 285;
    z ^= (y >>> i & 1) * x;
  }
  return z;
}
function encodeSegments(segs, ecl, minVersion = 1, maxVersion = 40, mask = -1, boostEcl = true) {
  if (!(MIN_VERSION <= minVersion && minVersion <= maxVersion && maxVersion <= MAX_VERSION) || mask < -1 || mask > 7) {
    throw new RangeError("Invalid value");
  }
  let version;
  let dataUsedBits;
  for (version = minVersion; ; version++) {
    const dataCapacityBits2 = getNumDataCodewords(version, ecl) * 8;
    const usedBits = getTotalBits(segs, version);
    if (usedBits <= dataCapacityBits2) {
      dataUsedBits = usedBits;
      break;
    }
    if (version >= maxVersion)
      throw new RangeError("Data too long");
  }
  for (const newEcl of [MEDIUM, QUARTILE, HIGH]) {
    if (boostEcl && dataUsedBits <= getNumDataCodewords(version, newEcl) * 8)
      ecl = newEcl;
  }
  const bb = [];
  for (const seg of segs) {
    appendBits(seg.mode[0], 4, bb);
    appendBits(seg.numChars, numCharCountBits(seg.mode, version), bb);
    for (const b of seg.getData())
      bb.push(b);
  }
  const dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb);
  appendBits(0, (8 - bb.length % 8) % 8, bb);
  for (let padByte = 236; bb.length < dataCapacityBits; padByte ^= 236 ^ 17)
    appendBits(padByte, 8, bb);
  const dataCodewords = Array.from({ length: Math.ceil(bb.length / 8) }, () => 0);
  bb.forEach((b, i) => dataCodewords[i >>> 3] |= b << 7 - (i & 7));
  return new QrCode(version, ecl, dataCodewords, mask);
}
function encode(data, options) {
  var _a;
  const {
    ecc = "L",
    boostEcc = false,
    minVersion = 1,
    maxVersion = 40,
    maskPattern = -1,
    border = 1
  } = options || {};
  const segment = typeof data === "string" ? makeSegments(data) : Array.isArray(data) ? [makeBytes(data)] : void 0;
  if (!segment)
    throw new Error(`uqr only supports encoding string and binary data, but got: ${typeof data}`);
  const qr = encodeSegments(
    segment,
    EccMap[ecc],
    minVersion,
    maxVersion,
    maskPattern,
    boostEcc
  );
  const result = addBorder({
    version: qr.version,
    maskPattern: qr.mask,
    size: qr.size,
    data: qr.modules,
    types: qr.types
  }, border);
  if (options == null ? void 0 : options.invert)
    result.data = result.data.map((row) => row.map((mod) => !mod));
  (_a = options == null ? void 0 : options.onEncoded) == null ? void 0 : _a.call(options, result);
  return result;
}
function addBorder(input, border = 1) {
  if (!border)
    return input;
  const { size } = input;
  const newSize = size + border * 2;
  input.size = newSize;
  input.data.forEach((row) => {
    for (let i = 0; i < border; i++) {
      row.unshift(false);
      row.push(false);
    }
  });
  for (let i = 0; i < border; i++) {
    input.data.unshift(Array.from({ length: newSize }, (_) => false));
    input.data.push(Array.from({ length: newSize }, (_) => false));
  }
  const b = QrCodeDataType.Border;
  input.types.forEach((row) => {
    for (let i = 0; i < border; i++) {
      row.unshift(b);
      row.push(b);
    }
  });
  for (let i = 0; i < border; i++) {
    input.types.unshift(Array.from({ length: newSize }, (_) => b));
    input.types.push(Array.from({ length: newSize }, (_) => b));
  }
  return input;
}

// packages/cli/src/qr.ts
var ERROR_CORRECTION = "M";
function qrMatrix(text) {
  const { size, data } = encode(text, { ecc: ERROR_CORRECTION, border: 0 });
  return { size, modules: data.flat().map((dark) => dark ? "1" : "0").join("") };
}

// packages/cli/src/lan.ts
var PRIVATE_IPV4 = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
var VIRTUAL_ADAPTER = /docker|veth|vmnet|vboxnet|vmware|virtualbox|hyper-v|vethernet|utun|tun\d|tap\d|ppp|ipsec|bridge|^br-|awdl|llw|tailscale|zerotier|^wg\d/i;
var PHYSICAL_ADAPTER = /^(en|eth|wlan|wl)|wi-?fi|ethernet|이더넷/i;
function reachableAddresses(entries) {
  return (entries ?? []).filter((entry) => (entry.family === "IPv4" || entry.family === 4) && !entry.internal && PRIVATE_IPV4.test(entry.address)).map((entry) => entry.address);
}
function lanAddresses(interfaces) {
  const usable = Object.entries(interfaces).filter(([name]) => !VIRTUAL_ADAPTER.test(name));
  const physicalFirst = [...usable.filter(([name]) => PHYSICAL_ADAPTER.test(name)), ...usable.filter(([name]) => !PHYSICAL_ADAPTER.test(name))];
  return [...new Set(physicalFirst.flatMap(([, entries]) => reachableAddresses(entries)))];
}
function lanUrl(address, port) {
  return `http://${address}:${port}/`;
}

// engines/unity/packager/package-build.ts
import { stat } from "fs/promises";
import path4 from "path";
var MAX_TITLE_LENGTH3 = 100;
function withPlayerSettings(config, request) {
  const version = config.version ?? (request.version && VERSION_PATTERN.test(request.version) ? request.version : void 0);
  const playerTitle = request.title && request.title.length <= MAX_TITLE_LENGTH3 ? request.title : void 0;
  const title = config.title ?? playerTitle;
  return { ...config, ...version === void 0 ? {} : { version }, ...title === void 0 ? {} : { title }, engine: "unity" };
}
async function loadUnityConfig(request) {
  const configPath = path4.join(request.projectDir, CONFIG_FILE);
  const hasConfig = await stat(configPath).then(() => true, () => false);
  const loaded = hasConfig ? await loadConfigFile(configPath) : { config: {}, warnings: [] };
  return { config: withPlayerSettings(loaded.config, request), warnings: loaded.warnings };
}

// engines/unity/packager/device-test.ts
var ALL_NETWORK_CARDS = "0.0.0.0";
function addressOf(address, port) {
  const url = lanUrl(address, port);
  const { size, modules } = qrMatrix(url);
  return { url, qrSize: size, qr: modules };
}
async function startDeviceTest(request, environment) {
  const folder = await stat2(request.folder).catch(() => null);
  if (!(folder == null ? void 0 : folder.isDirectory())) throw new PackageError("FOLDER_MISSING", request.folder);
  const handle = await startDevServer({
    folder: request.folder,
    host: ALL_NETWORK_CARDS,
    port: DEFAULT_DEV_PORT,
    fixedPort: false,
    engine: "unity",
    loadConfig: async () => ({ config: (await loadUnityConfig(request)).config, configDir: request.projectDir }),
    sdkPaths: environment.sdkPaths
  });
  const addresses = lanAddresses(environment.interfaces ?? networkInterfaces()).map((address) => addressOf(address, handle.port));
  return { handle, answer: { ok: true, port: handle.port, localUrl: handle.url, addresses } };
}

// engines/unity/packager/device-test-main.ts
var PARENT_CHECK_MS = 2e3;
function answer(result) {
  process.stdout.write(`${JSON.stringify(result)}
`);
}
function exitWithParent(parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch (error) {
      if (error.code === "ESRCH") process.exit(0);
    }
  }, PARENT_CHECK_MS);
}
async function run() {
  process.stdout.on("error", () => void 0);
  process.stderr.on("error", () => void 0);
  try {
    const request = JSON.parse(await readFile5(process.argv[2] ?? "", "utf8"));
    const here = path5.dirname(fileURLToPath(import.meta.url));
    const started = await startDeviceTest(request, { sdkPaths: [path5.join(here, "v1.js")] });
    if (request.parentPid) exitWithParent(request.parentPid);
    answer(started.answer);
  } catch (error) {
    answer({ ok: false, code: error instanceof PackageError ? error.code : "INTERNAL", message: error instanceof Error ? error.message : String(error) });
    process.exitCode = 1;
  }
}
void run();

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// engines/cocos-creator/superbox-play/source/main.ts
var main_exports = {};
__export(main_exports, {
  BUILD_BUSY: () => BUILD_BUSY,
  BUILD_PARAM_ERROR: () => BUILD_PARAM_ERROR,
  BUILD_SUCCESS: () => BUILD_SUCCESS,
  LOCAL_ZONE_ORIGIN: () => LOCAL_ZONE_ORIGIN,
  buildAndPackage: () => buildAndPackage,
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(main_exports);

// engines/cocos-creator/superbox-play/package.json
var package_default = {
  package_version: 2,
  name: "superbox-play",
  version: "0.2.7",
  title: "Superbox Play",
  description: "web-mobile \xB7 web-desktop \uBE4C\uB4DC\uB97C \uC288\uD37C\uBC15\uC2A4 \uD50C\uB808\uC774 \uD328\uD0A4\uC9C0(.sbp)\uB85C \uBB36\uACE0 \uAC8C\uC784 \uCF54\uB4DC\uC5D0\uC11C SuperboxPlay \uB97C \uC4F0\uAC8C \uD55C\uB2E4",
  author: "SUPERBOX",
  editor: ">=3.8.0",
  main: "./dist/main.js",
  contributions: {
    menu: [
      {
        path: "Superbox Play",
        label: "Build & Package",
        message: "build-and-package"
      },
      {
        path: "Superbox Play",
        label: "Build & Package (Local Game Zone)",
        message: "build-and-package-for-local-zone"
      }
    ],
    messages: {
      "build-and-package": {
        methods: ["buildAndPackage"]
      },
      "build-and-package-for-local-zone": {
        methods: ["buildAndPackageForLocalZone"]
      }
    },
    builder: "./dist/builder.js",
    "asset-db": {
      mount: {
        path: "./assets",
        readonly: true
      }
    }
  },
  devDependencies: {
    "@cocos/creator-types": "3.8.8"
  }
};

// engines/cocos-creator/superbox-play/source/builder.ts
var PACKAGE_NAME = "superbox-play";
var DEFAULT_ZONE_ORIGIN = "https://game.superboxgo.com";

// engines/cocos-creator/superbox-play/source/update-notice.ts
var import_promises = require("node:fs/promises");
var import_node_path = __toESM(require("node:path"));

// packages/package-core/src/node/sdk-policy-check.ts
var import_node_http = require("node:http");
var import_node_https = require("node:https");

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

// packages/package-core/src/node/sdk-policy-check.ts
var SDK_POLICY_URL_ENV = "SUPERBOX_PLAY_POLICY_URL";
var POLICY_OFF = "off";
var DEFAULT_TIMEOUT_MS = 2e3;
var MAX_POLICY_CHARS = 16 * 1024;
var OK = { kind: "ok" };
function readJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith("http:") ? import_node_http.get : import_node_https.get;
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

// engines/cocos-creator/superbox-play/source/update-notice.ts
var UPDATE_DOCS_URL = "https://developers.superboxgo.com/engines/cocos-creator";
var DIALOG_TITLE = "Superbox Play SDK \uC5C5\uB370\uC774\uD2B8";
var OPEN_GUIDE = 0;
var LATER = 1;
var BUTTONS = ["\uC124\uCE58 \uC548\uB0B4 \uBCF4\uAE30", "\uB098\uC911\uC5D0"];
var CHECKED_DATE_FILE = "temp/superbox-play-update-notice";
function localDay(now) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function noticeBody(verdict, version) {
  const lead = verdict.kind === "blocked" ? verdict.message : "\uC0C8\uB85C\uC6B4 SDK \uBC84\uC804\uC774 \uC788\uC5B4\uC694.";
  return `${lead}

\uD604\uC7AC: v${version}
\uCD5C\uC2E0: v${verdict.latestVersion}

\uC124\uCE58 \uC548\uB0B4\uC5D0\uC11C \uC0C8 \uBC84\uC804\uC744 \uBC1B\uC544 \uC8FC\uC138\uC694.`;
}
async function notifyUpdate(options) {
  const { editor, projectDir, version, now = /* @__PURE__ */ new Date() } = options;
  try {
    const checkedDateFile = import_node_path.default.join(projectDir, CHECKED_DATE_FILE);
    const today = localDay(now);
    if (await (0, import_promises.readFile)(checkedDateFile, "utf8").catch(() => "") === today) return;
    const { verdict, policy } = await inspectSdkPolicy(version);
    if (policy === "unreadable") return;
    await (0, import_promises.mkdir)(import_node_path.default.dirname(checkedDateFile), { recursive: true });
    await (0, import_promises.writeFile)(checkedDateFile, today);
    if (verdict.kind === "ok") return;
    const { response } = await editor.Dialog.info(noticeBody(verdict, version), { title: DIALOG_TITLE, buttons: BUTTONS, default: OPEN_GUIDE, cancel: LATER });
    if (response === OPEN_GUIDE) editor.Message.send("program", "open-url", UPDATE_DOCS_URL);
  } catch (error) {
    console.warn(`[superbox-play] \uC0C8 \uBC84\uC804\uC744 \uD655\uC778\uD558\uC9C0 \uBABB\uD588\uC5B4\uC694. ${error instanceof Error ? error.message : String(error)}`);
  }
}

// engines/cocos-creator/superbox-play/source/main.ts
var LOCAL_ZONE_ORIGIN = "http://localhost:8200";
var BUILD_PARAM_ERROR = 32;
var BUILD_SUCCESS = 36;
var BUILD_BUSY = 37;
var WEB_PLATFORMS = ["web-mobile", "web-desktop"];
var DEFAULT_PLATFORM = "web-mobile";
var DIALOG_TITLE2 = "Superbox Play";
var UPDATE_NOTICE_DELAY_MS = 5e3;
async function lastWebBuildOptions(editor) {
  const info = await editor.Message.request("builder", "query-tasks-info");
  const webTasks = (info.list ?? []).filter((task) => task.type === "build" && task.state === "success" && WEB_PLATFORMS.includes(task.options?.platform ?? ""));
  const latest = webTasks.reduce((found, task) => found && Number(found.id) >= Number(task.id) ? found : task, null);
  if (!latest?.options) return null;
  const { logDest: _logDest, id: _id, taskId: _taskId, ...options } = latest.options;
  return options;
}
async function firstBuildOptions(editor) {
  const scenes = await editor.Message.request("asset-db", "query-assets", { ccType: "cc.SceneAsset", pattern: "db://assets/**" });
  const startScene = scenes[0]?.uuid;
  if (startScene === void 0) return null;
  return await editor.Message.request("builder", "check-and-complete-options", { platform: DEFAULT_PLATFORM, startScene });
}
function messageOf(result) {
  switch (result) {
    case BUILD_SUCCESS:
      return null;
    case BUILD_BUSY:
      return "\uC774\uBBF8 \uC9C4\uD589 \uC911\uC778 \uBE4C\uB4DC\uAC00 \uC788\uC5B4\uC694. \uB05D\uB09C \uB4A4 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.";
    case BUILD_PARAM_ERROR:
      return "\uBE4C\uB4DC \uC124\uC815\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC544\uC694. \uBE4C\uB4DC \uD328\uB110\uC5D0\uC11C \uC124\uC815\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.";
    default:
      return "\uBE4C\uB4DC\uAC00 \uB05D\uB098\uC9C0 \uC54A\uC558\uC5B4\uC694. \uCF58\uC194\uC758 \uC624\uB958\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.";
  }
}
async function run(editor, zone) {
  if (!await editor.Message.request("builder", "query-worker-ready")) return "\uBE4C\uB354\uB97C \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694. \uC7A0\uC2DC \uB4A4 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.";
  const base = await lastWebBuildOptions(editor) ?? await firstBuildOptions(editor);
  if (base === null) return "\uBE4C\uB4DC\uD560 \uC52C\uC774 \uC5C6\uC5B4\uC694. \uC52C\uC744 \uC800\uC7A5\uD55C \uB4A4 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.";
  const options = { ...base, packages: { ...base.packages, [PACKAGE_NAME]: { enabled: true, zone } } };
  editor.Message.send("builder", "open", "default");
  return messageOf(await editor.Message.request("builder", "add-task", options, true));
}
async function buildAndPackage(editor, zone = DEFAULT_ZONE_ORIGIN) {
  const problem = await run(editor, zone).catch((error) => error instanceof Error ? error.message : String(error));
  if (problem !== null) await editor.Dialog.error(problem, { title: DIALOG_TITLE2 });
}
var methods = {
  buildAndPackage: () => buildAndPackage(Editor),
  buildAndPackageForLocalZone: () => buildAndPackage(Editor, LOCAL_ZONE_ORIGIN)
};
var updateNoticeTimer;
function load() {
  updateNoticeTimer = setTimeout(() => void notifyUpdate({ editor: Editor, projectDir: Editor.Project.path, version: package_default.version }), UPDATE_NOTICE_DELAY_MS);
}
function unload() {
  clearTimeout(updateNoticeTimer);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BUILD_BUSY,
  BUILD_PARAM_ERROR,
  BUILD_SUCCESS,
  LOCAL_ZONE_ORIGIN,
  buildAndPackage,
  load,
  methods,
  unload
});

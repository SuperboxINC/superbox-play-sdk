"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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

// engines/cocos-creator/superbox-play/source/builder.ts
var PACKAGE_NAME = "superbox-play";
var DEFAULT_ZONE_ORIGIN = "https://game.superboxgo.com";

// engines/cocos-creator/superbox-play/source/main.ts
var LOCAL_ZONE_ORIGIN = "http://localhost:8200";
var BUILD_PARAM_ERROR = 32;
var BUILD_SUCCESS = 36;
var BUILD_BUSY = 37;
var WEB_PLATFORMS = ["web-mobile", "web-desktop"];
var DEFAULT_PLATFORM = "web-mobile";
var DIALOG_TITLE = "Superbox Play";
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
  if (problem !== null) await editor.Dialog.error(problem, { title: DIALOG_TITLE });
}
var methods = {
  buildAndPackage: () => buildAndPackage(Editor),
  buildAndPackageForLocalZone: () => buildAndPackage(Editor, LOCAL_ZONE_ORIGIN)
};
function load() {
}
function unload() {
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

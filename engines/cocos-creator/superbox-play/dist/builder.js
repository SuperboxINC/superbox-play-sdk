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

// engines/cocos-creator/superbox-play/source/builder.ts
var builder_exports = {};
__export(builder_exports, {
  DEFAULT_ZONE_ORIGIN: () => DEFAULT_ZONE_ORIGIN,
  PACKAGE_NAME: () => PACKAGE_NAME,
  configs: () => configs,
  isAcceptableZone: () => isAcceptableZone,
  readBuildOptions: () => readBuildOptions
});
module.exports = __toCommonJS(builder_exports);
var PACKAGE_NAME = "superbox-play";
var DEFAULT_ZONE_ORIGIN = "https://game.superboxgo.com";
var LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1|[^/]+\.localhost)(:\d+)?$/;
var HTTPS_ORIGIN = /^https:\/\/[^/\s]+$/;
function isAcceptableZone(value) {
  return typeof value === "string" && (HTTPS_ORIGIN.test(value) || LOCAL_HTTP.test(value));
}
function readBuildOptions(packages) {
  const raw = packages?.[PACKAGE_NAME] ?? {};
  return {
    enabled: raw.enabled !== false,
    zone: typeof raw.zone === "string" && raw.zone ? raw.zone : DEFAULT_ZONE_ORIGIN
  };
}
var OPTIONS = {
  enabled: {
    label: "\uC288\uD37C\uBC15\uC2A4 \uD50C\uB808\uC774 \uD328\uD0A4\uC9C0 \uB9CC\uB4E4\uAE30",
    description: "\uBE4C\uB4DC\uAC00 \uB05D\uB098\uBA74 build \uD3F4\uB354 \uC606\uC5D0 .sbp\uB97C \uB9CC\uB4E4\uC5B4\uC694.",
    default: true,
    render: { ui: "ui-checkbox" }
  },
  zone: {
    label: "\uAC8C\uC784\uC874 \uC8FC\uC18C",
    description: "\uAE30\uBCF8\uC740 \uC6B4\uC601 \uAC8C\uC784\uC874\uC774\uC5D0\uC694. \uB85C\uCEEC\uC5D0\uC11C \uD14C\uC2A4\uD2B8\uD558\uB824\uBA74 http://localhost:8200\uC744 \uB123\uC5B4 \uC8FC\uC138\uC694.",
    default: DEFAULT_ZONE_ORIGIN,
    render: { ui: "ui-input", attributes: { placeholder: DEFAULT_ZONE_ORIGIN } },
    verifyRules: ["superboxZone"]
  }
};
var VERIFY_RULES = {
  superboxZone: {
    message: "https://\uD638\uC2A4\uD2B8 \uD615\uC2DD\uC774\uC5B4\uC57C \uD574\uC694. http\uB294 localhost\uB9CC \uC4F8 \uC218 \uC788\uC5B4\uC694.",
    func: (value) => isAcceptableZone(value)
  }
};
var PLATFORM_CONFIG = { hooks: "./hooks", options: OPTIONS, verifyRuleMap: VERIFY_RULES };
var configs = {
  "web-mobile": PLATFORM_CONFIG,
  "web-desktop": PLATFORM_CONFIG
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_ZONE_ORIGIN,
  PACKAGE_NAME,
  configs,
  isAcceptableZone,
  readBuildOptions
});

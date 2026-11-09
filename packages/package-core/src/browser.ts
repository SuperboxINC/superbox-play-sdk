/**
 * `@superbox-play/package/browser` — 콘솔 웹이 쓰는 진입. Node API 가 하나도 없다(시험이 대조한다).
 * 파일 고르기 → `readPackage(file)` → 항목마다 `slice()` 를 presigned PUT 으로.
 */
export * from './content-type.ts';
export * from './encoding.ts';
export * from './errors.ts';
export * from './limits.ts';
export * from './manifest.ts';
export * from './reader.ts';

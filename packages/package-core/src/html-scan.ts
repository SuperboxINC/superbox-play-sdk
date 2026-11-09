/**
 * 입구 문서의 태그 위치만 찾는 작은 스캐너 — 문서를 다시 쓰지 않고 그 자리에 끼워 넣기 위해 원문 위치가 필요하다.
 * 주석 · doctype · 스크립트 안의 `<body>` 같은 글자에 속지 않는다. `<template>` · `<noscript>` 안은 inert 로 표시한다.
 */
export interface HtmlAttr {
  readonly name: string;
  readonly value: string;
  /** 값의 원문 위치(따옴표 제외) — 값이 없으면 -1. */
  readonly valueStart: number;
  readonly valueEnd: number;
}

export interface HtmlTag {
  readonly name: string;
  readonly closing: boolean;
  /** `<` 위치. */
  readonly start: number;
  /** `>` 다음 위치. */
  readonly end: number;
  readonly attrs: readonly HtmlAttr[];
  readonly inert: boolean;
}

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes']);
const INERT = new Set(['template', 'noscript']);
const NAME_START = /[A-Za-z]/;
const SPACE = /[\s]/;

function skipSpace(html: string, from: number): number {
  let at = from;
  while (at < html.length && SPACE.test(html[at] as string)) at += 1;
  return at;
}

function readAttr(html: string, from: number): { readonly attr: HtmlAttr; readonly next: number } {
  let at = from;
  while (at < html.length && !SPACE.test(html[at] as string) && !'=>/'.includes(html[at] as string)) at += 1;
  // `=` 로 시작하는 틀린 이름도 앞으로 나아가게 한 글자는 먹는다
  if (at === from) at += 1;
  const name = html.slice(from, at).toLowerCase();
  let cursor = skipSpace(html, at);
  if (html[cursor] !== '=') return { attr: { name, value: '', valueStart: -1, valueEnd: -1 }, next: at };
  cursor = skipSpace(html, cursor + 1);
  const quote = html[cursor];
  if (quote === '"' || quote === "'") {
    const valueStart = cursor + 1;
    const close = html.indexOf(quote, valueStart);
    const valueEnd = close === -1 ? html.length : close;
    return { attr: { name, value: html.slice(valueStart, valueEnd), valueStart, valueEnd }, next: close === -1 ? html.length : close + 1 };
  }
  const valueStart = cursor;
  while (cursor < html.length && !SPACE.test(html[cursor] as string) && html[cursor] !== '>') cursor += 1;
  return { attr: { name, value: html.slice(valueStart, cursor), valueStart, valueEnd: cursor }, next: cursor };
}

function readTagBody(html: string, from: number): { readonly attrs: readonly HtmlAttr[]; readonly end: number } {
  const attrs: HtmlAttr[] = [];
  let at = from;
  while (at < html.length) {
    at = skipSpace(html, at);
    if (html[at] === '>') return { attrs, end: at + 1 };
    if (html[at] === '/') {
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

function findRawClose(html: string, name: string, from: number): number {
  const pattern = new RegExp(`</${name}(?=[\\s/>])`, 'gi');
  pattern.lastIndex = from;
  return pattern.exec(html)?.index ?? html.length;
}

export function scanTags(html: string): readonly HtmlTag[] {
  const tags: HtmlTag[] = [];
  let inertDepth = 0;
  let at = 0;
  while (at < html.length) {
    const lt = html.indexOf('<', at);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      at = close === -1 ? html.length : close + 3;
      continue;
    }
    const next = html[lt + 1];
    if (next === '!' || next === '?') {
      const close = html.indexOf('>', lt);
      at = close === -1 ? html.length : close + 1;
      continue;
    }
    const closing = next === '/';
    const nameStart = lt + (closing ? 2 : 1);
    if (!NAME_START.test(html[nameStart] ?? '')) {
      at = lt + 1;
      continue;
    }
    let nameEnd = nameStart;
    while (nameEnd < html.length && !SPACE.test(html[nameEnd] as string) && !'/>'.includes(html[nameEnd] as string)) nameEnd += 1;
    const name = html.slice(nameStart, nameEnd).toLowerCase();
    const { attrs, end } = readTagBody(html, nameEnd);

    if (closing && INERT.has(name)) inertDepth = Math.max(0, inertDepth - 1);
    tags.push({ name, closing, start: lt, end, attrs, inert: inertDepth > 0 });
    if (!closing && INERT.has(name)) inertDepth += 1;
    at = !closing && RAW_TEXT.has(name) ? findRawClose(html, name, end) : end;
  }
  return tags;
}

export function attrValue(tag: HtmlTag, name: string): string | null {
  return tag.attrs.find((attr) => attr.name === name)?.value ?? null;
}

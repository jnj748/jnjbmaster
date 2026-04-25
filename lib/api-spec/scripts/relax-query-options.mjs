#!/usr/bin/env node
// orval 코드젠 후처리:
//   orval react-query 어댑터가 생성하는 hook 시그니처는
//     options?: { query?: UseQueryOptions<TData, TError, TData>; ... }
//   인데, react-query v5 의 UseQueryOptions 는 `queryKey` 와 `queryFn` 이
//   필수다. 정작 hook 본체는 `getXxxQueryOptions(params, options)` 가
//   queryKey/queryFn 을 자동으로 채워 react-query 에 넘기므로 사용처에서는
//   queryKey/queryFn 을 줄 필요가 없다. 하지만 type 시그니처가 그대로 노출되어
//   `useFoo(params, { query: { enabled: true } })` 같은 호출이 모두 TS2741
//   ("Property 'queryKey' is missing") 로 깨진다.
//
// 이 스크립트는 codegen 직후 generated/api.ts 에서 hook 옵션의
//   `query?: UseQueryOptions<...>;`        → `query?: Partial<UseQueryOptions<...>>;`
//   `query?: UseInfiniteQueryOptions<...>;` → `query?: Partial<UseInfiniteQueryOptions<...>>;`
// 형태로 wrap 해 사용처가 부분 옵션만 넘길 수 있게 만든다.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiTsPath = path.resolve(
  here,
  "..",
  "..",
  "api-client-react",
  "src",
  "generated",
  "api.ts",
);

let src = await readFile(apiTsPath, "utf8");

// 패턴: `query?: UseQueryOptions<TData, TError, TData>;\n    request?:`
// 또는 `query?: UseInfiniteQueryOptions<...>;` (mode: split 가 아닌 단일 파일이므로 안전).
// generic body 는 줄바꿈이 포함되므로 [\s\S]+? 로 비탐욕 매칭.
const pattern =
  /query\?: (UseQueryOptions|UseInfiniteQueryOptions)<([\s\S]+?)>;\n(\s+)request\?:/g;

let count = 0;
src = src.replace(pattern, (_m, kind, generics, indent) => {
  count += 1;
  return `query?: Partial<${kind}<${generics}>>;\n${indent}request?:`;
});

await writeFile(apiTsPath, src);
console.log(
  `[relax-query-options] wrapped ${count} hook query options in Partial<>`,
);

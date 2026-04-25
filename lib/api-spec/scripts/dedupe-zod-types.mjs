#!/usr/bin/env node
// orval 코드젠 후처리:
//   lib/api-zod/src/generated/api.ts 에는 zod 런타임 스키마(`export const X = ...`)가
//   생성되고, lib/api-zod/src/generated/types/ 에는 같은 이름의 TypeScript interface
//   (`export interface X { ... }`) 가 생성된다. orval v8.5 에서 이 둘이 같은
//   namespace 로 export 되면 `export *` 시 ambiguity 가 발생해 빌드가 깨진다.
//   (zod 추론 타입과 interface 가 같은 이름의 type 별칭이 되기 때문.)
//
// 이 스크립트는 codegen 직후 실행되어, types/index.ts 의 `export * from "./xxx"`
// 줄 중 api.ts 와 이름이 충돌하는 항목을 제거한다. 사용처는 zod 스키마(api.ts)에서
// 같은 이름을 import 하면 z.infer 추론 타입을 그대로 받을 수 있어 호환된다.
//
// types/<file>.ts 한 파일에는 한 export 만 들어있다는 orval split mode 의 특성을
// 가정한다 (검증된 사실).

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.resolve(here, "..", "..", "api-zod", "src", "generated");

const apiTs = await readFile(path.join(generatedDir, "api.ts"), "utf8");
const apiNames = new Set(
  [...apiTs.matchAll(/^export const (\w+)/gm)].map((m) => m[1]),
);

const typesIndexPath = path.join(generatedDir, "types", "index.ts");
const typesIndex = await readFile(typesIndexPath, "utf8");

let removedCount = 0;
const filtered = typesIndex
  .split("\n")
  .filter((line) => {
    const m = line.match(/^export \* from "\.\/(\w+)"/);
    if (!m) return true;
    const fileBase = m[1];
    const pascalName = fileBase.charAt(0).toUpperCase() + fileBase.slice(1);
    if (apiNames.has(pascalName)) {
      removedCount += 1;
      return false;
    }
    return true;
  })
  .join("\n");

await writeFile(typesIndexPath, filtered);
console.log(
  `[dedupe-zod-types] removed ${removedCount} duplicate re-export(s) from generated/types/index.ts`,
);

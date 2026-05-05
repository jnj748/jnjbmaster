// [Task #868] LLM 이 깨진 JSON 을 돌려줬을 때 1회 자동 재시도하는 공용 헬퍼.
//   - 첫 파싱 시도 → 실패 → retry() 로 LLM 한 번 더 호출 → 두 번째 파싱.
//   - 두 번째도 실패하면 사용자에게는 한국어 단문 메시지로 던지고, 원본
//     stack trace 는 logger.warn 으로만 남긴다.
//   - 순환 import 를 피하려고 ocrPipeline.ts 와 분리했다 (logger 만 의존).

import { logger } from "./logger";

export class OcrJsonRetryError extends Error {
  constructor(message = "자료 인식이 일시적으로 실패했어요. 다시 업로드해 주세요") {
    super(message);
    this.name = "OcrJsonRetryError";
  }
}

export async function parseJsonWithRetry<T>(opts: {
  initialText: string;
  parser: (text: string) => T;
  /** 두 번째 LLM 호출. 프롬프트에 "JSON only" 강조 부탁. */
  retry: () => Promise<string>;
  caller: string;
}): Promise<T> {
  try {
    return opts.parser(opts.initialText);
  } catch (firstErr) {
    let retryText: string;
    try {
      retryText = await opts.retry();
    } catch (retryErr) {
      logger.warn(
        { err: retryErr, firstErr, caller: opts.caller },
        "JSON 재시도 LLM 호출 자체 실패",
      );
      throw new OcrJsonRetryError();
    }
    try {
      return opts.parser(retryText);
    } catch (secondErr) {
      logger.warn(
        {
          err: secondErr,
          firstErr,
          caller: opts.caller,
          initial: opts.initialText.slice(0, 400),
          retry: retryText.slice(0, 400),
        },
        "JSON 재시도 파싱도 실패",
      );
      throw new OcrJsonRetryError();
    }
  }
}

/** 두 번째 호출에서 LLM 에 덧붙이는 강조 프롬프트. */
export const JSON_RETRY_HINT =
  "직전 응답이 JSON 으로 파싱되지 않았습니다. 반드시 JSON 객체 하나만, 코드펜스/설명/잡문 없이 다시 출력하세요.";

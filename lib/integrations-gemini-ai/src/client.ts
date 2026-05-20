import { GoogleGenAI } from "@google/genai";

// [Task #870] Replit Integrations Gemini → 본인 무료 티어 API 키 직접 사용 전환.
//   우선순위: GEMINI_API_KEY_FREE (사장님 본인 무료 키)
//             > GEMINI_API_KEY (일반 키)
//             > AI_INTEGRATIONS_GEMINI_API_KEY (Replit Integrations 호환 폴백)
//   무료 티어는 공개 엔드포인트(generativelanguage.googleapis.com)를 그대로
//   쓰면 되므로 baseUrl 을 커스텀하지 않는다.
const apiKey =
  process.env.GEMINI_API_KEY_FREE ||
  process.env.GEMINI_API_KEY ||
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY_FREE (또는 GEMINI_API_KEY) 가 설정되지 않았습니다. Replit Secrets 에 등록해 주세요.",
  );
}

// Replit Integrations 폴백을 사용하는 경우에만 커스텀 baseUrl 을 적용.
const usingReplitProxy =
  !process.env.GEMINI_API_KEY_FREE &&
  !process.env.GEMINI_API_KEY &&
  !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

export const ai = new GoogleGenAI({
  apiKey,
  ...(usingReplitProxy
    ? {
        httpOptions: {
          apiVersion: "",
          baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
        },
      }
    : {}),
});

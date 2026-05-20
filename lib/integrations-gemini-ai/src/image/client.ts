import { GoogleGenAI, Modality } from "@google/genai";

// [Task #870] 본인 무료 티어 API 키 직접 사용. 자세한 우선순위는 ../client.ts 참고.
const apiKey =
  process.env.GEMINI_API_KEY_FREE ||
  process.env.GEMINI_API_KEY ||
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

if (!apiKey) {
  throw new Error(
    "GEMINI_API_KEY_FREE (또는 GEMINI_API_KEY) 가 설정되지 않았습니다. Replit Secrets 에 등록해 주세요.",
  );
}

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

export async function generateImage(
  prompt: string
): Promise<{ b64_json: string; mimeType: string }> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

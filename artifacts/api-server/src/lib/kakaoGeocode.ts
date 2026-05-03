// [Task #740 가입흐름재설정] 카카오 로컬 API 도로명 → 좌표 변환 헬퍼.
//   라우트(routes/kakaoGeocode.ts) 와 가입 라우트(routes/vendors.ts onboarding)에서
//   동일 로직으로 호출하기 위해 분리. 시크릿(KAKAO_REST_API_KEY) 미설정/응답 오류는
//   조용히 null 반환 — 호출자가 자동 백필이면 진행을 막지 않고 응답이면 502 처리.
import { logger } from "./logger";

export interface KakaoGeocodeResult {
  lat: number;
  lng: number;
  addressRoad: string | null;
  addressJibun: string | null;
}

interface KakaoLocalDocument {
  x: string;
  y: string;
  road_address?: { address_name?: string } | null;
  address?: { address_name?: string } | null;
}

interface KakaoLocalResponse {
  documents?: KakaoLocalDocument[];
}

export async function geocodeKakaoAddress(query: string): Promise<KakaoGeocodeResult | null> {
  const trimmed = (query ?? "").trim();
  if (!trimmed) return null;
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    logger.warn("[Task #740] kakao geocode skipped — KAKAO_REST_API_KEY missing");
    return null;
  }
  try {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(trimmed)}`;
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
    if (!r.ok) {
      logger.warn({ status: r.status, query: trimmed }, "[Task #740] kakao geocode http error");
      return null;
    }
    const data = (await r.json()) as KakaoLocalResponse;
    const doc = data?.documents?.[0];
    if (!doc) return null;
    const lng = Number(doc.x);
    const lat = Number(doc.y);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      addressRoad: doc.road_address?.address_name ?? null,
      addressJibun: doc.address?.address_name ?? null,
    };
  } catch (err) {
    logger.error({ err, query: trimmed }, "[Task #740] kakao geocode threw");
    return null;
  }
}

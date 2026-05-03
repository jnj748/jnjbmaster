// [Task #740 가입흐름재설정] 카카오 로컬 API 도로명 → 좌표 변환 프록시.
//   가입 위저드 4단계(사업장 주소·반경) 에서 사장님이 도로명 주소를 입력하면
//   이 라우트로 위·경도(lat/lng) 를 받아와 vendor 행에 저장한다.
//
//   이 프록시가 필요한 이유:
//     1) 카카오 REST API 키(KAKAO_REST_API_KEY)는 서버 시크릿 — 클라이언트 노출 금지.
//     2) 카카오 dapi.kakao.com 은 CORS 응답을 안 주므로 브라우저 직접 호출 시 실패.
//   인증 토큰(`req.user`)이 있는 사용자만 호출 가능 — authMiddleware 가 routes/index.ts
//   상위에서 적용된다.
import { Router, type Request, type Response } from "express";

const router: Router = Router();

interface KakaoLocalDocument {
  x: string; // longitude
  y: string; // latitude
  road_address?: { address_name?: string } | null;
  address?: { address_name?: string } | null;
}

interface KakaoLocalResponse {
  documents?: KakaoLocalDocument[];
}

router.get("/kakao/geocode", async (req: Request, res: Response): Promise<void> => {
  const query = typeof req.query?.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: "query 파라미터가 필요합니다" });
    return;
  }
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "지오코딩이 일시적으로 비활성화되어 있습니다" });
    return;
  }

  try {
    const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}`;
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
    if (!r.ok) {
      req.log?.warn?.({ status: r.status, query }, "[Task #740] kakao geocode failed");
      res.status(502).json({ error: "주소 변환 실패 — 잠시 후 다시 시도해 주세요" });
      return;
    }
    const data = (await r.json()) as KakaoLocalResponse;
    const doc = data?.documents?.[0];
    if (!doc) {
      res.json({ found: false });
      return;
    }
    const lng = Number(doc.x);
    const lat = Number(doc.y);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.json({ found: false });
      return;
    }
    res.json({
      found: true,
      lat,
      lng,
      addressRoad: doc.road_address?.address_name ?? null,
      addressJibun: doc.address?.address_name ?? null,
    });
  } catch (err) {
    req.log?.error?.({ err, query }, "[Task #740] kakao geocode threw");
    res.status(502).json({ error: "주소 변환 중 오류가 발생했습니다" });
  }
});

export default router;

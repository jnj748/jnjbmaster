// [Task #740 가입흐름재설정] 카카오 로컬 API 도로명 → 좌표 변환 프록시.
//   가입 위저드 4단계(사업장 주소·반경) 에서 사장님이 도로명 주소를 입력하면
//   이 라우트로 위·경도(lat/lng) 를 받아와 vendor 행에 저장한다.
//
//   이 프록시가 필요한 이유:
//     1) 카카오 REST API 키(KAKAO_REST_API_KEY)는 서버 시크릿 — 클라이언트 노출 금지.
//     2) 카카오 dapi.kakao.com 은 CORS 응답을 안 주므로 브라우저 직접 호출 시 실패.
//   인증 토큰(`req.user`)이 있는 사용자만 호출 가능 — authMiddleware 가 routes/index.ts
//   상위에서 적용된다.
//
//   [Task #740 T6] 실 변환 로직은 lib/kakaoGeocode.ts 헬퍼 로 분리되어, onboarding
//   라우트의 자동 좌표 백필과 동일한 코드 경로를 공유한다.
import { Router, type Request, type Response } from "express";
import { geocodeKakaoAddress } from "../lib/kakaoGeocode";

const router: Router = Router();

router.get("/kakao/geocode", async (req: Request, res: Response): Promise<void> => {
  const query = typeof req.query?.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: "query 파라미터가 필요합니다" });
    return;
  }
  if (!process.env.KAKAO_REST_API_KEY) {
    res.status(503).json({ error: "지오코딩이 일시적으로 비활성화되어 있습니다" });
    return;
  }
  const result = await geocodeKakaoAddress(query);
  if (!result) {
    // 빈 결과(주소 못 찾음) 와 외부 오류를 라우트 단에서 구분하기 어렵지만,
    // 사용자 입장에서는 "찾지 못함" 으로 안내하는 게 가장 자연스럽다.
    res.json({ found: false });
    return;
  }
  res.json({ found: true, ...result });
});

export default router;

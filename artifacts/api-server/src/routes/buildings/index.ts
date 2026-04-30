// [Task #496] buildings 라우터 분리 진입점.
//   원본 단일 파일 routes/buildings.ts (1,606줄) 을 도메인별 9개 파일로 분리하면서
//   외부 import 경로(`./buildings`)·엔드포인트 path/method/응답·미들웨어 적용 순서를
//   그대로 보존한다. routes/index.ts 의 `import buildingsRouter from "./buildings"`
//   는 이 디렉터리의 index.ts (= 본 파일) 를 가리킨다.
//
// 마운트 패턴:
//   1. 부모 라우터에 `router.use("/buildings", requireRole(...))` 를 먼저 등록하여
//      모든 /buildings/* 요청에 인증/권한 검사를 일괄 적용한다 (원본 line 51 동일).
//   2. 각 도메인 라우터를 `router.use(subRouter)` (prefix 없이) 로 마운트한다.
//      sub-router 핸들러들은 원본과 동일하게 풀 경로(`/buildings/...`) 로 등록되어
//      있으므로 URL 매칭 결과는 1:1 동일하다.
//   3. 외부에서 import 하던 공개 심볼은 duplicates.ts 에서 그대로 re-export 해
//      `routes/buildings` 모듈의 공개 API 표면을 보존한다 (facilitySignupRequests.ts).
import { Router, type IRouter } from "express";
import { requireRole } from "../../middlewares/auth";

import listRouter from "./list";
import duplicatesRouter from "./duplicates";
import seedTestTasksRouter from "./seed-test-tasks";
import crudRouter from "./crud";
import registerLookupRouter from "./register-lookup";
import unitsImportRouter from "./units-import";
import ownerLookupRouter from "./owner-lookup";
import safetyRouter from "./safety";
import inspectionsRouter from "./inspections";
import addressLockRouter from "./address-lock";
// [Task #651] 시설·경리 위저드 "담당자 확인" 단계 조회 엔드포인트.
import responsibleStaffRouter from "./responsible-staff";

const router: IRouter = Router();
router.use("/buildings", requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff"));

router.use(listRouter);
router.use(duplicatesRouter);
router.use(seedTestTasksRouter);
router.use(crudRouter);
router.use(registerLookupRouter);
router.use(unitsImportRouter);
router.use(ownerLookupRouter);
router.use(safetyRouter);
router.use(inspectionsRouter);
router.use(addressLockRouter);
router.use(responsibleStaffRouter);

// [Task #496] 외부 라우터(facilitySignupRequests.ts) 가 import 하는 공개 심볼.
//   routes/buildings 모듈의 기존 공개 표면을 그대로 유지한다.
export {
  BUILDING_DUPLICATE_MESSAGE,
  isDuplicateCheckRole,
  findExistingActiveUserForAddress,
  type DuplicateCheckRole,
} from "./duplicates";

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import oauthRouter from "./oauth";
import tasksRouter from "./tasks";
import inspectionsRouter from "./inspections";
import taxSchedulesRouter from "./taxSchedules";
import vendorsRouter from "./vendors";
// [S1 스마트견적] 파트너 스마트견적 가입/일일한도 — /me/vendor/smart-quote.
import vendorSmartQuoteRouter from "./vendorSmartQuote";
import vendorReviewsRouter from "./vendorReviews";
import commissionsRouter from "./commissions";
import dashboardRouter from "./dashboard";
import draftsRouter from "./drafts";
import tenantsRouter from "./tenants";
import ownersRouter from "./owners";
import vehiclesRouter from "./vehicles";
import notificationsRouter from "./notifications";
import documentChecklistsRouter from "./documentChecklists";
import usersRouter from "./users";
import approvalsRouter from "./approvals";
import { authMiddleware, requireRole, approvalGateMiddleware } from "../middlewares/auth";
import rfqsRouter from "./rfqs";
import rfqMessagesRouter from "./rfqMessages";
import rfqSiteVisitsRouter from "./rfqSiteVisits";
import quotesRouter from "./quotes";
import workReportsRouter from "./workReports";
import settlementsRouter from "./settlements";
import safetyChecklistsRouter from "./safetyChecklists";
// [Task #650] 안전점검표 템플릿(본사 관리 + 사용자 묶음) — buildingRouter 안에 마운트.
import safetyChecklistTemplatesRouter from "./safetyChecklistTemplates";
import maintenanceLogsRouter from "./maintenanceLogs";
import safetyTrainingsRouter from "./safetyTrainings";
import facilityDashboardRouter from "./facilityDashboard";
import facilityTasksRouter from "./facilityTasks";
import approvalStepsRouter from "./approvalSteps";
// [Task #611] 결재 라인(파이프라인) — 임계 금액 / 서명본 / 지출결의서 / 입금요청서.
import approvalPipelineRouter from "./approvalPipeline";
import signaturesRouter from "./signatures";
import documentTemplatesRouter from "./documentTemplates";
import reportSystemRouter from "./reportSystem";
import privacyRouter from "./privacy";
import taxDeadlineChecklistsRouter from "./taxDeadlineChecklists";
import attendanceRouter from "./attendance";
import alertActionsRouter from "./alertActions";
import externalDocumentsRouter from "./externalDocuments";
import buildingsRouter from "./buildings";
import calendarRouter from "./calendar";
import storageRouter from "./storage";
import unitsRouter from "./units";
import buildingSettingsRouter from "./buildingSettings";
import tenantCardTokensRouter from "./tenantCardTokens";
import managementContractTemplatesRouter from "./managementContractTemplates";
import publicTenantCardRouter from "./publicTenantCard";
import metersRouter from "./meters";
// [Task #798] 한전 송신 — meters 와 동일한 building-scoped 라우터에 마운트.
import kepcoTransmissionsRouter from "./kepcoTransmissions";
import feesRouter from "./fees";
// [Task #777] 부과엔진 v01 — /billing/* 신규 라우트.
import billingRouter from "./billing";
// [Task #799] 부과관리 풀세트 — /billing-items, /billing-late-fee-rates 등.
import billingFullSetRouter from "./billingFullSet";
// [Task #779] 고지·수납엔진 v01 — /bills/*, /bank-tx/* 신규 라우트.
import billsRouter, { publicBillsRouter } from "./bills";
// [Task #800] 수납·미납 관리 풀세트 — /receivables/*.
import receivablesFullSetRouter from "./receivablesFullSet";
import complaintsRouter, { handleComplaintAnalytics } from "./complaints";
import votesRouter from "./votes";
import delinquencyRouter from "./delinquency";
import warrantiesRouter from "./warranties";
import platformConsentsRouter from "./platformConsents";
import platformConsentDocumentsRouter from "./platformConsentDocuments";
import platformAnnouncementsRouter from "./platformAnnouncements";
import platformCampaignsRouter from "./platformCampaigns";
import platformKnowledgeDocsRouter from "./platformKnowledgeDocs";
import creditsRouter from "./credits";
import buildingNoticeTemplatesRouter from "./buildingNoticeTemplates";
import referralsRouter from "./referrals";
import hqAssignmentsRouter from "./hqAssignments";
import noticeLayoutRouter from "./noticeLayout";
import platformSettingsRouter from "./platformSettings";
import roleMenuOverridesRouter from "./roleMenuOverrides";
import contractsRouter, { partnerContractsRouter } from "./contracts";
import aiAssistantRouter from "./aiAssistant";
import onboardingRouter from "./onboarding";
import vendorCategoriesRouter from "./vendorCategories";
// [Task #740 가입흐름재설정] 가입 위저드 4단계(사업장 주소·반경) 의 카카오 지오코딩 프록시.
import kakaoGeocodeRouter from "./kakaoGeocode";
import accountingInitialFilesRouter from "./accountingInitialFiles";
import accountingRouter from "./accounting";
import accountingMasterRouter from "./accountingMaster";
import facilitySignupRequestsRouter from "./facilitySignupRequests";
import buildingRecordsRouter from "./buildingRecords";
// [Task #776] 예산·집행통제 엔진 v01.
import budgetsRouter, { registerBudgetExecutionListener } from "./budgets";
import workLogsRouter from "./workLogs";
import memoOcrRouter from "./memoOcr";
import taskTemplatesRouter from "./taskTemplates";
import usageAnalyticsRouter from "./usageAnalytics";
// [Task #610] 통합 문서 레지스트리 + 공고문 산출물 등록 라우트.
import documentsRouter from "./documents";
// [Task #774] OCR/문서엔진 v01 — 단일 ingest 파이프라인.
import documentIngestRouter from "./documentIngest";
// [Task #780] T9 마감·보고엔진 v01 — 게이트/잠금/스냅샷/표준보고.
import closingsRouter from "./closings";
// [Task #803] 결산·세무 모듈 — 결산보고 7종 + 세금계산서 도메인.
import closingReportsRouter from "./closingReports";
import taxInvoicesRouter from "./taxInvoices";
import noticeOutputsRouter from "./noticeOutputs";
// [Task #761] 플랫폼 레벨 AI — 포트폴리오 이상치 위젯용 라우트.
import portfolioAnomaliesRouter from "./portfolioAnomalies";
// [Task #781] T10 외부연동 엔진 — /dispatch/* (popbill 발송이력·재시도·설정).
import dispatchRouter from "./dispatch";
// [Task #758] 게스트 전자서명 — 비인증 공개 라우트 + 인증 매니저 라우트.
import guestSignaturesRouter, { publicGuestSignaturesRouter } from "./guestSignatures";
// [Task #773] 권한·감사로그 엔진 — 변경계 도메인 액션의 단일 조회/CSV 내보내기.
import auditLogsRouter from "./auditLogs";
// [Task #797] 입주자관리 부가 기능 — 키 발급/회수/중간정산/개인정보접근/전입전출/장기수선.
import residentsExtrasRouter from "./residentsExtras";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(oauthRouter);
router.use(storageRouter);
router.use(publicTenantCardRouter);
// [Task #779] 입주민 납부 링크 — 비인증 진입.
router.use(publicBillsRouter);
// [Task #758] 게스트 전자서명 공개 엔드포인트 — authMiddleware 앞에 마운트.
router.use(publicGuestSignaturesRouter);

// [Task #133] Public GET for active docs is mounted before authMiddleware (and
// before platformConsentsRouter, which applies authMiddleware globally on its
// own sub-router) so signup screens can fetch them without a session.
// Admin endpoints inside platformConsentDocumentsRouter enforce auth themselves.
router.use(platformConsentDocumentsRouter);
router.use(platformConsentsRouter);

router.use(authMiddleware);
// [Task #132] 시설기사 가입 승인 전이라면 화이트리스트 외 모든 API를 차단.
router.use(approvalGateMiddleware);

router.get("/complaints/analytics", requireRole("hq_executive", "platform_admin"), handleComplaintAnalytics);
// [Task #339] vendorReviewsRouter must be mounted BEFORE vendorsRouter:
// vendors.ts has a `router.use("/vendors", requireRole(...))` middleware that
// rejects partner requests (including legitimate /vendors/:id/reviews access).
// Mounting reviews first lets that route resolve before reaching the gate.
router.use(vendorReviewsRouter);
router.use(vendorsRouter);
router.use(vendorSmartQuoteRouter);
router.use(commissionsRouter);
router.use(notificationsRouter);
router.use(platformAnnouncementsRouter);
router.use(platformCampaignsRouter);
router.use(platformKnowledgeDocsRouter);
router.use(usersRouter);
router.use(rfqsRouter);
// [Task #612] 비교견적 메시지/현장방문 라우터: 매니저+파트너 양쪽이 사용하므로
//   buildingRouter(파트너 차단) 앞에 마운트한다.
router.use(rfqMessagesRouter);
router.use(rfqSiteVisitsRouter);
router.use(creditsRouter);
router.use(buildingNoticeTemplatesRouter);
router.use(referralsRouter);
router.use(hqAssignmentsRouter);
router.use(noticeLayoutRouter);
router.use(platformSettingsRouter);
router.use(portfolioAnomaliesRouter);
// [Task #781] /dispatch/* — buildingRouter 밖, 본인 building scope 는 라우터 내부에서.
router.use(dispatchRouter);
router.use(roleMenuOverridesRouter);
router.use(taskTemplatesRouter);
router.use(usageAnalyticsRouter);
// [Task #284] vendorCategoriesRouter는 partner 위저드에서 접근해야 하므로
// 파트너 역할을 차단하는 buildingRouter(buildingOnly) 보다 먼저 마운트한다.
router.use(vendorCategoriesRouter);
// [Task #740 가입흐름재설정] 카카오 도로명 → 좌표 변환 프록시. authMiddleware 가
//   상위에서 적용되므로 인증된 사용자(가입 위저드 진행 중인 partner) 만 접근 가능.
router.use(kakaoGeocodeRouter);
// [Task #335] quotesRouter는 자체적으로 manager/partner 권한을 검증하므로
// 파트너가 견적을 제출할 수 있도록 buildingRouter(파트너 차단) 앞에 마운트한다.
router.use(quotesRouter);
// [Task #335] 파트너의 "계약 내용에 동의" 인앱 액션은 buildingRouter 차단 전에 매핑한다.
router.use(partnerContractsRouter);

const buildingRouter: IRouter = Router();
// [Task #611] custodian(관리인)도 결재함·입금요청함 진입을 위해 buildingRouter 게이트
//   를 통과해야 한다. 라우트별 requireRole 로 세부 권한은 따로 막는다.
const buildingOnly = requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff", "custodian");
buildingRouter.use(buildingOnly);
buildingRouter.use(dashboardRouter);
buildingRouter.use(approvalsRouter);
// [Task #611] 결재 라인 파이프라인 — 임계 금액 / 서명본 / 지출결의서 / 입금요청서.
buildingRouter.use(approvalPipelineRouter);
// [Task #758] 매니저용 게스트 전자서명 발급/조회/취소/재발송.
buildingRouter.use(guestSignaturesRouter);
buildingRouter.use(tasksRouter);
buildingRouter.use(inspectionsRouter);
buildingRouter.use(taxSchedulesRouter);
buildingRouter.use(workReportsRouter);
buildingRouter.use(settlementsRouter);
buildingRouter.use(draftsRouter);
buildingRouter.use(tenantsRouter);
buildingRouter.use(ownersRouter);
buildingRouter.use(vehiclesRouter);
buildingRouter.use(documentChecklistsRouter);
buildingRouter.use(approvalStepsRouter);
buildingRouter.use(signaturesRouter);
buildingRouter.use(documentTemplatesRouter);
buildingRouter.use(reportSystemRouter);
buildingRouter.use(safetyChecklistsRouter);
buildingRouter.use(safetyChecklistTemplatesRouter);
buildingRouter.use(maintenanceLogsRouter);
buildingRouter.use(safetyTrainingsRouter);
buildingRouter.use(facilityDashboardRouter);
buildingRouter.use(facilityTasksRouter);
buildingRouter.use(privacyRouter);
buildingRouter.use(taxDeadlineChecklistsRouter);
buildingRouter.use(attendanceRouter);
buildingRouter.use(alertActionsRouter);
buildingRouter.use(externalDocumentsRouter);
buildingRouter.use(buildingsRouter);
buildingRouter.use(unitsRouter);
// [Task #796] XpBIZ 환경설정 풀세트.
buildingRouter.use(buildingSettingsRouter);
buildingRouter.use(calendarRouter);
buildingRouter.use(tenantCardTokensRouter);
buildingRouter.use(managementContractTemplatesRouter);
buildingRouter.use(metersRouter);
buildingRouter.use(kepcoTransmissionsRouter);
buildingRouter.use(feesRouter);
// [Task #777] 부과엔진 v01 — fees 위에 마운트(같은 buildingRouter 가드 공유).
buildingRouter.use(billingRouter);
// [Task #799] 부과관리 풀세트 — 항목/연체율/부과월/별도부과/발송결과/총괄/AI요약.
buildingRouter.use(billingFullSetRouter);
// [Task #779] 고지·수납엔진 v01 — billing 위에 마운트.
buildingRouter.use(billsRouter);
// [Task #800] 수납·미납 관리 풀세트 — bills 위에 마운트(같은 buildingOnly 가드).
buildingRouter.use(receivablesFullSetRouter);
buildingRouter.use(complaintsRouter);
buildingRouter.use(votesRouter);
buildingRouter.use(delinquencyRouter);
buildingRouter.use(warrantiesRouter);
buildingRouter.use(contractsRouter);
buildingRouter.use(onboardingRouter);
buildingRouter.use(buildingRecordsRouter);
// [Task #780] T9 마감·보고엔진 — 같은 건물 가드(buildingOnly) 공유.
buildingRouter.use(closingsRouter);
// [Task #803] 결산보고 7종 + 세금계산서 도메인 — buildingOnly 가드 공유.
buildingRouter.use(closingReportsRouter);
buildingRouter.use(taxInvoicesRouter);
// [Task #776] 예산 편성·집행률·가드. 회계엔진 voucher.confirmed 구독은 모듈 로드 시 1회.
buildingRouter.use(budgetsRouter);
registerBudgetExecutionListener();
buildingRouter.use(workLogsRouter);
buildingRouter.use(memoOcrRouter);
// [Task #610] documents 조회 + notice_outputs 등록 — 모두 buildingRouter 안.
// [Task #774] documentIngestRouter must be mounted BEFORE documentsRouter so its
//   /documents/ingest paths are not shadowed by documents.ts /documents/:id.
buildingRouter.use(documentIngestRouter);
buildingRouter.use(documentsRouter);
buildingRouter.use(noticeOutputsRouter);
// [Task #797] 입주자관리 부가 기능 — 같은 buildingOnly 가드 공유.
buildingRouter.use(residentsExtrasRouter);
router.use(buildingRouter);

router.use(aiAssistantRouter);
router.use(accountingInitialFilesRouter);
router.use(accountingRouter);
router.use(accountingMasterRouter);
router.use(facilitySignupRequestsRouter);
// [Task #773] 감사로그 — authMiddleware 뒤(인증 사용자만), buildingRouter 밖에 둔다.
//   화면(/audit-logs) 자체는 platform_admin/hq_executive/custodian 역할별 가드를
//   라우터 내부에서 처리하므로 여기서는 단순 mount.
router.use(auditLogsRouter);

export default router;

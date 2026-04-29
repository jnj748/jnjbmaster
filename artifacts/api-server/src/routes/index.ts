import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import oauthRouter from "./oauth";
import tasksRouter from "./tasks";
import inspectionsRouter from "./inspections";
import taxSchedulesRouter from "./taxSchedules";
import vendorsRouter from "./vendors";
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
import maintenanceLogsRouter from "./maintenanceLogs";
import safetyTrainingsRouter from "./safetyTrainings";
import facilityDashboardRouter from "./facilityDashboard";
import facilityTasksRouter from "./facilityTasks";
import approvalStepsRouter from "./approvalSteps";
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
import tenantCardTokensRouter from "./tenantCardTokens";
import managementContractTemplatesRouter from "./managementContractTemplates";
import publicTenantCardRouter from "./publicTenantCard";
import metersRouter from "./meters";
import feesRouter from "./fees";
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
import accountingInitialFilesRouter from "./accountingInitialFiles";
import facilitySignupRequestsRouter from "./facilitySignupRequests";
import buildingRecordsRouter from "./buildingRecords";
import workLogsRouter from "./workLogs";
import memoOcrRouter from "./memoOcr";
import taskTemplatesRouter from "./taskTemplates";
import usageAnalyticsRouter from "./usageAnalytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(oauthRouter);
router.use(storageRouter);
router.use(publicTenantCardRouter);

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
router.use(roleMenuOverridesRouter);
router.use(taskTemplatesRouter);
router.use(usageAnalyticsRouter);
// [Task #284] vendorCategoriesRouter는 partner 위저드에서 접근해야 하므로
// 파트너 역할을 차단하는 buildingRouter(buildingOnly) 보다 먼저 마운트한다.
router.use(vendorCategoriesRouter);
// [Task #335] quotesRouter는 자체적으로 manager/partner 권한을 검증하므로
// 파트너가 견적을 제출할 수 있도록 buildingRouter(파트너 차단) 앞에 마운트한다.
router.use(quotesRouter);
// [Task #335] 파트너의 "계약 내용에 동의" 인앱 액션은 buildingRouter 차단 전에 매핑한다.
router.use(partnerContractsRouter);

const buildingRouter: IRouter = Router();
const buildingOnly = requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff");
buildingRouter.use(buildingOnly);
buildingRouter.use(dashboardRouter);
buildingRouter.use(approvalsRouter);
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
buildingRouter.use(calendarRouter);
buildingRouter.use(tenantCardTokensRouter);
buildingRouter.use(managementContractTemplatesRouter);
buildingRouter.use(metersRouter);
buildingRouter.use(feesRouter);
buildingRouter.use(complaintsRouter);
buildingRouter.use(votesRouter);
buildingRouter.use(delinquencyRouter);
buildingRouter.use(warrantiesRouter);
buildingRouter.use(contractsRouter);
buildingRouter.use(onboardingRouter);
buildingRouter.use(buildingRecordsRouter);
buildingRouter.use(workLogsRouter);
buildingRouter.use(memoOcrRouter);
router.use(buildingRouter);

router.use(aiAssistantRouter);
router.use(accountingInitialFilesRouter);
router.use(facilitySignupRequestsRouter);

export default router;

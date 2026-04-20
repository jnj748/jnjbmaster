import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import oauthRouter from "./oauth";
import tasksRouter from "./tasks";
import inspectionsRouter from "./inspections";
import taxSchedulesRouter from "./taxSchedules";
import vendorsRouter from "./vendors";
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
import quotesRouter from "./quotes";
import workReportsRouter from "./workReports";
import settlementsRouter from "./settlements";
import safetyChecklistsRouter from "./safetyChecklists";
import maintenanceLogsRouter from "./maintenanceLogs";
import safetyTrainingsRouter from "./safetyTrainings";
import facilityDashboardRouter from "./facilityDashboard";
import approvalStepsRouter from "./approvalSteps";
import signaturesRouter from "./signatures";
import documentTemplatesRouter from "./documentTemplates";
import reportSystemRouter from "./reportSystem";
import privacyRouter from "./privacy";
import taxDeadlineChecklistsRouter from "./taxDeadlineChecklists";
import attendanceRouter from "./attendance";
import alertActionsRouter from "./alertActions";
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
import creditsRouter from "./credits";
import platformSettingsRouter from "./platformSettings";
import contractsRouter from "./contracts";
import aiAssistantRouter from "./aiAssistant";
import onboardingRouter from "./onboarding";
import vendorCategoriesRouter from "./vendorCategories";
import accountingInitialFilesRouter from "./accountingInitialFiles";
import facilitySignupRequestsRouter from "./facilitySignupRequests";

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
router.use(vendorsRouter);
router.use(commissionsRouter);
router.use(notificationsRouter);
router.use(usersRouter);
router.use(rfqsRouter);
router.use(creditsRouter);
router.use(platformSettingsRouter);

const buildingRouter: IRouter = Router();
const buildingOnly = requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff");
buildingRouter.use(buildingOnly);
buildingRouter.use(dashboardRouter);
buildingRouter.use(approvalsRouter);
buildingRouter.use(tasksRouter);
buildingRouter.use(inspectionsRouter);
buildingRouter.use(taxSchedulesRouter);
buildingRouter.use(quotesRouter);
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
buildingRouter.use(privacyRouter);
buildingRouter.use(taxDeadlineChecklistsRouter);
buildingRouter.use(attendanceRouter);
buildingRouter.use(alertActionsRouter);
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
router.use(buildingRouter);

router.use(aiAssistantRouter);
router.use(vendorCategoriesRouter);
router.use(accountingInitialFilesRouter);
router.use(facilitySignupRequestsRouter);

export default router;

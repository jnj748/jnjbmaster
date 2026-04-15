import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
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
import { authMiddleware, requireRole } from "../middlewares/auth";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(publicTenantCardRouter);

router.use(authMiddleware);

router.use(vendorsRouter);
router.use(commissionsRouter);
router.use(notificationsRouter);
router.use(usersRouter);
router.use(rfqsRouter);

const allBuildingRoles = requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff");
const managerFull = requireRole("manager", "platform_admin");
const accountingRoles = requireRole("manager", "platform_admin", "accountant");
const facilityRoles = requireRole("manager", "platform_admin", "facility_staff");
const monitoringRoles = requireRole("manager", "platform_admin", "hq_executive");

const buildingRouter: IRouter = Router();
buildingRouter.use(allBuildingRoles);

buildingRouter.use(dashboardRouter);
buildingRouter.use(buildingsRouter);
buildingRouter.use(calendarRouter);
buildingRouter.use(notificationsRouter);

const accountingRouter: IRouter = Router();
accountingRouter.use(accountingRoles);
accountingRouter.use(approvalsRouter);
accountingRouter.use(approvalStepsRouter);
accountingRouter.use(signaturesRouter);
accountingRouter.use(taxSchedulesRouter);
accountingRouter.use(taxDeadlineChecklistsRouter);
accountingRouter.use(draftsRouter);
accountingRouter.use(settlementsRouter);
accountingRouter.use(quotesRouter);
accountingRouter.use(workReportsRouter);
buildingRouter.use(accountingRouter);

const facilityRouter: IRouter = Router();
facilityRouter.use(facilityRoles);
facilityRouter.use(facilityDashboardRouter);
facilityRouter.use(safetyChecklistsRouter);
facilityRouter.use(maintenanceLogsRouter);
facilityRouter.use(attendanceRouter);
buildingRouter.use(facilityRouter);

const monitoringRouter: IRouter = Router();
monitoringRouter.use(monitoringRoles);
monitoringRouter.use(inspectionsRouter);
monitoringRouter.use(safetyTrainingsRouter);
monitoringRouter.use(reportSystemRouter);
monitoringRouter.use(documentTemplatesRouter);
buildingRouter.use(monitoringRouter);

const tenantMgmtRoles = requireRole("manager", "platform_admin", "accountant");
const tenantMgmtRouter: IRouter = Router();
tenantMgmtRouter.use(tenantMgmtRoles);
tenantMgmtRouter.use(tenantsRouter);
tenantMgmtRouter.use(unitsRouter);
buildingRouter.use(tenantMgmtRouter);

const managerOnlyRouter: IRouter = Router();
managerOnlyRouter.use(managerFull);
managerOnlyRouter.use(tasksRouter);
managerOnlyRouter.use(ownersRouter);
managerOnlyRouter.use(vehiclesRouter);
managerOnlyRouter.use(documentChecklistsRouter);
managerOnlyRouter.use(privacyRouter);
managerOnlyRouter.use(alertActionsRouter);
managerOnlyRouter.use(tenantCardTokensRouter);
managerOnlyRouter.use(managementContractTemplatesRouter);
buildingRouter.use(managerOnlyRouter);

router.use(buildingRouter);

export default router;

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
import { authMiddleware } from "../middlewares/auth";
import rfqsRouter from "./rfqs";
import quotesRouter from "./quotes";
import workReportsRouter from "./workReports";
import settlementsRouter from "./settlements";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);

router.use(authMiddleware);

router.use(tasksRouter);
router.use(inspectionsRouter);
router.use(taxSchedulesRouter);
router.use(vendorsRouter);
router.use(commissionsRouter);
router.use(rfqsRouter);
router.use(quotesRouter);
router.use(workReportsRouter);
router.use(settlementsRouter);
router.use(dashboardRouter);
router.use(draftsRouter);
router.use(tenantsRouter);
router.use(ownersRouter);
router.use(vehiclesRouter);
router.use(notificationsRouter);
router.use(documentChecklistsRouter);
router.use(usersRouter);
router.use(approvalsRouter);

export default router;

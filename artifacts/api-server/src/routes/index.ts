import { Router, type IRouter } from "express";
import healthRouter from "./health";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(inspectionsRouter);
router.use(taxSchedulesRouter);
router.use(vendorsRouter);
router.use(commissionsRouter);
router.use(dashboardRouter);
router.use(draftsRouter);
router.use(tenantsRouter);
router.use(ownersRouter);
router.use(vehiclesRouter);
router.use(notificationsRouter);
router.use(documentChecklistsRouter);

export default router;

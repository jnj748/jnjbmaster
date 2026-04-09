import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tasksRouter from "./tasks";
import inspectionsRouter from "./inspections";
import taxSchedulesRouter from "./taxSchedules";
import vendorsRouter from "./vendors";
import commissionsRouter from "./commissions";
import dashboardRouter from "./dashboard";
import draftsRouter from "./drafts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tasksRouter);
router.use(inspectionsRouter);
router.use(taxSchedulesRouter);
router.use(vendorsRouter);
router.use(commissionsRouter);
router.use(dashboardRouter);
router.use(draftsRouter);

export default router;

import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// [도메인 일원화] jnjbuildingmaster.replit.app 으로 들어온 모든 API 요청을
//   정식 도메인 jnjbmaster.com 으로 301 영구 리디렉트한다. cors/pinoHttp 등
//   다른 미들웨어보다 먼저 실행되도록 가장 위에 둔다. cloud_run 배포에서는
//   원래 호스트가 X-Forwarded-Host 로 전달될 수 있으므로 두 헤더를 모두
//   확인한다.
app.use((req, res, next) => {
  const fwdHost = req.headers["x-forwarded-host"];
  const host =
    (typeof fwdHost === "string" ? fwdHost : Array.isArray(fwdHost) ? fwdHost[0] : undefined) ||
    req.headers.host ||
    "";
  if (host.startsWith("jnjbuildingmaster.replit.app")) {
    res.redirect(301, `https://jnjbmaster.com${req.originalUrl}`);
    return;
  }
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;

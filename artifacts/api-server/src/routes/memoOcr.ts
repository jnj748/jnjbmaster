import { Router, type IRouter } from "express";
import { runMemoOcr, MemoOcrInputError } from "../lib/memoOcr";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

// [Task #465] 손글씨/인쇄/포스트잇 등 현장 메모 사진을 OCR 해 평문 텍스트만
// 돌려준다. 알림 처리 다이얼로그 / 업무기록 다이얼로그의 "메모 AI입력" 버튼이
// 호출하며, 결과는 사용자가 미리보기 후 메모란에 누적한다(서버 저장은 안 함).
//
// contracts.ts 의 /contracts/ocr-preview 와 같은 ACL/권한 패턴을 따른다 —
// 업로드된 objectPath 의 READ 권한을 먼저 확인한 뒤 Gemini OCR 을 실행한다.
// 모델 호출 실패시 명시적 에러를 반환한다(자동 더미값 금지).

const router: IRouter = Router();

router.post("/memos/ocr", async (req, res): Promise<void> => {
  const { objectPath, fileName } = req.body ?? {};
  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath가 필요합니다" });
    return;
  }
  try {
    const storage = new ObjectStorageService();
    const objectFile = await storage.getObjectEntityFile(objectPath);
    const allowed = await storage.canAccessObjectEntity({
      userId: req.user?.userId ? String(req.user.userId) : undefined,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!allowed) {
      res.status(403).json({ error: "해당 파일에 접근할 권한이 없습니다" });
      return;
    }
  } catch {
    res.status(404).json({ error: "파일을 찾지 못했습니다" });
    return;
  }
  try {
    const result = await runMemoOcr({ objectPath, fileName: fileName ?? null });
    res.json(result);
  } catch (err) {
    // 사용자 입력(파일 형식·크기) 문제는 4xx 로 매핑해 클라이언트가
    // 명확히 처리할 수 있게 한다. Gemini 호출/파싱 실패 등 서버측 문제만 500.
    if (err instanceof MemoOcrInputError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    req.log.error({ err, objectPath }, "memo ocr failed");
    res.status(500).json({
      error: err instanceof Error ? err.message : "OCR 처리 실패",
    });
  }
});

export default router;

import { db, documentTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function seedDocumentTemplates() {
  const existing = await db.select().from(documentTemplatesTable);
  if (existing.length > 0) return;

  const templates = [
    {
      name: "일반 기안지",
      category: "general" as const,
      description: "일반적인 업무 기안에 사용하는 기본 서식입니다",
      fields: JSON.stringify([
        { key: "subject", label: "제목", type: "text", required: true },
        { key: "department", label: "부서", type: "text", required: true },
        { key: "purpose", label: "기안 목적", type: "textarea", required: true },
        { key: "content", label: "내용", type: "textarea", required: true },
        { key: "expectedCost", label: "예상 비용", type: "number", required: false },
        { key: "notes", label: "비고", type: "textarea", required: false },
      ]),
      bodyTemplate: "기안지\n\n1. 제목: {{subject}}\n2. 부서: {{department}}\n3. 기안 목적: {{purpose}}\n4. 내용:\n{{content}}\n5. 예상 비용: {{expectedCost}}\n6. 비고:\n{{notes}}",
      isSystem: true,
      sortOrder: 1,
    },
    {
      name: "증명서 신청서",
      category: "certificate" as const,
      description: "각종 증명서 발급을 신청하는 서식입니다",
      fields: JSON.stringify([
        { key: "applicantName", label: "신청인", type: "text", required: true },
        { key: "certificateType", label: "증명서 종류", type: "select", required: true, options: ["재직증명서", "경력증명서", "급여증명서", "퇴직증명서", "기타"] },
        { key: "purpose", label: "사용 목적", type: "text", required: true },
        { key: "quantity", label: "발급 매수", type: "number", required: true },
        { key: "notes", label: "비고", type: "textarea", required: false },
      ]),
      bodyTemplate: "증명서 신청서\n\n1. 신청인: {{applicantName}}\n2. 증명서 종류: {{certificateType}}\n3. 사용 목적: {{purpose}}\n4. 발급 매수: {{quantity}}부\n5. 비고:\n{{notes}}",
      isSystem: true,
      sortOrder: 2,
    },
    {
      name: "부재 일정 신청서",
      category: "absence" as const,
      description: "휴가, 출장 등 부재 일정을 신청하는 서식입니다",
      fields: JSON.stringify([
        { key: "applicantName", label: "신청인", type: "text", required: true },
        { key: "absenceType", label: "부재 종류", type: "select", required: true, options: ["연차", "반차(오전)", "반차(오후)", "병가", "출장", "교육", "기타"] },
        { key: "startDate", label: "시작일", type: "date", required: true },
        { key: "endDate", label: "종료일", type: "date", required: true },
        { key: "reason", label: "사유", type: "textarea", required: true },
        { key: "emergencyContact", label: "비상 연락처", type: "text", required: false },
        { key: "handoverPlan", label: "업무 인수인계 계획", type: "textarea", required: false },
      ]),
      bodyTemplate: "부재 일정 신청서\n\n1. 신청인: {{applicantName}}\n2. 부재 종류: {{absenceType}}\n3. 기간: {{startDate}} ~ {{endDate}}\n4. 사유:\n{{reason}}\n5. 비상 연락처: {{emergencyContact}}\n6. 업무 인수인계 계획:\n{{handoverPlan}}",
      isSystem: true,
      sortOrder: 3,
    },
    {
      name: "급여 증명서",
      category: "salary" as const,
      description: "급여 관련 증명서 신청 서식입니다",
      fields: JSON.stringify([
        { key: "applicantName", label: "신청인", type: "text", required: true },
        { key: "employeeId", label: "사번", type: "text", required: true },
        { key: "department", label: "부서", type: "text", required: true },
        { key: "certificateType", label: "증명 종류", type: "select", required: true, options: ["급여 증명서", "원천징수 영수증", "소득 확인서"] },
        { key: "period", label: "증명 기간", type: "text", required: true },
        { key: "purpose", label: "사용 목적", type: "text", required: true },
        { key: "quantity", label: "발급 매수", type: "number", required: true },
      ]),
      bodyTemplate: "급여 증명서 신청\n\n1. 신청인: {{applicantName}}\n2. 사번: {{employeeId}}\n3. 부서: {{department}}\n4. 증명 종류: {{certificateType}}\n5. 증명 기간: {{period}}\n6. 사용 목적: {{purpose}}\n7. 발급 매수: {{quantity}}부",
      isSystem: true,
      sortOrder: 4,
    },
    {
      name: "수선유지비 지출 기안",
      category: "maintenance" as const,
      description: "시설 수선 및 유지보수 관련 지출 기안 서식입니다",
      fields: JSON.stringify([
        { key: "subject", label: "건명", type: "text", required: true },
        { key: "location", label: "공사 위치", type: "text", required: true },
        { key: "reason", label: "사유", type: "textarea", required: true },
        { key: "workContent", label: "작업 내용", type: "textarea", required: true },
        { key: "estimatedCost", label: "예상 비용", type: "number", required: true },
        { key: "vendor", label: "시공 업체", type: "text", required: false },
        { key: "workPeriod", label: "공사 기간", type: "text", required: false },
        { key: "notes", label: "비고", type: "textarea", required: false },
      ]),
      bodyTemplate: "수선유지비 지출 기안\n\n1. 건명: {{subject}}\n2. 공사 위치: {{location}}\n3. 사유:\n{{reason}}\n4. 작업 내용:\n{{workContent}}\n5. 예상 비용: {{estimatedCost}}원\n6. 시공 업체: {{vendor}}\n7. 공사 기간: {{workPeriod}}\n8. 비고:\n{{notes}}",
      isSystem: true,
      sortOrder: 5,
    },
  ];

  for (const t of templates) {
    await db.insert(documentTemplatesTable).values(t);
  }
}

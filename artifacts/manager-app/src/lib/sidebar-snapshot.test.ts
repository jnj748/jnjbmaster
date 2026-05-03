// [Task #725] 사이드바 노출 매트릭스 회귀 스냅샷.
//
// 목적:
//   - 사이드바 노출의 단일 진리 원천(SoT)을 ROUTES.sideMenu + 본사 그리드 명시적 ON 으로
//     단일화한 구조 변경(Task #725) 이후, 다른 역할의 사이드바가 의도하지 않게 늘어나거나
//     줄어들지 않도록 매트릭스 전체를 잠근다.
//   - 의도된 단 하나의 노출 변화: facility_staff 의 "꼼꼼하게 챙기는 회계·관리비" 섹션과
//     그 안의 "/erp/metering" 항목. 이 항목은 EXPECTED_SIDEBAR.facility_staff 스냅샷에
//     명시적으로 포함되어 있다.
//   - 추가로 본사 그리드의 명시적 ON/OFF 가 사이드바에 즉시 반영되는지(해당 메뉴가
//     속한 그룹이 GROUP_ORDER_BY_ROLE 에 없더라도) 검증한다.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getSidebarSections,
  type Role,
  type MenuOverride,
} from "./permissions.js";

type Snapshot = { title: string; paths: string[] }[];

function snapshot(role: Role, overrides: MenuOverride[] = []): Snapshot {
  return getSidebarSections(role, [], overrides).map((sec) => ({
    title: sec.title ?? "",
    paths: sec.items.map((it) => it.path),
  }));
}

const EXPECTED_SIDEBAR: Record<Role, Snapshot> = {
  manager: [
    {
      title: "오늘의 한눈 대시보드",
      paths: ["/", "/calendar", "/tasks", "/ai-assistant"],
    },
    {
      title: "든든하게 지키는 시설관리",
      paths: [
        "/inspections",
        "/facility/mandatory-tasks",
        "/facility/suggested-tasks",
        "/safety-checklists",
        "/maintenance-logs",
        "/safety-training",
        "/notices/templates",
      ],
    },
    { title: "차곡차곡 쌓는 보고·전자결재", paths: ["/work-log"] },
    {
      title: "꼼꼼하게 챙기는 회계·관리비",
      paths: ["/erp/metering", "/erp/fees-summary"],
    },
    {
      title: "입주민과 함께하는 호실 관리",
      paths: ["/units", "/tenants", "/vehicles"],
    },
    {
      title: "함께 키우는 파트너 마켓",
      paths: ["/rfqs", "/vendors", "/contracts", "/building/vendor-directory"],
    },
    {
      title: "내 손에 맞춘 설정",
      paths: ["/facility-approvals", "/settings/profile", "/settings/building"],
    },
  ],
  accountant: [
    { title: "오늘의 한눈 대시보드", paths: ["/", "/calendar"] },
    {
      title: "꼼꼼하게 챙기는 회계·관리비",
      paths: [
        "/erp/accounting",
        "/erp/metering",
        "/erp/billing",
        "/erp/fees-summary",
        "/erp/building-records",
        "/erp/bills",
        "/erp/governance",
        "/spending",
        "/tax-schedules",
        "/commissions",
        "/expense-vouchers",
      ],
    },
    {
      title: "든든하게 지키는 시설관리",
      paths: ["/safety-checklists", "/notices/templates"],
    },
    {
      title: "차곡차곡 쌓는 보고·전자결재",
      paths: ["/work-log", "/drafts", "/approvals"],
    },
    { title: "입주민과 함께하는 호실 관리", paths: ["/units", "/tenants"] },
    {
      title: "함께 키우는 파트너 마켓",
      paths: ["/contracts", "/building/vendor-directory"],
    },
  ],
  facility_staff: [
    { title: "오늘의 한눈 대시보드", paths: ["/"] },
    {
      title: "든든하게 지키는 시설관리",
      paths: [
        "/inspections",
        "/facility/mandatory-tasks",
        "/facility/suggested-tasks",
        "/safety-checklists",
        "/maintenance-logs",
        "/safety-training",
        "/notices/templates",
      ],
    },
    // [Task #725] ✦ 의도된 신규 노출 ✦
    //   /erp/metering 의 sideMenu 에 facility_staff 가 들어 있음에도 GROUP_ORDER_BY_ROLE
    //   .facility_staff 에 "accounting" 그룹이 없어 사이드바에서 통째로 숨겨졌던 회귀를
    //   해소. 본사 그리드 토글 없이 기본값으로도 노출되어야 한다.
    { title: "꼼꼼하게 챙기는 회계·관리비", paths: ["/erp/metering"] },
    { title: "차곡차곡 쌓는 보고·전자결재", paths: ["/work-log"] },
    {
      title: "함께 키우는 파트너 마켓",
      paths: ["/building/vendor-directory"],
    },
  ],
  hq_executive: [
    { title: "오늘의 한눈 대시보드", paths: ["/"] },
    {
      title: "든든하게 지키는 시설관리",
      paths: ["/inspections", "/safety-training"],
    },
    {
      title: "꼼꼼하게 챙기는 회계·관리비",
      paths: ["/erp/metering", "/erp/building-records", "/erp/governance"],
    },
    {
      title: "차곡차곡 쌓는 보고·전자결재",
      paths: ["/approvals", "/reports"],
    },
    { title: "함께 키우는 파트너 마켓", paths: ["/vendors", "/contracts"] },
    {
      title: "내 손에 맞춘 설정",
      paths: [
        "/hq-approval-thresholds",
        "/users",
        "/facility-approvals",
        "/platform-announcements",
        "/platform-knowledge-docs",
        "/settings/platform",
      ],
    },
  ],
  partner: [
    {
      title: "",
      paths: ["/", "/rfqs", "/rfqs", "/me/credits", "/me/vendor"],
    },
  ],
  custodian: [
    { title: "차곡차곡 쌓는 보고·전자결재", paths: ["/approvals"] },
    { title: "꼼꼼하게 챙기는 회계·관리비", paths: ["/payment-requests"] },
  ],
  platform_admin: [
    { title: "관리소장", paths: ["/platform/managers"] },
    { title: "경리", paths: ["/platform/accountants"] },
    {
      title: "시설기사",
      paths: ["/platform/facility-staff", "/facility-approvals"],
    },
    {
      title: "본부장",
      paths: ["/platform/hq-executives", "/platform/hq-assignments"],
    },
    {
      title: "파트너사",
      paths: [
        "/platform/partners",
        "/vendors",
        "/platform/credits",
        "/platform/quote-credit-policies",
        // [Task #734] 이벤트 크레딧 일괄 지급.
        "/platform/credit-events",
        // [Task #740 가입흐름재설정] 파트너 분야(2단 카테고리) 마스터 관리.
        "/platform/vendor-categories",
      ],
    },
    {
      title: "콘텐츠 관리",
      paths: [
        "/platform-consents",
        "/platform-announcements",
        "/platform/notice-templates",
        "/platform-knowledge-docs",
        "/settings/task-templates",
      ],
    },
    {
      title: "공통·시스템",
      paths: [
        "/users",
        "/platform/referrers",
        "/document-templates",
        "/platform/safety-checklist-templates",
        "/report-system",
        "/platform/usage-analytics",
      ],
    },
    {
      title: "설정",
      paths: [
        "/settings/menu-overrides",
        "/settings/profile",
        "/settings/building",
        "/settings/platform",
      ],
    },
  ],
};

const ALL_ROLES: Role[] = [
  "manager",
  "accountant",
  "facility_staff",
  "hq_executive",
  "partner",
  "custodian",
  "platform_admin",
];

for (const role of ALL_ROLES) {
  test(`getSidebarSections('${role}') 기본 사이드바 매트릭스 스냅샷`, () => {
    assert.deepStrictEqual(snapshot(role), EXPECTED_SIDEBAR[role]);
  });
}

test(
  "본사 그리드에서 (facility_staff, '/erp/metering') 명시적 OFF 시 검침이 사이드바에서 사라진다",
  () => {
    const overrides: MenuOverride[] = [
      { role: "facility_staff", blockId: "/erp/metering", enabled: false },
    ];
    const snap = snapshot("facility_staff", overrides);
    const accountingSection = snap.find(
      (s) => s.title === "꼼꼼하게 챙기는 회계·관리비",
    );
    assert.equal(
      accountingSection,
      undefined,
      "검침이 빠지면 회계 그룹 자체가 비어 헤더도 사라져야 한다",
    );
  },
);

test(
  "본사 그리드에서 (facility_staff, '/erp/billing') 명시적 ON 시 access 화이트리스트가 비어 있어도 사이드바에 등장한다",
  () => {
    // /erp/billing 의 access·sideMenu 에는 facility_staff 가 없다.
    //   본사 그리드에서 ON 으로 토글하면 사이드바·라우트에 즉시 노출되어야 한다.
    const overrides: MenuOverride[] = [
      { role: "facility_staff", blockId: "/erp/billing", enabled: true },
    ];
    const snap = snapshot("facility_staff", overrides);
    const accountingSection = snap.find(
      (s) => s.title === "꼼꼼하게 챙기는 회계·관리비",
    );
    assert.ok(
      accountingSection,
      "회계 그룹 헤더가 노출되어야 한다(시설담당의 GROUP_ORDER 에 그룹이 없어도)",
    );
    assert.ok(
      accountingSection!.paths.includes("/erp/billing"),
      "고지/수납이 회계 섹션에 등장해야 한다",
    );
  },
);

test(
  "본사 그리드에서 hq_executive 에 (/tasks) ON 시 GROUP_ORDER 에 dashboard 그룹이 이미 있으므로 거기에 합류한다",
  () => {
    // /tasks 의 group 은 dashboard. hq_executive 의 GROUP_ORDER 에 dashboard 가 이미
    //   있으므로 fallback 이 아닌 명시적 dashboard 그룹에 합류한다.
    const overrides: MenuOverride[] = [
      { role: "hq_executive", blockId: "/tasks", enabled: true },
    ];
    const snap = snapshot("hq_executive", overrides);
    const dashSection = snap.find((s) => s.title === "오늘의 한눈 대시보드");
    assert.ok(dashSection);
    assert.ok(dashSection!.paths.includes("/tasks"));
  },
);

test(
  "본사 그리드에서 custodian(GROUP_ORDER 에 dashboard 없음)에 (/calendar) ON 시 dashboard 섹션이 fallback 으로 등장한다",
  () => {
    // custodian 의 GROUP_ORDER_BY_ROLE 에는 'dashboard' 가 없다. 본사가 그리드에서
    //   /calendar 를 ON 으로 토글하면, fallback 에서 일반적으로 제외되는 dashboard 그룹도
    //   "명시적 ON 후보가 있을 때만" 예외적으로 노출되어야 한다.
    //   동시에, 명시적 ON 이 아닌 토글이 없는 상태에서는 custodian 사이드바에 대시보드
    //   섹션이 갑툭튀 하지 않아야 한다(기본 스냅샷 테스트가 이미 보장).
    const overrides: MenuOverride[] = [
      { role: "custodian", blockId: "/calendar", enabled: true },
    ];
    const snap = snapshot("custodian", overrides);
    const dashSection = snap.find((s) => s.title === "오늘의 한눈 대시보드");
    assert.ok(
      dashSection,
      "명시적 ON 한 dashboard 메뉴가 있을 때는 dashboard 헤더가 fallback 으로 살아나야 한다",
    );
    assert.ok(dashSection!.paths.includes("/calendar"));
    // rootItem('/') 은 custodian 의 sideMenu(=access) 에 포함되어 있는지에 따라 결정.
    //   여기서는 동작의 핵심(=명시적 ON 한 메뉴가 사이드바에 도달함)만 단언한다.
  },
);

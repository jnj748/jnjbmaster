import { sql } from "drizzle-orm";
import {
  db,
  platformConsentDocumentsTable,
  consentRoles,
  type platformConsentTypes,
} from "@workspace/db";

// [Task #133] Idempotent migration: add new columns / tables that may not exist
// in older databases (project uses drizzle-kit push, not auto-migrations).
export async function ensureConsentSchema(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE platform_consents
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'agreed'
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS platform_consent_documents (
      id serial PRIMARY KEY,
      role text NOT NULL,
      consent_type text NOT NULL,
      version text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      required boolean NOT NULL DEFAULT false,
      is_published boolean NOT NULL DEFAULT false,
      published_at timestamptz,
      created_by integer,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_consent_docs_role_type_version
      ON platform_consent_documents (role, consent_type, version)
  `);
}

type ConsentType = typeof platformConsentTypes[number];

interface SeedDoc {
  consentType: ConsentType;
  title: string;
  required: boolean;
  body: string;
  rolesOverride?: readonly typeof consentRoles[number][];
}

const VERSION = "1.0";

const TERMS_BODY = `[이용약관]

제1조 (목적)
본 약관은 (주)관리의달인(이하 "회사")이 제공하는 집합건물 관리행정 및 견적·계약 중개 서비스(이하 "서비스")의 이용 조건을 정합니다.

제2조 (회사의 지위)
1. 회사는 「전자상거래 등에서의 소비자보호에 관한 법률」 상의 통신판매중개자이며, 통신판매의 당사자가 아닙니다.
2. 회사는 관리단(건물)과 파트너사(용역사) 간의 견적·계약·이행을 위한 도구·정보·중개 환경을 제공합니다.
3. 회사는 개별 용역계약의 이행·의무·하자·분쟁에 대한 당사자로서의 책임을 지지 않으며, 책임은 관리단과 파트너사에게 귀속됩니다.

제3조 (서비스의 성격)
1. 하자담보, 법정점검, 계약 만료 등 회사가 제공하는 모든 알림은 정보 제공 서비스이며, 실제 이행·보증을 담보하지 않습니다.
2. 회사가 제공하는 검수·결재·계약서 양식 등은 행정 도구로서 제공되며, 법적 효력은 당사자의 서명·합의에 의합니다.

제4조 (이용자의 의무)
1. 이용자는 약관과 관계 법령을 준수하여야 합니다.
2. 견적·계약 정보의 진실성·정확성에 관한 책임은 해당 정보를 제공한 당사자에게 있습니다.

제5조 (책임 제한)
회사는 관리단과 파트너사 간의 거래·정산·이행과 관련된 손해에 대해 회사의 고의·중과실이 없는 한 책임을 지지 않습니다.`;

const PRIVACY_BODY = `[개인정보 처리방침]

1. 수집 항목
- 필수: 이메일, 이름, 비밀번호(해시), 소속 건물·업체 정보
- 선택: 전화번호, 프로필 정보
- 자동수집: 접속 기록, IP, 쿠키, 디바이스 정보

2. 수집·이용 목적
- 서비스 제공 및 본인 확인
- 결재·계약·견적 이력 관리
- 알림 발송 및 고객 응대

3. 보유 기간
- 회원 탈퇴 시까지. 단, 관계 법령에 따라 일정 기간 보관할 수 있습니다.
  · 계약 또는 청약철회 등에 관한 기록: 5년
  · 결제 및 재화 등의 공급에 관한 기록: 5년
  · 소비자의 불만 또는 분쟁처리에 관한 기록: 3년

4. 처리 위탁
클라우드 인프라 운영을 위한 필수 위탁 외에는 제3자에게 제공하지 않습니다.

5. 이용자의 권리
이용자는 언제든지 본인의 개인정보를 열람·수정·삭제·처리정지할 수 있습니다.`;

const MARKETING_BODY = `[마케팅 정보 수신 동의 (선택)]

1. 수집·이용 목적
- 신규 서비스, 이벤트, 혜택 안내
- 맞춤형 콘텐츠·추천 정보 제공

2. 수신 채널
이메일, SMS, 카카오 알림톡, 앱 푸시

3. 보유·이용 기간
동의 철회 시 또는 회원 탈퇴 시까지

4. 동의 철회
[설정 > 알림] 또는 고객센터를 통해 언제든지 철회할 수 있으며,
철회 시 마케팅 정보 수신만 중단되고 서비스 이용에는 영향이 없습니다.

본 항목은 선택 동의 사항이며, 동의하지 않아도 서비스 이용이 가능합니다.`;

const THIRD_PARTY_BODY = `[개인정보 제3자 제공 동의 (선택)]

회사는 아래와 같이 이용자의 개인정보를 제3자에게 제공할 수 있습니다.

1. 제공받는 자
- 견적 매칭 시 매칭된 파트너사(용역사)
- 결제 처리 시 PG사 (해당 시)

2. 제공 항목
이름, 연락처, 소속 건물·업체 정보, 견적/요청 관련 정보

3. 제공 목적
견적 회신, 계약 체결·이행, 결제·정산 처리

4. 보유·이용 기간
제공 목적 달성 시까지 또는 동의 철회 시까지

본 항목은 선택 동의 사항이며, 미동의 시 견적 매칭·자동 알림 등 일부 핵심 기능
이용에 제약이 있을 수 있습니다.`;

const PARTNER_BODY = `[파트너 이용약관]

1. 파트너사는 회사가 제공하는 견적 요청에 응할 수 있으며, 계약 체결 및 이행의 당사자는 파트너사와 관리단입니다.
2. 회사는 견적 매칭·정산 도구만 제공하며, 계약 이행 결과에 대한 보증을 하지 않습니다.
3. 파트너사는 정확한 사업자 정보·자격을 등록할 의무가 있으며, 허위 정보 등록 시 이용이 제한될 수 있습니다.
4. 회사는 매칭·중개 서비스 제공의 대가로 정해진 수수료를 청구할 수 있습니다.
5. 파트너사는 관리단과 체결한 계약을 성실히 이행할 의무가 있으며, 하자 발생 시 자체 책임으로 처리합니다.`;

const SEED_DOCS: SeedDoc[] = [
  {
    consentType: "intermediary_terms",
    title: "이용약관",
    required: true,
    body: TERMS_BODY,
  },
  {
    consentType: "privacy_policy",
    title: "개인정보 처리방침",
    required: true,
    body: PRIVACY_BODY,
  },
  {
    consentType: "marketing",
    title: "마케팅 정보 수신 동의 (선택)",
    required: false,
    body: MARKETING_BODY,
  },
  {
    consentType: "third_party_sharing",
    title: "개인정보 제3자 제공 동의 (선택)",
    required: false,
    body: THIRD_PARTY_BODY,
  },
  {
    consentType: "partner_terms",
    title: "파트너 이용약관",
    required: true,
    body: PARTNER_BODY,
    rolesOverride: ["partner"],
  },
];

export async function seedConsentDocuments(): Promise<void> {
  for (const doc of SEED_DOCS) {
    const targetRoles = doc.rolesOverride ?? consentRoles;
    for (const role of targetRoles) {
      // Insert if there's no existing version for this (role, type).
      // Use raw SQL with ON CONFLICT DO NOTHING on the (role, type, version) unique idx.
      await db
        .insert(platformConsentDocumentsTable)
        .values({
          role,
          consentType: doc.consentType,
          version: VERSION,
          title: doc.title,
          body: doc.body,
          required: doc.required,
          isPublished: true,
          publishedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }
}

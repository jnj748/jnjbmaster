# 하이브리드 앱 푸시 알림 구조 설계

> **이 문서의 위치**
> 본 문서는 [`push-notification-readiness.md`](./push-notification-readiness.md) 의
> **정식 후속(상세) 버전**이다. readiness 문서는 캠페인 push 채널이 NO-OP 인 이유와
> 도입 체크리스트를 짧게 요약한 것이고, 본 문서는 하이브리드/네이티브 앱 퍼블리싱을
> 전제로 한 **전체 푸시 아키텍처(클라이언트 SDK · 토큰 라이프사이클 · 서버 발송
> 파이프라인 · 역할별 라우팅 · 운영 정책 · 도입 로드맵)** 를 정리한다.
> readiness 문서의 내용은 본 문서로 흡수되었으며, 새 작업은 본 문서를 기준으로
> 한다(readiness 문서는 히스토리 보존 목적으로 유지).
>
> 본 문서는 Task #352 의 산출물이며, **설계/검토 문서**일 뿐 실제 코드/스키마
> 변경은 포함하지 않는다. 실제 구현은 본 문서 §9 의 단계별 후속 태스크에서 다룬다.

---

## 1. As-Is 정리 (현재 코드 기준 재확인)

### 1.1 인앱 알림(`notificationsTable`)

`lib/db/src/schema/notifications.ts`:

| 컬럼 | 의미 |
| --- | --- |
| `recipientType` (text) | 자유 텍스트. 현재 사용 패턴: `admin`, `hq_executive`, `manager:{buildingId}`, `partner:{vendorId}` 등. **enum 이 아니므로 라우팅 규칙이 코드 곳곳에 분산됨.** ※ 현행 코드의 `admin` 문자열은 `users.role` enum 의 `platform_admin` 과 동일 대상으로 취급한다(아래 §1.6 매핑 규칙 참조). |
| `notificationType` (text) | 트리거 식별자. 예: `quote_received`, `complaint_escalation`, `approval_step_pending`, `data_destruction_alert`, `vehicle_monthly_inspection`, `delinquency_detection`, `platform_announcement`. |
| `title` / `message` | 사용자 노출 텍스트(한국어 기본). |
| `relatedEntityType` / `relatedEntityId` | deep-link 라우팅에 사용 가능한 단서. |
| `isRead` | 인앱 읽음 처리. |

전송 방식은 **DB row insert + 클라이언트 polling(`GET /notifications`,
`GET /notifications/unread-count`)** 만 존재한다. 실시간 푸시·웹소켓·SSE 는 없다.

### 1.2 캠페인(`platform_campaigns`)

`lib/db/src/schema/platformCampaigns.ts`:

- `campaignChannels = ["modal", "banner", "bell", "push"]` — push 만 NO-OP.
- `targetRole`, `audienceFilter(all|active)`, `recurrence(none|daily|weekly|monthly)`,
  `maxImpressionsPerUser`, `startsAt/endsAt` 로 노출 룰 표현.
- 사용자별 상태는 `platform_campaign_user_states` 가 추적: `impressionCount`,
  `lastImpressionAt`, `dontShowAgain`, `dismissedUntil`, `ctaClickedAt`,
  `readAt` 등. **이 테이블이 “사용자×캠페인” 단일 기록자**이며, 푸시 도입 시 푸시
  발송 카운트·중복 방지 키도 이 테이블을 그대로 사용해야 한다.

### 1.3 사용자 모델

- `userRoles = ["manager", "partner", "platform_admin", "hq_executive", "accountant", "facility_staff"]`.
- 역할 기반 옵트아웃/카테고리 설정은 `users.disabledCategories`(메뉴 가시성용)
  하나뿐이며, **알림 채널별 옵트아웃 컬럼은 아직 없다.**

### 1.4 트리거가 발생하는 위치(인앱 알림 insert 지점)

| Trigger (`notificationType`) | 발생 위치 | 현재 수신자 (`recipientType`) | 비고 |
| --- | --- | --- | --- |
| `quote_received` | `routes/quotes.ts` POST `/quotes` | `manager:{buildingId}` | RFQ 가 속한 건물 매니저들. **파트너 측 알림은 현재 없음.** |
| `contract_auto_created`, `contract_draft_ready` | `routes/quotes.ts` PATCH `/quotes/:id` (accepted) | `admin`, `partner:{vendorId}` | 계약 자동 생성 |
| `complaint_escalation` | `routes/complaints.ts` (민감/긴급/수동 에스컬레이션) | `hq_executive` | 본사 라우팅 |
| `approval_step_pending`, `approval_rejected`, `approval_completed`, `approval_shared` | `routes/approvals*.ts` | 단계 결재자/요청자 등 | 결재선 워크플로우 |
| `data_destruction_alert`, `data_destruction_completed` | `scheduler.ts` | `admin`, `hq_executive` | 개인정보 파기 일정 |
| `vehicle_monthly_inspection` | `scheduler.ts` (매월 1일) | `admin` | 미등록 차량 점검 |
| `delinquency_detection`, `delinquency_auto_resolved` | `scheduler.ts` | `manager:{buildingId}`, `accountant:{buildingId}` | 연체 자동 감지/해소 |
| `platform_announcement` | `notifications.ts` 응답 합성 | 전체 | 별도 테이블, push 와 무관 |

### 1.5 `recipientType` ↔ `users.role` 정규화 규칙 (구현 태스크 공통 합의)

현행 `notificationsTable.recipientType` 는 자유 텍스트라 발송 워커 입장에서
"누구에게 푸시를 보내야 하는가" 를 결정하려면 명시적 매핑이 필요하다.
후속 구현 태스크(§9 단계 2·4) 는 다음 표를 단일 정답으로 사용한다.

| `recipientType` 값 | 매칭되는 `users.role` | 추가 필터 |
| --- | --- | --- |
| `admin` | `platform_admin` | (모두) |
| `platform_admin` | `platform_admin` | (모두) |
| `hq_executive` | `hq_executive` | (모두) |
| `manager:{buildingId}` | `manager` | `users.buildingId = {buildingId}` |
| `accountant:{buildingId}` | `accountant` | `users.buildingId = {buildingId}` |
| `facility_staff:{buildingId}` | `facility_staff` | `users.buildingId = {buildingId}` |
| `partner:{vendorId}` | `partner` | `users.vendorId = {vendorId}` |
| `all` | (모든 role) | `approvalStatus = 'active'` |

> 신규 트리거를 추가할 때는 위 표 형식을 유지하고, **`admin` 같은 레거시 별칭을
> 새로 만들지 않는다**(가능하면 `platform_admin` 으로 통일). 본 매핑은 발송
> 워커의 단일 헬퍼 함수(`resolveRecipients(recipientType)`) 한 곳에 구현해
> 라우팅 규칙이 다시 분산되지 않게 한다.

### 1.6 클라이언트(`manager-app`) 현황

- React + Vite 기반 PWA. `public/manifest.json`(`display: standalone`) 만 있고
  `service-worker.js`, `vite-plugin-pwa`, Workbox, Capacitor, Expo 등 **푸시
  관련 클라이언트 SDK 는 일절 없다.**
- 따라서 “브라우저 Web Push” 조차 동작하지 않는 상태이며, 본 문서에서는 **모바일
  앱(iOS/Android) 푸시를 1차 타깃**으로 한다.

---

## 2. 하이브리드 앱 스택 선택지

### 2.1 옵션 A — 현 PWA(`manager-app`) 를 **Capacitor 로 래핑**

**개요.** `artifacts/manager-app` 의 빌드 산출물(`dist/`) 을 그대로 Capacitor
WebView 컨테이너에 싣고, `@capacitor/push-notifications`(FCM/APNs) 플러그인으로
토큰 발급·수신 처리.

| 항목 | 평가 |
| --- | --- |
| 코드 재사용 | ★★★★★ — UI/라우팅/상태/디자인 100% 재사용 |
| 신규 빌드 파이프라인 | iOS Xcode + Android Studio (또는 Capacitor Cloud) 추가 필요 |
| 푸시 SDK | `@capacitor/push-notifications` (FCM 키, APNs 인증서/키 직접 보유) |
| 알림 수신 시 라우팅 | WebView 내부 라우터로 `postMessage` 또는 deep-link URL 전달 |
| 백그라운드 동작 | iOS WebView 백그라운드 제약 존재 (sliding 알림은 정상, 백그라운드 fetch 는 제한) |
| 디자인/UX 일관성 | 웹과 100% 동일 — 모바일 네이티브 룩&필 별도 작업 불가 |
| 장기 진화 | 네이티브 위젯/공유 시트 등 확장이 어렵고 plugin bridge 로 우회해야 함 |

**리스크.** iOS 의 Web Push 한계 우회(Capacitor + APNs 직접) 가 핵심이며,
FCM/APNs **자체 키 보유·갱신 운영** 부담이 있다.

### 2.2 옵션 B — 신규 **Expo artifact** (React Native 앱) 를 추가

**개요.** `artifacts/manager-app-mobile` (가칭) 을 Expo + React Native 로 신규
구축. 기존 `@workspace/api-zod`, `@workspace/api-spec` 클라이언트와 토큰/세션
훅은 공유 가능. 푸시는 `expo-notifications` + **Expo Push API** 사용.

| 항목 | 평가 |
| --- | --- |
| 코드 재사용 | ★★ — API 스펙·도메인 zod 는 공유, **UI 는 RN 으로 재작성** |
| 빌드 파이프라인 | EAS Build (Replit 친화) — Apple/Google 계정만 있으면 1-command 빌드 |
| 푸시 SDK | `expo-notifications` (Expo Push API 가 FCM/APNs 를 추상화) |
| 알림 수신 시 라우팅 | Expo Linking + `react-navigation` deep-link 표준 패턴 |
| 백그라운드 동작 | 네이티브 — 백그라운드 fetch, 위젯, 알림 카테고리(액션 버튼) 등 표준 지원 |
| 디자인/UX | 모바일 네이티브 룩&필 가능, 데스크톱 웹과 분리 진화 |
| 장기 진화 | 네이티브 기능(카메라, BLE, 푸시 카테고리 액션) 확장에 유리 |

**리스크.** 단기 구현 비용↑(UI 재작성), Expo 주요 화면 디자인을 별도 트랙으로
운영해야 함. `manager-app` 과의 화면 동기화가 두 개 트랙으로 늘어남.

### 2.3 권고안 — **단기 옵션 A(Capacitor 래핑) → 중기 옵션 B 점진 이행**

1. **단기(0–2개월).** 현 PWA 를 Capacitor 로 래핑하여 **iOS/Android 앱 스토어
   배포 + 푸시 수신**까지 빠르게 확보한다. 이유:
   - 6개 역할 × 다수 기능을 RN 으로 일시에 재작성하는 것은 리스크가 크다.
   - 푸시의 **비즈니스 가치(매니저 업무 안내, 파트너 견적 알림, 본사 민원
     에스컬레이션)** 가 UI 룩&필 보다 우선순위가 높다.
2. **중기(3–6개월).** 사용 빈도가 가장 높고 네이티브 UX 이득이 큰 흐름(파트너의
   견적 응답, 시설기사의 작업 보고)부터 Expo artifact 로 옮긴다. 본사·관리소장의
   복잡한 워크플로는 PWA/Capacitor 그대로 유지해도 무방.
3. 두 옵션 모두 **발송 측(서버) 구조는 동일**해야 한다 — 즉 §3, §4 에서 제안하는
   토큰 스키마/발송 게이트웨이는 Capacitor·Expo 어느 쪽이 와도 그대로 동작하도록
   설계한다(아래 “Expo Push API 우선” 권고 참조).

> **참고.** Expo Push API 는 **FCM/APNs 전용 토큰만 있어도 서버 측에서 호출 가능**
> 하지만, 가장 단순한 채택 경로는 클라이언트가 Expo SDK 를 사용하는 경우다.
> Capacitor 단독 사용 시에는 서버가 FCM/APNs 를 직접 호출하는 편이 일반적이다
> (§4 참조).

---

## 3. 푸시 토큰 라이프사이클 & 스키마 초안

### 3.1 `user_push_tokens` 스키마 초안 (실제 마이그레이션은 후속 태스크)

```ts
// lib/db/src/schema/userPushTokens.ts (제안 — 본 태스크에서는 작성하지 않음)
export const pushPlatforms = ["ios", "android", "web"] as const;
export const pushProviders = ["expo", "fcm", "apns", "webpush"] as const;

export const userPushTokensTable = pgTable("user_push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: pushPlatforms }).notNull(),
  provider: text("provider", { enum: pushProviders }).notNull(),
  token: text("token").notNull(),                          // ExpoPushToken[xxx] 또는 FCM/APNs raw
  deviceId: text("device_id"),                             // 클라이언트 생성 UUID (설치별 고유)
  appVersion: text("app_version"),
  osVersion: text("os_version"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  invalidationReason: text("invalidation_reason"),         // "DeviceNotRegistered" 등 게이트웨이 응답
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserDeviceToken: uniqueIndex("uniq_user_device_token").on(t.userId, t.deviceId, t.token),
  idxUserActive: index("idx_push_tokens_user_active").on(t.userId, t.isActive),
}));
```

**설계 결정**

- **사용자당 N개 디바이스** 허용. `(userId, deviceId)` 가 사용자×기기 단위 키.
- 같은 디바이스에서 토큰이 회전되면 새 row + 이전 row `isActive=false` 처리(과거
  토큰 invalidate 이력 보존).
- `provider` 를 명시해 향후 Capacitor(FCM/APNs 직발사) 와 Expo(Expo Push) 가
  공존해도 발송 워커가 분기할 수 있게 함.
- **로그아웃 / 계정 전환 시 `isActive=false`**. 같은 디바이스에 다른 사용자가
  로그인하면 새 row 생성. 기기 분실/탈퇴 시 cascade delete.

### 3.2 등록·갱신·만료 시퀀스 (의사 흐름)

```
[App 최초 진입 / 로그인 직후]
  Client → 권한 요청 (Notifications.requestPermissionsAsync)
  if granted:
    token = await getPushTokenAsync()
    deviceId = persistedOrNewUUID()
    POST /me/push-tokens  { platform, provider, token, deviceId, appVersion, osVersion }
    server upsert by (userId, deviceId): set token, isActive=true, lastSeenAt=now

[App resume / N일 경과 시]
  Client refresh token if SDK reports change
  POST /me/push-tokens (idempotent upsert) → lastSeenAt 갱신

[로그아웃]
  DELETE /me/push-tokens/{deviceId}
  server: set isActive=false, invalidatedAt=now, invalidationReason="logout"

[게이트웨이 응답 처리(서버)]
  Expo Push API 응답: details.error == "DeviceNotRegistered" 또는
  FCM 응답: UNREGISTERED / INVALID_REGISTRATION
  → 해당 token row: isActive=false, invalidatedAt=now, invalidationReason=<code>

[GC 잡 (월 1회)]
  isActive=false AND invalidatedAt < now()-90d → physical delete
  isActive=true  AND lastSeenAt   < now()-180d → isActive=false (좀비 토큰 정리)
```

### 3.3 API 표면 (제안)

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST` | `/me/push-tokens` | upsert (멱등). 권한 동의 직후 / 토큰 회전 시. |
| `DELETE` | `/me/push-tokens/:deviceId` | 단일 디바이스 등록 해제(로그아웃). |
| `GET` | `/me/push-tokens` | 본인 디바이스 목록(설정 화면용, 선택). |
| `PATCH` | `/me/notification-prefs` | 무음 시간대·옵트아웃(§7) 설정. |

---

## 4. 발송 게이트웨이 비교

| 항목 | **Expo Push API** (권고) | FCM(Android) + APNs(iOS) 직접 |
| --- | --- | --- |
| 도입 비용 | 낮음 — 토큰만 받아 단일 HTTPS 엔드포인트 호출 | 높음 — APNs 키/인증서 발급, FCM 서비스 계정, JWT 서명 등 |
| 운영 복잡도 | 낮음 — 응답 코드 체계 단일화, 배치 100건/요청 | 높음 — iOS/Android 각각 응답 포맷·에러 코드 별도 |
| 한국 시장 적합성 | 중상 — Apple/Google 동일 인프라 사용. 카카오 알림톡 미지원(별도 트랙) | 동일 |
| iOS/Android 커버리지 | 양쪽 모두 OK (Expo 가 추상화) | 양쪽 모두 OK (직접 분기) |
| Capacitor 와 호환 | 가능하지만 비표준(클라이언트가 ExpoPushToken 발급 안 함) | 자연스러움 — Capacitor 의 기본 토큰이 FCM/APNs |
| 대량 발송 처리 | 100건/요청 + 자체 큐, 사용량 무료 | 자체 큐 필요, 구글/애플 쿼터 별도 관리 |
| 베스트 케이스 | Expo artifact (옵션 B) | Capacitor 단독 (옵션 A 단기) |

### 4.1 권고안 — **하이브리드 게이트웨이 레이어**

발송 코드는 “provider 추상화” 어댑터로 작성한다(아래는 의사코드).

```ts
interface PushGateway {
  send(tokens: PushTokenRow[], payload: PushPayload): Promise<PushResult[]>;
}
const gateways: Record<PushProvider, PushGateway> = {
  expo: new ExpoPushGateway(),
  fcm:  new FcmGateway(),
  apns: new ApnsGateway(),
  webpush: new WebPushGateway(), // 후순위
};
```

**1차 도입 권고: Expo Push API 우선.**

- 옵션 B(Expo artifact) 가 중기 권고이므로, Expo Push 를 먼저 정착시키고
- 단기 Capacitor 는 **Expo Push API 가 받아주는 FCM/APNs raw 토큰 모드**로
  통일하거나(가능하면), 어려울 경우 `provider=fcm/apns` 어댑터를 추가한다.
- 이 구조는 후일 카카오 알림톡(별도 트랙) 도 같은 인터페이스로 추가 가능.

> **⚠ 선행 PoC 필요.**
> "Capacitor 가 발급한 FCM/APNs raw 토큰을 Expo Push API 로 그대로 발송 가능"
> 이라는 가정은 운영 환경에서 검증된 적이 없다(Expo Push 는 ExpoPushToken 형식
> 을 1차 입력으로 가정). §9 단계 2(발송 코어) 착수 직전에 1주 이내 기술
> 스파이크로 검증하고, 호환되지 않을 경우 **단기 Capacitor 트랙은 §9 단계 9
> (FCM/APNs 직접 어댑터) 가 사실상 필수**가 된다. 본 권고안은 호환 가능성을
> 전제로 하므로, 검증 결과에 따라 §9 의 2단계와 9단계 범위를 재조정해야 한다.

---

## 5. 역할별 트리거 매트릭스

수신자 표기: M=manager, A=accountant, F=facility_staff, P=partner, H=hq_executive,
PA=platform_admin. ✓=발송, ·=발송 안 함. **무음 시간대 적용 컬럼은 §7 정책을
따른다.**

### 5.1 업무 트리거 (이미 인앱 알림 row 가 발생 중)

| 이벤트 (`notificationType`) | M | A | F | P | H | PA | Push 페이로드 핵심 | Deep-link | 무음 시간 적용 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `quote_received` | ✓ | · | · | · | · | · | "견적 도착, 확인하세요" / vendor·rfq 제목 | `/rfqs/{rfqId}/quotes/{quoteId}` | ✓(긴급 아님) | RFQ 건물 매니저들 |
| `quote_request_matched` *(신설)* | · | · | · | ✓ | · | · | "신규 견적 요청 도착" / 카테고리·지역 | `/partner/rfqs/{rfqId}` | ✓ | **현재 미발송 — 본 문서에서 신설 권고**. RFQ open 시점에 매칭된 파트너에게 발송. 사용자 요구: "파트너 = 본인이 견적 가능한 신규 요청". |
| `contract_auto_created` | ✓ | ✓ | · | ✓ | · | ✓(admin) | "계약 초안이 생성되었습니다" | `/contracts/{contractId}` | ✓ | 기존 인앱 알림 그대로 |
| `contract_draft_ready` | · | · | · | ✓ | · | ✓(admin) | "계약 초안 검토 요청" | `/partner/contracts/{contractId}` | ✓ | 파트너 측 |
| `complaint_escalation` | · | · | · | · | ✓ | · | "[민감 민원] {건물명} - {제목}" | `/hq/complaints/{id}` | **× (긴급)** | **사용자 요구: 본사 = 본사 관여 민원만**. 자동 에스컬레이션 + 수동 에스컬레이션 모두 포함. |
| `approval_step_pending` | ✓(해당자) | ✓(해당자) | ✓(해당자) | · | ✓(해당자) | · | "결재 대기: {제목}" | `/approvals/{id}` | ✓ | 결재선상 본인 차례일 때만 |
| `approval_rejected` | ✓(요청자) | ✓(요청자) | ✓(요청자) | · | ✓(요청자) | · | "결재 반려: {제목}" | `/approvals/{id}` | ✓ | 요청자에게 |
| `approval_completed` | ✓(요청자) | ✓(요청자) | ✓(요청자) | · | ✓(요청자) | · | "결재 완료: {제목}" | `/approvals/{id}` | ✓ | |
| `approval_shared` | ✓(공유대상) | ✓(공유대상) | · | · | ✓(공유대상) | · | "결재 공유: {제목}" | `/approvals/{id}` | ✓ | |
| `data_destruction_alert` | · | · | · | · | ✓ | ✓ | "개인정보 파기 예정" | `/hq/privacy/destruction` | ✓ | scheduler 주기 발송 |
| `data_destruction_completed` | · | · | · | · | ✓ | ✓ | "개인정보 파기 완료" | `/hq/privacy/destruction` | ✓ | |
| `vehicle_monthly_inspection` | ✓ | · | ✓ | · | · | · | "월간 차량 점검 시작" | `/residents/vehicles` | ✓ | 매월 1일 |
| `delinquency_detection` | ✓ | ✓ | · | · | · | · | "{호실} 연체 감지" | `/accounting/delinquency` | ✓ | 건물 단위 |
| `delinquency_auto_resolved` | ✓ | ✓ | · | · | · | · | "{호실} 연체 해소" | `/accounting/delinquency` | ✓ | |
| `tax_deadline_d3` *(신설 후보)* | · | ✓ | · | · | · | · | "세무 마감 D-3" | `/accounting/tax` | ✓ | 회계 마감용. scheduler 후속 태스크. |
| `meter_reading_due` *(신설 후보)* | ✓ | · | ✓ | · | · | · | "검침 마감 D-N" | `/facility/meters` | ✓ | 검침 마감 |
| `legal_appointee_threshold` *(신설 후보)* | ✓ | · | · | · | ✓ | · | "법정선임 임계 도달" | `/facility/appointees` | ✓ | |

### 5.2 사용 유도 / 캠페인 트리거

| 이벤트 | 대상 | Push 페이로드 | Deep-link | 무음 적용 | 비고 |
| --- | --- | --- | --- | --- | --- |
| `campaign:{id}` (channels 에 `push` 포함) | `targetRole` 그대로 | `title` / `body` (캠페인 텍스트) | `ctaUrl` (캠페인 정의 사용) | ✓ | `audienceFilter`, `dontShowAgain`, `dismissedUntil`, `maxImpressionsPerUser` 모두 준수. |
| `unread_reminder` *(신설 후보)* | M / A / F / P / H 중 **3일 이상 인앱 미열람** | "확인 안 한 알림 N건" | `/notifications` | ✓ | 사용 유도 목적. 글로벌 일일 한도(§7) 적용. |

### 5.3 사용자 요구의 명시적 매핑

- **관리소장 / 경리 / 시설기사**: 위 §5.1 의 업무 안내(승인/검침/회계/연체/법정선임)
  + §5.2 의 캠페인·미열람 리마인드.
- **파트너사**: §5.1 의 신설 `quote_request_matched` 만 1차 푸시 대상으로 한다.
  기존 `quote_received`(매니저 측) 와 혼동 금지.
- **본사**: `complaint_escalation` 만 1차 대상. 다른 hq_executive 인앱 알림은
  푸시 대상 아님(과다 발송 방지).

---

## 6. 인앱 알림과 푸시의 통합 규칙 (중복 발송 방지)

### 6.1 단일 진실 원천: `notificationsTable` row 1건 = 푸시 1건

업무 트리거(§5.1) 는 다음 **순서**로 처리한다.

```
1) 비즈니스 라우트가 db.insert(notificationsTable) 으로 인앱 row 생성
2) 동일 트랜잭션의 after-commit 훅이
   enqueuePush({ notificationId, recipients, payload })
   를 호출 (push_outbox 테이블 권장 — outbox 패턴)
3) 발송 워커가 outbox 에서 읽어 §3 의 토큰 테이블로 fan-out
4) 발송 결과를 push_dispatch_log 에 기록 (notificationId 와 join)
```

- **중복 방지 키**: `(notificationId, userId, deviceId)` 유니크 인덱스. 워커가
  같은 row 를 두 번 보내지 못한다.
- **푸시 클릭 시 인앱 read 동기화**: 클라이언트가 deep-link 진입 시
  `PATCH /notifications/:id/read` 를 호출. 또는 푸시 페이로드에 `notificationId`
  를 실어 자동 처리.
- **실패한 푸시는 인앱 row 를 “읽지 않음” 그대로 유지** — 사용자가 앱을 열면
  bell 에서 따라 잡힌다(이중 안전망).

### 6.2 캠페인 채널 통합

- `platform_campaigns.channels` 가 `push` 를 포함하면, 캠페인 발송 워커가 §3 의
  토큰 테이블로 직접 발송한다(인앱 row 는 만들지 않음 — 캠페인은
  `platform_campaign_user_states` 가 별도 추적자).
- 발송 시 같은 사용자에 대해 `platform_campaign_user_states.impressionCount` 를
  +1 처리. **modal/banner 와 카운트를 통합**해 `maxImpressionsPerUser` 가 채널
  교차로도 정확히 적용되게 한다.
- `dontShowAgain=true` / `dismissedUntil > now()` 사용자에게는 push 도 보내지
  않는다(`required` 캠페인은 예외).

### 6.3 deep-link 규약

| 영역 | 규약 |
| --- | --- |
| 모바일 앱 | `manager-da://{path}` 커스텀 스킴 + Universal Link/App Link 백업 |
| 웹/PWA | `/{path}` (현 라우터 그대로) |
| 페이로드 키 | `{ data: { route, notificationId?, campaignId? } }` |

---

## 7. 운영 정책

### 7.1 무음 시간대(Quiet Hours)

- **기본값**: 22:00 ~ 08:00 (Asia/Seoul). 사용자별 오버라이드 허용.
- **예외(무음 적용 안 함)**: `complaint_escalation`, 그리고 §5.1 표의 “무음 시간
  적용 = ×” 로 표시된 트리거.
- 무음 시간대에 발생한 **무음 적용 푸시는 다음 활성 시각으로 deferred** (인앱 row
  는 즉시 생성). 이를 위해 `push_outbox.notBefore` 컬럼.

### 7.2 옵트아웃 / 사용자 환경설정

- **신규 컬럼 권장**: `users.disabledNotificationTypes` (text JSON array) — 사용자가
  개별 트리거를 끌 수 있음. **단, 다음 트리거는 옵트아웃 불가(필수)**:
  - `complaint_escalation` (본사)
  - `approval_step_pending` (본인 결재 차례)
  - `data_destruction_alert` (개인정보 보호 의무)
- **신규 컬럼 권장**: `users.disabledCampaignChannels` (text JSON array, 값
  서브셋 of `campaignChannels`) — 캠페인의 채널별 옵트아웃. push 만 끌 수
  있도록 함.
- **무음 시간대**: `users.quietHoursStart`, `users.quietHoursEnd` (text "HH:MM",
  KST 기준).
- 위 컬럼들은 본 문서에서는 **권장만** 하며 실제 마이그레이션은 후속 태스크.

### 7.3 일일 한도

- **사용자당 일일 한도**: 캠페인 push 는 사용자당 **최대 3건/일** (글로벌 가드).
  `platform_campaign_user_states` 의 `lastImpressionAt` + push 카운트 분기 컬럼
  필요(또는 별도 `push_dispatch_log` 일일 집계).
- **업무 트리거에는 일일 한도를 적용하지 않는다** — 단, 동일 `notificationType` +
  동일 entity 의 중복은 §6.1 의 unique index 로 차단.

### 7.4 재시도 / 실패 로깅

- `push_dispatch_log(id, notification_id, user_id, device_id, provider, request_id, status, response_code, response_body, attempt, sent_at)`.
- **재시도**: 지수 백오프, 최대 3회. 5xx / 네트워크 오류만 재시도. 4xx 는 즉시
  실패 처리.
- **토큰 무효화 응답 매핑**:
  - Expo: `details.error == "DeviceNotRegistered"` → `isActive=false`.
  - FCM: `UNREGISTERED`, `INVALID_ARGUMENT(token)` → `isActive=false`.
  - APNs: `BadDeviceToken`, `Unregistered` → `isActive=false`.
- 모든 무효화는 §3.2 “게이트웨이 응답 처리” 흐름으로 통일.

### 7.5 토큰 만료 정책

- **soft-expire**: `lastSeenAt < now() - 180d` → `isActive=false`.
- **hard-delete**: `isActive=false AND invalidatedAt < now() - 90d` → 물리 삭제.
- 매월 1회 GC 잡(`scheduler.ts` 에 추가) 으로 실행.

---

## 8. 보안·프라이버시 체크리스트

- 푸시 페이로드에 **민감 정보 본문(주민번호·계좌·민원 상세)** 미포함. 제목/요약만
  표시하고 상세는 deep-link 로 앱 내에서 인증 후 조회.
- iOS 의 경우 `mutable-content` 로 잠금화면 제목 가공 가능 — 그러나 본문 노출은
  여전히 최소화.
- 토큰은 **사용자 자신의 토큰만 조회/삭제** 가능 — 라우트에 `requireAuth` 적용,
  `userId` 강제.
- 로그(`push_dispatch_log.response_body`) 에 토큰 raw 노출 금지(마스킹).

---

## 9. 단계적 도입 로드맵 (후속 태스크 단위 제안)

각 단계는 본 문서 산출 후 별도 태스크로 분할하여 발주한다. 기존 PROPOSED
태스크와의 연계도 함께 표기.

| 단계 | 제안 태스크 | 산출물 | 의존 | 기존 태스크와의 관계 |
| --- | --- | --- | --- | --- |
| **1. 토큰 인프라** | `푸시 토큰 테이블 + 등록/해제 API 추가` | §3.1 스키마 마이그레이션, `POST/DELETE /me/push-tokens`, 사용자 환경설정 컬럼(§7.2) 마이그레이션 | — | 신규. #56(보증 만료 푸시), #60(본사 민원 푸시) 의 전제. |
| **2. 발송 코어** | `푸시 발송 워커 + outbox 패턴 + Expo 어댑터` | `push_outbox`, `push_dispatch_log` 테이블, `ExpoPushGateway`, scheduler 잡, 무효화 응답 처리 | 1 | 신규. |
| **3. 하이브리드 앱 셸** | `manager-app Capacitor 래핑 (iOS/Android 빌드)` | Capacitor 통합, 권한 요청, 토큰 등록 클라이언트 코드, deep-link 라우터 브릿지 | 1 | 신규(옵션 A 단기 권고). |
| **4. 업무 트리거 연결** | `notificationsTable insert 지점 → outbox enqueue 통합` | 기존 `quote_received`, `complaint_escalation`, `approval_*`, `delinquency_*`, scheduler 트리거에 push 연결 | 2 | **#60(본사 민원 푸시) 흡수.** 기타 보증/유지보수 푸시는 #56 흡수. |
| **5. 파트너 신규 트리거** | `quote_request_matched 트리거 + 매칭 로직` | RFQ open 시 매칭 파트너 산정 → 인앱 row + push (§5.1) | 2 | 신규(파트너 푸시 요구사항 충족). |
| **6. 캠페인 push 활성화** | `platform_campaigns push 채널 발송 통합` | 캠페인 워커가 outbox 사용, `dontShowAgain`/`dismissedUntil`/한도 통합, 운영자 가이드 | 2 | readiness 문서의 §2 흡수. |
| **7. 사용자 설정 화면** | `알림 설정 화면(무음 시간대/옵트아웃/디바이스 목록)` | 마이페이지 내 설정 UI, `PATCH /me/notification-prefs` | 1, 2 | 신규. |
| **8. (중기) Expo artifact** | `manager-app-mobile (Expo) 신규 artifact` | 핵심 화면(파트너 견적 응답·시설 작업 보고) RN 구현, EAS 빌드 | 1, 2 | 옵션 B 중기 이행. |
| **9. (옵션) FCM/APNs 직접 어댑터** | `Capacitor 단독 운영 시 FCM/APNs Gateway 추가` | `FcmGateway`, `ApnsGateway`, 키/인증서 secret 운영 가이드 | 2 | 단기 Capacitor 가 Expo Push 호환 모드를 못 쓸 때만 필요. |

### 9.1 우선순위 추천

가장 **비즈니스 영향이 크고 의존이 적은** 1·2·3 단계를 먼저 1개 마일스톤으로
묶고, 그 다음 마일스톤에서 4·5·6 을 함께 발주하면 §1.4 의 모든 인앱 트리거가
1~2주 안에 일괄 푸시화된다. 7 은 베타 출시 전 마지막에 합류해도 무방하다.

---

## 10. 부록 — 결정 요약 (본사 검토자용)

| 결정 항목 | 결론 |
| --- | --- |
| 클라이언트 스택 | **단기 Capacitor 래핑**, 중기 Expo artifact 점진 도입 |
| 발송 게이트웨이 | **Expo Push API 우선** + 어댑터 패턴(FCM/APNs 추가 가능) |
| 토큰 모델 | `(userId, deviceId)` 단위 멀티 디바이스, provider 명시 |
| 인앱 ↔ 푸시 통합 | 인앱 row 1건 = 푸시 1건. outbox 패턴 + 유니크 키로 중복 방지 |
| 캠페인 푸시 | `platform_campaign_user_states` 카운트 통합, `dontShowAgain`/한도 준수 |
| 옵트아웃 | `disabledNotificationTypes`, `disabledCampaignChannels`, `quietHours*` 컬럼 신설 권장 |
| 도입 순서 | 토큰 인프라 → 발송 코어 → Capacitor 셸 → 업무 트리거 → 파트너 트리거 → 캠페인 → 설정 화면 → (중기) Expo |

본 문서로 후속 구현 태스크를 발주할 수 있는 수준의 상세도가 확보되었다.
실제 코드 변경은 §9 의 단계별 태스크에서 다룬다.

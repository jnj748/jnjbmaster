# 푸시 알림 도입 준비 문서

> **⚠️ 후속 문서로 승계됨 (Task #352)**
> 본 문서는 캠페인 push 채널이 NO-OP 인 이유와 도입 체크리스트를 짧게 요약한
> 1차 메모이며, 정식 후속/심화 버전은
> [`push-notification-architecture.md`](./push-notification-architecture.md)
> 에 정리되어 있다. 신규 작업·태스크 발주는 후속 문서를 기준으로 한다.
> (본 문서는 히스토리 보존용으로 유지)

본 문서는 Task #283 으로 도입된 캠페인 알림 시스템에서 "푸시(push)" 채널이
현재 NO-OP 인 이유와, 모바일 앱 전환 시 실제 푸시 발송으로 확장하기 위한
설계·운영 체크리스트를 정리한다.

## 현재 상태 (As-Is)

- 캠페인 채널 enum 에는 `modal`, `banner`, `bell`, `push` 4 종이 모두 정의되어 있다.
- 관리자 UI(`/platform/campaigns`)에서 push 채널을 선택·저장할 수 있고
  데이터베이스에도 그대로 저장된다.
- 그러나 백엔드(`platform_campaigns` 라우트, 알림 송출 로직)는 push 채널을
  **무시**한다. 사용자에게 푸시 토큰을 요청하지 않으며, 스토어 등록도 없다.
- 사용자에게 노출되는 캠페인은 modal/banner/bell 3 채널만으로 충분히
  도달 가능한 상태이며, push 는 향후 확장 자리만 잡아 둔 것이다.

## 도입 시 필요한 작업

### 1. 클라이언트 (Expo / 네이티브 앱)
- Expo Notifications + EAS Build 기반의 모바일 빌드를 우선 정식화한다
  (현재 워크스페이스의 `manager-app` 은 PWA 위주이며 Expo artifact 가 아직 없다).
- 앱 최초 진입 시 푸시 권한 모달 → 토큰 발급 → 백엔드 등록 (`POST /me/push-tokens`).
- 토큰 저장 테이블: `user_push_tokens(user_id, platform, token, last_seen_at)` 신설 필요.
- 토큰 만료/무효화 처리 (Apple/Google 응답 코드에 따른 토큰 비활성화).

### 2. 서버
- `platform_campaigns` 의 `channels` 가 `push` 를 포함할 때 만 발송 큐에 적재.
- 발송 큐: BullMQ/Cron 둘 중 하나 (Replit 환경에서는 단순 cron + 잠금 토큰
  방식이 안전). 발송 시 `platform_campaign_user_states` 의 노출 횟수도 함께
  +1 처리하여 modal/banner 와 카운트를 통합한다.
- 외부 발송 게이트웨이는 다음 중 택일:
  - Expo Push API (가장 빠른 도입 경로, 자체 키 불필요)
  - FCM (Android 직접) + APNs (iOS 직접) — 운영 복잡도↑
- 한국 시장에서 카카오톡 비즈메시지 / 알림톡 채널은 별도 운영비/심사가 필요하므로
  본 작업의 범위에서 제외한다 (요구 시 별도 카카오 비즈채널 도입 태스크 분리).

### 3. 운영·정책
- 푸시 무음 시간대(예: 22:00 ~ 08:00) 글로벌 가드, 사용자 개별 설정 화면.
- 발송 실패 로그 확인 + 재시도 정책 (지수 백오프, 최대 3 회).
- 사용자당 1 일 푸시 한도 (캠페인 기본 `maxImpressionsPerUser` 와 분리된
  플랫폼 글로벌 한도) — 스팸 방지.
- 옵트아웃 1-tap 링크 / 앱 내 캠페인 알림 끄기 토글 (`users.disabledCampaignChannels`
  컬럼 신설 권장).

### 4. 마이그레이션
- 기존에 push 채널로 저장된 캠페인은 자동으로 활성화되지 않도록, 푸시 도입
  배포 직전 한 번 `is_active=false` 로 강제 토글 후 운영자가 수동 검토하도록
  공지한다.
- 토큰 등록 안 된 사용자에 대해서는 push 발송을 건너뛰고 modal/banner 채널이
  계속 fallback 으로 동작한다 (현재 구조 그대로 유지).

## 결론

현 시점에서는 push 채널 UI 와 데이터 모델까지만 선반영하여, 모바일 앱 전환
이후 위 체크리스트를 순차 진행하면 추가 schema 변경 없이 곧바로 발송 파이프라인을
연결할 수 있도록 설계되어 있다.

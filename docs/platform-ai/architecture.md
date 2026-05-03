# Platform-Level Building Management AI — 1차 설계 (Phase 1)

> [Task #761] 관리의달인(SaaS) — 단일 건물 어시스턴트를 넘어, 전 건물(포트폴리오)
> 데이터로 운영 인사이트를 주는 "플랫폼 레벨 AI" 의 1차 설계 문서.

## 1. 목표

| 구분 | 단일 건물 AI (현행) | 플랫폼 AI (신규) |
|------|---------------------|------------------|
| 시야 | 사용자가 배정된 한 건물 | 비교군 ↔ 전체 포트폴리오 |
| 사용자 | manager / platform_admin | platform_admin (전체) + manager (익명 비교군) |
| 입력 | building/complaints/inspections/bills 등 단일 건물 | 동일 + 비교군 집계(평균·중앙값·분위수) |
| 출력 | 즉답·인용 | 이상치 카드 + 자연어 요약 + 1줄 코멘트 |

## 2. 데이터 도메인

플랫폼 AI 가 다루는 1차 데이터 도메인은 다음과 같다. 모두 기존 스키마(`@workspace/db`)를 재사용하고
신규 테이블은 만들지 않는다.

| 도메인 | 테이블 | 용도 |
|--------|--------|------|
| 건물 메타 | `buildings` | 비교군 정의(규모/연식/지역). `totalUnits / totalArea / completionDate / sido / sigungu` |
| 관리비 추세 | `monthly_bill_summaries` | 항목별 MoM/YoY 이상치, 단가 비교 |
| 민원 | `complaints` | 카테고리별 누적·재발·민감 키워드 |
| 점검 | `inspections` | 미이행/임박 비율 |
| 보증 | `building_warranties` | 만료 임박 누락 |
| 계약 | `contracts` | 자동연장·만료 임박 누락 |
| 공통 자료 | `platform_knowledge_docs` | 법령/가이드(전사) — Tier1/2 RAG 후보 |
| 채팅 로그 | `ai_chat_messages` | tier/tokens/cost 기록 (이번 작업에 추가) |

## 3. 비교군 정의 ("peer group")

매니저에게 보여줄 비교군은 다음 3축으로 정의한다. 매칭이 부족하면 더 넓은 축까지 확장한다.

1. **규모**: `totalUnits` 가 ±30% 안인 건물.
2. **연식**: `completionDate` 의 연도가 ±7년 안인 건물.
3. **지역**: 동일 `sido` (광역). 매칭 < 5 건이면 광역 조건만으로도 사용.

비교군 N < 3 인 경우엔 비교 결과를 노출하지 않고 "비교군이 부족합니다" 로 답한다.

## 4. 익명화 / 다테넌시

- 매니저(manager) 응답에는 **다른 건물의 식별자(buildingId/name/주소/관리사무소 전화)** 를 일절 포함하지
  않는다. 비교 데이터는 항상 집계값(평균·중앙값·분위수·N)만 노출한다.
- platform_admin 은 식별 가능한 형태로 전체 건물 데이터를 볼 수 있다.
- 데이터 흐름의 모든 경계(`getCrossBuildingPeerStats` 등)는 `getAccessibleBuildingIds(req)` 의
  결과로 사용자 시야를 제한한 뒤, 매니저면 추가로 비교군 집계로만 응답을 가공한다.
- AI 컨텍스트에 들어가는 행은 모두 익명화 키(`peerCount / mean / median / p25 / p75`)만 사용하며,
  LLM 프롬프트에 다른 건물의 식별자를 노출하지 않는다(시스템 프롬프트가 이를 강제).

## 5. 모델 라우팅 (Cost-Tier Router)

### 5.1 티어

| Tier | 모델 (현행) | 용도 | 비용/요청 (대략) |
|------|-------------|------|-------------------|
| 0 — Free | `gemini-2.5-flash` (max 512 tokens, 짧은 컨텍스트) | 분류·길이 짧은 OCR·키워드 추출·1줄 요약 | $0 ~ $0.0002 |
| 1 — Cheap | `gemini-2.5-flash` (max 8192 tokens) | 일상 챗봇·OCR 본 처리·이상치 1줄 코멘트 | ≈ $0.001 |
| 2 — Advanced | `gemini-2.5-pro` | 비교/계획/전략/근거/리스크/추론 | ≈ $0.01 |

> 참고: Replit AI Integrations 가 제공하는 모델 카탈로그에서 **gemini-2.5-flash / gemini-2.5-pro**
> 가 1차 후보다. 무료 LLM 후보(예: `gpt-4o-mini` via OpenAI Free Tier, Groq llama-3, Together,
> 또는 Cloudflare Workers AI 의 Llama-3.3-70B-instruct) 는 향후 Tier 0 의 백엔드 옵션으로
> 검토하되, 현재는 Gemini Flash 의 짧은 토큰 범위 호출을 Tier 0 으로 본다.

### 5.2 자동 승급 (auto-promote)

`pickTier(content, hint)` 는 다음 규칙으로 티어를 결정한다(기본 흐름: Tier 0 → 1 → 2).

- 호출자가 명시한 `hint` 가 우선(`'tier0' | 'tier1' | 'tier2'`).
- 길이 > 800 자 → Tier 2.
- "분석/비교/전략/계획/추천/예측/왜/근거/리스크/최적" 키워드 → Tier 2.
- 길이 60~800 자 OR 일반 챗 키워드("?/어떻게/방법/절차/어디/언제/누가/얼마/가능/필요") → Tier 1.
- 그 외 짧고 단순한 사실 질의(예: "준공일?", "엘리베이터 몇 대?") → Tier 0 (가장 저렴).

호출 중 실패(429/5xx/JSON 파싱 실패) 시 한 단계 자동 승급해 1회 재시도한다 (tier0→1, 1→2).

### 5.3 회계 (accounting)

`routedGenerate` 가 반환하는 결과에는 `tier / model / inputTokens / outputTokens /
costEstimateUsd` 가 포함된다. `ai_chat_messages.metadata` jsonb 컬럼에 저장한다.

### 5.4 공유 위치

- 라이브러리: `artifacts/api-server/src/lib/llmRouter.ts`
- 사용처: `aiAssistant`, `billOcr`, `contractOcr`, `meterPhotoOcr`, `memoOcr`, 향후 `portfolio anomalies`

## 6. MVP 1 — 포트폴리오 이상치 위젯 (admin-dashboard)

플랫폼 운영자가 처음 보는 화면(`/platform`) 에 "이상치 카드 N건" 위젯을 추가한다.

- **백엔드**: `GET /platform/portfolio-anomalies`
  - 권한: `platform_admin` 만.
  - 룰 기반(rule):
    - 관리비 MoM ±25% / YoY ±30%
    - 민원 6개월 누적 ≥ 비교군 95퍼센타일 (`complaint_surge`)
    - 30일 이상 미해결 민원 ≥ 3건 (`complaint_backlog`)
    - 점검 미이행(기한 지남 + 미완료) ≥ 1건 (`inspection_overdue`)
    - 30일 이내 도래 + 미완료 점검 (`inspection_imminent`)
    - 보증 만료 30일 이내 (`warranty_expiring`)
  - LLM(Tier 1): 룰이 카드 1장씩에 대해 "1줄 한국어 코멘트" 만 생성.
  - 결과는 `[{ buildingId, buildingName, kind, severity, summary, metric }, …]`
- **프론트엔드**: `admin-dashboard.tsx` 에 `PortfolioAnomalyPanel` 추가, 데스크탑/모바일 동시 노출.

## 7. MVP 2 — 비교군 NL 질문 (AI 어시스턴트)

기존 `/api/ai/chat` 안에서 사용자의 질문이 비교군과 관련될 때 컨텍스트에 비교군 집계를 함께 넣는다.

- 매니저가 "우리 건물 청소비가 비싼 편이야?" 처럼 묻는 경우, 컨텍스트에
  `peerStats: { metric, n, mean, median, p25, p75 }` 만 익명으로 들어간다.
- platform_admin 의 동일 질문은 추가로 `topBuildings` (식별 가능한 상위/하위 3건물) 도
  함께 노출되며 시스템 프롬프트 규칙 #10 이 매니저 응답에서는 식별자 노출을 금지한다.
  구현 위치: `aiAssistant/context.ts` 의 `getCrossBuildingTopList` (role gate 후 호출).
- SSE 응답에는 별도 `peerStats: { n }` 이벤트가 함께 전송되어 클라이언트가
  "비교군 N개 건물 기준" 배지를 메시지 위에 렌더한다.
- 모델은 Tier 2 (`gemini-2.5-pro`) 로 자동 승급되며, 답변에는 비교군 N 과 분위수가 포함된다.

## 8. 로드맵

- Phase 1 (이번 작업, MVP 1·2 + 공통 라우터): ✓
- Phase 2: 임베딩 기반 RAG (platform_knowledge_docs / 계약서·민원 본문) — 무료 임베딩 후보 검토.
- Phase 3: 비용/품질 자동 학습 (사용자 만족도 시그널 → tier 가중치 조정).
- Phase 4: 자체 호스팅 LLM (Llama-3.3 / Qwen-2.5) 을 Tier 0 으로 검토.

## 9. 무료 LLM 후보 검토

| 후보 | 현재 가능? | 비고 |
|------|-----------|------|
| Gemini Flash (Replit AI Integrations) | ✅ | 현재 Tier 0/1 의 기본 |
| Groq llama-3.3-70b | △ | 별도 키 필요. 매우 빠르나 무료 한도 낮음 |
| Cloudflare Workers AI | △ | 무료 티어 제한적, 한국어 품질 모니터링 필요 |
| 자체 호스팅 (Ollama/llama.cpp) | ✗ | Replit 환경에서 GPU 미지원, Phase 4 에 검토 |

지금은 **Gemini Flash 를 Tier 0/1 양쪽으로 사용** 하고, Tier 2 만 Pro 로 분기한다. 추가 무료 LLM 도입은
Phase 2 이후 비용 데이터(`ai_chat_messages.metadata.costEstimateUsd`)가 쌓인 뒤 검토한다.

import { Sparkles, Calculator, Handshake } from "lucide-react";

// [Task #444] 메인(로그인) 화면 좌측 브랜드 패널.
//   - 데스크톱(≥ md): 좌측 컬럼에서 세로 중앙 정렬, 브랜드 컬러 위 화이트 톤.
//   - 모바일(< md): 로그인 카드 위에 컴팩트하게 스택. 회원가입 모드에서는
//     `compact` 로 더 축약하여 폼 스크롤이 길어지지 않도록 한다.
interface Props {
  // 모바일에서 더 축약 표시할지 여부(회원가입 단계 등에서 사용).
  compact?: boolean;
}

export function LoginBrandPanel({ compact = false }: Props) {
  return (
    <div
      className={
        // 데스크톱: 컬럼 내부에서 세로 중앙 정렬, 좌측 패딩 여유.
        // 모바일: 상단 컴팩트, 좌측 정렬.
        "w-full text-white " +
        "flex flex-col justify-center " +
        "px-5 md:px-10 lg:px-16 " +
        (compact ? "py-3 md:py-10" : "py-5 md:py-10")
      }
    >
      {/* 브랜드명 + 메인 카피 */}
      <div className={compact ? "mb-2 md:mb-8" : "mb-4 md:mb-8"}>
        <h1
          className={
            "font-extrabold tracking-tight leading-tight " +
            // 모바일에선 한 줄 안에 들어갈 정도, 데스크톱에선 큼직하게.
            (compact
              ? "text-2xl md:text-5xl lg:text-6xl"
              : "text-3xl md:text-5xl lg:text-6xl")
          }
        >
          관리의달인
        </h1>
        <p
          className={
            "mt-2 md:mt-4 font-bold text-white/95 leading-snug " +
            (compact
              ? "text-sm md:text-2xl lg:text-3xl"
              : "text-base md:text-2xl lg:text-3xl")
          }
        >
          AI로 실현하는 스마트 건물관리 솔루션
        </p>
      </div>

      {/* 역할별 핵심 기능 — 모바일 컴팩트 모드에서는 숨김 */}
      <ul
        className={
          "space-y-2 md:space-y-3 text-white/90 " +
          (compact ? "hidden md:block" : "hidden sm:block")
        }
      >
        <li className="flex items-start gap-2.5">
          <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/20">
            <Sparkles className="h-3.5 w-3.5 text-white" aria-hidden />
          </span>
          <span className="text-sm md:text-base leading-snug">
            <strong className="font-semibold text-white">관리소장</strong>
            <span className="text-white/80">
              {" "}
              : 법정업무스케줄 AI자동생성 + 공고문·보고서 자동생성
            </span>
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/20">
            <Calculator className="h-3.5 w-3.5 text-white" aria-hidden />
          </span>
          <span className="text-sm md:text-base leading-snug">
            <strong className="font-semibold text-white">경리</strong>
            <span className="text-white/80">
              {" "}
              : AI관리비 자동 부과 + 고지서 발송 + 수납관리
            </span>
          </span>
        </li>
      </ul>

      {/* 파트너 권유 박스 — 모바일 컴팩트 모드에서는 숨김 */}
      <div
        className={
          "mt-4 md:mt-8 rounded-xl border border-white/25 bg-white/10 px-4 py-3 md:px-5 md:py-4 backdrop-blur-sm " +
          (compact ? "hidden md:block" : "hidden sm:block")
        }
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-300/95 text-slate-900">
            <Handshake className="h-4 w-4" aria-hidden />
          </span>
          <div className="leading-snug">
            <p className="text-sm md:text-base font-semibold text-white">
              건물관리 분야 파트너사이신가요?
            </p>
            <p className="mt-0.5 text-xs md:text-sm text-amber-200">
              지금 건물 모든 분야에 비교견적을 넣어 보세요.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginBrandPanel;

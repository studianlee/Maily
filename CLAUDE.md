# Maily - AI 이메일 클라이언트

## 프로젝트 개요
Tauri + React 기반 데스크탑 이메일 클라이언트. EXAONE 3.5 (로컬 LLM)를 활용한 스마트 답변 생성 기능 포함.

## 기술 스택
- **Frontend**: React 19, TypeScript, Vite
- **Desktop**: Tauri 2.x (Rust)
- **AI**: EXAONE 3.5 2.4B (LG AI Research) - Ollama 런타임
- **인증**: OAuth2 (Google, Microsoft)

## 구현 완료된 기능

### 핵심 기능
- [x] Gmail 연동 (로그인, 메일 조회, 전송, 삭제, 보관)
- [x] Outlook 연동 (로그인, 메일 조회, 전송, 삭제, 보관)
- [x] AI 답변 생성 (5가지 톤: 수락, 거절, 문의, 정중, 친근)
- [x] 이메일 예약 발송
- [x] 첨부파일 다운로드
- [x] 스마트 카테고리 분류 (내부/외부/인증/프로모션)
- [x] 내부 도메인 설정

### UI/UX
- [x] 메일 검색 (디바운스 300ms)
- [x] 무한 스크롤 페이지네이션
- [x] 토스트 알림 (시스템 + 인앱)
- [x] 윈도우 크기 애니메이션

## TODO (우선순위순)

### 최우선 (완료)
- [x] 첨부파일 업로드 (새 메일/답장 작성 시)
- [x] 일괄 선택/처리 (체크박스)
- [x] 중요 표시/플래그
- [x] CC/BCC 지원

### 중간 우선순위
- [ ] 폴더 관리 (받은편지함/보낸편지함/휴지통/스팸)
- [ ] 메일 스레딩 (대화 연결)
- [ ] HTML 메일 렌더링
- [ ] 인라인 이미지 표시
- [ ] 멀티 계정 동시 사용
- [ ] 다크 모드
- [ ] 서명 관리

### 낮은 우선순위
- [ ] Gmail 라벨 관리
- [ ] 메일 필터/규칙
- [ ] 고급 검색 (발신자, 날짜, 첨부파일 필터)
- [ ] 오프라인 모드
- [ ] IMAP/SMTP 지원

## 프로젝트 구조

```
src/
├── components/
│   ├── Inbox/          # 메일함 (목록, 검색)
│   ├── Feature.tsx     # AI 답변 생성 화면
│   ├── NewEmail.tsx    # 새 메일 작성
│   ├── ScheduledList.tsx # 예약 메일 목록
│   ├── Settings.tsx    # 설정
│   └── Menu.tsx        # 메인 메뉴
├── hooks/
│   ├── useGmail.ts     # Gmail API
│   ├── useOutlook.ts   # Outlook API
│   ├── useAI.ts        # Ollama 연동
│   ├── useScheduledEmail.ts
│   └── ...
├── utils/
│   ├── emailUtils.ts   # 이메일 파싱
│   ├── dateUtils.ts    # 날짜 포맷
│   └── emailCategorizer.ts # 스마트 분류
├── types/index.ts
└── constants/index.ts
```

## 환경변수
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
```

## 개발 명령어
```bash
npm run dev      # 개발 서버
npm run build    # 빌드
npm run tauri dev    # Tauri 개발
npm run tauri build  # Tauri 빌드
```

## 최근 작업
- 2025-01: Outlook 통합, 예약 발송, 보안 시크릿 처리 추가
- 초기: Gmail 통합, AI 답변 생성 구현

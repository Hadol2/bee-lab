# cert-lab

자격증 필기 기출문제를 풀고, 틀린 문제까지 끝낼 수 있게 돕는 학습 웹앱입니다.
풀이·채점·오답 복습 같은 학습 기능은 공통으로 두고, 자격증은 시험 모듈 단위로 붙입니다.

## 시험 모듈

| 모듈 | 범위 | 상태 | 사이트 |
| --- | --- | --- | --- |
| 폐기물처리기사 | 2016~2022 기출 20회차, 2,000문제, 필기 5과목 | 운영 중 | https://waste-engineer-lab.vercel.app |

## 학습 기능

- 회차별 풀이: 실제 시험 그대로 100문제
- 과목별 연습: 과목을 골라 10~100문제를 무작위로 출제
- 실전 모의고사: 5과목에서 20문제씩 뽑아 100문제로 구성하고, 과목 40점·평균 60점 기준으로 합격권 여부 표시
- 답을 고르면 바로 정답과 해설 확인 (자체 제작 해설, 오류 제보 기능)
- 오답 복습: 로그인하면 기기 간 오답 동기화, 틀린 문제만 모아 다시 풀기
- 새로고침해도 진행 중인 시험 세션 유지

## 기술 스택

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS 4, Pretendard
- Neon Auth (이메일 로그인), Neon Postgres (오답·진행 기록)
- Vercel 배포

## 구조

```
app/                  화면(quiz-app.tsx)과 API 라우트
lib/                  문제 세트 구성, 채점, 오답 동기화, 해설 로직
public/data/exams/    회차별 기출 JSON과 manifest.json(사용 중인 회차 목록)
public/data/          출제기준 분류, 공식 카드, 복습 우선순위 등 파생 데이터
scripts/              기출 PDF 변환, 해설 생성·검증, 파생 데이터 생성, DB 마이그레이션
tests/                문제 데이터, 세트 구성, 채점, 동기화 계약 테스트
```

## 로컬 실행

Vercel 프로젝트의 환경 변수를 내려받은 뒤 실행합니다.

```bash
vercel env pull .env.local
npm install
npm run db:migrate
npm run build && npm start
```

> `npm run dev`(Turbopack)는 이 저장소에서 메모리를 수십 GB까지 쓰다 멈춘 적이 있습니다.
> 개발 서버가 필요하면 `NODE_OPTIONS=--max-old-space-size=4096 npx next dev --webpack`으로 실행하세요.

## 확인 및 배포

```bash
npm run lint
npm test
vercel deploy --prod
```

`npm test`는 빌드한 뒤 문제 데이터, 과목별·모의고사 구성, 채점, 로그인 화면, 비로그인 오답 API 보호를 확인합니다.

## 로드맵

- 모듈 분리: 지금은 폐기물처리기사 데이터와 과목 설정이 앱에 직접 들어가 있습니다. 시험별 모듈(문제 데이터, 과목, 합격 기준)로 분리할 예정입니다.
- 모듈 추가: 수질환경기사, 대기환경기사 등

# 폐기물기사 LAB

폐기물처리기사 필기 기출문제 학습 웹앱입니다.

- 22회차, 2,200문제
- 필기 5과목별 무작위 20문제
- 과목당 20문제씩 구성하는 100문제 모의고사
- 세부 유형 필터, 해설, 원문 PDF 연결
- 이메일 로그인 및 사용자별 오답 동기화

## 구성

- Next.js 16
- Vercel 배포 및 서버 API
- Neon Auth
- Neon Postgres

## 로컬 실행

Vercel 프로젝트의 환경 변수를 내려받은 뒤 실행합니다.

```bash
vercel env pull .env.local
npm install
npm run db:migrate
npm run dev
```

## 확인 및 배포

```bash
npm run lint
npm test
vercel deploy --prod
```

`npm test`는 전체 문제 데이터, 과목별/모의고사 구성, 로그인 화면, 비로그인 오답 API 보호를 확인합니다.

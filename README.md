# 수도 내신분석

수학도서관 내신 기출 보관함과 학교별 누적 분석.

- 화면: GitHub Pages (`index.html`, `styles.css`, `app.js`, `report.js`, `register.js`, `ai.js`, `boot.js`)
- 기기별 화면: 폭 1200px 이상 PC, 768~1199px 아이패드(아이콘 메뉴·목록/상세 분할·상담 모드), 767px 이하 휴대폰(아래 탭·카드·시트)
- 분석지: 간결 A4 · 카톡 카드 · 상세 2쪽, '이미지 복사하기'로 카톡·문자에 붙여넣기 (html2canvas)
- 시험 등록(4단계): 보관함 시험 고르기 또는 새 시험 입력 → PDF·사진 올리기 → AI(Claude 또는 GPT)가 문항표 채우기 → 검수 → 저장. MYBOX 폴더를 통째로 골라 분석 전 시험을 한꺼번에 읽어 '검수 대기'에 넣을 수도 있습니다(PC).
- AI 중계: `worker/worker.js` (Cloudflare Worker). API 키는 Worker 비밀 값에만 둡니다. 설치: `worker/설치안내.md`
- 데이터: Firebase `sudo-naesin` 프로젝트의 Firestore (`exams`, `analyses`, `types`, `drafts`(검수 대기), `meta`)
- 로그인: Google, `firestore.rules`에 적힌 계정만 접근
- 시험 데이터는 이 저장소에 넣지 않습니다. 처음 한 번 앱의 "데이터 넣기" 화면에서 데이터 파일을 골라 저장합니다.

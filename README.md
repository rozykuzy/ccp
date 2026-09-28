# Archive Index — Carol Christian Poell

https://rozykuzy.github.io/ccp/

지금 판매 중인 캐롤 크리스찬 포엘 매물. 매일 07:17 KST 수집·조판·발행(`.github/workflows/daily.yml`).

| 파일 | 하는 일 |
|---|---|
| `collect.mjs` | 모든 수집기를 돌려 `data/raw/` 에 쓴다 |
| `sources.mjs` | 야후옥션(진행·낙찰) · 메루카리 · 라쿠마 · 후루츠패밀리 브랜드 페이지 · 야후 플리마 · 세컨드스트리트 |
| `mercari.mjs` | 메루카리 검색 페이지를 브라우저로 그려 읽는다 |
| `fruitsfamily.mjs` | 후루츠패밀리 신규 등록(사이트맵)과 매물 페이지 재확인 |
| `grailed.mjs` · `ebay.mjs` | Grailed 검색 서비스(디자이너 = Carol Christian Poell) · eBay 공식 API(키가 있을 때만) |
| `lib.mjs` | robots.txt 준수 · 요청 간격 · 이름을 밝힌 UA · 페이지 읽기 |
| `classify.mjs` | 상품명 읽기 — 연도·시즌, 분류, 사이즈, 모델 번호, 제외 |
| `build.mjs` | 대장(`data/ledger.json`) 갱신 → `site/index.html` · `data/mail.html` |
| `template.html` | 사이트 원본. `/*__DATA__*/` 자리에 그날 데이터가 들어간다 |
| `test.mjs` | 매일 수집 전에 도는 시험. 실패하면 그날은 발행하지 않는다 |
| `test_corpus.json` | 실제 매물 제목 354건 (2026-09-27, 판매자 정보 없음) |
| `RUNBOOK.md` | 규칙 · 판정 · 문제가 생기면 |

`data/ledger.json` · `data/sold.json` 은 지우지 않는다.

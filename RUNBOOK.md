# ARCHIVE INDEX — Carol Christian Poell · 일간 발행 지침

지금 판매 중인 캐롤 크리스찬 포엘 매물을 매일 모아 사이트를 갱신하고, 새로 들어온 것이 있으면 메일로 알린다.
헬무트 랭 인덱스와 같은 원칙, 따로 도는 사이트다.

- **사이트** https://rozykuzy.github.io/ccp/ (저장소 `rozykuzy/ccp`, 공개, 2026-09-27 생성, 2026-09-28 첫 호)
- **발행** GitHub Actions `daily` — 매일 22:17 UTC = **07:17 KST**. PC가 필요 없다
- **메일** 클라우드 예약 작업 `Archive Index CCP 메일`, 09:05 KST, **rozykuzy@gmail.com 한 곳**(ROK이 정함). `data/mail_meta.json` 의 `send` 가 true 일 때만
- **범위** 전 시즌. 연도·시즌은 상품명에 적힌 것만

## 처음 한 번 (저장소 주인) — 2026-09-28 마침

1. 파일을 저장소에 올린다 — 2026-09-28에는 PC(`C:\Users\PC\ccp`, Git Credential Manager)에서 push 했다.
   웹에서 한다면: 루트 파일은 **Add file → Upload files**, 워크플로는 **Add file → Create new file** 에
   `.github/workflows/daily.yml` 이라고 이름을 적고 내용을 붙여 넣는다.
   `.gitignore` 는 빠져도 된다 — 워크플로가 커밋할 파일을 하나씩 적어 두어 그날의 원본 페이지는 올라가지 않는다
2. **Settings → Pages → Source: GitHub Actions** — 이것이 없으면 워크플로 두 번째 단계에서 멈춘다(아무것도 수집·커밋하지 않고)
3. (선택) **Settings → Secrets and variables → Actions**: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` (developer.ebay.com, 무료). 없으면 eBay만 건너뛴다
4. **Actions → daily → Run workflow** 로 첫 발행. 첫 호는 전부 새로 보는 매물이라 `신규` 를 붙이지 않는다

## 파일

| 파일 | 하는 일 |
|---|---|
| `collect.mjs` | 모든 수집기 → `data/raw/*.json`. 한 곳이 실패해도 나머지는 돈다. 전부 실패하면 종료 코드 1 |
| `sources.mjs` | 야후옥션(진행 · 180일 낙찰, 영·일 두 검색어) · 라쿠마 · 후루츠패밀리 브랜드 페이지 · 야후 플리마(검색 페이지의 내장 JSON) · 세컨드스트리트 온라인 스토어. 메루카리의 경로와 매물 형식도 여기 있다 |
| `mercari.mjs` | 메루카리 검색 페이지를 브라우저로 그려 읽는다(HTML에는 매물이 없다). 자기 `次へ` 링크로 넘기고, 없으면 마지막 페이지. 사진·글꼴은 받지 않는다 |
| `fruitsfamily.mjs` | 후루츠패밀리 제품 사이트맵(최신순, 제목 슬러그)으로 신규 발견 → 매물 페이지의 `product:brand` 로 확인. 알고 있는 매물은 하루 40건씩 다시 본다(3일 간격) |
| `grailed.mjs` | Grailed의 검색 서비스(Algolia)에 디자이너 = Carol Christian Poell 을 묻는다. 한 번에 1,000건까지라 가격 구간으로 나눠 읽고, 모든 구간이 다 돌아왔을 때만 '끝까지 읽음' |
| `tools/grailed_pc.mjs` | 같은 읽기를 PC에서 손으로. 러너가 막히는 날에만(예약 없음) |
| `ebay.mjs` | Browse API. 판매자 통화(`convertedFrom*`) 그대로 |
| `lib.mjs` | robots.txt(리다이렉트마다 다시 확인) · 호스트당 2.5초 · 이름을 밝힌 UA · 403/429면 멈춤 · 페이지 읽기 두 방식(내장 JSON · 매물 링크 주변) |
| `classify.mjs` | 상품명 읽기: 제외 · 연도/시즌 · 분류 · 사이즈 · 모델 번호 |
| `build.mjs` | 대장 갱신 → `site/index.html` · `data/archive.json` · `data/mail.html` · `data/mail_meta.json` · `data/status.json` |
| `template.html` | 사이트 원본 (헬무트 랭 r8 엔진의 CCP판). `/*__DATA__*/` 자리에 데이터 |
| `test.mjs` | 수집 전에 도는 시험 18묶음. 실패하면 그날 발행하지 않고 어제 사이트가 그대로 있다 |
| `test_corpus.json` | 실제 매물 제목 354건 (2026-09-27, 판매자 정보 없음, 구매 예약자 이름은 ○○) |

`data/ledger.json`(대장)과 `data/sold.json`(판매 기록)은 **지우지 않는다.** 읽을 수 없거나, 지난 빌드(`status.json`)보다
항목이 적으면 빌드가 멈추고 그 파일을 덮어쓰지 않는다. git 이력이 곧 백업이다. push가 세 번 실패하면 그날 `data/` 는
Actions 실행의 아티팩트(`data`, 14일)로 남는다.

## 수집처 판정 (2026-09-27, 공개 페이지로 확인)

| 곳 | 경로 | 판정 | 양 |
|---|---|---|---|
| 야후옥션 진행 | `/search/search?p=` (정렬·n 파라미터 금지) | 자동 수집 | "carol christian poell" 73건 · 가타카나 68건 |
| 야후옥션 낙찰 | `/closedsearch/closedsearch?p=` (robots 명시 허용) | 판매 기록 | 180일 59건 |
| 메루카리 | `/search?keyword=&status=on_sale` | 자동 수집 (브라우저) | 첫 페이지 약 120 (절반은 설명에만 이름이 있는 다른 브랜드) |
| 라쿠마 | `/s?query=` | 자동 수집 | 약 800 (다른 브랜드·판매 완료 다수) |
| 후루츠패밀리 | `/brand/Carol Christian Poell` · `/sitemap.product.xml?page=` · `/product/{id}/` | 자동 수집 (`*` 허용, AI 학습 크롤러 그룹은 우리 규칙이 아니다) | 브랜드 페이지 669건 표기, 정적 40건(트렌드순) |
| Grailed | 검색 서비스 `mnrwefss2q-dsn.algolia.net` (robots.txt 404 — 규칙 없음). grailed.com의 `/search` 페이지는 열지 않는다 | 자동 수집 (2026-09-29부터, ROK 결정). 디자이너 페이지는 2026-09-28 헤드리스 브라우저에 403 | 1,764건 (2026-09-29) |
| 야후 플리마 | `/search/<검색어>` · `page=` (robots가 `sort=` `order=` `sold=` 등만 막음) | 자동 수집 (2026-09-28 추가) — 페이지 자체 JSON, 한 쪽 100건. `SOLD` 는 사라짐 | 영·일 두 검색어 |
| 2nd STREET (세컨드스트리트) | 온라인 스토어 브랜드 검색 | 자동 수집 (2026-09-28 추가) — 카드 칸별로 읽는다. 모델 번호의 `/` 는 지킨다 | — |
| eBay | Browse API (`/sch/` 금지) | 키가 있을 때 | — |
| RAGTAG | — | 취급 없음 | 0 |
| 번개장터 · Depop · Vinted · Vestiaire | — | 바로가기만 (다른 곳에서 찾기) | — |

바로가기: 야후옥션 · 낙찰가 · 메루카리 · 라쿠마 · 2nd STREET · Buyee · 후루츠패밀리 · 번개장터 · Grailed · eBay · 판매 완료 · Depop · Vinted 유럽/미국 · Vestiaire.
검색어가 브랜드뿐이면 후루츠패밀리·Grailed는 브랜드 페이지로 간다.

## 상품명 읽기

**제외** — 대장에 넣지 않는다
- `no-brand` 제목에 브랜드가 없다 (브랜드 페이지·판매자가 브랜드로 지정한 매물은 예외)
- `other-brand` 다른 브랜드 이름이 **먼저** 나온다: `Paul Harnden … キャロルクリスチャンポエル guidi …`
- `not-brand` ブランド不明 · 元ネタ · 元キャロル クリスチャン ポエル · ポエル期
- `style-of` …風 · 系 · 好き · st · 스타일 · inspired (`Style AM/2601L`, `like new`, `type-2` 는 제외 아님)
- `reserved` 専用(액세서리 명사가 뒤따르지 않을 때) · 様へ · 取り置き
- `wanted` 구매) · 구해요 · WTB / `rental` 렌탈 / `fake` レプリカ · 가품 (정품 보증 문구의 가품은 제외 아님)

**연도** — 적힌 것만. 1995년(브랜드 시작, Grailed 디자이너 소개) ~ 내년
- A 연도 표기: `2009` · `SS97` · `07SS` · `AW2002` · `02fw` · `P/E 2002` · `96〜97AW`(=AW96) · `A/W '98-'99` · `２００１ＳＳ`
- B 시기 표기: `1990년대` · `2000–01` · `2008–09` · `초기` · `아카이브` · 두 해
- C 연도 미확인
- 연도로 읽지 않는 숫자: 모델 번호(`AM/2601L` `PM1278` `GM-2027` `2687P`), 가격(`定価` `参考上代` `¥` `€` `$` `£` `円` `EUR` `euros`), 사이즈 표기, `no.2003` · `品番`, 기간(`10年保管` `5년 사용`)

**분류** 아우터 · 테일러링 · 셔츠 · 상의 · 팬츠 · 데님 · 신발 · 가방·소품 · 주얼리 · 기타.
제목에 품목 말이 없을 때만: 번호 머리 `AM`=신발 · `PM`=팬츠 · `CM`=셔츠 · `KM` `TM`=상의(말뭉치 354건에서 예외 없음), 그다음 `prosthetic` `u-sole` `paper dart` `officer` `tornado` `diagonal zip` `goodyear` = 신발.

**사이즈** 표시된 것만: `サイズ48` · `size 7` · `7 size` · `UK 8` · `[50]` · `50)` · `(9)` · 옷 제목의 짝수 40–58 · 신발 제목의 4–13 / 35–47 · 신발 `27cm`. 플랫폼의 사이즈 칸(Grailed · 후루츠패밀리)이 있으면 그것.

**모델 번호** `AM/2601L` 한 가지 모양으로 적는다. 검색은 `2601` · `am2601` · `am/2601` 어느 것으로도. 상세판에 `같은 번호 N건`.
판매 기록 요약(`sc`)은 같은 번호(머리글자가 둘 다 있으면 같아야)끼리만.

**기법·모델 20** 드립 · 오브젝트 다이드 · 오버록 · 데드엔드 · 체인 심 · 스카 스티치 · 심리스 · 리버시블 · 스파이럴 · 인비트윈 ·
프로스테틱 · 토네이도 · 다이애거널 지퍼 · U솔 · 페이퍼 다트 · 굿이어 · 오피서 · 하이넥 · 베스트 백 · 샘플·런웨이 (영·일·한 모두)
**소재·표기** 캥거루 · 홀스 · 코도반 · 바이슨 · 티타늄 · 새 상품 · Made in Italy (3건 이상일 때 필터에)

## 대장 규칙

- 실패한 소스는 관측 안 됨: 다시 본 것도, 사라진 것도 아니다
- **사라짐**은 끝까지 읽은 날에만 센다. 끝까지 읽음 = 마지막 페이지가 짧았다(페이지당 야후 50 · 메루카리 120 · 라쿠마 40, 페이지 길이는 매물 링크 수로) 또는 사이트가 '결과 없음'이라고 말했다. 꽉 찬 페이지 다음이 비었거나 같은 페이지가 또 오면 끝까지 읽지 못한 것
- 끝까지 읽은 날 두 번 연속(하루에 한 번만 센다) 없으면 사라짐. 마감 시각이 지난 경매는 한 번(시각의 정밀도만큼 여유를 두고). 판매 완료 배지가 보이면 그날
- 가격을 못 읽었어도 매물 링크가 페이지에 있으면 '봤다'로 친다
- 지난번 끝까지 읽은 날 본 매물 가운데 5건 이상, 그리고 80%(야후 60%) 넘게가 안 보이면 그날은 판단 보류 — 기준일은 그대로, 최대 3일
- 가격 변동은 판매자 통화로만. 환율은 ECB(frankfurter). 못 받으면 어제 환율, 그것도 없으면 빌드 중단
- 하루에 가격은 하나: 같은 날 다시 읽으면(수집기를 고친 뒤 다시 돌린 날) 그날 값을 고쳐 적고, 가격 변동으로 치지 않는다. 비교는 전날 값과
- **신규**: 그 소스가 이전에 끝까지 읽은 날이 있을 때만. 소스의 첫 완독은 신규가 아니다. 코드 수정으로 한 소스가 더 멀리 읽게 되는 날은 `ledger.json` 의 `state.quiet[<file>] = "<그날>"` 로 그 소스의 신규를 끈다
- 같은 날 다시 돌려도 같은 호수, 첫 메일 표시 유지. 첫 호 = 매물이 처음 있었던 날
- 판매 기록은 매물이 아니다: 대장에 없고, 신규도 사라짐도 없다

## 문제가 생기면

- `data/status.json` — 그날 소스별 결과(`ok` `complete` `read` `error`)와 대장 통계(`added` `vanished` `held` `unread` `flood`)
- `data/raw/_diag.json` — 첫 페이지에서 아무것도 못 읽은 소스의 페이지 모양(크기 · `<title>` · 매물 링크 수 · 내장 JSON 키 · 링크 모양). 글자와 판매자는 담지 않는다. 이걸 보고 `sources.mjs` 의 `hrefRe` 나 `lib.listingsFrom` 을 고친다
- 모두 raw.githubusercontent.com 으로 클라우드에서 읽힌다(`https://raw.githubusercontent.com/rozykuzy/ccp/main/data/status.json`)
- **정직한 UA로 막히면 그 소스는 거기서 끝이다.** UA를 바꾸거나 자동화 표시를 숨기지 않는다

## 메일 (예약 작업, 09:05 KST)

클라우드 예약 작업 `Archive Index CCP 메일 (매일 09:05 KST)`(2026-09-28 생성, 승인 없이 돈다)이 저장소가 만든 것을 받아 보내기만 한다. PC는 필요 없다. 받는 사람은 **rozykuzy@gmail.com 한 곳**.

1. `https://raw.githubusercontent.com/rozykuzy/ccp/main/data/mail_meta.json` 을 받는다. 404면 가동 전 — 보내지 않는다
2. `date` 가 오늘(KST)이 아니면 9분 뒤 한 번 더 받고, 그래도 아니면 보내지 않고 "오늘 CCP 빌드 없음"이라고 보고
3. `send` 가 false면 보내지 않는다(신규·오늘 가격 내림 없음)
4. `data/mail.html` 을 받아 `mail_meta.subject` 의 호수가 들어 있는지 본다(raw.githubusercontent.com 은 5분 캐시)
5. 같은 호수가 보낸편지함에 이미 있으면 보내지 않는다
6. `mail.html` 전문을 Gmail로(`cat` 으로 읽는다 — Read는 줄 번호를 붙인다). subject = `mail_meta.subject`. 받는 사람 rozykuzy@gmail.com
7. 보고에 `data/status.json` 에서 실패한 소스와 그 이유를 적는다

메일은 목록과 링크만, 사진 없음. 가격 내림은 그날 내린 것만 한 번. 한 줄에 매물 하나, 전체 2만 4천 자 이하 — 넘으면 적게 싣고 "외 N건"으로 센다(사이트에는 다 있다).

## 확인한 것 (2026-09-27)

- `test.mjs` 14묶음: robots 15경로 · 페이지 읽기 · 페이지 끝 판정 · 사이트맵 · 제목 77건 고정 + 말뭉치 전수 · 영어 시즌 · 4일 대장 · 빌드 실제 실행(첫 메일 · 같은 날 재실행 · 소스 첫 완독 · CAD · 깨진 대장 · 줄어든 대장) · 리다이렉트 robots · 검토 사례 전부
- 브라우저(Chromium) 11묶음: 세 언어 검색(드립 = ドリップ = drip) · 번호 검색 · `?category=shoes` · 같은 번호 → 검색과 뒤로 가기 · 저장 키 `ccpx.*` · 다른 곳에서 찾기 · 연도 1995– · 소재 필터 · 360–2560px 가로 넘침 0 · 옮기기 링크 · 판매 기록
- 패싯 산술 15,000회 불일치 0 (헬무트 랭 검사기를 CCP 템플릿에 그대로)
- 독립 검토 네 번: 20 → 12 → 4 → 1건, 전부 고치고 시험으로 고정
- 수집기는 이날까지 실제 판매처 페이지에 대 보지 못했다. 첫 실행(아래)으로 맞췄다

## 첫 실행 (2026-09-28, Issue 001)

| 곳 | 결과 | 한 일 |
|---|---|---|
| 야후옥션 진행 · 낙찰 | 66건 · 60건, 끝까지 읽음 | 그대로 |
| 라쿠마 | 837건 읽음 → 66건. 제목에 링크 설명(`…の商品詳細ページへのリンク`)이 붙고, 사진은 자리표시 그림, 제목 속 `参考上代` 금액이 가격으로 읽힌 매물이 있었다 | 카드 링크에 달린 `data-rat-item_name` · `data-rat-price` 를 쓰고, 사진은 `data-original`. 링크 설명의 카테고리(`靴/シューズ(ブーツ)` 등)는 제목이 분류를 말하지 않을 때만 쓴다 |
| 메루카리 | 실패 — HTML(395 KB)에 매물이 없다. 브라우저가 그린다 | `mercari.mjs`: 헤드리스 브라우저로 검색 페이지를 그려 읽는다(PC의 Chrome으로 먼저 확인) |
| 후루츠패밀리 | 브랜드 페이지 40 · 사이트맵 신규 2 | 그대로 |
| Grailed | 헤드리스 브라우저에 403 | 막힌 채 둔다(바로가기만) |
| eBay | 키 없음 | 키를 넣으면 돈다 |

고친 수집기로 같은 날 다시 돌려 Issue 001을 다시 만들었다(같은 호수, 같은 날 가격은 고쳐 적기): 메루카리 350건 읽음(7쪽, 91초), 대장 318건. 제목 속 `参考上代` 금액으로 잘못 읽힌 가격 3건이 그날 값으로 고쳐졌고 가격 내림으로 치지 않았다.

라쿠마의 브랜드 칸만 Carol Christian Poell인 다른 물건(HED MAYNER · ISHINN · Lumen et Umbra · VALENTINO 티셔츠, LP 레코드)이 있었다. 제목이 다른 브랜드를 대면 제외하고(다른 브랜드 목록에 추가), 제목이 브랜드를 대지 않으면 무엇인지(분류어 · 하우스 기법어 · 모델 번호 · 사이트 카테고리) 말할 때만 넣는다.

## 검토 (2026-09-28 오후)

- **메일 머리가 흰 바탕에 흐린 글자로 왔다.** Gmail은 메일의 `background` 를 전부 지운다(보낸편지함 원문으로 확인).
  어두운 머리를 없애고 흰 바탕에 짙은 글자 · 위아래 선으로 바꿨다. 시험이 메일에 `background` 가 없는지 본다
- **'전체 보기'를 누르면 Google 리디렉션 알림이 뜬다.** 보내는 주소 r@beodd.kr 의 도메인이 인증되지 않았다:
  SPF에 Google이 없고(`v=spf1 ip4:222.122.86.177 ~all`), DKIM(`google._domainkey`)과 DMARC가 없다.
  Gmail은 인증되지 않은 메일의 링크를 이 알림으로 감싼다. 고치는 곳은 beodd.kr DNS와 Google 관리 콘솔(이메일 인증 → DKIM)
- **폰에서 가격 줄이 넘쳤다**(헬무트 랭에서 먼저 드러남): `₩… ¥… ₩지운값` 사이에 끊을 자리가 없어 페이지가 438px로 넓어지고
  상세판이 왼쪽으로 밀려 보였다. 숫자 사이에 공백, 숫자는 안 끊기게. 연도 막대 상자도 36px로(막대가 넘치지 않게)
- **상세판 사진**: 메루카리 목록 사진은 240px라 크게 보면 뭉개졌다 → `/item/detail/orig/photos/` 원본, 라쿠마는 상세판만 `/l/`.
  안 되면 `data-full` 로 원래 주소를 한 번 더 부른다
- **분류**: `Dress Pants` 는 팬츠, `ブレーザー` 는 테일러링, `Button Ups` 는 셔츠, `ハイネックレザー` 는 아우터.
  `PREAMITA`(Premiata 오기) · `Caroll`(다른 브랜드) 제외

## 헬무트 랭 쪽에 옮길 것

- r8: 카드에서 저장한 직후 필터판의 '저장한 매물 N' 줄이 다음 클릭 전까지 0으로 남는다 → `toggleSave` 에서 `buildWatch()` (CCP판에는 반영)
- 같은 origin(rozykuzy.github.io)이라 저장 키를 나눴다: HL `hlx.*`, CCP `ccpx.*`

## 통합 사이트가 이 페이지를 읽는다 (2026-09-28)

https://rozykuzy.github.io/ (저장소 `rozykuzy/rozykuzy.github.io`)가 이 사이트의 `index.html` 을 열 때마다 받아
`<script type="application/json" id="__data">` 를 읽는다. 저장소에 복사본을 두지 않으므로 매일 발행이 곧바로 반영된다.

- 이 블록의 **id·형식을 바꾸지 않는다** — 바꾸면 통합 사이트의 CCP 칸이 `불러오지 못함` 이 된다
- `template.html` 의 읽는 규칙(MOTIF · LEX · MARK · yearClaim · sizeToks · histHtml · dutyHtml · SEEK · thumb 등)을 바꾸면
  통합 사이트의 `engine.js` 를 다시 만든다 — 그 저장소의 README와 프로젝트 문서 `claude/archive-index-site-runbook.md`
- 저장 목록 `ccpx.saved` 는 통합 사이트와 같이 쓴다(같은 origin). 값 형식 `{k,p,u,d,g}` 를 바꾸지 않는다
- **메일의 `전체 보기` 는 통합 사이트를 연다** (2026-09-28, ROK 결정) — `build.mjs` 의 `MAIL_URL`
  `https://rozykuzy.github.io/?archive=ccp`, 신규가 있는 날은 `&show=new&sort=new`. 이 페이지(`SITE_URL`)는 전과 같이 발행한다 —
  통합 사이트가 여기서 읽는다. 되돌리려면 `mail()` 의 `siteUrl` 기본값을 `SITE_URL` 로

## 2026-09-29 — 야후 사진 크기 · 통합 사이트 재디자인

- `template.html` `thumb()` 에 야후 사진 프록시 규칙: `auc-pctr.c.yimg.jp` 는 요청한 `w`·`h` 로 준다(300 · 600 · 1200, 9/28 PC에서 225×300 · 450×600 · 900×1200 확인),
  야후 플리마의 정사각 채움(`ccw`·`cch`·`fill=1`)은 뗀다. `rozykuzy/ccp` `9002653`, 다음 07:17 빌드부터. 통합 사이트 `engine.js` 에도 같은 줄(그쪽은 이미 반영)
- 통합 사이트가 새 디자인으로 바뀌었다(움직임·Index Sans·문구) — `claude/archive-index-site-runbook.md` 9/29 절. 이 페이지와 데이터 형식은 그대로
- 야후 플리마 · 세컨드스트리트는 9/28 추가(`2e206b5`), 첫 빌드는 9/29 07:17. 첫 완독 날은 신규로 세지 않는다(대장 규칙)
- Grailed: 9/28 ROK가 고른 'PC에서 매일 수집'은 허용된 `/designers/` 페이지가 헤드리스 Chrome에 403이라 우회 없이는 안 됐다.
  9/29 ROK 결정으로 Grailed의 검색 서비스로 읽는다 — 아래 절
- eBay는 공식 Browse API 키(저장소 Secrets `EBAY_CLIENT_ID` · `EBAY_CLIENT_SECRET`)를 ROK가 넣으면 켜진다 — 코드는 준비돼 있다

## Grailed — 검색 서비스로 읽는다 (2026-09-29, ROK 결정)

ROK: "Grailed는 HL처럼 검색 백엔드로 읽어줘". 헬무트 랭 인덱스가 2026-09-15부터 매일 아침 Grailed를 읽는 방식과 같다.

- grailed.com의 디자이너 페이지는 HTML에 매물이 없다. 보는 사람의 브라우저가 Grailed의 검색 서비스(Algolia, 앱 `MNRWEFSS2Q`)에
  grailed.com이 모든 방문자에게 주는 검색 전용 공개 키로 묻는다. `grailed.mjs` 는 같은 곳에 같은 것(디자이너 = Carol Christian Poell)을 묻는다
- `lib.get` 을 거친다: 검색 호스트의 robots.txt를 먼저(404 — 규칙 없음), 이름을 밝힌 UA, 2.5초 간격, 403·429면 그날은 멈춘다.
  판매자 칸(`user`)은 담지 않는다
- grailed.com의 robots.txt는 크롤러에게 `/search` 페이지를 막아 두었다. 이 방식은 그 페이지 뒤의 검색 서비스를 직접 부른다 —
  헬무트 랭 기준서(2026-09-23 §3)가 짚은 점이고, 헬무트 랭도 같은 방식이다. 2026-09-29 ROK가 이 방식을 골랐다. 하루 검색 15번 안팎, 숨기는 것 없음
- 한 번에 1,000건까지라 가격 구간(0–100 … 10,000–)으로 묻고, 넘치는 구간은 반으로 나눈다. 모든 구간이 다 돌아오고
  읽은 수가 서비스가 센 수 이상일 때만 '끝까지 읽음' — 사라짐은 그날만 센다
- 쓰는 칸: 가격 `price_i`(USD) · 사이즈 `size`('one size'는 뺀다) · 사진 `cover_photo.url` · 새 제품 `condition = is_new` ·
  분류 `category_path`(제목이 무엇인지 말하지 않을 때만. `accessories.misc` 는 아무것도 말하지 않는다). `sold` · `deleted` 는 버린다
- 태그만 Carol Christian Poell인 다른 브랜드(Luciano Soprani · Thom Browne · Yoshiyuki Konishi · Christian Louboutin · By Walid)는
  다른 브랜드 목록에 넣어 제외한다. 제목에 이름이 없는 216건은 대부분 모델 번호·하우스 기법어가 있는 CCP였다
- 첫 완독(2026-09-29 빌드)은 신규가 아니다(대장 규칙 그대로). 그날 대장이 크게 는다
- 러너가 막히는 날: PC에서 `node tools/grailed_pc.mjs` → `data/raw/grailed_pc.json` push → 다음 빌드가 36시간 안의 PC 읽기를
  그날 날짜로 쓴다(하루 늦음을 밝힌다). 예약하지 않았다
- 첫 빌드(2026-09-29 07:17 KST) 뒤 `data/status.json` 의 `grailed` 가 `ok` · `complete` · `via: search` 인지 본다. 러너가 403·429를 받았으면 위의 PC 읽기
- 2026-09-29 PC에서 시험(01:41 · 01:47 KST 두 번): 1,764건 · 검색 15번 · 37초 · 끝까지 읽음. 남는 것 1,749건
  (제외 15: 다른 브랜드 13 · 이름도 분류도 없음 2). 사진은 전부 `media-assets.grailed.com`(사이트의 `?w=` 규칙 그대로),
  사이즈 1,557건, 새 제품 423건, 연도·시즌 표기 165건. 분류: 아우터 507 · 신발 487 · 팬츠 174 · 가방·소품 152 · 테일러링 110 ·
  셔츠 84 · 상의 84 · 주얼리 76 · 데님 60 · 기타 15

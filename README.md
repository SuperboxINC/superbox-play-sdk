# superbox-play-sdk

슈퍼박스 플레이에 게임을 올릴 때 쓰는 도구예요. 엔진에서 뽑은 웹 빌드를 패키지 `.sbp`로 묶고, 로딩 화면을 입히고, 콘솔에 올려요.

자세한 안내는 [개발자 센터](https://developers.superboxgo.com)에 있어요.

## 받기

Node.js 24가 필요해요. npm 레지스트리에는 올리지 않고 이 저장소에서 받아요.

```bash
npm install --save-dev github:SuperboxINC/superbox-play-sdk
npx superbox-play --help
```

| 들어 있는 것 | 쓰는 법 |
|---|---|
| 명령 도구 `superbox-play` | `npx superbox-play build ./Build/WebGL` |
| Play SDK 타입 · 로더 | `import { loadSBPlay } from 'superbox-play-sdk'` |
| Phaser 3.60+ · 4 플러그인 | `import { superboxPlayPlugin } from 'superbox-play-sdk/phaser'` |
| Cocos Creator 3.8+ 확장 | `engines/cocos-creator/superbox-play` 폴더를 프로젝트의 `extensions/superbox-play`로 복사해요. 빌드는 필요 없어요. |

Unity는 아래 C# SDK를 넣으면 상단 메뉴 `Superbox Play > Build & Package`로 WebGL 빌드부터 패키지까지 만들어요. C# SDK는 Package Manager의 Add package from git URL에 아래 주소를 넣어 받아요.

```text
https://github.com/SuperboxINC/superbox-play-sdk.git?path=engines/unity/superbox-play
```

## 패키지 만들고 올리기

```bash
npx superbox-play init                       # 설정 파일 superbox.config.json
npx superbox-play dev ./web-build            # 내 컴퓨터에서 띄우기 — 광고 · 결제는 시뮬레이션
npx superbox-play build ./web-build          # web-build-1.0.0.sbp
npx superbox-play inspect web-build-1.0.0.sbp
```

만든 패키지는 콘솔 「출시」 화면의 「버전 등록하기」에 넣거나 `superbox-play deploy`로 올려요. 검수 요청과 출시는 콘솔에서 해요.

## 샘플

저장소를 받아 돌려 볼 수 있어요.

```bash
cd samples/html5 && npm run dev                  # 엔진 없는 HTML5
cd samples/phaser && npm install && npm run dev  # Phaser 4 (npm run package는 3 · 4를 묶어요)
cd samples/cocos && npm run prepare-project      # 확장을 넣고 자원을 그려요. 그다음 Cocos Creator로 열어요
```

## 소스에서 빌드하기

받아서 쓸 때는 빌드가 필요 없어요. 코드를 고쳐 보고 싶을 때만 아래처럼 돌려요.

```bash
npm ci
npm run build:all   # dist를 다시 만들어요
npm run typecheck
npm test
```

`packages/*/src`와 `engines` 아래 폴더가 원본이고, `dist`는 여기서 만든 결과물이에요.

## 라이선스

저작권은 SUPERBOX INC에 있어요. 슈퍼박스 플레이용 게임을 만들 때 쓸 수 있고, 자세한 조건은 [LICENSE](LICENSE)에서 확인해 주세요.

# superbox-play-sdk

슈퍼박스 플레이에 게임을 올릴 때 쓰는 도구입니다. 엔진에서 뽑은 웹 빌드를 패키지 `.sbp` 로 묶고, 로딩 화면을 입히고, 콘솔에 올립니다.

자세한 안내는 [개발자 센터](https://developers.superboxgo.com)에 있습니다.

## 받기

Node.js 24 가 필요합니다. npm 레지스트리에는 올리지 않고 이 저장소에서 받습니다.

```bash
npm install --save-dev github:SuperboxINC/superbox-play-sdk
npx superbox-play --help
```

| 들어 있는 것 | 쓰는 법 |
|---|---|
| 명령 도구 `superbox-play` | `npx superbox-play build ./Build/WebGL` |
| Play SDK 타입 · 로더 | `import { loadSBPlay } from 'superbox-play-sdk'` |
| Phaser 3.60+ · 4 플러그인 | `import { superboxPlayPlugin } from 'superbox-play-sdk/phaser'` |
| Cocos Creator 3.8+ 확장 | `engines/cocos-creator/superbox-play` 폴더를 프로젝트의 `extensions/superbox-play` 로 복사합니다. 빌드는 필요 없습니다. |

Unity 는 WebGL 빌드 폴더를 `superbox-play build` 로 묶습니다. C# API 는 Unity 패키지 `com.superbox.html5` 에 있습니다.

## 패키지 만들고 올리기

```bash
npx superbox-play init                       # 설정 파일 superbox.config.json
npx superbox-play dev ./web-build            # 내 컴퓨터에서 띄우기 — 광고 · 결제는 시뮬레이션
npx superbox-play build ./web-build          # web-build-1.0.0.sbp
npx superbox-play inspect web-build-1.0.0.sbp
```

만든 패키지는 콘솔 「출시」 화면의 「버전 등록하기」에 넣거나 `superbox-play deploy` 로 올립니다. 검수 요청과 출시는 콘솔에서 합니다.

## 샘플

저장소를 받아 돌려 봅니다.

```bash
cd samples/html5 && npm run dev                  # 엔진 없는 HTML5
cd samples/phaser && npm install && npm run dev  # Phaser 4 (npm run package 는 3 · 4 를 묶습니다)
cd samples/cocos && npm run prepare-project      # 확장을 넣고 자원을 그립니다. 그다음 Cocos Creator 로 엽니다
```

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

Unity는 아래 C# SDK를 넣으면 상단 메뉴 `Superbox Play > Build & Package`로 WebGL 빌드부터 패키지까지 만들어요. `Superbox Play > Test on Device`를 누르면 빌드한 뒤 QR로 같은 Wi-Fi의 휴대폰에서 바로 열 수 있어요. C# SDK는 Package Manager의 Add package from git URL에 아래 주소를 넣어 받아요.

```text
https://github.com/SuperboxINC/superbox-play-sdk.git?path=engines/unity/superbox-play
```

## 패키지 만들고 올리기

```bash
npx superbox-play init                       # 설정 파일 superbox.config.json
npx superbox-play dev ./web-build            # 내 컴퓨터에서 띄우기 — 광고 · 결제는 시뮬레이션
npx superbox-play dev ./web-build --lan      # 같은 Wi-Fi의 휴대폰에서 열기 — 주소와 QR을 보여 줘요
npx superbox-play build ./web-build          # web-build-1.0.0.sbp
npx superbox-play inspect web-build-1.0.0.sbp
```

만든 패키지는 콘솔 「출시」 화면의 「버전 등록하기」에 넣거나 `superbox-play deploy`로 올려요. 검수 요청과 출시는 콘솔이나 AI 도구에서 해요.

## AI 도구에서 쓰기

Claude Code에 플러그인을 설치하면 콘솔 MCP가 연결되고 시작, 기능 붙이기, 휴대폰 테스트, 출시 점검 스킬이 들어와요. 게임 등록부터 패키지 올리기, 검수 요청, 출시까지 AI 도구로 할 수 있어요.

```text
/plugin marketplace add SuperboxINC/superbox-play-sdk
/plugin install superbox-play@superbox-play
```

처음 콘솔 도구를 쓸 때 브라우저에서 콘솔 계정으로 로그인하고 연결을 허용해 주세요. 자세한 내용은 [AI 도구 연결](https://developers.superboxgo.com/package/mcp)에서 확인해 주세요.

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

## 도구 버전

도구는 실행할 때 이 저장소의 `sdk-policy.json`을 읽어요. 지원이 끝난 버전이면 멈추고, 새 버전이 있으면 안내만 해요. Unity와 Cocos Creator는 에디터를 켤 때 창으로, Phaser 플러그인은 로컬에서 실행할 때 게임 화면 위에 하루 한 번 알려 줘요. 읽지 못하면 막지 않고 그대로 진행해요. 게임이나 계정 정보는 보내지 않아요. 끄려면 환경 변수 `SUPERBOX_PLAY_POLICY_URL`에 `off`를 넣어 주세요.

## 라이선스

저작권은 SUPERBOX Inc에 있어요. 슈퍼박스 플레이용 게임을 만들 때 쓸 수 있고, 자세한 조건은 [LICENSE](LICENSE)에서 확인해 주세요. 함께 묶인 오픈소스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)에 적어 두었어요.

# 슈퍼박스 플레이 플러그인

AI 코딩 도구에서 슈퍼박스 플레이 게임을 등록하고, 기능을 붙이고, 테스트하고, 검수 요청까지 이어 가게 도와주는 플러그인이에요. 새 버전 출시는 콘솔에서 직접 해요. 설치하면 콘솔 MCP 서버가 함께 연결돼요.

## 설치

Claude Code에서 아래 명령을 차례대로 실행해 주세요.

```text
/plugin marketplace add SuperboxINC/superbox-play-sdk
/plugin install superbox-play@superbox-play
```

처음 콘솔 도구를 쓸 때 브라우저에서 콘솔 계정으로 로그인하고 연결을 허용해 주세요. API 키는 필요 없어요. AI 도구는 내 콘솔 계정의 권한으로만 동작해요.

## 스킬

| 스킬 | 언제 써요 |
|---|---|
| `/superbox-play:start` | 처음 시작할 때예요. 엔진을 확인하고 SDK를 넣고 게임을 등록해요. |
| `/superbox-play:integrate` | 광고, 인앱 결제, 포인트 미션 같은 기능을 게임 코드에 붙일 때예요. |
| `/superbox-play:device-test` | 내 휴대폰에서 바로 실행해 볼 때예요. |
| `/superbox-play:release-check` | 패키지를 올리고 검수 요청까지 점검할 때예요. |

자세한 내용은 [개발자 센터](https://developers.superboxgo.com/package/mcp)에서 확인해 주세요.

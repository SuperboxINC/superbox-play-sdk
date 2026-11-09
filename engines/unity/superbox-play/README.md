# Superbox Play SDK

슈퍼박스 플레이 게임센터에 올리는 Unity WebGL 게임용 SDK예요. 광고, 인앱 결제, 로그인, 포인트 미션, 안전 영역을 C#으로 호출해요.

자세한 안내는 [개발자 센터](https://developers.superboxgo.com/engines/unity)에서 확인해 주세요.

## 설치

Package Manager의 **Add package from git URL**에 아래 주소를 입력해 주세요.

```text
https://github.com/SuperboxINC/superbox-play-sdk.git?path=engines/unity/superbox-play
```

## 사용

```csharp
using Superbox.Play;

var session = await SuperboxPlay.InitAsync();

if (session.Features.Ads.Rewarded)
{
    var result = await SuperboxPlay.Ads.ShowRewardedAsync("continue");
    if (result.Rewarded) GrantContinue();
}
```

실패하면 `SuperboxPlayException`이 발생해요. `Code`로 원인을 구분해 주세요.

## 패키징

상단 메뉴 **Superbox Play > Build & Package**를 누르면 WebGL 빌드부터 `.sbp` 패키지까지 한 번에 만들어져요. 결과는 프로젝트의 `Build/SuperboxPlay` 폴더에 생겨요.

## 휴대폰에서 테스트

상단 메뉴 **Superbox Play > Test on Device**를 누르면 WebGL로 빌드한 뒤 QR 창이 열려요. 같은 Wi-Fi의 휴대폰 카메라로 찍으면 바로 실행돼요. 광고와 결제는 시뮬레이션이에요.

## 동작 환경

| 환경 | 동작 |
|---|---|
| WebGL 빌드 | 게임존과 연결해요. |
| 에디터 | 광고와 결제를 시뮬레이션해요. |
| 그 밖의 플레이어 | 호출하면 `NOT_CONNECTED`로 끝나요. |

using System;
using System.Globalization;
using Newtonsoft.Json.Linq;

namespace Superbox.Play
{
    /// <summary>
    /// 에디터 시뮬레이션 — Play SDK 의 로컬 시뮬레이션과 같은 답이다. 광고는 바로 끝나고 보상형은 보상, 결제는 simulated 로 성공, 게임존이 필요한 기능은 UNSUPPORTED.
    /// </summary>
    internal sealed class PlaySimulatedChannel : IPlayChannel
    {
        private readonly Action<Action> defer;
        private int sequence;

        internal PlaySimulatedChannel(Action<Action> defer = null)
        {
            this.defer = defer ?? PlayLog.NextFrame;
        }

        public event Action<string, JObject> EventReceived
        {
            add { }
            remove { }
        }

        public void Init(Action<PlayResponse> onResponse) => Answer(onResponse, PlayResponse.Success(StandaloneSession()));

        public void Call(string method, object parameters, Action<PlayResponse> onResponse, float timeoutSeconds = 0f) =>
            Answer(onResponse, Simulate(method, PlayJson.ToObject(parameters)));

        private void Answer(Action<PlayResponse> onResponse, PlayResponse response) => defer(() => onResponse?.Invoke(response));

        private PlayResponse Simulate(string method, JObject parameters)
        {
            switch (method)
            {
                case PlayMethods.SessionInit:
                    return PlayResponse.Success(StandaloneSession());
                case PlayMethods.AdsLoad:
                    return Result(new JObject { ["ready"] = true });
                case PlayMethods.AdsShow:
                    return Result(new JObject { ["shown"] = true, ["rewarded"] = PlayJson.Text(parameters, "format") == "rewarded" });
                case PlayMethods.StoreProducts:
                    return Result(new JObject { ["products"] = new JArray() });
                case PlayMethods.StorePurchase:
                    sequence++;
                    return Result(new JObject
                    {
                        ["status"] = PurchaseStatus.Paid,
                        ["orderId"] = "sim_" + sequence.ToString(CultureInfo.InvariantCulture),
                        ["productKey"] = PlayJson.Text(parameters, "productKey") ?? string.Empty,
                        ["simulated"] = true,
                    });
                case PlayMethods.StorePendingOrders:
                    return Result(new JObject { ["orders"] = new JArray() });
                case PlayMethods.StoreCompleteOrder:
                    return Result(new JObject { ["completed"] = true });
                case PlayMethods.StoreSubscriptions:
                    return Result(new JObject { ["subscriptions"] = new JArray() });
                case PlayMethods.AuthLogin:
                    return Result(new JObject { ["loggedIn"] = true, ["key"] = PlayEnvironment.Standalone, ["displayName"] = string.Empty, ["linked"] = false });
                case PlayMethods.AnalyticsTrack:
                case PlayMethods.NavExit:
                    return Result(new JObject());
                case PlayMethods.ScreenSafeArea:
                    return Result(Insets());
                case PlayMethods.ScreenSetOrientation:
                    return Result(new JObject { ["applied"] = false });
                default:
                    return PlayResponse.Failure(PlayErrorCodes.Unsupported, method);
            }
        }

        private static PlayResponse Result(JObject result) => PlayResponse.Success(result);

        private static JObject Insets() => new JObject { ["top"] = 0, ["bottom"] = 0, ["left"] = 0, ["right"] = 0 };

        private static JObject StandaloneSession() => new JObject
        {
            ["protocol"] = 1,
            ["environment"] = PlayEnvironment.Standalone,
            ["player"] = new JObject { ["key"] = PlayEnvironment.Standalone, ["displayName"] = string.Empty, ["linked"] = false },
            ["features"] = new JObject
            {
                ["ads"] = new JObject { ["rewarded"] = true, ["interstitial"] = true, ["banner"] = false },
                ["purchases"] = true,
                ["share"] = false,
                ["haptic"] = false,
                ["externalLinks"] = false,
                ["leaderboard"] = false,
                ["analytics"] = true,
                ["missions"] = false,
                ["points"] = false,
            },
            ["safeArea"] = Insets(),
            ["locale"] = "ko-KR",
        };
    }

    /// <summary>에디터 · WebGL 밖의 플레이어 — 게임존이 없다. 운영 빌드에서 결제가 무료로 끝나지 않게 시뮬레이션하지 않는다.</summary>
    internal sealed class PlayOfflineChannel : IPlayChannel
    {
        private readonly Action<Action> defer;

        internal PlayOfflineChannel(Action<Action> defer = null)
        {
            this.defer = defer ?? PlayLog.NextFrame;
        }

        public event Action<string, JObject> EventReceived
        {
            add { }
            remove { }
        }

        public void Init(Action<PlayResponse> onResponse) => Answer(PlayMethods.SessionInit, onResponse);

        public void Call(string method, object parameters, Action<PlayResponse> onResponse, float timeoutSeconds = 0f) => Answer(method, onResponse);

        private void Answer(string method, Action<PlayResponse> onResponse) =>
            defer(() => onResponse?.Invoke(PlayResponse.Failure(PlayErrorCodes.NotConnected, $"{method}: 게임존 밖에서는 쓸 수 없어요")));
    }
}

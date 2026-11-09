using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Scripting;

namespace Superbox.Play
{
    /// <summary>게임 채널 v1 메서드.</summary>
    internal static class PlayMethods
    {
        public const string SessionInit = "session.init";
        public const string AdsLoad = "ads.load";
        public const string AdsShow = "ads.show";
        public const string AdsBanner = "ads.banner";
        public const string StoreProducts = "store.products";
        public const string StorePurchase = "store.purchase";
        public const string StorePendingOrders = "store.pendingOrders";
        public const string StoreCompleteOrder = "store.completeOrder";
        public const string StoreSubscriptions = "store.subscriptions";
        public const string AuthLogin = "auth.login";
        public const string AuthServerAuthCode = "auth.serverAuthCode";
        public const string SocialShare = "social.share";
        public const string SocialShareLink = "social.shareLink";
        public const string SocialOpenUrl = "social.openUrl";
        public const string SocialRequestReview = "social.requestReview";
        public const string SocialSubmitScore = "social.submitScore";
        public const string SocialOpenLeaderboard = "social.openLeaderboard";
        public const string AnalyticsTrack = "analytics.track";
        public const string Haptic = "haptic";
        public const string ScreenSafeArea = "screen.safeArea";
        public const string ScreenSetOrientation = "screen.setOrientation";
        public const string MissionsTrack = "missions.track";
        public const string PointsBalance = "points.balance";
        public const string NavExit = "nav.exit";
    }

    /// <summary>게임존 이벤트.</summary>
    internal static class PlayEvents
    {
        public const string AppPause = "app.pause";
        public const string AppResume = "app.resume";
        public const string SafeAreaChange = "safeArea.change";
        public const string SessionChanged = "session.changed";

        public static readonly string[] Forwarded = { AppPause, AppResume, SafeAreaChange, SessionChanged };
    }

    /// <summary>열거형 → 게임 채널 글자.</summary>
    internal static class PlayWire
    {
        public static string Of(AdFormat format) => format == AdFormat.Interstitial ? "interstitial" : "rewarded";

        public static string Of(BannerAction action)
        {
            switch (action)
            {
                case BannerAction.Hide: return "hide";
                case BannerAction.Destroy: return "destroy";
                default: return "show";
            }
        }

        public static string Of(HapticStrength strength)
        {
            switch (strength)
            {
                case HapticStrength.Medium: return "medium";
                case HapticStrength.Heavy: return "heavy";
                default: return "light";
            }
        }

        public static string Of(GameOrientation orientation) => orientation == GameOrientation.Landscape ? "landscape" : "portrait";
    }

    [Preserve]
    internal sealed class PlayError
    {
        [Preserve, JsonProperty("code")] public string Code;
        [Preserve, JsonProperty("message")] public string Message;
    }

    internal static class PlayLog
    {
        public const string Prefix = "[SuperboxPlay]";

        /// <summary>기능이 꺼졌거나 게임존 밖이거나 사용자가 닫은 것은 고장이 아니라 경고하지 않는다.</summary>
        public static void Failure(string api, PlayError error)
        {
            var code = string.IsNullOrEmpty(error?.Code) ? PlayErrorCodes.Internal : error.Code;
            var message = error?.Message ?? string.Empty;
            switch (code)
            {
                case PlayErrorCodes.Unsupported:
                case PlayErrorCodes.NotConnected:
                case PlayErrorCodes.Canceled:
                case PlayErrorCodes.AdNoFill:
                case PlayErrorCodes.AdFrequencyCapped:
                    Debug.Log($"{Prefix} {api}: {code} {message}");
                    return;
                default:
                    Debug.LogWarning($"{Prefix} {api} 실패({code}): {message}");
                    return;
            }
        }

        /// <summary>게임 콜백을 부른다 — 던져도 다음 콜백과 SDK 장부는 이어 간다.</summary>
        public static void Run(Action callback, string what)
        {
            try
            {
                callback?.Invoke();
            }
            catch (Exception error)
            {
                Debug.LogError($"{Prefix} {what} 처리 중 오류가 났어요: {error}");
            }
        }

        /// <summary>다음 프레임에 부른다 — 실제 응답처럼 비동기로 끝나게. WebGL 에는 타이머 스레드가 없어 Task.Delay 를 쓰지 않는다.</summary>
        public static async void NextFrame(Action action)
        {
            await Task.Yield();
            Run(action, "다음 프레임 작업");
        }
    }

    /// <summary>게임 채널 JSON — 없는 칸은 무시하고, null 은 빼고, 날짜 모양 글자는 글자 그대로 둔다.</summary>
    internal static class PlayJson
    {
        internal static readonly JsonSerializer Serializer = JsonSerializer.Create(new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
            MissingMemberHandling = MissingMemberHandling.Ignore,
            DateParseHandling = DateParseHandling.None,
            FloatParseHandling = FloatParseHandling.Double,
        });

        public static JObject ParseObject(string json)
        {
            using (var reader = new JsonTextReader(new StringReader(json ?? string.Empty))
                   {
                       DateParseHandling = DateParseHandling.None,
                       FloatParseHandling = FloatParseHandling.Double,
                   })
            {
                return JObject.Load(reader);
            }
        }

        public static JObject ToObject(object value)
        {
            if (value == null)
                return new JObject();
            if (value is JObject json)
                return json;
            return JObject.FromObject(value, Serializer);
        }

        public static string Serialize(object value) => ToObject(value).ToString(Formatting.None);

        // 사전을 통째로 FromObject 하지 않는다 — 제네릭 사전 리플렉션을 IL2CPP 에 맡기지 않는다
        public static JObject ToToken(IReadOnlyDictionary<string, object> values)
        {
            var token = new JObject();
            foreach (var pair in values)
                token[pair.Key] = pair.Value == null ? JValue.CreateNull() : JToken.FromObject(pair.Value, Serializer);
            return token;
        }

        public static T TryRead<T>(JToken token) where T : class
        {
            if (token == null || token.Type != JTokenType.Object)
                return null;
            if (token is T same)
                return same;
            try
            {
                return token.ToObject<T>(Serializer);
            }
            catch (Exception error)
            {
                Debug.LogWarning($"{PlayLog.Prefix} {typeof(T).Name} 응답을 읽지 못했어요({error.Message}): {token.ToString(Formatting.None)}");
                return null;
            }
        }

        public static bool Flag(JObject source, string field) => source?[field] is JValue value && value.Value is bool flag && flag;

        public static string Text(JObject source, string field) => source?[field] is JValue value && value.Type == JTokenType.String ? (string)value.Value : null;

        public static bool HasNumbers(JObject source, params string[] fields)
        {
            foreach (var field in fields)
            {
                var type = source?[field]?.Type;
                if (type != JTokenType.Integer && type != JTokenType.Float)
                    return false;
            }
            return true;
        }
    }
}

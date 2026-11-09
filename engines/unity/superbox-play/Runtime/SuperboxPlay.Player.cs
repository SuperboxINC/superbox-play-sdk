using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace Superbox.Play
{
    public static partial class SuperboxPlay
    {
        private const float PlayerTimeoutSeconds = 20f;

        /// <summary>진동 — <see cref="PlayFeatures.Haptic"/> 가 켜졌을 때만 부른다.</summary>
        public static Task HapticAsync(HapticStrength strength = HapticStrength.Light) =>
            Request(PlayMethods.Haptic, new JObject { ["strength"] = PlayWire.Of(strength) });

        public static class Auth
        {
            /// <summary>현재 플레이어. 로그인 창은 열지 않는다.</summary>
            public static Task<LoginResult> LoginAsync() => Request<LoginResult>(PlayMethods.AuthLogin, null, PlayerTimeoutSeconds);

            public static Task<ServerAuthCode> ServerAuthCodeAsync() => Request<ServerAuthCode>(PlayMethods.AuthServerAuthCode, null, PlayerTimeoutSeconds);
        }

        public static class Social
        {
            /// <summary>공유 창을 연다. 사용자가 머물 수 있어 제한 시간이 없다. 결과는 추정값이라 이것만 보고 보상을 주지 않는다.</summary>
            public static Task<bool> ShareAsync(string text, string url = null)
            {
                var parameters = new JObject { ["text"] = text ?? string.Empty };
                if (!string.IsNullOrEmpty(url))
                    parameters["url"] = url;
                return RequestFlag(PlayMethods.SocialShare, parameters, "shared");
            }

            /// <summary>공유 링크. 지원하지 않는 환경이면 빈 문자열.</summary>
            public static async Task<string> ShareLinkAsync(string path)
            {
                var result = await Request<JObject>(PlayMethods.SocialShareLink, new JObject { ["path"] = path ?? string.Empty }, PlayerTimeoutSeconds);
                return PlayJson.Text(result, "url") ?? string.Empty;
            }

            public static Task OpenUrlAsync(string url) => Request(PlayMethods.SocialOpenUrl, new JObject { ["url"] = url ?? string.Empty }, PlayerTimeoutSeconds);
        }

        public static class Analytics
        {
            /// <summary>값은 숫자 · 글자 · bool 로 넘긴다. JSON 으로 만들 수 없는 값(Vector3 등)은 INVALID_PARAMS 로 끝난다.</summary>
            public static async Task TrackAsync(string name, IReadOnlyDictionary<string, object> parameters = null)
            {
                var request = new JObject { ["name"] = name ?? string.Empty };
                if (parameters != null)
                    request["params"] = ToParams(parameters);
                await Request(PlayMethods.AnalyticsTrack, request);
            }

            private static JObject ToParams(IReadOnlyDictionary<string, object> parameters)
            {
                try
                {
                    return PlayJson.ToToken(parameters);
                }
                catch (Exception error)
                {
                    throw new SuperboxPlayException(PlayErrorCodes.InvalidParams, $"분석 값을 JSON 으로 만들지 못했어요: {error.Message}");
                }
            }
        }

        public static class Missions
        {
            /// <summary>미션 이벤트를 보낸다. 받아들이지 않은 이벤트면 false.</summary>
            public static Task<bool> TrackAsync(string eventName, int? value = null)
            {
                var parameters = new JObject { ["event"] = eventName ?? string.Empty };
                if (value.HasValue)
                    parameters["value"] = value.Value;
                return RequestFlag(PlayMethods.MissionsTrack, parameters, "accepted", PlayerTimeoutSeconds);
            }
        }

        public static class Points
        {
            public static Task<PointsBalance> BalanceAsync() => Request<PointsBalance>(PlayMethods.PointsBalance, null, PlayerTimeoutSeconds);
        }

        public static class Nav
        {
            /// <summary>게임을 끝내고 게임존 홈으로 돌아간다.</summary>
            public static Task ExitAsync() => Request(PlayMethods.NavExit, null, PlayerTimeoutSeconds);
        }
    }
}

using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace Superbox.Play
{
    public static partial class SuperboxPlay
    {
        /// <summary>광고 — 보여도 되는지는 <see cref="PlaySession.Features"/> 로 판단한다.</summary>
        public static class Ads
        {
            private const float LoadTimeoutSeconds = 60f;
            private const float BannerTimeoutSeconds = 20f;

            /// <summary>광고를 미리 불러 둔다. 광고가 꺼진 환경이면 false.</summary>
            public static Task<bool> LoadAsync(AdFormat format, string adGroupId = null) =>
                RequestFlag(PlayMethods.AdsLoad, WithGroup(new JObject { ["format"] = PlayWire.Of(format) }, adGroupId), "ready", LoadTimeoutSeconds);

            /// <summary>보상형 광고 — 보상은 <see cref="AdShowResult.Rewarded"/> 일 때만 준다. 사용자가 오래 머물 수 있어 제한 시간이 없다.</summary>
            public static Task<AdShowResult> ShowRewardedAsync(string placement, string adGroupId = null) => Show(AdFormat.Rewarded, placement, adGroupId);

            public static Task<AdShowResult> ShowInterstitialAsync(string placement, string adGroupId = null) => Show(AdFormat.Interstitial, placement, adGroupId);

            /// <summary>화면 아래 배너를 켜고 끈다. 상태가 바뀌면 <see cref="Screen.SafeAreaChanged"/> 가 온다.</summary>
            public static Task<BannerState> BannerAsync(BannerAction action, string adGroupId = null) =>
                Request<BannerState>(PlayMethods.AdsBanner, WithGroup(new JObject { ["action"] = PlayWire.Of(action) }, adGroupId), BannerTimeoutSeconds);

            private static Task<AdShowResult> Show(AdFormat format, string placement, string adGroupId)
            {
                var parameters = new JObject { ["format"] = PlayWire.Of(format), ["placement"] = placement ?? string.Empty };
                return Request<AdShowResult>(PlayMethods.AdsShow, WithGroup(parameters, adGroupId));
            }

            private static JObject WithGroup(JObject parameters, string adGroupId)
            {
                if (!string.IsNullOrEmpty(adGroupId))
                    parameters["adGroupId"] = adGroupId;
                return parameters;
            }
        }
    }
}

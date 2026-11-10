using Newtonsoft.Json;
using UnityEngine;
using UnityEngine.Scripting;

namespace Superbox.Play
{
    // 응답 모양 — 게임에서는 읽기만 한다. 속성마다 [Preserve] 를 붙인다: IL2CPP 코드 제거가 게임 코드가 부르지 않는 setter 를 지우면 Newtonsoft 가 값을 넣지 못한다.

    public enum AdFormat
    {
        Rewarded,
        Interstitial,
    }

    public enum BannerAction
    {
        Show,
        Hide,
        Destroy,
    }

    public enum HapticStrength
    {
        Light,
        Medium,
        Heavy,
    }

    public enum GameOrientation
    {
        Portrait,
        Landscape,
    }

    public static class PlayEnvironment
    {
        public const string Live = "live";
        public const string Sandbox = "sandbox";
        public const string Standalone = "standalone";
    }

    public static class PlayPauseReason
    {
        public const string Background = "background";
        public const string Ad = "ad";
        public const string Payment = "payment";
        public const string Menu = "menu";
    }

    public static class PurchaseStatus
    {
        public const string Paid = "paid";
        public const string Pending = "pending";
        public const string Canceled = "canceled";
        public const string Failed = "failed";
    }

    public static class PlayProductType
    {
        public const string Consumable = "consumable";
        public const string NonConsumable = "non_consumable";
        public const string Subscription = "subscription";
    }

    public static class SubscriptionStatus
    {
        public const string Active = "active";
        public const string Canceled = "canceled";
        public const string Expired = "expired";
        public const string Revoked = "revoked";
    }

    [Preserve]
    public sealed class PlaySession
    {
        [Preserve, JsonProperty("protocol")] public int Protocol { get; private set; } = 1;
        /// <summary><see cref="PlayEnvironment"/> 값.</summary>
        [Preserve, JsonProperty("environment")] public string Environment { get; private set; } = PlayEnvironment.Standalone;
        [Preserve, JsonProperty("player")] public PlayPlayer Player { get; private set; } = new PlayPlayer();
        /// <summary>버튼을 보일지는 이 값만 보고 정한다.</summary>
        [Preserve, JsonProperty("features")] public PlayFeatures Features { get; private set; } = new PlayFeatures();
        /// <summary>게임 틀 기준 CSS 픽셀 — 화면 좌표는 <see cref="SuperboxPlay.Screen.SafeArea"/>.</summary>
        [Preserve, JsonProperty("safeArea")] public PlayInsets SafeArea { get; private set; } = new PlayInsets();
        [Preserve, JsonProperty("locale")] public string Locale { get; private set; } = "ko-KR";
    }

    [Preserve]
    public sealed class PlayPlayer
    {
        /// <summary>이 파트너 안에서 바뀌지 않는 플레이어 ID. 파트너 회원번호가 아니다.</summary>
        [Preserve, JsonProperty("key")] public string Key { get; private set; } = string.Empty;
        [Preserve, JsonProperty("displayName")] public string DisplayName { get; private set; } = string.Empty;
        [Preserve, JsonProperty("linked")] public bool Linked { get; private set; }
        /// <summary>
        /// 이 채널에서 이 게임을 출시 전에 사전예약했는지. 사전예약 보상(아이템)은 게임이 주고, 한 번만 주는 것은 게임이 <see cref="Key"/> 로 지킨다.
        /// 게임존 밖(standalone) · 검수 미리보기 · 사전예약이 없던 게임 · 확인하지 못했을 때는 false.
        /// </summary>
        [Preserve, JsonProperty("preregistered")] public bool Preregistered { get; private set; }
    }

    [Preserve]
    public sealed class PlayFeatures
    {
        [Preserve, JsonProperty("ads")] public PlayAdFeatures Ads { get; private set; } = new PlayAdFeatures();
        [Preserve, JsonProperty("purchases")] public bool Purchases { get; private set; }
        [Preserve, JsonProperty("share")] public bool Share { get; private set; }
        [Preserve, JsonProperty("haptic")] public bool Haptic { get; private set; }
        [Preserve, JsonProperty("externalLinks")] public bool ExternalLinks { get; private set; }
        [Preserve, JsonProperty("leaderboard")] public bool Leaderboard { get; private set; }
        [Preserve, JsonProperty("analytics")] public bool Analytics { get; private set; }
        [Preserve, JsonProperty("missions")] public bool Missions { get; private set; }
        [Preserve, JsonProperty("points")] public bool Points { get; private set; }
    }

    [Preserve]
    public sealed class PlayAdFeatures
    {
        [Preserve, JsonProperty("rewarded")] public bool Rewarded { get; private set; }
        [Preserve, JsonProperty("interstitial")] public bool Interstitial { get; private set; }
        [Preserve, JsonProperty("banner")] public bool Banner { get; private set; }
    }

    /// <summary>CSS 픽셀 네 변.</summary>
    [Preserve]
    public sealed class PlayInsets
    {
        [Preserve, JsonProperty("top")] public float Top { get; private set; }
        [Preserve, JsonProperty("bottom")] public float Bottom { get; private set; }
        [Preserve, JsonProperty("left")] public float Left { get; private set; }
        [Preserve, JsonProperty("right")] public float Right { get; private set; }

        internal bool SameAs(PlayInsets other) =>
            Mathf.Approximately(Top, other.Top) && Mathf.Approximately(Bottom, other.Bottom) &&
            Mathf.Approximately(Left, other.Left) && Mathf.Approximately(Right, other.Right);
    }

    [Preserve]
    public sealed class AdShowResult
    {
        [Preserve, JsonProperty("shown")] public bool Shown { get; private set; }
        /// <summary>보상형 광고를 끝까지 봤다. 전면형은 늘 false.</summary>
        [Preserve, JsonProperty("rewarded")] public bool Rewarded { get; private set; }
    }

    [Preserve]
    public sealed class BannerState
    {
        [Preserve, JsonProperty("visible")] public bool Visible { get; private set; }
        [Preserve, JsonProperty("heightPx")] public float HeightPx { get; private set; }
    }

    [Preserve]
    public sealed class PlayPrice
    {
        /// <summary>정수 금액.</summary>
        [Preserve, JsonProperty("amount")] public long Amount { get; private set; }
        [Preserve, JsonProperty("currency")] public string Currency { get; private set; } = string.Empty;
        /// <summary>화면에 그대로 보여 줄 가격 글자.</summary>
        [Preserve, JsonProperty("label")] public string Label { get; private set; } = string.Empty;
    }

    [Preserve]
    public sealed class PlayProduct
    {
        [Preserve, JsonProperty("key")] public string Key { get; private set; } = string.Empty;
        [Preserve, JsonProperty("title")] public string Title { get; private set; } = string.Empty;
        /// <summary><see cref="PlayProductType"/> 값.</summary>
        [Preserve, JsonProperty("type")] public string Type { get; private set; } = string.Empty;
        [Preserve, JsonProperty("price")] public PlayPrice Price { get; private set; } = new PlayPrice();
        /// <summary>구독만 — weekly · monthly · yearly. 그 밖에는 null.</summary>
        [Preserve, JsonProperty("renewalPeriod")] public string RenewalPeriod { get; private set; }
        /// <summary>구독만 — 무료 체험(비면 없음). 그 밖에는 null.</summary>
        [Preserve, JsonProperty("freeTrial")] public string FreeTrial { get; private set; }
    }

    [Preserve]
    public class PurchaseResult
    {
        /// <summary><see cref="PurchaseStatus"/> 값.</summary>
        [Preserve, JsonProperty("status")] public string Status { get; protected set; } = string.Empty;
        [Preserve, JsonProperty("orderId")] public string OrderId { get; protected set; } = string.Empty;
        [Preserve, JsonProperty("productKey")] public string ProductKey { get; protected set; } = string.Empty;
        /// <summary>샌드박스 · 에디터의 시뮬레이션 결제.</summary>
        [Preserve, JsonProperty("simulated")] public bool Simulated { get; protected set; }
    }

    public sealed class GrantedPurchaseResult : PurchaseResult
    {
        internal GrantedPurchaseResult(PurchaseResult order, bool completed)
        {
            Status = order.Status;
            OrderId = order.OrderId;
            ProductKey = order.ProductKey;
            Simulated = order.Simulated;
            Completed = completed;
        }

        /// <summary>지급 확인까지 끝났다.</summary>
        public bool Completed { get; }
    }

    [Preserve]
    public sealed class PendingOrder
    {
        [Preserve, JsonProperty("orderId")] public string OrderId { get; private set; } = string.Empty;
        [Preserve, JsonProperty("productKey")] public string ProductKey { get; private set; } = string.Empty;
        /// <summary><see cref="PurchaseStatus"/> 값.</summary>
        [Preserve, JsonProperty("status")] public string Status { get; private set; } = string.Empty;
        [Preserve, JsonProperty("simulated")] public bool Simulated { get; private set; }
    }

    [Preserve]
    public sealed class PlaySubscription
    {
        [Preserve, JsonProperty("productKey")] public string ProductKey { get; private set; } = string.Empty;
        [Preserve, JsonProperty("orderId")] public string OrderId { get; private set; } = string.Empty;
        /// <summary><see cref="SubscriptionStatus"/> 값.</summary>
        [Preserve, JsonProperty("status")] public string Status { get; private set; } = string.Empty;
        /// <summary>지금 이용권을 열어도 된다. 만료 시각은 서버가 따진다.</summary>
        [Preserve, JsonProperty("accessible")] public bool Accessible { get; private set; }
        /// <summary>만료 시각(ISO 8601).</summary>
        [Preserve, JsonProperty("expiresDate")] public string ExpiresDate { get; private set; } = string.Empty;
        [Preserve, JsonProperty("autoRenew")] public bool AutoRenew { get; private set; }
        [Preserve, JsonProperty("isTrial")] public bool IsTrial { get; private set; }
        [Preserve, JsonProperty("renewalPeriod")] public string RenewalPeriod { get; private set; } = string.Empty;
    }

    [Preserve]
    public sealed class LoginResult
    {
        [Preserve, JsonProperty("loggedIn")] public bool LoggedIn { get; private set; }
        [Preserve, JsonProperty("key")] public string Key { get; private set; } = string.Empty;
        [Preserve, JsonProperty("displayName")] public string DisplayName { get; private set; } = string.Empty;
        [Preserve, JsonProperty("linked")] public bool Linked { get; private set; }
    }

    [Preserve]
    public sealed class ServerAuthCode
    {
        [Preserve, JsonProperty("provider")] public string Provider { get; private set; } = string.Empty;
        [Preserve, JsonProperty("code")] public string Code { get; private set; } = string.Empty;
        [Preserve, JsonProperty("expiresInSeconds")] public int ExpiresInSeconds { get; private set; }
    }

    [Preserve]
    public sealed class PointsBalance
    {
        [Preserve, JsonProperty("balance")] public long Balance { get; private set; }
        [Preserve, JsonProperty("unit")] public string Unit { get; private set; } = string.Empty;
    }
}

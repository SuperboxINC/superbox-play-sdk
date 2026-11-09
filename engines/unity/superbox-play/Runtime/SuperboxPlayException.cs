using System;

namespace Superbox.Play
{
    /// <summary>게임존이 거절했거나 연결되지 않았다 — <see cref="Code"/> 는 <see cref="PlayErrorCodes"/>.</summary>
    public sealed class SuperboxPlayException : Exception
    {
        public SuperboxPlayException(string code, string message)
            : base(string.IsNullOrEmpty(message) ? code : message)
        {
            Code = code;
        }

        public string Code { get; }
    }

    /// <summary>오류 코드 — 개발자 센터의 오류 코드 표.</summary>
    public static class PlayErrorCodes
    {
        public const string Unsupported = "UNSUPPORTED";
        public const string InvalidParams = "INVALID_PARAMS";
        public const string Forbidden = "FORBIDDEN";
        public const string Canceled = "CANCELED";
        public const string Timeout = "TIMEOUT";
        public const string RateLimited = "RATE_LIMITED";
        public const string AdNoFill = "AD_NO_FILL";
        public const string AdFrequencyCapped = "AD_FREQUENCY_CAPPED";
        public const string PayPending = "PAY_PENDING";
        public const string PayFailed = "PAY_FAILED";
        public const string NotConnected = "NOT_CONNECTED";
        public const string Network = "NETWORK";
        public const string Internal = "INTERNAL";
    }
}

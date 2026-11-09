using System;
using Newtonsoft.Json.Linq;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace Superbox.Play
{
    /// <summary>
    /// 실제 채널 — 요청은 SuperboxPlay.jslib 을 지나 Play SDK(<c>SBPlay.init()</c> · <c>SBPlay.call</c>)로, 답과 게임존 이벤트는 JSON 문자열로
    /// <see cref="PlayReceiver"/> 에 돌아온다. 페이지에 SDK 가 없으면 jslib 이 불러올 때까지 요청을 줄 세운다.
    /// </summary>
    internal sealed class PlayJsChannel : IPlayChannel
    {
        private const string DefaultSdkUrl = "https://game.superboxgo.com/sdk/play/v1.js";
        // SDK 로드(jslib 15초) + SDK 의 독립 실행 판정(3초) — 여유를 둔다
        private const float InitTimeoutSeconds = 30f;

        private readonly PlayCallTable table = new PlayCallTable();
        private bool started;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void SuperboxPlay_Start(string sdkUrl, string target, string responseMethod, string eventMethod);
        [DllImport("__Internal")] private static extern void SuperboxPlay_Listen(string eventName);
        [DllImport("__Internal")] private static extern void SuperboxPlay_Init(string id);
        [DllImport("__Internal")] private static extern void SuperboxPlay_Call(string id, string method, string paramsJson);
#else
        private static void SuperboxPlay_Start(string sdkUrl, string target, string responseMethod, string eventMethod) { }
        private static void SuperboxPlay_Listen(string eventName) { }
        private static void SuperboxPlay_Init(string id) { }
        private static void SuperboxPlay_Call(string id, string method, string paramsJson) { }
#endif

        // C# 9 는 정적 메서드 그룹을 대리자로 바꿀 때마다 새로 만든다 — 매 프레임 할당하지 않게 한 번만 만든다
        private static readonly Action<string, string, string> SendCall = Send;

        private static float Now => Time.realtimeSinceStartup;

        public event Action<string, JObject> EventReceived
        {
            add => table.EventReceived += value;
            remove => table.EventReceived -= value;
        }

        public void Init(Action<PlayResponse> onResponse)
        {
            EnsureStarted();
            var id = table.Register(PlayMethods.SessionInit, onResponse, InitTimeoutSeconds, Now);
            SuperboxPlay_Init(id);
        }

        public void Call(string method, object parameters, Action<PlayResponse> onResponse, float timeoutSeconds = 0f)
        {
            EnsureStarted();
            string json;
            try
            {
                json = PlayJson.Serialize(parameters);
            }
            catch (Exception error)
            {
                PlayLog.NextFrame(() => onResponse?.Invoke(PlayResponse.Failure(PlayErrorCodes.InvalidParams, error.Message)));
                return;
            }
            table.Enqueue(method, json, onResponse, timeoutSeconds, Now);
            Pump();
        }

        /// <summary>한도 안에서 보내고 제한 시간을 본다 — <see cref="PlayReceiver"/> 가 프레임마다 부른다.</summary>
        internal void Pump()
        {
            if (!table.IsIdle)
                table.Pump(Now, SendCall);
        }

        internal void Deliver(string json) => table.Deliver(json);

        internal void DeliverEvent(string json) => table.DeliverEvent(json);

        private static void Send(string id, string method, string paramsJson) => SuperboxPlay_Call(id, method, paramsJson);

        private void EnsureStarted()
        {
            if (started)
                return;
            started = true;
            PlayReceiver.Create(this);
            SuperboxPlay_Start(DefaultSdkUrl, PlayReceiver.ObjectName, nameof(PlayReceiver.OnPlayResponse), nameof(PlayReceiver.OnPlayEvent));
            foreach (var name in PlayEvents.Forwarded)
                SuperboxPlay_Listen(name);
        }
    }
}

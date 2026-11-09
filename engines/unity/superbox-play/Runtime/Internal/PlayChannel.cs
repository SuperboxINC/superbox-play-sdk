using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Superbox.Play
{
    /// <summary>요청 하나의 답 — 결과 객체 또는 프로토콜 오류. 요청마다 정확히 하나다.</summary>
    internal sealed class PlayResponse
    {
        private PlayResponse(JObject result, PlayError error)
        {
            Result = result;
            Error = error;
        }

        public bool Ok => Error == null;
        public JObject Result { get; }
        public PlayError Error { get; }
        public string ErrorCode => Error?.Code ?? string.Empty;

        public static PlayResponse Success(JObject result) => new PlayResponse(result ?? new JObject(), null);

        public static PlayResponse Failure(string code, string message) =>
            new PlayResponse(null, new PlayError
            {
                Code = string.IsNullOrEmpty(code) ? PlayErrorCodes.Internal : code,
                Message = message ?? string.Empty,
            });

        /// <summary>jslib 이 보낸 답 — 봉투에서 v 를 뺀 <c>{id, ok, result}</c> 또는 <c>{id, ok:false, error{code, message}}</c>.</summary>
        public static PlayResponse FromMessage(JObject message)
        {
            if (message == null)
                return Failure(PlayErrorCodes.Internal, "답이 없어요");
            if (message["ok"] is JValue ok && ok.Type == JTokenType.Boolean && (bool)ok.Value)
                return Success(message["result"] as JObject);
            var error = PlayJson.TryRead<PlayError>(message["error"]);
            return Failure(error?.Code, error?.Message);
        }

        public T ResultAs<T>() where T : class => Result == null ? null : PlayJson.TryRead<T>(Result);
    }

    /// <summary>게임 채널 — 세션은 <c>SBPlay.init()</c>, 나머지는 <c>SBPlay.call(method, params)</c>. 답은 메인 스레드에서 정확히 한 번 온다.</summary>
    internal interface IPlayChannel
    {
        void Init(Action<PlayResponse> onResponse);

        /// <summary>
        /// <paramref name="timeoutSeconds"/> 가 0 보다 크면 그때까지 답이 없을 때 TIMEOUT 으로 답한다 — 조회용 안전장치다. 광고와 결제창은 사용자가 오래 머물 수 있어 넣지 않는다.
        /// </summary>
        void Call(string method, object parameters, Action<PlayResponse> onResponse, float timeoutSeconds = 0f);

        event Action<string, JObject> EventReceived;
    }

    /// <summary>
    /// 실제 채널의 장부 — id 와 답 기다리는 콜백(정확히 한 번, 제한 시간 뒤 늦게 온 답은 버린다), 메서드별 속도 조절(게임존은 같은 메서드 초당 5회를 넘으면 RATE_LIMITED), 게임존 이벤트.
    /// Unity · JavaScript 를 부르지 않아 시험이 바로 돌린다.
    /// </summary>
    internal sealed class PlayCallTable
    {
        /// <summary>메서드 하나가 1초에 보내는 수 — 게임존 한도 5 에 여유를 둔다.</summary>
        internal const int MaxCallsPerSecond = 4;
        /// <summary>메서드 하나가 줄 서는 수 — 넘으면 가장 오래된 것을 버린다(분석 이벤트 폭주).</summary>
        internal const int MaxQueuedPerMethod = 100;
        private const float RateWindowSeconds = 1f;

        private sealed class PendingCall
        {
            public string Id;
            public string Method;
            public string ParamsJson;
            public Action<PlayResponse> OnResponse;
            public float TimeoutSeconds;
            public float Deadline;
        }

        private readonly Dictionary<string, PendingCall> waiting = new Dictionary<string, PendingCall>();
        private readonly List<PendingCall> outbox = new List<PendingCall>();
        private readonly Dictionary<string, Queue<float>> sentAt = new Dictionary<string, Queue<float>>();
        // 같은 페이지에서 Unity 를 다시 만들면 jslib 상태는 남는다 — 앞 인스턴스의 늦은 답이 새 인스턴스의 같은 번호 요청에 붙지 않게
        private readonly string idPrefix = "u" + Guid.NewGuid().ToString("N").Substring(0, 8) + "-";
        private int sequence;

        public event Action<string, JObject> EventReceived;

        public int WaitingCount => waiting.Count;
        public int QueuedCount => outbox.Count;
        public bool IsIdle => waiting.Count == 0 && outbox.Count == 0;

        /// <summary>속도 조절 없이 바로 보낼 요청(세션) — id 를 돌려준다.</summary>
        public string Register(string method, Action<PlayResponse> onResponse, float timeoutSeconds, float now, string id = null)
        {
            var call = NewCall(method, null, onResponse, timeoutSeconds, id);
            Arm(call, now);
            return call.Id;
        }

        /// <summary>요청을 줄 세운다 — <see cref="Pump"/> 가 한도 안에서 보낸다.</summary>
        public string Enqueue(string method, string paramsJson, Action<PlayResponse> onResponse, float timeoutSeconds, float now)
        {
            var call = NewCall(method, paramsJson, onResponse, timeoutSeconds, null);
            // 늦은 진동은 없느니만 못하다 — 한도를 넘는 진동은 줄 세우지 않고 버린다
            if (method == PlayMethods.Haptic && (QueuedOf(method) > 0 || !HasRoom(method, now)))
            {
                Answer(call, PlayResponse.Failure(PlayErrorCodes.RateLimited, "진동을 너무 자주 호출했어요"));
                return call.Id;
            }
            if (QueuedOf(method) >= MaxQueuedPerMethod)
            {
                var oldest = outbox.FindIndex(c => c.Method == method);
                var dropped = outbox[oldest];
                outbox.RemoveAt(oldest);
                Answer(dropped, PlayResponse.Failure(PlayErrorCodes.RateLimited, $"{method} 호출이 너무 많이 쌓였어요"));
            }
            outbox.Add(call);
            return call.Id;
        }

        /// <summary>한도 안에서 보내고(메서드마다 순서대로) 제한 시간이 지난 요청에 답한다.</summary>
        public void Pump(float now, Action<string, string, string> send)
        {
            for (var i = 0; i < outbox.Count;)
            {
                var call = outbox[i];
                if (!HasRoom(call.Method, now))
                {
                    i++;
                    continue;
                }
                outbox.RemoveAt(i);
                Record(call.Method, now);
                Arm(call, now);
                try
                {
                    send(call.Id, call.Method, call.ParamsJson);
                }
                catch (Exception error)
                {
                    if (waiting.Remove(call.Id))
                        Answer(call, PlayResponse.Failure(PlayErrorCodes.Internal, $"{call.Method}을 보내지 못했어요: {error.Message}"));
                }
            }
            Expire(now);
        }

        /// <summary>jslib 이 보낸 답.</summary>
        public void Deliver(string json)
        {
            var message = Parse(json, "답");
            if (message == null)
                return;
            var id = TextOf(message["id"]);
            // 제한 시간이 지나 이미 TIMEOUT 으로 답한 요청의 늦은 답 — 프로토콜 규칙대로 버린다
            if (string.IsNullOrEmpty(id) || !waiting.TryGetValue(id, out var call))
                return;
            waiting.Remove(id);
            Answer(call, PlayResponse.FromMessage(message));
        }

        /// <summary>jslib 이 보낸 게임존 이벤트 — 핸들러 하나가 던져도 나머지는 받는다.</summary>
        public void DeliverEvent(string json)
        {
            var message = Parse(json, "이벤트");
            var name = message == null ? null : TextOf(message["event"]);
            if (string.IsNullOrEmpty(name))
                return;
            var data = message["data"] as JObject ?? new JObject();
            var handlers = EventReceived;
            if (handlers == null)
                return;
            foreach (Action<string, JObject> handler in handlers.GetInvocationList())
                PlayLog.Run(() => handler(name, data), name);
        }

        private void Expire(float now)
        {
            if (waiting.Count == 0)
                return;
            List<PendingCall> expired = null;
            foreach (var call in waiting.Values)
            {
                if (call.Deadline > 0f && now >= call.Deadline)
                    (expired ??= new List<PendingCall>()).Add(call);
            }
            if (expired == null)
                return;
            foreach (var call in expired)
            {
                // 앞 답의 콜백이 새 요청을 보내면 Pump → Expire 가 다시 돌아 이 요청에 이미 답했을 수 있다 — 한 번만 답한다
                if (!waiting.Remove(call.Id))
                    continue;
                Answer(call, PlayResponse.Failure(PlayErrorCodes.Timeout, $"{call.Method}: {call.TimeoutSeconds:0.#}초 안에 답이 없어요"));
            }
        }

        private PendingCall NewCall(string method, string paramsJson, Action<PlayResponse> onResponse, float timeoutSeconds, string id) =>
            new PendingCall
            {
                Id = string.IsNullOrEmpty(id) ? idPrefix + (++sequence).ToString(CultureInfo.InvariantCulture) : id,
                Method = method ?? string.Empty,
                ParamsJson = string.IsNullOrEmpty(paramsJson) ? "{}" : paramsJson,
                OnResponse = onResponse,
                TimeoutSeconds = Math.Max(0f, timeoutSeconds),
            };

        private void Arm(PendingCall call, float now)
        {
            call.Deadline = call.TimeoutSeconds > 0f ? now + call.TimeoutSeconds : 0f;
            waiting[call.Id] = call;
        }

        private int QueuedOf(string method)
        {
            var count = 0;
            foreach (var call in outbox)
            {
                if (call.Method == method)
                    count++;
            }
            return count;
        }

        private bool HasRoom(string method, float now)
        {
            if (!sentAt.TryGetValue(method, out var times))
                return true;
            while (times.Count > 0 && now - times.Peek() >= RateWindowSeconds)
                times.Dequeue();
            return times.Count < MaxCallsPerSecond;
        }

        private void Record(string method, float now)
        {
            if (!sentAt.TryGetValue(method, out var times))
                sentAt[method] = times = new Queue<float>();
            times.Enqueue(now);
        }

        private static void Answer(PendingCall call, PlayResponse response) => PlayLog.Run(() => call.OnResponse?.Invoke(response), call.Method);

        private static JObject Parse(string json, string what)
        {
            try
            {
                return PlayJson.ParseObject(json);
            }
            catch (Exception error)
            {
                Debug.LogWarning($"{PlayLog.Prefix} Play SDK 의 {what}을 읽지 못했어요({error.Message}): {json}");
                return null;
            }
        }

        private static string TextOf(JToken token) =>
            token is JValue value && value.Value != null ? Convert.ToString(value.Value, CultureInfo.InvariantCulture) : null;
    }
}

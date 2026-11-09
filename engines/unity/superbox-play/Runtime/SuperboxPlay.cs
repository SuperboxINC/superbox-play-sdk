using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Scripting;

namespace Superbox.Play
{
    /// <summary>
    /// 슈퍼박스 플레이 SDK 진입점 — Play SDK(전역 SBPlay)와 같은 메서드를 C# 으로 부른다. 메서드 설명은 개발자 센터의 메서드 레퍼런스.
    /// 실패는 <see cref="SuperboxPlayException"/> 으로 온다. 첫 씬 전에 스스로 게임존과 연결한다.
    /// </summary>
    public static partial class SuperboxPlay
    {
        public const string SdkVersion = "0.2.0";

        private const float RefreshTimeoutSeconds = 30f;

        private static IPlayChannel channel;
        private static PlaySession session = new PlaySession();
        private static Task<PlaySession> initializing;
        private static bool isInitialized;
        private static bool refreshing;
        private static bool refreshWanted;
        private static bool audioPausedBySdk;

        /// <summary>게임존이 게임을 멈출 때 <see cref="AudioListener.pause"/> 를 함께 건다. 기본 true.</summary>
        public static bool PauseAudioOnPause { get; set; } = true;

        /// <summary>마지막 세션 — 받기 전에는 게임존 밖의 값(기능은 모두 꺼짐)이고 null 이 아니다.</summary>
        public static PlaySession Session => session;

        /// <summary>게임존에서 세션을 받았다.</summary>
        public static bool IsInitialized => isInitialized;

        /// <summary>게임존이 게임을 멈췄다 — 값은 <see cref="PlayPauseReason"/>. 시간이 흐르는 게임은 여기서 멈춘다.</summary>
        public static event Action<string> Paused;

        public static event Action Resumed;

        /// <summary>플레이어가 바뀌어 새 세션을 받았다.</summary>
        public static event Action<PlaySession> SessionChanged;

        internal static IPlayChannel Channel
        {
            get
            {
                if (channel == null)
                    UseChannel(CreateChannel());
                return channel;
            }
        }

        /// <summary>
        /// 게임존과 연결하고 세션을 받는다. 여러 번 불러도 요청은 하나다. 게임을 막지 않게 실패해도 던지지 않고 게임존 밖의 세션을 돌려주며, 다음 호출이 다시 시도한다.
        /// </summary>
        public static Task<PlaySession> InitAsync()
        {
            if (initializing != null && (isInitialized || !initializing.IsCompleted))
                return initializing;
            initializing = Connect();
            return initializing;
        }

        /// <summary>
        /// 메서드를 이름으로 부른다 — 전용 함수가 없는 메서드용. 값은 JObject 로만 받는다: IL2CPP 코드 제거가 익명 객체의 getter 를 지우면 빈 값이 나간다.
        /// <paramref name="timeoutSeconds"/> 가 0 보다 크면 그때까지 답이 없을 때 TIMEOUT 으로 끝난다 — 조회용이다. 사용자가 오래 머물 수 있는 광고와 결제창에는 넣지 않는다.
        /// </summary>
        public static async Task<JObject> CallAsync(string method, JObject parameters = null, float timeoutSeconds = 0f)
        {
            var response = await Send(method, parameters, timeoutSeconds);
            if (!response.Ok)
                throw ToException(response);
            return response.Result;
        }

        internal static void UseChannel(IPlayChannel replacement)
        {
            if (channel != null)
                channel.EventReceived -= OnZoneEvent;
            channel = replacement;
            if (channel != null)
                channel.EventReceived += OnZoneEvent;
        }

        // 도메인 다시 불러오기를 끈 에디터에서도 플레이마다 처음부터 시작한다
        [Preserve]
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        internal static void ResetState()
        {
            UseChannel(null);
            session = new PlaySession();
            initializing = null;
            isInitialized = false;
            refreshing = false;
            refreshWanted = false;
            audioPausedBySdk = false;
            PauseAudioOnPause = true;
            Paused = null;
            Resumed = null;
            SessionChanged = null;
            Screen.ResetState();
        }

        // 버튼을 그릴 때 기능 플래그가 있도록 첫 씬 전에 연결한다
        [Preserve]
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        private static void AutoConnect() => _ = InitAsync();

        private static IPlayChannel CreateChannel()
        {
#if UNITY_EDITOR
            return new PlaySimulatedChannel();
#elif UNITY_WEBGL
            return new PlayJsChannel();
#else
            // 운영 빌드에서 결제가 무료로 끝나면 안 된다 — 시뮬레이션은 에디터뿐이다
            return new PlayOfflineChannel();
#endif
        }

        private static Task<PlaySession> Connect()
        {
            var done = new TaskCompletionSource<PlaySession>();
            Channel.Init(response =>
            {
                var info = response.Ok ? response.ResultAs<PlaySession>() : null;
                if (info == null)
                {
                    PlayLog.Failure(PlayMethods.SessionInit, response.Error);
                    done.TrySetResult(session);
                }
                else
                {
                    Adopt(info);
                    done.TrySetResult(info);
                }
                RefreshIfWanted();
            });
            return done.Task;
        }

        private static void Adopt(PlaySession info)
        {
            session = info;
            isInitialized = true;
            Screen.Adopt(info.SafeArea);
        }

        private static void OnZoneEvent(string name, JObject data)
        {
            switch (name)
            {
                case PlayEvents.AppPause:
                    PauseAudio();
                    RaiseSafely(Paused, PlayJson.Text(data, "reason") ?? PlayPauseReason.Background, name);
                    break;
                case PlayEvents.AppResume:
                    ResumeAudio();
                    RaiseSafely(Resumed, name);
                    break;
                case PlayEvents.SafeAreaChange:
                    Screen.OnZoneInsets(data);
                    break;
                case PlayEvents.SessionChanged:
                    if (refreshing || initializing == null || !initializing.IsCompleted)
                        refreshWanted = true;
                    else
                        Refresh();
                    break;
            }
        }

        private static void Refresh()
        {
            refreshing = true;
            Channel.Call(PlayMethods.SessionInit, null, response =>
            {
                refreshing = false;
                var info = response.Ok ? response.ResultAs<PlaySession>() : null;
                if (info == null)
                {
                    PlayLog.Failure(PlayMethods.SessionInit, response.Error);
                }
                else
                {
                    Adopt(info);
                    initializing = Task.FromResult(info);
                    RaiseSafely(SessionChanged, info, PlayEvents.SessionChanged);
                }
                RefreshIfWanted();
            }, RefreshTimeoutSeconds);
        }

        private static void RefreshIfWanted()
        {
            if (!refreshWanted)
                return;
            refreshWanted = false;
            Refresh();
        }

        // 게임이 스스로 멈춘 소리는 다시 시작할 때도 건드리지 않는다
        private static void PauseAudio()
        {
            if (!PauseAudioOnPause || AudioListener.pause)
                return;
            audioPausedBySdk = true;
            AudioListener.pause = true;
        }

        private static void ResumeAudio()
        {
            if (!audioPausedBySdk)
                return;
            audioPausedBySdk = false;
            AudioListener.pause = false;
        }

        internal static Task<PlayResponse> Send(string method, object parameters, float timeoutSeconds)
        {
            var answer = new TaskCompletionSource<PlayResponse>();
            Channel.Call(method, parameters, response => answer.TrySetResult(response), timeoutSeconds);
            return answer.Task;
        }

        internal static async Task Request(string method, object parameters = null, float timeoutSeconds = 0f)
        {
            var response = await Send(method, parameters, timeoutSeconds);
            if (!response.Ok)
                throw ToException(response);
        }

        internal static async Task<T> Request<T>(string method, object parameters = null, float timeoutSeconds = 0f) where T : class
        {
            var response = await Send(method, parameters, timeoutSeconds);
            if (!response.Ok)
                throw ToException(response);
            return response.ResultAs<T>() ?? throw UnexpectedAnswer(method);
        }

        internal static async Task<bool> RequestFlag(string method, object parameters, string field, float timeoutSeconds = 0f)
        {
            var response = await Send(method, parameters, timeoutSeconds);
            if (!response.Ok)
                throw ToException(response);
            return PlayJson.Flag(response.Result, field);
        }

        // Newtonsoft 가 List<T> 를 리플렉션으로 만들지 않게 줄마다 읽는다 — IL2CPP 코드 제거에 기대지 않는다. 모양이 틀린 줄은 버린다
        internal static async Task<IReadOnlyList<T>> RequestList<T>(string method, string field, float timeoutSeconds) where T : class
        {
            var response = await Send(method, null, timeoutSeconds);
            if (!response.Ok)
                throw ToException(response);
            var items = new List<T>();
            if (!(response.Result[field] is JArray entries))
                return items;
            foreach (var entry in entries)
            {
                var item = PlayJson.TryRead<T>(entry);
                if (item != null)
                    items.Add(item);
            }
            return items;
        }

        internal static SuperboxPlayException UnexpectedAnswer(string method) =>
            new SuperboxPlayException(PlayErrorCodes.Internal, $"{method} 응답 형식이 달라요");

        private static SuperboxPlayException ToException(PlayResponse response) =>
            new SuperboxPlayException(response.ErrorCode, response.Error?.Message);

        private static void RaiseSafely(Action handlers, string what)
        {
            if (handlers == null)
                return;
            foreach (Action handler in handlers.GetInvocationList())
                PlayLog.Run(handler, what);
        }

        private static void RaiseSafely<T>(Action<T> handlers, T value, string what)
        {
            if (handlers == null)
                return;
            foreach (Action<T> handler in handlers.GetInvocationList())
                PlayLog.Run(() => handler(value), what);
        }
    }
}

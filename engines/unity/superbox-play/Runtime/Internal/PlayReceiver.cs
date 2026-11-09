using UnityEngine;
using UnityEngine.Scripting;

namespace Superbox.Play
{
    /// <summary>
    /// SuperboxPlay.jslib 의 SendMessage(답 · 게임존 이벤트)를 받고 프레임마다 속도 조절 · 제한 시간을 돌린다. WebGL 에서는 Update 가 돌고 Task.Delay 와 타이머는 돌지 않는다.
    /// </summary>
    [AddComponentMenu("")]
    internal sealed class PlayReceiver : MonoBehaviour
    {
        // jslib 이 이 이름으로 SendMessage 한다 — 이름으로 찾으므로 숨김 플래그를 두지 않는다
        internal const string ObjectName = "Superbox.Play.Receiver";

        private PlayJsChannel channel;

        internal static void Create(PlayJsChannel channel)
        {
            var go = new GameObject(ObjectName);
            DontDestroyOnLoad(go);
            go.AddComponent<PlayReceiver>().channel = channel;
        }

        [Preserve]
        public void OnPlayResponse(string json) => channel?.Deliver(json);

        [Preserve]
        public void OnPlayEvent(string json) => channel?.DeliverEvent(json);

        private void Update()
        {
            channel?.Pump();
            SuperboxPlay.Screen.PollScreenSize(Screen.width, Screen.height);
        }
    }
}

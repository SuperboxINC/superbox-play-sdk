using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Superbox.Play
{
    public static partial class SuperboxPlay
    {
        public static class Screen
        {
            private const float SafeAreaTimeoutSeconds = 10f;
            private const float OrientationTimeoutSeconds = 10f;

            private static PlayInsets insets = new PlayInsets();
            private static Vector2Int screenSize;

            /// <summary>마지막 안전 영역 — 게임 틀 기준 CSS 픽셀.</summary>
            public static PlayInsets SafeAreaCss => insets;

            /// <summary>
            /// 안전한 사각형 — <see cref="UnityEngine.Screen.safeArea"/> 와 같은 화면 픽셀 · 왼쪽 아래 원점. 노치, 배너, 오른쪽 위 메뉴 버튼이 가리는 자리를 뺐다.
            /// </summary>
            public static Rect SafeArea => PlayCanvas.SafeRect(insets, PlayCanvas.Current, UnityEngine.Screen.width, UnityEngine.Screen.height);

            /// <summary>안전 영역이나 화면 크기가 바뀌었다 — <see cref="SafeArea"/> 를 다시 읽는다.</summary>
            public static event Action SafeAreaChanged;

            /// <summary>게임존에 지금 값을 묻는다 — 돌려주는 값은 CSS 픽셀이다. 보통은 <see cref="SafeAreaChanged"/> 를 구독하고 <see cref="SafeArea"/> 를 읽으면 된다.</summary>
            public static async Task<PlayInsets> SafeAreaAsync()
            {
                var result = await Request<JObject>(PlayMethods.ScreenSafeArea, null, SafeAreaTimeoutSeconds);
                OnZoneInsets(result);
                return PlayJson.TryRead<PlayInsets>(result) ?? throw UnexpectedAnswer(PlayMethods.ScreenSafeArea);
            }

            /// <summary>
            /// 화면 방향을 요청한다. 고정하지 못하거나 실패하면 false 이고, 어느 쪽이든 게임은 창 크기에 맞춰 그린다. 게임이 끝나면 게임존이 되돌린다.
            /// </summary>
            public static async Task<bool> SetOrientationAsync(GameOrientation orientation)
            {
                var parameters = new JObject { ["orientation"] = PlayWire.Of(orientation) };
                var response = await Send(PlayMethods.ScreenSetOrientation, parameters, OrientationTimeoutSeconds);
                if (response.Ok)
                    return PlayJson.Flag(response.Result, "applied");
                PlayLog.Failure(PlayMethods.ScreenSetOrientation, response.Error);
                return false;
            }

            internal static void Adopt(PlayInsets value)
            {
                RememberScreenSize(UnityEngine.Screen.width, UnityEngine.Screen.height);
                if (value != null)
                    Apply(value);
            }

            /// <summary>기준 크기를 세션을 받을 때 잡는다 — 게임이 첫 프레임 전에 방향을 요청해도 회전을 놓치지 않게.</summary>
            internal static void RememberScreenSize(int width, int height)
            {
                if (screenSize == default && width > 0 && height > 0)
                    screenSize = new Vector2Int(width, height);
            }

            internal static void OnZoneInsets(JObject data)
            {
                // 일부만 온 값이 나머지 변을 0 으로 만들면 안 된다
                if (!PlayJson.HasNumbers(data, "top", "bottom", "left", "right"))
                    return;
                var value = PlayJson.TryRead<PlayInsets>(data);
                if (value != null)
                    Apply(value);
            }

            /// <summary>화면 크기 변화를 본다 — 안전 영역 알림과 회전의 순서는 정해져 있지 않아 크기가 바뀐 뒤에도 알린다.</summary>
            internal static void PollScreenSize(int width, int height)
            {
                // 캔버스가 잠깐 0 이 되는 순간은 무시한다
                if (width <= 0 || height <= 0)
                    return;
                var size = new Vector2Int(width, height);
                if (size == screenSize)
                    return;
                var isFirst = screenSize == default;
                screenSize = size;
                if (!isFirst)
                    RaiseSafely(SafeAreaChanged, PlayEvents.SafeAreaChange);
            }

            internal static void ResetState()
            {
                insets = new PlayInsets();
                screenSize = default;
                SafeAreaChanged = null;
            }

            private static void Apply(PlayInsets value)
            {
                var changed = !insets.SameAs(value);
                insets = value;
                if (changed)
                    RaiseSafely(SafeAreaChanged, PlayEvents.SafeAreaChange);
            }
        }
    }
}

using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace Superbox.Play
{
    /// <summary>게임 틀 안 캔버스 자리(CSS 픽셀) — 네 변은 캔버스와 틀 사이 간격이고, 캔버스가 틀 밖으로 나가면 음수다.</summary>
    internal readonly struct CanvasBox
    {
        public CanvasBox(float topGap, float bottomGap, float leftGap, float rightGap, float width, float height)
        {
            TopGap = topGap;
            BottomGap = bottomGap;
            LeftGap = leftGap;
            RightGap = rightGap;
            Width = width;
            Height = height;
        }

        public float TopGap { get; }
        public float BottomGap { get; }
        public float LeftGap { get; }
        public float RightGap { get; }
        public float Width { get; }
        public float Height { get; }
    }

    /// <summary>게임존이 준 안전 영역(게임 틀 기준 CSS 픽셀)을 Unity 화면 픽셀로 옮긴다.</summary>
    internal static class PlayCanvas
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern float SuperboxPlay_CanvasMetric(int index);

        public static CanvasBox Current => new CanvasBox(
            SuperboxPlay_CanvasMetric(0),
            SuperboxPlay_CanvasMetric(1),
            SuperboxPlay_CanvasMetric(2),
            SuperboxPlay_CanvasMetric(3),
            SuperboxPlay_CanvasMetric(4),
            SuperboxPlay_CanvasMetric(5));
#else
        public static CanvasBox Current => new CanvasBox(0f, 0f, 0f, 0f, Screen.width, Screen.height);
#endif

        /// <summary>
        /// 안전한 사각형 — 화면 픽셀 · 왼쪽 아래 원점(<see cref="Screen.safeArea"/> 와 같다). 캔버스가 틀 안쪽에 떠 있으면 그 여백만큼은 게임을 가리지 않는다.
        /// </summary>
        public static Rect SafeRect(PlayInsets insets, CanvasBox box, float screenWidth, float screenHeight)
        {
            var perCssX = PixelsPerCss(screenWidth, box.Width);
            var perCssY = PixelsPerCss(screenHeight, box.Height);
            var top = Covered(insets.Top, box.TopGap, perCssY);
            var bottom = Covered(insets.Bottom, box.BottomGap, perCssY);
            var left = Covered(insets.Left, box.LeftGap, perCssX);
            var right = Covered(insets.Right, box.RightGap, perCssX);
            return new Rect(left, bottom, Mathf.Max(0f, screenWidth - left - right), Mathf.Max(0f, screenHeight - top - bottom));
        }

        // 캔버스에 크기가 잡히기 전에는 1 로 본다
        private static float PixelsPerCss(float screenSize, float cssSize) => cssSize > 0f && screenSize > 0f ? screenSize / cssSize : 1f;

        private static float Covered(float inset, float gap, float pixelsPerCss) => Mathf.Max(0f, inset - gap) * pixelsPerCss;
    }
}

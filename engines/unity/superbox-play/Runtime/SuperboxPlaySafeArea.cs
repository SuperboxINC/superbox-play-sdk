using UnityEngine;

namespace Superbox.Play
{
    /// <summary>
    /// 화면 전체를 덮는 RectTransform 을 안전 영역에 맞춘다 — 노치, 배너, 오른쪽 위 메뉴 버튼을 피한다. 앵커만 옮기므로 위 · 아래 끝에 붙인 자식이 따라온다.
    /// </summary>
    [RequireComponent(typeof(RectTransform))]
    [DisallowMultipleComponent]
    [AddComponentMenu("Superbox Play/Safe Area")]
    public sealed class SuperboxPlaySafeArea : MonoBehaviour
    {
        public bool top = true;
        public bool bottom = true;
        public bool left = true;
        public bool right = true;

        private void OnEnable()
        {
            SuperboxPlay.Screen.SafeAreaChanged += Apply;
            Apply();
        }

        private void OnDisable()
        {
            SuperboxPlay.Screen.SafeAreaChanged -= Apply;
        }

        private void Apply()
        {
            var size = new Vector2(Screen.width, Screen.height);
            if (size.x <= 0f || size.y <= 0f)
                return;
            Anchors(SuperboxPlay.Screen.SafeArea, size, top, bottom, left, right, out var anchorMin, out var anchorMax);
            var rect = (RectTransform)transform;
            rect.anchorMin = anchorMin;
            rect.anchorMax = anchorMax;
        }

        internal static void Anchors(Rect safe, Vector2 screen, bool top, bool bottom, bool left, bool right, out Vector2 anchorMin, out Vector2 anchorMax)
        {
            anchorMin = new Vector2(left ? safe.xMin / screen.x : 0f, bottom ? safe.yMin / screen.y : 0f);
            anchorMax = new Vector2(right ? safe.xMax / screen.x : 1f, top ? safe.yMax / screen.y : 1f);
        }
    }
}

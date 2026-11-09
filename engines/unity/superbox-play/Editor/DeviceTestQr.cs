using UnityEngine;

namespace Superbox.Play.Editor
{
    /// <summary>Node 가 만든 QR 칸(왼쪽 위부터 줄 순서)을 창에 그릴 그림으로 — QR 은 둘레에 밝은 여백이 있어야 읽힌다.</summary>
    internal static class DeviceTestQr
    {
        internal const int QuietZoneModules = 4;
        private const char DarkModule = '1';
        private static readonly Color32 Dark = new Color32(0, 0, 0, 255);
        private static readonly Color32 Light = new Color32(255, 255, 255, 255);

        internal static Texture2D Render(int size, string modules, int pixelsPerModule)
        {
            var side = (size + QuietZoneModules * 2) * pixelsPerModule;
            var pixels = new Color32[side * side];
            for (var index = 0; index < pixels.Length; index++)
                pixels[index] = Light;
            for (var row = 0; row < size; row++)
            {
                for (var column = 0; column < size; column++)
                {
                    if (modules[row * size + column] == DarkModule)
                        PaintModule(pixels, side, column, row, pixelsPerModule);
                }
            }
            var texture = new Texture2D(side, side, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, hideFlags = HideFlags.HideAndDontSave };
            texture.SetPixels32(pixels);
            texture.Apply();
            return texture;
        }

        private static void PaintModule(Color32[] pixels, int side, int column, int row, int scale)
        {
            var left = (column + QuietZoneModules) * scale;
            // 텍스처는 맨 아래 줄부터 저장된다 — QR 의 윗줄을 그림의 위쪽에 둔다
            var bottom = side - (row + QuietZoneModules + 1) * scale;
            for (var y = bottom; y < bottom + scale; y++)
            {
                for (var x = left; x < left + scale; x++)
                    pixels[y * side + x] = Dark;
            }
        }
    }
}

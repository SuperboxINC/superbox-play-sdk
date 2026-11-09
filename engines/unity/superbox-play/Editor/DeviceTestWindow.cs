using System;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Superbox.Play.Editor
{
    /// <summary>휴대폰으로 찍을 QR 과 주소를 보여 주고 서버를 끈다.</summary>
    internal sealed class DeviceTestWindow : EditorWindow
    {
        private const string WindowTitle = "기기 테스트";
        private const int PixelsPerModule = 6;
        private const int MinimumWidth = 340;
        private const int MinimumHeight = 500;

        [NonSerialized] private Texture2D qrTexture;
        [NonSerialized] private string renderedUrl;
        private int selected;

        internal static void Open()
        {
            var window = GetWindow<DeviceTestWindow>(false, WindowTitle, true);
            window.minSize = new Vector2(MinimumWidth, MinimumHeight);
            window.Repaint();
        }

        private void OnDisable() => ReleaseTexture();

        private void OnGUI()
        {
            var answer = DeviceTestServer.Current;
            if (answer == null)
            {
                EditorGUILayout.HelpBox("기기 테스트 서버가 꺼져 있어요. 상단 메뉴 Superbox Play > Test on Device로 다시 켜 주세요.", MessageType.Info);
                return;
            }
            if (answer.addresses == null || answer.addresses.Length == 0)
                EditorGUILayout.HelpBox("휴대폰에서 열 주소를 찾지 못했어요. Wi-Fi 연결을 확인해 주세요.", MessageType.Warning);
            else
                DrawAddress(answer.addresses);
            EditorGUILayout.Space();
            DrawButtons(answer);
        }

        private void DrawAddress(DeviceTestAddress[] addresses)
        {
            EditorGUILayout.LabelField("휴대폰 카메라로 QR을 찍어 열어 주세요.", EditorStyles.boldLabel);
            selected = addresses.Length > 1 ? EditorGUILayout.Popup(Mathf.Clamp(selected, 0, addresses.Length - 1), addresses.Select(address => address.url).ToArray()) : 0;
            var address = addresses[Mathf.Clamp(selected, 0, addresses.Length - 1)];
            DrawQr(address);
            EditorGUILayout.SelectableLabel(address.url, GUILayout.Height(EditorGUIUtility.singleLineHeight));
            EditorGUILayout.HelpBox("휴대폰과 이 컴퓨터가 같은 Wi-Fi에 있어야 해요. 열리지 않으면 방화벽에서 Node 연결을 허용해 주세요. 광고와 결제는 시뮬레이션이에요.", MessageType.None);
            if (GUILayout.Button("주소 복사"))
                EditorGUIUtility.systemCopyBuffer = address.url;
        }

        private void DrawQr(DeviceTestAddress address)
        {
            if (qrTexture == null || renderedUrl != address.url)
            {
                ReleaseTexture();
                qrTexture = DeviceTestQr.Render(address.qrSize, address.qr, PixelsPerModule);
                renderedUrl = address.url;
            }
            var rect = GUILayoutUtility.GetRect(qrTexture.width, qrTexture.height, GUILayout.ExpandWidth(true));
            GUI.DrawTexture(rect, qrTexture, ScaleMode.ScaleToFit);
        }

        private void DrawButtons(DeviceTestAnswer answer)
        {
            if (GUILayout.Button("이 컴퓨터에서 열기"))
                Application.OpenURL(answer.localUrl);
            if (GUILayout.Button("서버 끄기"))
            {
                DeviceTestServer.Stop();
                ReleaseTexture();
            }
        }

        private void ReleaseTexture()
        {
            if (qrTexture != null)
                DestroyImmediate(qrTexture);
            qrTexture = null;
            renderedUrl = null;
        }
    }
}

using System.Diagnostics;
using System.IO;
using UnityEditor;

namespace Superbox.Play.Editor
{
    /// <summary>
    /// 상단 메뉴 하나로 WebGL 빌드 → 이 컴퓨터의 서버 → 휴대폰으로 찍을 QR 까지 — 같은 Wi-Fi 의 휴대폰에서 바로 열어 본다. 광고와 결제는 시뮬레이션이다.
    /// 서버는 CLI <c>dev --lan</c> 과 같고, Unity 가 끝나면 스스로 꺼진다.
    /// </summary>
    public static class DeviceTest
    {
        internal const string ServerScriptName = "device-test.mjs";
        private const string Menu = "Superbox Play/Test on Device";
        private const string DialogTitle = "Superbox Play";
        private const string RequestFile = "Temp/superbox-play-device-test.json";

        [MenuItem(Menu)]
        public static void Run()
        {
            // 빌드가 폴더를 비우는 동안 앞 서버가 옛 파일을 내주지 않게 먼저 끈다
            DeviceTestServer.Stop();
            BuildAndPackage.BuildThen(ServerScriptName, Serve);
        }

        [MenuItem(Menu, true)]
        private static bool CanRun() => BuildAndPackage.CanRun();

        private static void Serve(string node, string script, string projectDir, string playerFolder)
        {
            EditorUtility.DisplayProgressBar(DialogTitle, "기기 테스트 서버를 켜고 있어요", 1f);
            var request = new DeviceTestRequest
            {
                folder = playerFolder,
                projectDir = projectDir,
                version = PlayerSettings.bundleVersion,
                title = PlayerSettings.productName,
                parentPid = Process.GetCurrentProcess().Id,
            };
            DeviceTestServer.Start(node, script, request, Path.Combine(projectDir, RequestFile));
            DeviceTestWindow.Open();
        }
    }
}

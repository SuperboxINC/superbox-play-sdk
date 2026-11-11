using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Superbox.Play.Editor
{
    /// <summary>
    /// 상단 메뉴 하나로 WebGL 빌드부터 슈퍼박스 플레이 패키지(.sbp)까지 만든다. 결과는 프로젝트의 Build/SuperboxPlay 에 생긴다.
    /// CI 에서는 <c>-buildTarget WebGL -executeMethod Superbox.Play.Editor.BuildAndPackage.Run</c> — 실패하면 에디터가 0 이 아닌 코드로 끝난다.
    /// </summary>
    public static class BuildAndPackage
    {
        internal const string LogPrefix = "[Superbox Play]";
        private const string BuildMenu = "Superbox Play/Build & Package";
        private const string LocalZoneMenu = "Superbox Play/Build & Package (Local Game Zone)";
        private const string LocalZoneOrigin = "http://localhost:8200";
        private const string DialogTitle = "Superbox Play";
        private const string OutputFolder = "Build/SuperboxPlay";
        private const string PlayerFolderName = "WebGL";
        private const string RequestFile = "Temp/superbox-play-package.json";
        private const string PackagerScriptName = "package-build.mjs";

        /// <summary>
        /// 게임은 게임존 iframe 안에서 돈다 — 게임존이 광고 · 결제 창을 띄우는 동안 게임 창이 포커스를 잃고, Run In Background 를 끈 빌드는 그동안 게임 루프가
        /// 멈춘다(포커스로 일시정지 창을 띄우는 게임은 창이 남는다). 막지는 않고 경고만 — 멈춤은 SuperboxPlay.Paused · Resumed 로 처리하게 안내한다
        /// </summary>
        internal const string RunInBackgroundOffMessage =
            "Run In Background가 꺼져 있어요. 게임존이 광고나 결제 창을 띄우는 동안 게임이 멈출 수 있어요. Player Settings > Resolution and Presentation에서 Run In Background를 켜고, 멈춤은 SuperboxPlay.Paused와 Resumed로 처리해 주세요.";

        [MenuItem(BuildMenu)]
        public static void Run() => Perform(zoneOrigin: null);

        /// <summary>로컬 게임존에 붙여 보는 패키지 — 운영에는 올라가지 않는다.</summary>
        [MenuItem(LocalZoneMenu)]
        public static void RunForLocalZone() => Perform(LocalZoneOrigin);

        [MenuItem(BuildMenu, true)]
        [MenuItem(LocalZoneMenu, true)]
        internal static bool CanRun() => !EditorApplication.isPlayingOrWillChangePlaymode && !EditorApplication.isCompiling && !BuildPipeline.isBuildingPlayer;

        private static void Perform(string zoneOrigin) =>
            BuildThen(PackagerScriptName, (node, script, projectDir, playerFolder) => Report(Package(node, script, projectDir, playerFolder, zoneOrigin)));

        /// <summary>WebGL 빌드를 끝낸 뒤 <paramref name="next"/> 를 부른다(Node, 도구 스크립트, 프로젝트 폴더, 빌드 폴더) — 실패는 창으로 알리고, 배치 모드는 그대로 던진다.</summary>
        internal static void BuildThen(string scriptName, Action<string, string, string, string> next)
        {
            try
            {
                if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL))
                    throw new PackagingException("WebGL 빌드 모듈이 없어요. Unity Hub에서 WebGL Build Support를 설치해 주세요.");
                if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.WebGL)
                {
                    OfferWebGlSwitch();
                    return;
                }
                // 오래 걸리는 빌드 전에 패키징에 필요한 것부터 본다
                var node = NodeFinder.Find() ?? throw new PackagingException($"Node {NodeFinder.MinimumMajorVersion} 이상을 찾지 못했어요. Node를 설치한 뒤 다시 실행해 주세요.");
                var script = ToolScript(scriptName);
                var projectDir = Path.GetDirectoryName(Application.dataPath);
                StopIfVersionBlocked(node, projectDir);
                if (!PlayerSettings.runInBackground)
                    Debug.LogWarning($"{LogPrefix} {RunInBackgroundOffMessage}");
                var playerFolder = BuildPlayer(projectDir);
                next(node, script, projectDir, playerFolder);
            }
            // 배치 모드는 그대로 던진다 — 에디터가 오류를 찍고 0 이 아닌 코드로 끝난다
            catch (Exception error) when (!Application.isBatchMode)
            {
                Debug.LogError($"{LogPrefix} {(error is PackagingException ? error.Message : error.ToString())}");
                EditorUtility.DisplayDialog(DialogTitle, error.Message, "확인");
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
        }

        // 오래 걸리는 빌드 전에 묻는다 — 공개 저장소의 버전 정책에서 지원이 끝난 SDK 면 여기서 멈춘다
        private static void StopIfVersionBlocked(string node, string projectDir)
        {
            var policy = PackagerProcess.CheckPolicy(node, PackagerScript(), Path.Combine(projectDir, RequestFile));
            if (policy.blocked)
                throw new PackagingException(policy.message);
            if (!string.IsNullOrEmpty(policy.message))
                Debug.LogWarning($"{LogPrefix} {policy.message}");
        }

        // BuildPlayer 에 맡기면 플랫폼이 말없이 바뀌고, 전환의 도메인 리로드가 패키징을 끊을 수 있다 — 먼저 바꾸고 다시 누르게 한다
        private static void OfferWebGlSwitch()
        {
            if (Application.isBatchMode)
                throw new PackagingException("지금 플랫폼이 WebGL이 아니에요. -buildTarget WebGL을 붙여 실행해 주세요.");
            if (EditorUtility.DisplayDialog(DialogTitle, "지금 플랫폼이 WebGL이 아니에요. WebGL로 바꿀까요? 바뀐 뒤 메뉴를 다시 눌러 주세요.", "WebGL로 바꾸기", "취소"))
                EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
        }

        internal static string PackagerScript() => ToolScript(PackagerScriptName);

        internal static string ToolScript(string name)
        {
            var package = UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(BuildAndPackage).Assembly);
            var script = package == null ? null : Path.Combine(package.resolvedPath, "Editor", "Packager~", name);
            if (script == null || !File.Exists(script))
                throw new PackagingException("패키징 스크립트가 없어요. Package Manager에서 com.superbox.play를 다시 설치해 주세요.");
            return script;
        }

        private static string BuildPlayer(string projectDir)
        {
            var scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray();
            if (scenes.Length == 0)
                throw new PackagingException("빌드할 씬이 없어요. Build Settings의 Scene List에 씬을 추가해 주세요.");

            // 지난 결과를 비운다 — 빌드가 실패했을 때 지난 .sbp 가 새것처럼 남지 않고, 압축 설정이 바뀌어도 옛 파일이 패키지에 섞이지 않게
            var output = Path.Combine(projectDir, OutputFolder);
            FileUtil.DeleteFileOrDirectory(output);
            Directory.CreateDirectory(output);
            var playerFolder = Path.Combine(output, PlayerFolderName);
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes,
                target = BuildTarget.WebGL,
                locationPathName = playerFolder,
                options = BuildOptions.None,
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new PackagingException($"WebGL 빌드가 끝나지 않았어요({report.summary.result}). Console의 오류를 확인해 주세요.");
            return playerFolder;
        }

        private static PackagerResult Package(string node, string script, string projectDir, string playerFolder, string zoneOrigin)
        {
            EditorUtility.DisplayProgressBar(DialogTitle, "패키지를 만들고 있어요", 1f);
            var request = new PackagerRequest
            {
                folder = playerFolder,
                projectDir = projectDir,
                version = PlayerSettings.bundleVersion,
                title = PlayerSettings.productName,
                zoneOrigin = zoneOrigin ?? string.Empty,
            };
            var result = PackagerProcess.Run(node, script, request, Path.Combine(projectDir, RequestFile));
            if (!result.ok)
                throw new PackagingException($"패키지를 만들지 못했어요. {result.message}");
            return result;
        }

        private static void Report(PackagerResult result)
        {
            Debug.Log($"{LogPrefix} {result.outPath} ({result.files}개 파일, {result.bytes:N0}B)");
            foreach (var warning in result.warnings ?? new PackagerWarning[0])
                Debug.LogWarning($"{LogPrefix} {warning.code}: {warning.message}");
            if (!Application.isBatchMode)
                EditorUtility.RevealInFinder(result.outPath);
        }
    }
}

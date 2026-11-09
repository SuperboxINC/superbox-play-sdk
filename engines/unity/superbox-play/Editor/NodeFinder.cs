using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Superbox.Play.Editor
{
    /// <summary>패키징을 돌릴 Node 를 찾는다. Unity WebGL 모듈에 Node 가 들어 있어 보통은 따로 깔지 않아도 되고, 그것이 없거나 낡았으면(Unity 버전마다 다르다) 시스템 Node 를 쓴다.</summary>
    internal static class NodeFinder
    {
        internal const int MinimumMajorVersion = 14;
        private const int VersionCheckMilliseconds = 10000;

        // 에디터는 셸의 PATH 를 물려받지 못할 때가 있다 — macOS 의 흔한 자리를 같이 본다
        private static readonly string[] CommonFolders = { "/opt/homebrew/bin", "/usr/local/bin" };

        internal static string ExecutableName => Application.platform == RuntimePlatform.WindowsEditor ? "node.exe" : "node";

        /// <summary>쓸 수 있는 첫 Node 의 경로. 없으면 null.</summary>
        internal static string Find()
        {
            var webGlModule = BuildPipeline.GetPlaybackEngineDirectory(BuildTarget.WebGL, BuildOptions.None);
            return Candidates(webGlModule, Environment.GetEnvironmentVariable("PATH")).FirstOrDefault(IsUsable);
        }

        internal static IEnumerable<string> Candidates(string webGlModule, string pathVariable)
        {
            var bundled = string.IsNullOrEmpty(webGlModule) ? null : Path.Combine(webGlModule, "BuildTools", "Emscripten", "node");
            if (bundled != null && Directory.Exists(bundled))
            {
                foreach (var file in Directory.GetFiles(bundled, ExecutableName, SearchOption.AllDirectories))
                    yield return file;
            }
            foreach (var folder in (pathVariable ?? string.Empty).Split(Path.PathSeparator).Concat(CommonFolders))
            {
                if (string.IsNullOrWhiteSpace(folder))
                    continue;
                var candidate = Path.Combine(folder.Trim().Trim('"'), ExecutableName);
                if (File.Exists(candidate))
                    yield return candidate;
            }
        }

        /// <summary><c>node --version</c> 의 출력 → 주 버전. 읽지 못하면 0.</summary>
        internal static int MajorVersionOf(string versionOutput)
        {
            var text = (versionOutput ?? string.Empty).Trim().TrimStart('v');
            var dot = text.IndexOf('.');
            return dot > 0 && int.TryParse(text.Substring(0, dot), NumberStyles.None, CultureInfo.InvariantCulture, out var major) ? major : 0;
        }

        private static bool IsUsable(string node)
        {
            try
            {
                var version = PackagerProcess.Execute(node, "--version", VersionCheckMilliseconds);
                return version.ExitCode == 0 && MajorVersionOf(version.Output) >= MinimumMajorVersion;
            }
            catch (Exception error) when (error is Win32Exception || error is InvalidOperationException || error is PackagingException)
            {
                // 실행할 수 없는 파일 — 다음 후보를 본다
                return false;
            }
        }
    }
}

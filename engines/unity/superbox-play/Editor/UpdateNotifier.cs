using System;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEngine;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace Superbox.Play.Editor
{
    internal sealed class UpdatePrompt
    {
        public UpdatePrompt(string body, string confirm)
        {
            Body = body;
            Confirm = confirm;
        }

        public string Body { get; }
        public string Confirm { get; }
    }

    /// <summary>
    /// 에디터를 켤 때 새 SDK 버전을 알린다 — Cocos 확장 · Phaser 플러그인과 같은 정책 파일 · 같은 문구 · 프로젝트마다 하루 한 번이다.
    /// 확인은 백그라운드에서 해서 에디터를 붙잡지 않고, 확인하지 못하면 아무것도 띄우지 않는다.
    /// </summary>
    [InitializeOnLoad]
    internal static class UpdateNotifier
    {
        private const string DialogTitle = "Superbox Play SDK";
        private const string Update = "업데이트";
        private const string OpenGuide = "설치 안내 보기";
        private const string Later = "나중에";
        private const string GuideUrl = "https://developers.superboxgo.com/engines/unity";
        private const string CheckedThisSession = "Superbox.Play.UpdateNotice.Checked";
        private const string CheckedDatePrefix = "Superbox.Play.UpdateNotice.Date.";
        private const string RequestFile = "Temp/superbox-play-update-notice.json";

        static UpdateNotifier() => EditorApplication.delayCall += CheckOnceADay;

        private static void CheckOnceADay()
        {
            if (Application.isBatchMode || EditorApplication.isPlayingOrWillChangePlaymode || SessionState.GetBool(CheckedThisSession, false))
                return;
            SessionState.SetBool(CheckedThisSession, true);
            var dateKey = CheckedDatePrefix + Application.dataPath;
            var today = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            if (EditorPrefs.GetString(dateKey, string.Empty) == today)
                return;
            EditorPrefs.SetString(dateKey, today);
            StartCheck();
        }

        private static void StartCheck()
        {
            string script;
            try
            {
                script = BuildAndPackage.PackagerScript();
            }
            // 패키지가 깨졌으면 빌드 메뉴가 알린다 — 켤 때마다 알릴 일은 아니다
            catch (PackagingException)
            {
                return;
            }
            var node = NodeFinder.Find();
            if (node == null)
                return;
            var requestFile = Path.Combine(Path.GetDirectoryName(Application.dataPath), RequestFile);
            var check = Task.Run(() => PackagerProcess.CheckPolicy(node, script, requestFile));

            void ShowWhenDone()
            {
                if (!check.IsCompleted)
                    return;
                EditorApplication.update -= ShowWhenDone;
                Show(check.Result);
            }

            EditorApplication.update += ShowWhenDone;
        }

        private static void Show(PackagerResult result)
        {
            var package = PackageInfo.FindForAssembly(typeof(UpdateNotifier).Assembly);
            var fromGit = package != null && package.source == PackageSource.Git;
            var prompt = PromptFor(result, fromGit);
            if (prompt == null)
                return;
            // 게임을 돌리는 중에는 창으로 멈추지 않는다
            if (EditorApplication.isPlayingOrWillChangePlaymode)
            {
                Debug.LogWarning($"{BuildAndPackage.LogPrefix} {prompt.Body}");
                return;
            }
            if (!EditorUtility.DisplayDialog(DialogTitle, prompt.Body, prompt.Confirm, Later))
                return;
            if (fromGit)
                Client.Add(UpdateUrl(package.packageId, result.latestVersion));
            else
                Application.OpenURL(GuideUrl);
        }

        /// <summary>띄울 내용 — 알릴 것이 없으면 null. git 주소로 받은 패키지만 바로 바꿀 수 있고, 그 밖에는 설치 안내를 연다.</summary>
        internal static UpdatePrompt PromptFor(PackagerResult result, bool canInstall) =>
            string.IsNullOrEmpty(result.message) ? null : new UpdatePrompt(result.message, canInstall ? Update : OpenGuide);

        /// <summary>패키지를 받아 온 주소는 그대로 두고 태그만 새 버전으로 — <c>이름@주소#태그</c> 꼴이다.</summary>
        internal static string UpdateUrl(string packageId, string version)
        {
            var address = packageId.Substring(packageId.IndexOf('@') + 1);
            var tag = address.IndexOf('#');
            return $"{(tag < 0 ? address : address.Substring(0, tag))}#v{version}";
        }
    }
}

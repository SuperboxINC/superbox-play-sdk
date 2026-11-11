using System;
using System.Globalization;
using System.IO;
using System.Threading.Tasks;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;
using UnityEditorInternal;
using UnityEngine;
using PackageInfo = UnityEditor.PackageManager.PackageInfo;

namespace Superbox.Play.Editor
{
    /// <summary>
    /// 새 SDK 버전을 알리는 창 — 에디터를 켜면(도메인 로드 뒤 첫 유휴 프레임) 프로젝트마다 하루 한 번(이 컴퓨터의 날짜) 공개 저장소의 버전
    /// 정책을 보고, 더 높은 버전이 있으면 「업데이트 / 나중에」를 묻는다. 「업데이트」 = Package Manager 가 받아 온 git 주소의 태그만 새 버전으로
    /// 바꾼다. 「나중에」 = 내일 다시 묻는다. 메뉴 Superbox Play > Check for Updates 는 하루 제한 없이 바로 확인하고 결과를 창으로 알린다.
    ///
    /// <para>그날 확인은 결론이 났을 때만 남긴다(묻지 않을 결론 · 창을 띄움 · 세션에서 거듭 실패) — 리로드에 끊긴 확인 · 실패한 확인은 다음
    /// 로드에서 다시 본다. 창은 에디터가 앞에 있고 손이 빌 때만 띄운다 — 모달 창은 메인 스레드를 막아서 사람이 안 보는 사이 뜨면 에디터
    /// 자동화가 창이 닫힐 때까지 멈춘다. 배치 모드(CI)에서는 돌지 않는다.</para>
    /// </summary>
    [InitializeOnLoad]
    internal static class UpdateNotifier
    {
        private const string Menu = "Superbox Play/Check for Updates";

        // 다른 메뉴(기본 1000) 아래에 선을 두고 놓는다
        private const int MenuPriority = 1100;

        private const string GuideUrl = "https://developers.superboxgo.com/engines/unity";
        private const string RequestFile = "Temp/superbox-play-update-notice.json";

        /// <summary>SessionState — 띄울 창(<see cref="UpdatePromptInfo"/>). 에디터가 앞에 오고 손이 빌 때까지 리로드를 넘어 기다린다.</summary>
        private const string PendingKey = "Superbox.Play.UpdatePrompt.Pending";

        /// <summary>SessionState — 이 세션에서 실패한 확인 수(<see cref="UpdatePromptLogic.MaxFailuresPerSession"/> 까지 다시 해 본다).</summary>
        private const string FailuresKey = "Superbox.Play.UpdatePrompt.Failures";

        /// <summary>SessionState — 「업데이트」로 받는 중인 버전. 리로드가 먼저 오면 다음 로드가 다 됐는지 콘솔에 남긴다.</summary>
        private const string UpdatingKey = "Superbox.Play.UpdatePrompt.Updating";

        /// <summary>EditorPrefs — 마지막 확인일. EditorPrefs 는 머신 전역이라 프로젝트 경로를 붙인다(0.2.0 부터 같은 키).</summary>
        private const string DayKeyPrefix = "Superbox.Play.UpdateNotice.Date.";

        private static bool checking;
        private static bool waiting;
        private static AddRequest adding;
        private static UpdatePromptInfo addingInfo;

        private static string DayKey => DayKeyPrefix + Application.dataPath;

        // 이 컴퓨터의 날짜 — 0.2.1 까지는 UTC 라 한국 오전 9시에 날이 바뀌었다
        private static string Today => DateTime.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

        static UpdateNotifier()
        {
            if (Application.isBatchMode)
                return;
            // 로드 직후는 에셋 DB · 패키지 정보가 불안정하다 — 첫 유휴 프레임으로 미룬다
            EditorApplication.delayCall += OnEditorReady;
        }

        [MenuItem(Menu, false, MenuPriority)]
        private static void CheckNow() => StartCheck(manual: true);

        [MenuItem(Menu, true, MenuPriority)]
        private static bool CanCheckNow() =>
            !checking && adding == null && !EditorApplication.isPlayingOrWillChangePlaymode && !EditorApplication.isCompiling;

        /// <summary>도메인 로드마다 — 받던 업데이트를 맺고, 기다리는 창이 있으면 이어서 기다리고, 오늘 확인을 아직 안 끝냈으면 확인한다.</summary>
        private static void OnEditorReady()
        {
            ReportFinishedUpdate();
            if (SessionState.GetString(PendingKey, string.Empty).Length > 0)
            {
                WaitToAsk();
                return;
            }
            if (checking || EditorPrefs.GetString(DayKey, string.Empty) == Today)
                return;
            StartCheck(manual: false);
        }

        /// <summary>정책 확인은 백그라운드 Node 하나라 에디터를 붙잡지 않는다 — 끝나면 메인 스레드에서 이어 간다.</summary>
        private static void StartCheck(bool manual)
        {
            var problem = Prepare(out var sdk, out var node, out var script);
            if (problem != null)
            {
                CannotCheck(manual, problem);
                return;
            }
            checking = true;
            if (manual)
                Debug.Log($"{BuildAndPackage.LogPrefix} {UpdateMessages.Checking}");
            var requestFile = Path.Combine(Path.GetDirectoryName(Application.dataPath), RequestFile);
            var check = Task.Run(() => PackagerProcess.CheckPolicy(node, script, requestFile));

            void ContinueWhenDone()
            {
                if (!check.IsCompleted)
                    return;
                EditorApplication.update -= ContinueWhenDone;
                checking = false;
                var result = check.Status == TaskStatus.RanToCompletion ? check.Result : null;
                if (manual)
                    AnswerMenu(result, sdk);
                else
                    AfterStartupCheck(result, sdk);
            }

            EditorApplication.update += ContinueWhenDone;
        }

        /// <summary>확인할 준비 — 안 되면 그 까닭(빌드 메뉴와 같은 말).</summary>
        private static string Prepare(out InstalledSdk sdk, out string node, out string script)
        {
            sdk = CurrentSdk();
            node = null;
            script = null;
            try
            {
                script = BuildAndPackage.PackagerScript();
            }
            catch (PackagingException error)
            {
                return error.Message;
            }
            if (sdk == null)
                return "패키지 정보를 읽지 못했어요. Package Manager에서 com.superbox.play를 다시 설치해 주세요.";
            node = NodeFinder.Find();
            return node == null ? UpdateMessages.NodeMissing(NodeFinder.MinimumMajorVersion) : null;
        }

        /// <summary>확인을 시작할 수 없을 때 — 메뉴는 까닭을 창으로 알리고, 켤 때는 말없이 오늘 확인을 끝낸다(빌드 메뉴가 같은 까닭을 알린다).</summary>
        private static void CannotCheck(bool manual, string problem)
        {
            if (manual)
            {
                EditorUtility.DisplayDialog(UpdateMessages.Title, problem, UpdateMessages.Confirm);
                return;
            }
            MarkCheckedToday();
        }

        private static void AfterStartupCheck(PackagerResult result, InstalledSdk sdk)
        {
            var failuresBefore = SessionState.GetInt(FailuresKey, 0);
            switch (UpdatePromptLogic.AfterCheck(result, sdk, failuresBefore))
            {
                case UpdatePromptStep.Retry:
                    SessionState.SetInt(FailuresKey, failuresBefore + 1);
                    return;
                case UpdatePromptStep.GiveUp:
                    SessionState.SetInt(FailuresKey, failuresBefore + 1);
                    MarkCheckedToday();
                    Debug.Log($"{BuildAndPackage.LogPrefix} {UpdateMessages.StartupCheckFailed}");
                    return;
                case UpdatePromptStep.Done:
                    SessionState.EraseInt(FailuresKey);
                    MarkCheckedToday();
                    return;
                default:
                    SessionState.EraseInt(FailuresKey);
                    SessionState.SetString(PendingKey, UpdatePromptLogic.Serialize(UpdatePromptLogic.InfoOf(result, sdk)));
                    WaitToAsk();
                    return;
            }
        }

        private static void WaitToAsk()
        {
            if (waiting)
                return;
            waiting = true;
            EditorApplication.update += AskWhenReady;
        }

        /// <summary>창은 에디터가 앞에 있고 손이 빌 때 — 띄우는 순간 그날 확인을 남긴다(답이 무엇이든 오늘은 끝).</summary>
        private static void AskWhenReady()
        {
            if (!EditorIsFree())
                return;
            EditorApplication.update -= AskWhenReady;
            waiting = false;
            var pending = SessionState.GetString(PendingKey, string.Empty);
            SessionState.EraseString(PendingKey);
            MarkCheckedToday();
            var sdk = CurrentSdk();
            // 그새 바뀌었다(Package Manager 에서 직접 올렸다) — 물을 것이 없다
            if (!UpdatePromptLogic.TryParseInfo(pending, out var info) || sdk == null || sdk.Version != info.installed)
                return;
            Ask(info);
        }

        private static bool EditorIsFree() =>
            InternalEditorUtility.isApplicationActive
            && !EditorApplication.isPlayingOrWillChangePlaymode
            && !EditorApplication.isCompiling
            && !EditorApplication.isUpdating
            && !BuildPipeline.isBuildingPlayer
            && !checking
            && adding == null;

        private static void Ask(UpdatePromptInfo info)
        {
            if (EditorUtility.DisplayDialog(UpdateMessages.Title, UpdateMessages.PromptBody(info), UpdateMessages.Update, UpdateMessages.Later))
                StartUpdate(info);
            else
                Debug.Log($"{BuildAndPackage.LogPrefix} {UpdateMessages.Postponed(info)}");
        }

        /// <summary>메뉴로 확인한 결과 — 어떤 결론이든 창으로 알린다. 하루 제한은 보지 않고, 결론이 나면 오늘 확인으로 친다.</summary>
        private static void AnswerMenu(PackagerResult result, InstalledSdk sdk)
        {
            if (UpdatePromptLogic.CheckFailed(result))
            {
                EditorUtility.DisplayDialog(UpdateMessages.Title, UpdateMessages.CheckFailed, UpdateMessages.Confirm);
                return;
            }
            SessionState.EraseString(PendingKey);
            SessionState.EraseInt(FailuresKey);
            MarkCheckedToday();
            if (UpdatePromptLogic.CheckTurnedOff(result))
            {
                EditorUtility.DisplayDialog(UpdateMessages.Title, UpdateMessages.CheckTurnedOff, UpdateMessages.Confirm);
                return;
            }
            if (!UpdatePromptLogic.HasNewerVersion(result, sdk.Version))
            {
                EditorUtility.DisplayDialog(UpdateMessages.Title, UpdateMessages.UpToDate(sdk.Version), UpdateMessages.Confirm);
                return;
            }
            var info = UpdatePromptLogic.InfoOf(result, sdk);
            if (sdk.FromGit)
            {
                Ask(info);
                return;
            }
            if (EditorUtility.DisplayDialog(UpdateMessages.Title, UpdateMessages.NotFromGit(info), UpdateMessages.OpenGuide, UpdateMessages.Close))
                Application.OpenURL(GuideUrl);
        }

        /// <summary>받아 온 git 주소의 태그만 새 버전으로 — Package Manager 가 받고 다시 불러온다. 결과는 콘솔에 남긴다.</summary>
        private static void StartUpdate(UpdatePromptInfo info)
        {
            SessionState.SetString(UpdatingKey, UpdatePromptLogic.Serialize(info));
            Debug.Log($"{BuildAndPackage.LogPrefix} {UpdateMessages.Updating(info.latest)}");
            addingInfo = info;
            adding = Client.Add(UpdatePromptLogic.UpdateUrl(info.packageId, info.latest));
            EditorApplication.update += WatchUpdate;
        }

        private static void WatchUpdate()
        {
            if (adding == null || !adding.IsCompleted)
                return;
            EditorApplication.update -= WatchUpdate;
            var request = adding;
            var info = addingInfo;
            adding = null;
            addingInfo = null;
            SessionState.EraseString(UpdatingKey);
            if (request.Status == StatusCode.Success)
            {
                Debug.Log($"{BuildAndPackage.LogPrefix} {UpdateMessages.Updated(info.installed, request.Result?.version ?? info.latest)}");
                return;
            }
            var message = UpdateMessages.UpdateFailed(request.Error?.message);
            Debug.LogError($"{BuildAndPackage.LogPrefix} {message}");
            EditorUtility.DisplayDialog(UpdateMessages.Title, message, UpdateMessages.Confirm);
        }

        /// <summary>업데이트를 받는 동안 리로드가 먼저 왔을 때 — 새 버전으로 다시 불렸으면 다 됐다고 남긴다. 옛 버전 그대로면(리로드에 요청이
        /// 끊겼다) 말없이 지운다 — 다음 확인이 다시 묻는다.</summary>
        private static void ReportFinishedUpdate()
        {
            if (adding != null)
                return;
            var json = SessionState.GetString(UpdatingKey, string.Empty);
            if (json.Length == 0)
                return;
            SessionState.EraseString(UpdatingKey);
            var sdk = CurrentSdk();
            if (UpdatePromptLogic.TryParseInfo(json, out var info) && sdk != null && sdk.Version == info.latest)
                Debug.Log($"{BuildAndPackage.LogPrefix} {UpdateMessages.Updated(info.installed, info.latest)}");
        }

        private static void MarkCheckedToday() => EditorPrefs.SetString(DayKey, Today);

        private static InstalledSdk CurrentSdk()
        {
            var package = PackageInfo.FindForAssembly(typeof(UpdateNotifier).Assembly);
            return package == null ? null : new InstalledSdk(package.version, package.packageId, package.source == PackageSource.Git);
        }
    }
}

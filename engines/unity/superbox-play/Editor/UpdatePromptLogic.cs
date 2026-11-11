using System;
using System.Text.RegularExpressions;
using UnityEngine;

namespace Superbox.Play.Editor
{
    /// <summary>설치된 SDK — Package Manager 가 아는 버전 · 받아 온 주소 · git 으로 받았는지(그래야 Package Manager 가 바로 바꿀 수 있다).</summary>
    internal sealed class InstalledSdk
    {
        public InstalledSdk(string version, string packageId, bool fromGit)
        {
            Version = version ?? string.Empty;
            PackageId = packageId ?? string.Empty;
            FromGit = fromGit;
        }

        public string Version { get; }
        public string PackageId { get; }
        public bool FromGit { get; }
    }

    /// <summary>새 버전 창이 띄울 내용 — 확인 결과에서 뽑아 SessionState 에 JSON 으로 실어 둔다. 창은 에디터가 앞에 오고 손이 빌 때까지
    /// 기다리고, 그 사이 도메인 리로드가 와도 이 값으로 이어서 띄운다.</summary>
    [Serializable]
    internal sealed class UpdatePromptInfo
    {
        /// <summary>확인할 때 설치돼 있던 버전(<c>0.2.0</c>) — 띄우기 직전에 그새 바뀌었는지 가른다.</summary>
        public string installed;

        /// <summary>올라갈 버전 — 정책의 권장 버전(<c>0.2.1</c>).</summary>
        public string latest;

        /// <summary>지원이 끝난 버전인가 — 빌드 메뉴가 막는다.</summary>
        public bool blocked;

        /// <summary>정책이 준 말 — 막힌 버전이면 창의 첫 줄이다.</summary>
        public string message;

        /// <summary>패키지를 받아 온 주소(<c>com.superbox.play@https://…#v0.2.0</c>) — 업데이트 주소를 만든다.</summary>
        public string packageId;
    }

    /// <summary>에디터를 켤 때의 확인 한 번이 끝난 뒤 할 일.</summary>
    internal enum UpdatePromptStep
    {
        /// <summary>창을 띄운다 — 그날 확인은 창을 띄울 때 남긴다(띄우기 전에 에디터를 끄면 다시 켤 때 다시 묻는다).</summary>
        Ask,

        /// <summary>물을 것이 없다(최신 · 바꿀 수 없는 설치 · 확인을 끔) — 오늘 확인 끝.</summary>
        Done,

        /// <summary>확인 실패 — 오늘 확인으로 치지 않고 다음 로드(컴파일 · 재시작)에서 다시. 막 켠 에디터는 네트워크가 아직일 수 있다.</summary>
        Retry,

        /// <summary>이 세션에서 거듭 실패 — 콘솔에 한 줄 남기고 오늘은 그만.</summary>
        GiveUp,
    }

    /// <summary>
    /// 새 버전 창의 순수 판정 — EditMode 테스트 대상. 에디터를 켤 때 · 프로젝트마다 하루 한 번(이 컴퓨터의 날짜) 묻는다. 확인에 실패하면
    /// 그날로 치지 않고 다음 로드에서 다시 보고(세션마다 <see cref="MaxFailuresPerSession"/> 번까지), 창은 에디터가 앞에 있고 손이 빌 때만 띄운다.
    /// </summary>
    internal static class UpdatePromptLogic
    {
        /// <summary>한 에디터 세션에서 실패를 몇 번까지 다시 해 보나 — 한 번은 백그라운드 Node 하나라 막지는 않지만, 오프라인이면 컴파일마다 도는 셈이다.</summary>
        public const int MaxFailuresPerSession = 3;

        private const string PolicyRead = "read";
        private const string PolicyOff = "off";

        // 0.2.1 꼴만 — pre-release(0.3.0-beta)나 틀린 값으로는 묻지 않는다
        private static readonly Regex ReleaseVersion = new Regex(@"^\d+\.\d+\.\d+$");

        /// <summary>정책을 보지 못했나 — 끈 것(off)은 결론으로 친다. 비었으면 Node 가 답하지 못한 것이다.</summary>
        public static bool CheckFailed(PackagerResult result) =>
            result == null || (result.policy != PolicyRead && result.policy != PolicyOff);

        /// <summary>정책 확인을 꺼 둔 것인가(<c>SUPERBOX_PLAY_POLICY_URL=off</c>).</summary>
        public static bool CheckTurnedOff(PackagerResult result) => result != null && result.policy == PolicyOff;

        /// <summary>확인 결과 → 할 일. <paramref name="failuresBefore"/> = 이 세션에서 이번 전까지 실패한 수.</summary>
        public static UpdatePromptStep AfterCheck(PackagerResult result, InstalledSdk sdk, int failuresBefore)
        {
            if (CheckFailed(result))
                return failuresBefore + 1 >= MaxFailuresPerSession ? UpdatePromptStep.GiveUp : UpdatePromptStep.Retry;
            return ShouldAsk(result, sdk) ? UpdatePromptStep.Ask : UpdatePromptStep.Done;
        }

        /// <summary>창을 띄울 결론인가 — git 주소로 받은 패키지이고 정책이 더 높은 정식 버전을 말할 때만. file: · 임베드 · tgz 처럼
        /// Package Manager 가 바꿀 수 없는 설치는 켤 때 묻지 않는다(그런 것까지 물으면 매일 뜨는 창이 된다 — 메뉴 Check for Updates 는 알려 준다).</summary>
        public static bool ShouldAsk(PackagerResult result, InstalledSdk sdk) =>
            sdk != null && sdk.FromGit && HasNewerVersion(result, sdk.Version);

        /// <summary>정책이 지금보다 높은 버전을 말하나 — 할 말이 있고 두 버전을 읽을 수 있고 최신이 더 높을 때. 막힌 버전이어도
        /// 최신이 더 높지 않으면(정책을 잘못 올렸다) 올라갈 곳이 없어 묻지 않는다.</summary>
        public static bool HasNewerVersion(PackagerResult result, string installed) =>
            result != null && !string.IsNullOrEmpty(result.message) && IsNewer(result.latestVersion, installed);

        public static bool IsNewer(string latest, string installed) =>
            TryParseRelease(latest, out var newer) && TryParseRelease(installed, out var current) && newer.CompareTo(current) > 0;

        public static UpdatePromptInfo InfoOf(PackagerResult result, InstalledSdk sdk) => new UpdatePromptInfo
        {
            installed = sdk.Version,
            latest = result.latestVersion ?? string.Empty,
            blocked = result.blocked,
            message = result.message ?? string.Empty,
            packageId = sdk.PackageId,
        };

        public static string Serialize(UpdatePromptInfo info) => JsonUtility.ToJson(info);

        /// <summary>SessionState 의 한 칸 → 창 내용. 비었거나 깨졌거나 버전 · 주소가 빠졌으면 false.</summary>
        public static bool TryParseInfo(string json, out UpdatePromptInfo info)
        {
            info = null;
            if (string.IsNullOrEmpty(json))
                return false;
            try
            {
                info = JsonUtility.FromJson<UpdatePromptInfo>(json);
            }
            catch (ArgumentException)
            {
                return false;
            }
            return info != null && !string.IsNullOrEmpty(info.installed) && !string.IsNullOrEmpty(info.latest) && !string.IsNullOrEmpty(info.packageId);
        }

        /// <summary>패키지를 받아 온 주소는 그대로 두고 태그만 새 버전으로 — <c>이름@주소#태그</c> 꼴이다.</summary>
        public static string UpdateUrl(string packageId, string version)
        {
            var address = packageId.Substring(packageId.IndexOf('@') + 1);
            var tag = address.IndexOf('#');
            return $"{(tag < 0 ? address : address.Substring(0, tag))}#v{version}";
        }

        private static bool TryParseRelease(string text, out Version version)
        {
            version = null;
            return !string.IsNullOrEmpty(text) && ReleaseVersion.IsMatch(text) && Version.TryParse(text, out version);
        }
    }
}

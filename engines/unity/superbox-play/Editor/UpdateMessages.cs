namespace Superbox.Play.Editor
{
    /// <summary>
    /// 새 버전 창과 메뉴 Check for Updates 의 문구 — 순수 함수라 EditMode 테스트로 고정한다. 창은 제목 · 현재 · 최신 · 「지금 업데이트할까요?」 ·
    /// 업데이트 / 나중에 차례다. 버전 숫자 뒤에는 조사를 붙이지 않는다 — 끝 숫자마다 받침이 달라(0.2.0을 · 0.2.2를) 맞출 수 없다.
    /// </summary>
    internal static class UpdateMessages
    {
        public const string Title = "Superbox Play SDK 업데이트";
        public const string Update = "업데이트";
        public const string Later = "나중에";
        public const string OpenGuide = "설치 안내 보기";
        public const string Close = "닫기";
        public const string Confirm = "확인";
        public const string MenuPath = "Superbox Play > Check for Updates";

        private const string NewVersion = "새로운 SDK 버전이 있어요.";

        /// <summary>새 버전 창 본문 — 지금 · 최신 버전과 묻는 말, 그 아래 두 버튼이 하는 일. 지원이 끝난 버전이면 정책이 준 까닭이 첫 줄이다.</summary>
        public static string PromptBody(UpdatePromptInfo info)
        {
            var lead = info.blocked && !string.IsNullOrEmpty(info.message) ? info.message : NewVersion;
            var later = info.blocked
                ? "• 나중에: 업데이트하기 전에는 Build & Package를 쓸 수 없어요. 내일 다시 알려 드려요."
                : $"• 나중에: 내일 다시 알려 드려요. 그 전에 업데이트하려면 ‘{MenuPath}’를 눌러 주세요.";
            return $"{lead}\n\n{Versions(info)}\n\n지금 업데이트할까요?\n\n"
                + $"• 업데이트: Package Manager가 새 버전을 받아요. 되돌리려면 Packages/manifest.json에서 com.superbox.play 주소 끝의 태그를 이전 태그(#v{info.installed})로 바꿔 주세요.\n"
                + later;
        }

        public static string Postponed(UpdatePromptInfo info) =>
            $"SDK v{info.latest} 업데이트를 미뤘어요. 내일 다시 알려 드려요. 지금 업데이트하려면 ‘{MenuPath}’를 눌러 주세요.";

        /// <summary>에디터를 켤 때의 확인이 한 세션에서 거듭 실패했을 때 — 창은 띄우지 않고 콘솔에 이 한 줄만(그 전의 실패는 말없이 다시 한다).</summary>
        public const string StartupCheckFailed =
            "에디터를 켤 때 새 SDK 버전을 확인하지 못했어요. 오늘은 다시 확인하지 않아요. 직접 확인하려면 ‘" + MenuPath + "’를 눌러 주세요.";

        public const string Checking = "새 SDK 버전을 확인하고 있어요.";

        public const string CheckFailed = "새 SDK 버전을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.";

        public const string CheckTurnedOff = "새 버전 확인이 꺼져 있어요. 환경 변수 SUPERBOX_PLAY_POLICY_URL을 지우고 Unity를 다시 켜 주세요.";

        public static string UpToDate(string installed) => $"최신 버전을 쓰고 있어요.\n\n현재: v{installed}";

        /// <summary>새 버전은 있는데 Package Manager 가 바꿀 수 없는 설치(file: · 임베드 · tgz) — 메뉴로 확인했을 때만 띄운다.</summary>
        public static string NotFromGit(UpdatePromptInfo info) =>
            $"{NewVersion}\n\n{Versions(info)}\n\nGit 주소로 설치한 SDK만 여기서 업데이트할 수 있어요. 설치 안내에서 새 버전을 받아 주세요.";

        public static string NodeMissing(int minimumMajorVersion) =>
            $"Node {minimumMajorVersion} 이상을 찾지 못해서 새 버전을 확인할 수 없어요. Node를 설치한 뒤 다시 시도해 주세요.";

        public static string Updating(string latest) => $"SDK v{latest} 업데이트를 시작했어요. Package Manager가 받은 뒤 다시 불러와요.";

        public static string Updated(string from, string to) =>
            $"SDK를 v{to} 버전으로 업데이트했어요. (이전 v{from}) 바뀐 내용은 패키지의 CHANGELOG.md에서 확인해 주세요.";

        public static string UpdateFailed(string error) =>
            string.IsNullOrWhiteSpace(error)
                ? "SDK를 업데이트하지 못했어요. Package Manager에서 다시 시도해 주세요."
                : $"SDK를 업데이트하지 못했어요. Package Manager에서 다시 시도해 주세요.\n\n{error.Trim()}";

        private static string Versions(UpdatePromptInfo info) => $"현재: v{info.installed}\n최신: v{info.latest}";
    }
}

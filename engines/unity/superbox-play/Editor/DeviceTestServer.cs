using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Superbox.Play.Editor
{
    [Serializable]
    internal sealed class DeviceTestRequest
    {
        public string folder;
        public string projectDir;
        public string version;
        public string title;
        public int parentPid;
    }

    [Serializable]
    internal sealed class DeviceTestAddress
    {
        public string url;
        public int qrSize;
        public string qr;
    }

    [Serializable]
    internal sealed class DeviceTestAnswer
    {
        public bool ok;
        public int port;
        public string localUrl;
        public DeviceTestAddress[] addresses;
        public string code;
        public string message;
    }

    /// <summary>기기 테스트 서버를 켜고 끈다. 번호와 답은 SessionState 에 둔다 — 스크립트를 다시 컴파일해도 서버는 돌고 창도 그대로 이어진다.</summary>
    internal static class DeviceTestServer
    {
        private const int StartMilliseconds = 30000;
        internal const string PidKey = "Superbox.Play.DeviceTest.Pid";
        private const string AnswerKey = "Superbox.Play.DeviceTest.Answer";
        private const int NoProcess = 0;

        /// <summary>지금 켜져 있는 서버의 답 — 꺼져 있으면 null.</summary>
        internal static DeviceTestAnswer Current
        {
            get
            {
                var line = SessionState.GetString(AnswerKey, string.Empty);
                if (line.Length == 0)
                    return null;
                if (IsRunning(SessionState.GetInt(PidKey, NoProcess)))
                    return JsonUtility.FromJson<DeviceTestAnswer>(line);
                Stop();
                return null;
            }
        }

        internal static DeviceTestAnswer Start(string node, string script, DeviceTestRequest request, string requestFile)
        {
            Stop();
            Directory.CreateDirectory(Path.GetDirectoryName(requestFile));
            File.WriteAllText(requestFile, JsonUtility.ToJson(request), new UTF8Encoding(false));
            var info = new ProcessStartInfo(node, $"{PackagerProcess.Quote(script)} {PackagerProcess.Quote(requestFile)}")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                StandardOutputEncoding = Encoding.UTF8,
            };
            // Dispose 해도 서버는 돈다 — 여기서 놓는 것은 이 쪽의 손잡이뿐이다
            using (var process = Process.Start(info))
            {
                var firstLine = process.StandardOutput.ReadLineAsync();
                if (!firstLine.Wait(StartMilliseconds))
                {
                    process.Kill();
                    throw new PackagingException("기기 테스트 서버가 답하지 않아 멈췄어요.");
                }
                var answer = ParseAnswer(firstLine.Result);
                if (!answer.ok)
                    throw new PackagingException($"기기 테스트 서버를 켜지 못했어요. {answer.message}");
                SessionState.SetInt(PidKey, process.Id);
                SessionState.SetString(AnswerKey, firstLine.Result);
                return answer;
            }
        }

        internal static void Stop()
        {
            var pid = SessionState.GetInt(PidKey, NoProcess);
            SessionState.EraseInt(PidKey);
            SessionState.EraseString(AnswerKey);
            if (pid == NoProcess)
                return;
            try
            {
                using (var process = Process.GetProcessById(pid))
                    process.Kill();
            }
            // 이미 끝났거나 끝나는 중이다 — 둘 다 원하던 상태다
            catch (Exception error) when (IsProcessGone(error))
            {
            }
        }

        private static bool IsRunning(int pid)
        {
            try
            {
                using (var process = Process.GetProcessById(pid))
                    return !process.HasExited;
            }
            catch (Exception error) when (IsProcessGone(error))
            {
                return false;
            }
        }

        private static bool IsProcessGone(Exception error) => error is ArgumentException || error is InvalidOperationException || error is Win32Exception;

        internal static DeviceTestAnswer ParseAnswer(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
                throw new PackagingException("기기 테스트 서버가 답하지 않았어요.");
            try
            {
                return JsonUtility.FromJson<DeviceTestAnswer>(line);
            }
            catch (ArgumentException)
            {
                throw new PackagingException("기기 테스트 서버의 답을 읽지 못했어요.");
            }
        }
    }
}

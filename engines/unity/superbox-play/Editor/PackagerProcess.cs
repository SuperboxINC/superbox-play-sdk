using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace Superbox.Play.Editor
{
    /// <summary>메뉴가 멈춰야 할 때 — 메시지는 게임 개발자가 그대로 읽는다.</summary>
    internal sealed class PackagingException : Exception
    {
        public PackagingException(string message) : base(message)
        {
        }
    }

    [Serializable]
    internal sealed class PackagerRequest
    {
        public string folder;
        public string projectDir;
        public string version;
        public string title;
        public string zoneOrigin;
    }

    [Serializable]
    internal sealed class PackagerWarning
    {
        public string code;
        public string message;
    }

    [Serializable]
    internal sealed class PackagerResult
    {
        public bool ok;
        public string outPath;
        public int files;
        public long bytes;
        public PackagerWarning[] warnings;
        public string code;
        public string message;
    }

    /// <summary>패키지에 묶어 넣은 패키징 스크립트(CLI 와 같은 규칙)를 Node 로 실행한다. 요청은 파일로 넘긴다 — 명령줄은 한글 게임 이름을 깨뜨릴 수 있다.</summary>
    internal static class PackagerProcess
    {
        private const int PackagingMilliseconds = 300000;

        internal readonly struct ProcessOutput
        {
            public ProcessOutput(int exitCode, string output, string error)
            {
                ExitCode = exitCode;
                Output = output;
                Error = error;
            }

            public int ExitCode { get; }
            public string Output { get; }
            public string Error { get; }
        }

        internal static PackagerResult Run(string node, string script, PackagerRequest request, string requestFile)
        {
            File.WriteAllText(requestFile, JsonUtility.ToJson(request), new UTF8Encoding(false));
            var finished = Execute(node, $"{Quote(script)} {Quote(requestFile)}", PackagingMilliseconds);
            var answer = finished.Output.Split('\n').Select(line => line.Trim()).LastOrDefault(line => line.Length > 0);
            if (answer == null)
                throw new PackagingException($"패키징 스크립트가 답하지 않았어요. {finished.Error}".Trim());
            try
            {
                return JsonUtility.FromJson<PackagerResult>(answer);
            }
            catch (ArgumentException)
            {
                throw new PackagingException($"패키징 스크립트의 답을 읽지 못했어요. {finished.Error}".Trim());
            }
        }

        internal static ProcessOutput Execute(string file, string arguments, int timeoutMilliseconds)
        {
            var info = new ProcessStartInfo(file, arguments)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };
            using (var process = Process.Start(info))
            {
                var output = process.StandardOutput.ReadToEndAsync();
                var error = process.StandardError.ReadToEndAsync();
                if (!process.WaitForExit(timeoutMilliseconds))
                {
                    process.Kill();
                    throw new PackagingException($"{Path.GetFileName(file)} 실행이 끝나지 않아 멈췄어요.");
                }
                return new ProcessOutput(process.ExitCode, output.Result, error.Result);
            }
        }

        internal static string Quote(string argument) => $"\"{argument.Replace("\"", "\\\"")}\"";
    }
}

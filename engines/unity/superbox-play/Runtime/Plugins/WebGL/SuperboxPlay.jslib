mergeInto(LibraryManager.library, {
    // Play SDK(window.SBPlay)로 가는 길 — C#(PlayJsChannel)이 Start 를 한 번 부른 뒤 Listen · Init · Call 을 쓴다.
    // 페이지가 Play SDK(…/sdk/play/…)를 넣었으면 그것을 기다리고, 없으면 sdkUrl 의 <script> 를 한 번만 넣어 불러올 때까지 요청을 줄 세운다
    // (못 불러오면 NOT_CONNECTED — 다음 요청이 다시 불러 본다).
    // 답 {id, ok, result | error{code, message}} 과 게임존 이벤트 {event, data} 는 JSON 문자열로 SendMessage(target, method) 해 C# 로 넘긴다.
    SuperboxPlay_Start: function (sdkUrlPtr, targetPtr, responseMethodPtr, eventMethodPtr) {
        var play = window.__sbxPlayUnity || (window.__sbxPlayUnity = { queue: [], wanted: [], listened: {}, loading: false, started: false });
        play.sdkUrl = UTF8ToString(sdkUrlPtr);
        play.target = UTF8ToString(targetPtr);
        play.responseMethod = UTF8ToString(responseMethodPtr);
        play.eventMethod = UTF8ToString(eventMethodPtr);
        // 프로미스 · 게임존 이벤트 처리 중에 Unity 로 다시 들어가지 않도록 한 틱 미룬다.
        // Start 때마다 다시 묶는다 — 같은 페이지에서 Unity 를 다시 만들면(Quit 뒤 createUnityInstance) 새 인스턴스의 SendMessage 로 답한다
        play.send = function (method, json) {
            setTimeout(function () { SendMessage(play.target, method, json); }, 0);
        };
        if (play.started) return;
        play.started = true;

        // SDK 는 .code(프로토콜 오류 코드) · .message 를 가진 Error 로 거절한다 — 코드가 없는 오류는 INTERNAL
        play.errorOf = function (error) {
            if (error && typeof error === 'object' && typeof error.code === 'string' && error.code) {
                return { code: error.code, message: String(error.message || '') };
            }
            return { code: 'INTERNAL', message: String((error && error.message) || error || 'unknown error') };
        };

        play.reply = function (id, ok, value) {
            var message = ok
                ? { id: id, ok: true, result: (value && typeof value === 'object') ? value : {} }
                : { id: id, ok: false, error: play.errorOf(value) };
            var json;
            try {
                json = JSON.stringify(message);
            } catch (error) {
                json = JSON.stringify({ id: id, ok: false, error: { code: 'INTERNAL', message: '답을 JSON 으로 만들지 못했어요: ' + error } });
            }
            play.send(play.responseMethod, json);
        };

        play.emit = function (name, data) {
            var json;
            try {
                json = JSON.stringify({ event: name, data: (data && typeof data === 'object') ? data : {} });
            } catch (error) {
                return;
            }
            play.send(play.eventMethod, json);
        };

        play.sdk = function () {
            var sdk = window.SBPlay;
            return sdk && typeof sdk.call === 'function' && typeof sdk.init === 'function' ? sdk : null;
        };

        play.listenOne = function (sdk, name) {
            if (play.listened[name] || typeof sdk.on !== 'function') return;
            play.listened[name] = true;
            sdk.on(name, function (data) {
                play.emit(name, data);
            });
        };

        play.withSdk = function (run) {
            var sdk = play.sdk();
            // 불러오는 중이면 SDK 가 먼저 생겼어도 줄을 따른다 — 앞서 줄 선 init 보다 먼저 나가지 않게
            if (sdk && !play.loading) {
                run(sdk, '');
                return;
            }
            play.queue.push(run);
            play.load();
        };

        play.settle = function (id, start) {
            var pending;
            try {
                pending = start();
            } catch (error) {
                play.reply(id, false, error);
                return;
            }
            Promise.resolve(pending).then(
                function (result) { play.reply(id, true, result); },
                function (error) { play.reply(id, false, error); });
        };

        // 페이지가 넣은 Play SDK 태그 — sdkUrl 과 같은 주소가 먼저, 아니면 주소가 달라도 …/sdk/play/… 경로(로컬 게임존 등).
        // 두 벌을 불러오면 게임존 연결(hello)이 둘이 되고 먼저 실행된 쪽 출처로 붙는다. 못 불러온 태그는 건너뛴다
        play.pageScript = function (absolute) {
            var scripts = document.getElementsByTagName('script');
            var other = null;
            for (var i = 0; i < scripts.length; i++) {
                var tag = scripts[i];
                if (!tag.src || tag.__sbxPlayFailed) continue;
                if (tag.src === absolute) return tag;
                if (!other && play.isPlaySdk(tag.src)) other = tag;
            }
            return other;
        };

        play.isPlaySdk = function (src) {
            var path = String(src);
            try { path = new URL(src, document.baseURI).pathname; } catch (error) {}
            return path.indexOf('/sdk/play/') >= 0;
        };

        play.load = function () {
            if (play.loading) return;
            play.loading = true;
            var absolute = play.sdkUrl;
            try { absolute = new URL(play.sdkUrl, document.baseURI).href; } catch (error) {}
            var script = play.pageScript(absolute);
            var injected = !script;
            if (injected) {
                script = document.createElement('script');
                script.src = play.sdkUrl;
                script.async = true;
                (document.head || document.documentElement).appendChild(script);
            }
            var source = script.src || play.sdkUrl;
            var waited = 0;
            var timer = null;
            function onError() { finish('Play SDK를 불러오지 못했어요: ' + source); }
            function finish(problem) {
                if (!play.loading) return;
                play.loading = false;
                if (timer !== null) clearInterval(timer);
                script.removeEventListener('error', onError);
                var sdk = play.sdk();
                // 못 불러온 태그 — 넣은 것은 걷어 내 다음 요청이 새로 불러 보고, 페이지 태그는 두되 다음에는 건너뛰고 sdkUrl 을 넣는다
                if (!sdk) {
                    if (injected) {
                        if (script.parentNode) script.parentNode.removeChild(script);
                    } else {
                        script.__sbxPlayFailed = true;
                    }
                }
                if (sdk) {
                    for (var w = 0; w < play.wanted.length; w++) play.listenOne(sdk, play.wanted[w]);
                }
                var queued = play.queue;
                play.queue = [];
                for (var q = 0; q < queued.length; q++) {
                    try {
                        queued[q](sdk, sdk ? '' : problem);
                    } catch (error) {
                        // 다음 요청은 계속 처리한다 — 답은 각 요청이 스스로 보낸다
                    }
                }
            }
            script.addEventListener('error', onError);
            // onload 만 믿지 않는다 — 페이지가 넣은 <script> 는 이미 끝났을 수 있어 SBPlay 가 생겼는지 짧게 살핀다
            timer = setInterval(function () {
                waited += 50;
                if (play.sdk()) finish('');
                else if (waited >= 15000) finish('Play SDK를 15초 안에 불러오지 못했어요: ' + source);
            }, 50);
        };
    },

    // 게임존 이벤트 하나를 C# 로 넘긴다 — SDK 가 아직 없으면 불러온 뒤 구독한다
    SuperboxPlay_Listen: function (eventPtr) {
        var play = window.__sbxPlayUnity;
        if (!play || !play.started) return;
        var name = UTF8ToString(eventPtr);
        if (play.wanted.indexOf(name) < 0) play.wanted.push(name);
        var sdk = play.sdk();
        if (sdk) play.listenOne(sdk, name);
    },

    // SBPlay.init() — 게임존에 연결하고 세션을 받는다(3초 안에 연결이 없으면 SDK 가 standalone 으로 답한다)
    SuperboxPlay_Init: function (idPtr) {
        var play = window.__sbxPlayUnity;
        if (!play || !play.started) return;
        var id = UTF8ToString(idPtr);
        play.withSdk(function (sdk, problem) {
            if (!sdk) {
                play.reply(id, false, { code: 'NOT_CONNECTED', message: problem });
                return;
            }
            play.settle(id, function () { return sdk.init(); });
        });
    },

    // SBPlay.call(method, params) — 게임 채널 요청 하나. 답은 정확히 한 번 OnPlayResponse 로 간다
    SuperboxPlay_Call: function (idPtr, methodPtr, paramsPtr) {
        var play = window.__sbxPlayUnity;
        if (!play || !play.started) return;
        var id = UTF8ToString(idPtr);
        var method = UTF8ToString(methodPtr);
        var params;
        try {
            params = JSON.parse(UTF8ToString(paramsPtr) || '{}');
        } catch (error) {
            play.reply(id, false, { code: 'INVALID_PARAMS', message: 'params 가 JSON 이 아니에요' });
            return;
        }
        play.withSdk(function (sdk, problem) {
            if (!sdk) {
                play.reply(id, false, { code: 'NOT_CONNECTED', message: problem });
                return;
            }
            play.settle(id, function () { return sdk.call(method, params); });
        });
    },

    // 게임 틀 안 캔버스 자리(CSS 픽셀) — 0 위 · 1 아래 · 2 왼쪽 · 3 오른쪽 간격, 4 너비, 5 높이
    SuperboxPlay_CanvasMetric: function (index) {
        var canvas = Module['canvas'] || document.querySelector('canvas');
        if (!canvas) return 0;
        var box = canvas.getBoundingClientRect();
        switch (index) {
            case 0: return box.top;
            case 1: return window.innerHeight - box.bottom;
            case 2: return box.left;
            case 3: return window.innerWidth - box.right;
            case 4: return box.width;
            default: return box.height;
        }
    }
});

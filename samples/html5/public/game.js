/**
 * 엔진 없는 게임의 기준 예시 — 자원을 직접 받으며 `SBPlayLoading.progress()` 로 알리고 준비되면 `complete()` 를 부른다.
 * 아무것도 안 불러도 window.load 뒤 로딩 화면은 저절로 닫힌다. 직접 부르려면 시작할 때 autoComplete 를 끈다.
 */
(function () {
  var TILE_COUNT = 32;
  var GEMS = { gem_300: 300 };
  var state = { gems: 0, rewards: 0, missions: 0, paused: false, resumed: 0 };
  window.sampleState = state;

  var loading = window.SBPlayLoading;
  if (loading) loading.autoComplete = false;

  function $(id) { return document.getElementById(id); }
  function log(text) {
    var item = document.createElement('li');
    item.textContent = text;
    $('log').prepend(item);
  }
  function fail(error) { log('실패: ' + (error && error.code ? error.code + ' ' : '') + (error && error.message ? error.message : error)); }
  function render() {
    $('gems').textContent = String(state.gems);
    $('rewards').textContent = String(state.rewards);
    $('missions').textContent = String(state.missions);
  }

  function loadTiles() {
    var done = 0;
    var tiles = $('tiles');
    var jobs = [];
    for (var i = 0; i < TILE_COUNT; i += 1) {
      jobs.push(new Promise(function (resolve, reject) {
        var image = new Image();
        image.alt = '';
        image.onload = function () {
          done += 1;
          if (loading) loading.progress(done / TILE_COUNT);
          resolve(image);
        };
        image.onerror = function () { reject(new Error('자원을 불러오지 못했어요: ' + image.src)); };
        image.src = 'assets/tile-' + String(i).padStart(2, '0') + '.png';
      }));
    }
    return Promise.all(jobs).then(function (images) {
      images.slice(0, 8).forEach(function (image) { tiles.appendChild(image); });
    });
  }

  // 결제 완료(paid) → 지급 → completeOrder. 앱이 그 사이 죽으면 다음 실행 때 pendingOrders 로 다시 받는다
  function grant(order) {
    state.gems += GEMS[order.productKey] || 0;
    render();
    return SBPlay.store.completeOrder(order.orderId).then(function () { log('지급 완료 ' + order.productKey); });
  }

  function bind() {
    $('rewarded').onclick = function () {
      SBPlay.ads.showRewarded('continue').then(function (result) {
        if (result.rewarded) state.rewards += 1;
        log('보상형 광고 ' + JSON.stringify(result));
        render();
      }).catch(fail);
    };
    $('interstitial').onclick = function () {
      SBPlay.ads.showInterstitial('stage_end').then(function (result) { log('전면 광고 ' + JSON.stringify(result)); }).catch(fail);
    };
    $('buy').onclick = function () {
      SBPlay.store.purchase('gem_300').then(function (order) {
        log('결제 ' + order.status + (order.simulated ? ' (모의)' : ''));
        return order.status === 'paid' ? grant(order) : null;
      }).catch(fail);
    };
    $('mission').onclick = function () {
      SBPlay.missions.track('stage_clear', 1).then(function (result) {
        if (result.accepted) state.missions += 1;
        log('미션 ' + JSON.stringify(result));
        render();
      }).catch(fail);
    };
    SBPlay.on('app.pause', function (data) { state.paused = true; log('일시정지 — ' + (data.reason || 'background')); });
    SBPlay.on('app.resume', function () { state.paused = false; state.resumed += 1; log('다시 시작'); });
  }

  bind();
  SBPlay.init().then(function (session) {
    $('status').textContent = '환경: ' + session.environment + ' · 플레이어: ' + (session.player.displayName || session.player.key);
    return SBPlay.store.pendingOrders();
  }).then(function (result) {
    return Promise.all(result.orders.filter(function (order) { return order.status === 'paid'; }).map(grant));
  }).catch(fail);

  loadTiles().then(function () {
    if (loading) loading.complete();
  }).catch(function (error) {
    if (loading) loading.error(error);
    else fail(error);
  });
})();

using System;
using System.Threading.Tasks;
using Superbox.Play;
using UnityEngine;

/// <summary>
/// 빈 GameObject 에 붙이면 돌아가는 예제 — 초기화, 지난 주문 지급, 보상형 광고, 결제, 미션.
/// 에디터에서는 광고와 결제가 시뮬레이션되고, 미션은 게임존이 필요해 UNSUPPORTED 로 끝난다.
/// </summary>
public sealed class QuickStart : MonoBehaviour
{
    private const string ProductKey = "gem_300";
    private const int GemsPerProduct = 300;
    private const string GrantedPrefix = "quickstart_granted_";

    private string status = "게임존과 연결하는 중…";
    private int gems;
    private int rewards;
    private bool isBusy;

    private async void Start()
    {
        var session = await SuperboxPlay.InitAsync();
        status = $"환경: {session.Environment}";
        if (session.Features.Purchases)
            await Run(GrantPendingOrders);
    }

    private void OnGUI()
    {
        GUILayout.Label(status);
        GUILayout.Label($"젬 {gems} · 광고 보상 {rewards}");
        if (GUILayout.Button("보상형 광고"))
            _ = Run(ShowRewarded);
        if (GUILayout.Button("젬 300 구매"))
            _ = Run(Purchase);
        if (GUILayout.Button("한 판 끝(미션)"))
            _ = Run(FinishStage);
    }

    private async Task ShowRewarded()
    {
        var result = await SuperboxPlay.Ads.ShowRewardedAsync("continue");
        if (result.Rewarded)
            rewards++;
    }

    // 결제가 끝나면(paid) grant 로 지급하고, true 를 돌려주면 SDK 가 지급 확인까지 부른다
    private Task Purchase() => SuperboxPlay.Store.PurchaseAsync(ProductKey, order => Grant(order.OrderId));

    private Task FinishStage() => SuperboxPlay.Missions.TrackAsync("stage_clear", 1);

    // 지난 실행에서 지급하지 못한 주문
    private async Task GrantPendingOrders()
    {
        foreach (var order in await SuperboxPlay.Store.PendingOrdersAsync())
        {
            if (order.Status == PurchaseStatus.Paid && Grant(order.OrderId))
                await SuperboxPlay.Store.CompleteOrderAsync(order.OrderId);
        }
    }

    // 지급은 orderId 기준으로 한 번만 — 지급한 뒤 지급 확인이 실패하면 같은 주문이 다음 실행에 다시 온다
    private bool Grant(string orderId)
    {
        var key = GrantedPrefix + orderId;
        if (PlayerPrefs.GetInt(key, 0) == 0)
        {
            gems += GemsPerProduct;
            PlayerPrefs.SetInt(key, 1);
            PlayerPrefs.Save();
        }
        return true;
    }

    private async Task Run(Func<Task> action)
    {
        // 결제창이 떠 있는 동안 또 누르면 주문이 두 개 생긴다
        if (isBusy)
            return;
        isBusy = true;
        try
        {
            await action();
        }
        catch (SuperboxPlayException error)
        {
            status = $"실패 {error.Code}: {error.Message}";
        }
        finally
        {
            isBusy = false;
        }
    }
}

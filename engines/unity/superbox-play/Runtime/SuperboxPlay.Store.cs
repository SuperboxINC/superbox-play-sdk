using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Superbox.Play
{
    public static partial class SuperboxPlay
    {
        /// <summary>인앱 결제 — 지급은 orderId 기준으로 한 번만 한다.</summary>
        public static class Store
        {
            private const float QueryTimeoutSeconds = 20f;

            public static Task<IReadOnlyList<PlayProduct>> ProductsAsync() => RequestList<PlayProduct>(PlayMethods.StoreProducts, "products", QueryTimeoutSeconds);

            /// <summary>결제창을 연다. 사용자가 오래 머물 수 있어 제한 시간이 없다. paid 면 지급한 뒤 <see cref="CompleteOrderAsync"/> 를 부른다.</summary>
            public static Task<PurchaseResult> PurchaseAsync(string productKey) =>
                Request<PurchaseResult>(PlayMethods.StorePurchase, new JObject { ["productKey"] = productKey ?? string.Empty });

            /// <summary>결제 → 지급 → 지급 확인을 한 번에. <paramref name="grant"/> 가 true 를 돌려주면 지급 확인까지 부른다.</summary>
            public static Task<GrantedPurchaseResult> PurchaseAsync(string productKey, Func<PurchaseResult, bool> grant)
            {
                if (grant == null)
                    throw new ArgumentNullException(nameof(grant));
                return PurchaseAsync(productKey, order => Task.FromResult(grant(order)));
            }

            /// <summary>
            /// 결제 → 지급 → 지급 확인을 한 번에. <paramref name="grant"/> 가 false 를 돌려주거나 던지면 Completed 가 false 이고,
            /// 그 주문은 다음 실행 때 <see cref="PendingOrdersAsync"/> 로 다시 온다.
            /// </summary>
            public static async Task<GrantedPurchaseResult> PurchaseAsync(string productKey, Func<PurchaseResult, Task<bool>> grant)
            {
                if (grant == null)
                    throw new ArgumentNullException(nameof(grant));
                var order = await PurchaseAsync(productKey);
                if (order.Status != PurchaseStatus.Paid)
                    return new GrantedPurchaseResult(order, false);
                try
                {
                    if (!await grant(order))
                        return new GrantedPurchaseResult(order, false);
                    return new GrantedPurchaseResult(order, await CompleteOrderAsync(order.OrderId));
                }
                catch (Exception error)
                {
                    Debug.LogException(error);
                    return new GrantedPurchaseResult(order, false);
                }
            }

            /// <summary>결제가 끝났지만 지급 확인을 받지 못한 주문.</summary>
            public static Task<IReadOnlyList<PendingOrder>> PendingOrdersAsync() => RequestList<PendingOrder>(PlayMethods.StorePendingOrders, "orders", QueryTimeoutSeconds);

            public static Task<bool> CompleteOrderAsync(string orderId) =>
                RequestFlag(PlayMethods.StoreCompleteOrder, new JObject { ["orderId"] = orderId ?? string.Empty }, "completed", QueryTimeoutSeconds);

            /// <summary>이 플레이어의 구독 — 이용권은 <see cref="PlaySubscription.Accessible"/> 만 보고 연다.</summary>
            public static Task<IReadOnlyList<PlaySubscription>> SubscriptionsAsync() =>
                RequestList<PlaySubscription>(PlayMethods.StoreSubscriptions, "subscriptions", QueryTimeoutSeconds);
        }
    }
}

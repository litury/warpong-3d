// js/yandex_sdk.js — thin JS glue between Yandex Games SDK and Rust/WASM

window.__ysdk = null;
window.__ysdk_inbox = [];
window.__ysdk_ready = false;

function _push(msg) {
    window.__ysdk_inbox.push(JSON.stringify(msg));
}

// --- Init ---

window.ysdk_init = function() {
    if (typeof YaGames === "undefined") {
        _push({ type: "init_err", msg: "YaGames not found" });
        return;
    }
    YaGames.init().then(function(ysdk) {
        window.__ysdk = ysdk;
        window.__ysdk_ready = true;
        if (ysdk.features && ysdk.features.LoadingAPI) {
            ysdk.features.LoadingAPI.ready();
        }
        _push({ type: "init_ok" });
    }).catch(function(err) {
        _push({ type: "init_err", msg: String(err) });
    });
};

window.ysdk_drain_inbox = function() {
    var msgs = window.__ysdk_inbox;
    window.__ysdk_inbox = [];
    return msgs;
};

window.ysdk_is_ready = function() {
    return window.__ysdk_ready;
};

// --- Ads ---

window.ysdk_show_fullscreen_adv = function() {
    if (!window.__ysdk) { _push({ type: "adv_err", msg: "SDK not ready" }); return; }
    window.__ysdk.adv.showFullscreenAdv({
        callbacks: {
            onClose: function(wasShown) {
                _push({ type: "adv_close", wasShown: wasShown });
            },
            onError: function(err) {
                _push({ type: "adv_err", msg: String(err) });
            }
        }
    });
};

window.ysdk_show_rewarded_video = function() {
    if (!window.__ysdk) { _push({ type: "rewarded_err", msg: "SDK not ready" }); return; }
    window.__ysdk.adv.showRewardedVideo({
        callbacks: {
            onOpen: function() { _push({ type: "rewarded_open" }); },
            onRewarded: function() { _push({ type: "rewarded_granted" }); },
            onClose: function() { _push({ type: "rewarded_close" }); },
            onError: function(err) { _push({ type: "rewarded_err", msg: String(err) }); }
        }
    });
};

// --- Leaderboard ---

window.ysdk_set_score = function(leaderboardName, score) {
    if (!window.__ysdk) { _push({ type: "lb_err", msg: "SDK not ready" }); return; }
    window.__ysdk.getLeaderboards().then(function(lb) {
        return lb.setLeaderboardScore(leaderboardName, score);
    }).then(function() {
        _push({ type: "lb_score_ok" });
    }).catch(function(err) {
        _push({ type: "lb_err", msg: String(err) });
    });
};

window.ysdk_get_leaderboard = function(leaderboardName, quantityTop) {
    if (!window.__ysdk) { _push({ type: "lb_err", msg: "SDK not ready" }); return; }
    window.__ysdk.getLeaderboards().then(function(lb) {
        return lb.getLeaderboardEntries(leaderboardName, { quantityTop: quantityTop });
    }).then(function(result) {
        var entries = result.entries.map(function(e) {
            return { rank: e.rank, score: e.score, name: e.player.publicName || "Anonymous" };
        });
        _push({ type: "lb_entries", entries: entries });
    }).catch(function(err) {
        _push({ type: "lb_err", msg: String(err) });
    });
};

// --- Payments (IAP) ---

window.ysdk_purchase = function(productId) {
    if (!window.__ysdk) { _push({ type: "purchase_err", msg: "SDK not ready" }); return; }
    window.__ysdk.getPayments({ signed: true }).then(function(payments) {
        return payments.purchase({ id: productId });
    }).then(function(purchase) {
        _push({ type: "purchase_ok", productId: productId, token: purchase.purchaseToken || "" });
    }).catch(function(err) {
        _push({ type: "purchase_err", msg: String(err) });
    });
};

window.ysdk_consume_purchase = function(token) {
    if (!window.__ysdk) { return; }
    window.__ysdk.getPayments({ signed: true }).then(function(payments) {
        return payments.consumePurchase(token);
    }).catch(function(err) {
        console.warn("[ysdk] consume error:", err);
    });
};

// --- Cloud Save ---

window.ysdk_save_data = function(jsonStr) {
    if (!window.__ysdk) { _push({ type: "save_err", msg: "SDK not ready" }); return; }
    var data = JSON.parse(jsonStr);
    window.__ysdk.getPlayer({ scopes: false }).then(function(player) {
        return player.setData(data, true);
    }).then(function() {
        _push({ type: "save_ok" });
    }).catch(function(err) {
        _push({ type: "save_err", msg: String(err) });
    });
};

window.ysdk_load_data = function() {
    if (!window.__ysdk) { _push({ type: "load_err", msg: "SDK not ready" }); return; }
    window.__ysdk.getPlayer({ scopes: false }).then(function(player) {
        return player.getData();
    }).then(function(data) {
        _push({ type: "load_ok", data: JSON.stringify(data) });
    }).catch(function(err) {
        _push({ type: "load_err", msg: String(err) });
    });
};

// --- Auth / Player ---

window.ysdk_get_player = function() {
    if (!window.__ysdk) { _push({ type: "player_err", msg: "SDK not ready" }); return; }
    window.__ysdk.getPlayer({ scopes: false }).then(function(player) {
        _push({
            type: "player_info",
            name: player.getName() || "",
            id: player.getUniqueID() || "",
            isAuthorized: player.getMode() !== "lite"
        });
    }).catch(function(err) {
        _push({ type: "player_err", msg: String(err) });
    });
};

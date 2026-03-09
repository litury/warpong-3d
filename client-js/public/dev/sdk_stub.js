// dev/sdk_stub.js — fake YaGames SDK for local development

window.YaGames = {
    init: function() {
        console.log("[stub] YaGames.init()");
        return Promise.resolve({
            environment: {
                i18n: { lang: "ru" }
            },
            features: {
                LoadingAPI: {
                    ready: function() { console.log("[stub] LoadingAPI.ready()"); }
                }
            },
            adv: {
                showFullscreenAdv: function(opts) {
                    console.log("[stub] fullscreen ad");
                    setTimeout(function() { opts.callbacks.onClose(true); }, 500);
                },
                showRewardedVideo: function(opts) {
                    console.log("[stub] rewarded video");
                    setTimeout(function() { opts.callbacks.onOpen(); }, 100);
                    setTimeout(function() { opts.callbacks.onRewarded(); }, 300);
                    setTimeout(function() { opts.callbacks.onClose(); }, 500);
                }
            },
            getLeaderboards: function() {
                return Promise.resolve({
                    setLeaderboardScore: function(name, score) {
                        console.log("[stub] setScore", name, score);
                        return Promise.resolve();
                    },
                    getLeaderboardEntries: function(name, opts) {
                        console.log("[stub] getEntries", name, opts);
                        return Promise.resolve({
                            entries: [
                                { rank: 1, score: 100, player: { publicName: "Alice" } },
                                { rank: 2, score: 80, player: { publicName: "Bob" } },
                                { rank: 3, score: 60, player: { publicName: "Charlie" } },
                            ]
                        });
                    }
                });
            },
            getPayments: function() {
                return Promise.resolve({
                    purchase: function(opts) {
                        console.log("[stub] purchase", opts.id);
                        return Promise.resolve({ purchaseToken: "stub-token-" + Date.now() });
                    },
                    consumePurchase: function(token) {
                        console.log("[stub] consumePurchase", token);
                        return Promise.resolve();
                    }
                });
            },
            getPlayer: function() {
                return Promise.resolve({
                    getName: function() { return "DevPlayer"; },
                    getUniqueID: function() { return "dev-123"; },
                    isAuthorized: function() { return true; },
                    signature: "stub-signature-dev",
                    setData: function(data, flush) {
                        console.log("[stub] setData", data, flush);
                        localStorage.setItem("__ysdk_save", JSON.stringify(data));
                        return Promise.resolve();
                    },
                    getData: function() {
                        console.log("[stub] getData");
                        var raw = localStorage.getItem("__ysdk_save");
                        return Promise.resolve(raw ? JSON.parse(raw) : {});
                    }
                });
            },
            auth: {
                openAuthDialog: function() { return Promise.resolve(); }
            }
        });
    }
};

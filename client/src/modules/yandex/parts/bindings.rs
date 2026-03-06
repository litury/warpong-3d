#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_init();

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_is_ready() -> bool;

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_drain_inbox() -> JsValue;

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_show_fullscreen_adv();

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_show_rewarded_video();

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_set_score(leaderboard_name: &str, score: i32);

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_get_leaderboard(leaderboard_name: &str, quantity_top: i32);

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_get_player();

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_purchase(product_id: &str);

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_consume_purchase(token: &str);

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_save_data(json_str: &str);

    #[wasm_bindgen(js_namespace = window)]
    pub fn ysdk_load_data();
}

// Stubs for non-WASM targets (host cargo check)
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_init() {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_is_ready() -> bool {
    false
}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_drain_inbox() -> Vec<String> {
    vec![]
}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_show_fullscreen_adv() {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_show_rewarded_video() {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_set_score(_: &str, _: i32) {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_get_leaderboard(_: &str, _: i32) {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_get_player() {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_purchase(_: &str) {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_consume_purchase(_: &str) {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_save_data(_: &str) {}
#[cfg(not(target_arch = "wasm32"))]
pub fn ysdk_load_data() {}

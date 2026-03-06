use bevy::prelude::*;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum SdkMessage {
    // Init
    #[serde(rename = "init_ok")]
    InitOk,
    #[serde(rename = "init_err")]
    InitErr { msg: String },

    // Fullscreen ad
    #[serde(rename = "adv_close")]
    AdvClose {
        #[serde(rename = "wasShown")]
        was_shown: bool,
    },
    #[serde(rename = "adv_err")]
    AdvErr { msg: String },

    // Rewarded video
    #[serde(rename = "rewarded_open")]
    RewardedOpen,
    #[serde(rename = "rewarded_granted")]
    RewardedGranted,
    #[serde(rename = "rewarded_close")]
    RewardedClose,
    #[serde(rename = "rewarded_err")]
    RewardedErr { msg: String },

    // Leaderboard
    #[serde(rename = "lb_score_ok")]
    LbScoreOk,
    #[serde(rename = "lb_entries")]
    LbEntries { entries: Vec<LeaderboardEntry> },
    #[serde(rename = "lb_err")]
    LbErr { msg: String },

    // Purchase (IAP)
    #[serde(rename = "purchase_ok")]
    PurchaseOk {
        #[serde(rename = "productId")]
        product_id: String,
        token: String,
    },
    #[serde(rename = "purchase_err")]
    PurchaseErr { msg: String },

    // Cloud save
    #[serde(rename = "save_ok")]
    SaveOk,
    #[serde(rename = "save_err")]
    SaveErr { msg: String },
    #[serde(rename = "load_ok")]
    LoadOk { data: String },
    #[serde(rename = "load_err")]
    LoadErr { msg: String },

    // Player
    #[serde(rename = "player_info")]
    PlayerInfo {
        name: String,
        id: String,
        #[serde(rename = "isAuthorized")]
        is_authorized: bool,
    },
    #[serde(rename = "player_err")]
    PlayerErr { msg: String },
}

#[derive(Deserialize, Debug, Clone)]
pub struct LeaderboardEntry {
    pub rank: u32,
    pub score: i32,
    pub name: String,
}

#[derive(Resource, Default)]
pub struct SdkInbox {
    pub messages: Vec<SdkMessage>,
}

pub fn poll_sdk_inbox(mut inbox: ResMut<SdkInbox>) {
    inbox.messages.clear();

    #[cfg(target_arch = "wasm32")]
    {
        let js_val = super::bindings::ysdk_drain_inbox();
        let array = js_sys::Array::from(&js_val);
        for i in 0..array.length() {
            if let Some(s) = array.get(i).as_string() {
                match serde_json::from_str::<SdkMessage>(&s) {
                    Ok(msg) => inbox.messages.push(msg),
                    Err(e) => {
                        web_sys::console::warn_1(
                            &format!("SDK parse error: {e} | raw: {s}").into(),
                        );
                    }
                }
            }
        }
    }
}

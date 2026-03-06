use bevy::prelude::*;

use super::parts::bindings;
use super::parts::callbacks::{SdkInbox, SdkMessage};
use crate::modules::shop::Wallet;

#[derive(Resource, Default)]
pub struct AdState {
    pub showing: bool,
}

pub fn request_fullscreen_ad(mut ad_state: ResMut<AdState>) {
    if !ad_state.showing {
        ad_state.showing = true;
        bindings::ysdk_show_fullscreen_adv();
    }
}

pub fn process_ad_callbacks(
    mut ad_state: ResMut<AdState>,
    inbox: Res<SdkInbox>,
    mut wallet: ResMut<Wallet>,
) {
    for msg in &inbox.messages {
        match msg {
            SdkMessage::AdvClose { .. } | SdkMessage::AdvErr { .. } => {
                ad_state.showing = false;
            }
            SdkMessage::RewardedGranted => {
                wallet.coins += 15;
                bevy::log::info!("Rewarded ad: +15 coins (total: {})", wallet.coins);
            }
            SdkMessage::RewardedClose | SdkMessage::RewardedErr { .. } => {
                ad_state.showing = false;
            }
            SdkMessage::PurchaseOk {
                product_id, token, ..
            } => {
                let coins = match product_id.as_str() {
                    "coins_100" => 100,
                    "coins_500" => 500,
                    "coins_1500" => 1500,
                    _ => 0,
                };
                if coins > 0 {
                    wallet.coins += coins;
                    bevy::log::info!("IAP: +{} coins (total: {})", coins, wallet.coins);
                }
                bindings::ysdk_consume_purchase(token);
            }
            _ => {}
        }
    }
}

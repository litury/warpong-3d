use bevy::prelude::*;

use super::data::{EquippedCosmetics, OwnedUpgrades, ShopSaveData, Wallet};
use crate::modules::yandex::parts::bindings;
use crate::modules::yandex::parts::callbacks::{SdkInbox, SdkMessage};

#[derive(Resource)]
pub struct CloudSaveTimer {
    pub dirty: bool,
    pub timer: Timer,
}

impl Default for CloudSaveTimer {
    fn default() -> Self {
        Self {
            dirty: false,
            timer: Timer::from_seconds(5.0, TimerMode::Once),
        }
    }
}

pub fn mark_save_dirty(
    wallet: Res<Wallet>,
    owned: Res<OwnedUpgrades>,
    equipped: Res<EquippedCosmetics>,
    mut save_timer: ResMut<CloudSaveTimer>,
) {
    if wallet.is_changed() || owned.is_changed() || equipped.is_changed() {
        save_timer.dirty = true;
        save_timer.timer.reset();
    }
}

pub fn flush_cloud_save(
    time: Res<Time>,
    mut save_timer: ResMut<CloudSaveTimer>,
    wallet: Res<Wallet>,
    owned: Res<OwnedUpgrades>,
    equipped: Res<EquippedCosmetics>,
) {
    if !save_timer.dirty {
        return;
    }
    save_timer.timer.tick(time.delta());
    if !save_timer.timer.just_finished() && save_timer.timer.elapsed() < save_timer.timer.duration() {
        return;
    }
    save_timer.dirty = false;

    let data = ShopSaveData {
        wallet: wallet.clone(),
        owned: owned.clone(),
        equipped: equipped.clone(),
    };
    match serde_json::to_string(&data) {
        Ok(json) => {
            bindings::ysdk_save_data(&json);
            bevy::log::info!("Cloud save triggered");
        }
        Err(e) => bevy::log::warn!("Cloud save serialize error: {e}"),
    }
}

pub fn request_cloud_load() {
    bindings::ysdk_load_data();
}

pub fn process_cloud_load(
    inbox: Res<SdkInbox>,
    mut wallet: ResMut<Wallet>,
    mut owned: ResMut<OwnedUpgrades>,
    mut equipped: ResMut<EquippedCosmetics>,
) {
    for msg in &inbox.messages {
        if let SdkMessage::LoadOk { data } = msg {
            match serde_json::from_str::<ShopSaveData>(data) {
                Ok(save) => {
                    *wallet = save.wallet;
                    *owned = save.owned;
                    *equipped = save.equipped;
                    bevy::log::info!("Cloud save loaded: {} coins", wallet.coins);
                }
                Err(e) => bevy::log::warn!("Cloud load parse error: {e}"),
            }
        }
    }
}

use bevy::prelude::*;

use super::parts::bindings;
use super::parts::callbacks::{SdkInbox, SdkMessage};

#[derive(Resource, Default)]
pub struct PlayerData {
    pub name: String,
    pub id: String,
    pub is_authorized: bool,
    pub loaded: bool,
}

pub fn request_player_info(inbox: Res<SdkInbox>) {
    for msg in &inbox.messages {
        if matches!(msg, SdkMessage::InitOk) {
            bindings::ysdk_get_player();
        }
    }
}

pub fn process_player_callbacks(mut player: ResMut<PlayerData>, inbox: Res<SdkInbox>) {
    for msg in &inbox.messages {
        match msg {
            SdkMessage::PlayerInfo {
                name,
                id,
                is_authorized,
            } => {
                player.name = name.clone();
                player.id = id.clone();
                player.is_authorized = *is_authorized;
                player.loaded = true;
                // Load cloud save data
                bindings::ysdk_load_data();
            }
            SdkMessage::PlayerErr { .. } => {
                player.loaded = true;
            }
            _ => {}
        }
    }
}

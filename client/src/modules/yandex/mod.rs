pub mod ads;
mod auth;
mod leaderboard;
pub mod parts;

use bevy::prelude::*;

use crate::config::states::GameState;

pub use auth::PlayerData;
pub use leaderboard::LeaderboardData;

pub struct YandexPlugin;

impl Plugin for YandexPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<parts::callbacks::SdkInbox>()
            .init_resource::<ads::AdState>()
            .init_resource::<leaderboard::LeaderboardData>()
            .init_resource::<auth::PlayerData>()
            .add_systems(Startup, init_sdk)
            .add_systems(
                Update,
                (
                    parts::callbacks::poll_sdk_inbox,
                    auth::request_player_info,
                    auth::process_player_callbacks,
                    ads::process_ad_callbacks,
                    leaderboard::process_leaderboard_callbacks,
                )
                    .chain(),
            )
            .add_systems(
                OnEnter(GameState::GameOver),
                (ads::request_fullscreen_ad, leaderboard::submit_score),
            )
            .add_systems(
                OnExit(GameState::GameOver),
                leaderboard::reset_leaderboard_data,
            );
    }
}

fn init_sdk() {
    parts::bindings::ysdk_init();
}

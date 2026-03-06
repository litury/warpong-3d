pub mod client;
mod parts;
pub mod sync;

use bevy::prelude::*;

use crate::config::states::{GameMode, GameState};

fn is_online_active(
    game_state: Res<State<GameState>>,
    game_mode: Res<GameMode>,
) -> bool {
    *game_mode == GameMode::Online
        && matches!(game_state.get(), GameState::Lobby | GameState::Playing)
}

pub struct NetworkPlugin;

fn reset_match_result(mut match_result: ResMut<client::MatchResult>) {
    *match_result = client::MatchResult::default();
}

impl Plugin for NetworkPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<client::NetworkClient>()
            .init_resource::<client::MatchResult>()
            .add_systems(
                OnEnter(GameState::Lobby),
                client::connect_to_server,
            )
            .add_systems(
                Update,
                (
                    client::poll_server_messages,
                    sync::handle_server_messages,
                )
                    .chain()
                    .run_if(is_online_active),
            )
            .add_systems(
                Update,
                sync::apply_server_state
                    .run_if(in_state(GameState::Playing))
                    .run_if(resource_equals(GameMode::Online)),
            )
            .add_systems(
                FixedUpdate,
                client::send_player_input
                    .run_if(in_state(GameState::Playing))
                    .run_if(resource_equals(GameMode::Online)),
            )
            .add_systems(
                OnExit(GameState::GameOver),
                reset_match_result
                    .run_if(resource_equals(GameMode::Online)),
            );
    }
}

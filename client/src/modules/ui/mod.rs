mod game_over;
mod hud;
mod lobby;
mod menu;

use bevy::prelude::*;

use crate::config::states::GameState;

pub struct UiPlugin;

impl Plugin for UiPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(OnEnter(GameState::Menu), menu::setup_menu)
            .add_systems(OnExit(GameState::Menu), menu::cleanup_menu)
            .add_systems(
                Update,
                menu::handle_menu_buttons.run_if(in_state(GameState::Menu)),
            )
            .add_systems(OnEnter(GameState::Lobby), lobby::setup_lobby)
            .add_systems(OnExit(GameState::Lobby), lobby::cleanup_lobby)
            .add_systems(
                Update,
                lobby::handle_lobby_buttons.run_if(in_state(GameState::Lobby)),
            )
            .add_systems(OnEnter(GameState::Playing), hud::setup_hud)
            .add_systems(OnExit(GameState::Playing), hud::cleanup_hud)
            .add_systems(
                Update,
                (hud::update_score_text, hud::update_coin_text)
                    .run_if(in_state(GameState::Playing)),
            )
            .add_systems(OnEnter(GameState::GameOver), game_over::setup_game_over)
            .add_systems(OnExit(GameState::GameOver), game_over::cleanup_game_over)
            .add_systems(
                Update,
                (
                    game_over::handle_game_over_buttons,
                    game_over::update_leaderboard_display,
                )
                    .run_if(in_state(GameState::GameOver)),
            );
    }
}

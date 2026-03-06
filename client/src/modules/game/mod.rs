mod ball;
mod paddle;
pub mod parts;
mod scoring;
pub mod setup;

use bevy::prelude::*;

use crate::config::states::{GameMode, GameState};
use crate::shared::events::{CollisionEvent, GameOverEvent, ScoreEvent};

pub struct GamePlugin;

impl Plugin for GamePlugin {
    fn build(&self, app: &mut App) {
        app.add_message::<ScoreEvent>()
            .add_message::<GameOverEvent>()
            .add_message::<CollisionEvent>()
            .add_systems(OnEnter(GameState::Playing), setup::setup_game)
            .add_systems(OnExit(GameState::Playing), setup::cleanup_game)
            // Solo-only systems: player input, AI, physics, collisions, scoring
            // In online mode, server controls all positions; client only sends input direction
            .add_systems(
                FixedUpdate,
                (
                    paddle::player_input,
                    paddle::touch_input,
                    parts::ai::ai_paddle,
                    ball::ball_movement,
                    parts::collision::check_collisions,
                    scoring::handle_scoring,
                    scoring::check_game_over,
                )
                    .run_if(in_state(GameState::Playing))
                    .run_if(resource_equals(GameMode::Solo)),
            )
            // Cosmetic systems (both modes)
            .add_systems(
                Update,
                (
                    parts::cosmetics::spawn_ball_trail,
                    parts::cosmetics::fade_trail_particles,
                )
                    .run_if(in_state(GameState::Playing)),
            );
    }
}

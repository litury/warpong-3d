use bevy::prelude::*;
use pong_shared::config::*;

use crate::config::states::GameState;
use crate::shared::components::*;
use crate::shared::events::{GameOverEvent, ScoreEvent};

use super::setup::Scoreboard;

pub fn handle_scoring(
    mut ball_query: Query<(&mut Transform, &mut Velocity), With<Ball>>,
    mut scoreboard: ResMut<Scoreboard>,
    mut score_events: MessageWriter<ScoreEvent>,
) {
    let half_w = ARENA_WIDTH / 2.0;

    for (mut transform, mut velocity) in &mut ball_query {
        if transform.translation.x < -half_w - BALL_SIZE {
            scoreboard.right += 1;
            score_events.write(ScoreEvent { left_scored: false });
            reset_ball(&mut transform, &mut velocity, false);
        } else if transform.translation.x > half_w + BALL_SIZE {
            scoreboard.left += 1;
            score_events.write(ScoreEvent { left_scored: true });
            reset_ball(&mut transform, &mut velocity, true);
        }
    }
}

fn reset_ball(transform: &mut Transform, velocity: &mut Velocity, go_right: bool) {
    transform.translation = Vec3::ZERO;
    let dir = if go_right { 1.0 } else { -1.0 };
    velocity.0 = Vec2::new(dir * BALL_INITIAL_SPEED, BALL_INITIAL_SPEED * 0.3);
}

pub fn check_game_over(
    scoreboard: Res<Scoreboard>,
    mut game_over_events: MessageWriter<GameOverEvent>,
    mut next_state: ResMut<NextState<GameState>>,
) {
    if scoreboard.left >= WIN_SCORE {
        game_over_events.write(GameOverEvent { player_won: true });
        next_state.set(GameState::GameOver);
    } else if scoreboard.right >= WIN_SCORE {
        game_over_events.write(GameOverEvent { player_won: false });
        next_state.set(GameState::GameOver);
    }
}

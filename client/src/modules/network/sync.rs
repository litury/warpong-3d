use bevy::prelude::*;
use pong_shared::messages::ServerMessage;

use crate::config::states::{GameMode, GameState};
use crate::modules::game::setup::Scoreboard;
use crate::shared::components::*;

use super::client::{ConnectionState, MatchResult, NetworkClient};

pub fn handle_server_messages(
    mut net: ResMut<NetworkClient>,
    mut next_state: ResMut<NextState<GameState>>,
    mut match_result: ResMut<MatchResult>,
) {
    let messages: Vec<ServerMessage> = net.inbox.drain(..).collect();

    for msg in messages {
        match msg {
            ServerMessage::MatchFound { side } => {
                net.state = ConnectionState::InMatch(side);
                match_result.player_side = Some(side);
                next_state.set(GameState::Playing);
            }
            ServerMessage::GameOver { winner } => {
                match_result.winner = Some(winner);
                next_state.set(GameState::GameOver);
            }
            ServerMessage::OpponentDisconnected => {
                next_state.set(GameState::Menu);
                net.disconnect();
            }
            // GameStateUpdate and GameEvent are handled in apply_server_state
            other => {
                net.inbox.push_back(other);
            }
        }
    }
}

pub fn apply_server_state(
    mut net: ResMut<NetworkClient>,
    mut ball_query: Query<(&mut Transform, &mut Velocity), With<Ball>>,
    mut paddle_query: Query<&mut Transform, (With<Paddle>, Without<Ball>)>,
    mut scoreboard: ResMut<Scoreboard>,
    game_mode: Res<GameMode>,
) {
    if *game_mode != GameMode::Online {
        return;
    }

    let messages: Vec<ServerMessage> = net.inbox.drain(..).collect();

    for msg in messages {
        if let ServerMessage::GameStateUpdate(snapshot) = msg {
            // Update ball
            for (mut transform, mut velocity) in &mut ball_query {
                transform.translation.x = snapshot.ball.x;
                transform.translation.y = snapshot.ball.y;
                velocity.0.x = snapshot.ball.vx;
                velocity.0.y = snapshot.ball.vy;
            }

            // Update paddles (distinguish by x position)
            for mut transform in &mut paddle_query {
                if transform.translation.x < 0.0 {
                    transform.translation.y = snapshot.left_paddle.y;
                } else {
                    transform.translation.y = snapshot.right_paddle.y;
                }
            }

            // Update scoreboard for HUD
            scoreboard.left = snapshot.score.left;
            scoreboard.right = snapshot.score.right;
        }
    }
}

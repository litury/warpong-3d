use bevy::prelude::*;
use pong_shared::config::*;

use crate::config::states::GameMode;
use crate::modules::network::client::{ConnectionState, NetworkClient};
use crate::modules::shop::{EffectiveStats, EquippedCosmetics};
use crate::modules::shop::parts::data::UpgradeId;
use crate::shared::components::*;
use pong_shared::messages::PlayerSide;

#[derive(Component)]
pub struct GameEntity;

#[derive(Resource, Default)]
pub struct Scoreboard {
    pub left: u32,
    pub right: u32,
}

fn paddle_color(cosmetics: &EquippedCosmetics) -> Color {
    match cosmetics.paddle_color {
        Some(UpgradeId::ColorNeonGreen) => Color::srgb(0.2, 1.0, 0.2),
        Some(UpgradeId::ColorNeonBlue) => Color::srgb(0.2, 0.4, 1.0),
        Some(UpgradeId::ColorHotPink) => Color::srgb(1.0, 0.2, 0.6),
        Some(UpgradeId::ColorGold) => Color::srgb(1.0, 0.84, 0.0),
        _ => Color::WHITE,
    }
}

pub fn setup_game(
    mut commands: Commands,
    game_mode: Res<GameMode>,
    net: Res<NetworkClient>,
    effective: Res<EffectiveStats>,
    cosmetics: Res<EquippedCosmetics>,
) {
    commands.insert_resource(Scoreboard::default());

    let half_w = ARENA_WIDTH / 2.0;
    let half_h = ARENA_HEIGHT / 2.0;
    let p_color = paddle_color(&cosmetics);
    let paddle_h = effective.paddle_height;
    let paddle_speed = effective.paddle_speed;
    let ball_speed = effective.ball_initial_speed;

    // Determine which side the local player controls
    let player_side = match &net.state {
        ConnectionState::InMatch(side) => Some(*side),
        _ => None, // Solo mode — left paddle is player
    };

    let stats = PaddleStats {
        speed: paddle_speed,
        height: paddle_h,
    };

    // Left paddle
    let mut left_paddle = commands.spawn((
        Sprite {
            color: p_color,
            custom_size: Some(Vec2::new(PADDLE_WIDTH, paddle_h)),
            ..default()
        },
        Transform::from_xyz(-half_w + PADDLE_MARGIN, 0.0, 0.0),
        Paddle,
        PaddleStats {
            speed: stats.speed,
            height: stats.height,
        },
        GameEntity,
    ));
    if *game_mode == GameMode::Solo || player_side == Some(PlayerSide::Left) {
        left_paddle.insert(PlayerControlled);
    }

    // Right paddle (AI in Solo, server-controlled in Online)
    let mut right_paddle = commands.spawn((
        Sprite {
            color: p_color,
            custom_size: Some(Vec2::new(PADDLE_WIDTH, paddle_h)),
            ..default()
        },
        Transform::from_xyz(half_w - PADDLE_MARGIN, 0.0, 0.0),
        Paddle,
        PaddleStats {
            speed: stats.speed,
            height: stats.height,
        },
        GameEntity,
    ));
    if *game_mode == GameMode::Solo {
        right_paddle.insert(AiControlled);
    } else if player_side == Some(PlayerSide::Right) {
        right_paddle.insert(PlayerControlled);
    }

    // Ball
    commands.spawn((
        Sprite {
            color: Color::WHITE,
            custom_size: Some(Vec2::new(BALL_SIZE, BALL_SIZE)),
            ..default()
        },
        Transform::from_xyz(0.0, 0.0, 0.0),
        Ball,
        Velocity(Vec2::new(ball_speed, ball_speed * 0.5)),
        GameEntity,
    ));

    // Top wall
    commands.spawn((
        Sprite {
            color: Color::srgb(0.3, 0.3, 0.3),
            custom_size: Some(Vec2::new(ARENA_WIDTH, 10.0)),
            ..default()
        },
        Transform::from_xyz(0.0, half_h, 0.0),
        Wall,
        GameEntity,
    ));

    // Bottom wall
    commands.spawn((
        Sprite {
            color: Color::srgb(0.3, 0.3, 0.3),
            custom_size: Some(Vec2::new(ARENA_WIDTH, 10.0)),
            ..default()
        },
        Transform::from_xyz(0.0, -half_h, 0.0),
        Wall,
        GameEntity,
    ));

    // Center line (decorative)
    commands.spawn((
        Sprite {
            color: Color::srgb(0.2, 0.2, 0.2),
            custom_size: Some(Vec2::new(2.0, ARENA_HEIGHT)),
            ..default()
        },
        Transform::from_xyz(0.0, 0.0, -1.0),
        GameEntity,
    ));
}

pub fn cleanup_game(mut commands: Commands, entities: Query<Entity, With<GameEntity>>) {
    for entity in &entities {
        commands.entity(entity).despawn();
    }
}

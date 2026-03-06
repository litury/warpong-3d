use bevy::prelude::*;

#[derive(Component)]
pub struct Paddle;

#[derive(Component)]
pub struct AiControlled;

#[derive(Component)]
pub struct Ball;

#[derive(Component)]
pub struct Velocity(pub Vec2);

#[derive(Component)]
pub struct PlayerControlled;

#[derive(Component)]
pub struct PaddleStats {
    pub speed: f32,
    pub height: f32,
}

#[derive(Component)]
pub struct Wall;

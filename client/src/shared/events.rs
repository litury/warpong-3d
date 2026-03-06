use bevy::prelude::*;

#[derive(Message)]
pub struct ScoreEvent {
    pub left_scored: bool,
}

#[derive(Message)]
pub struct GameOverEvent {
    pub player_won: bool,
}

#[derive(Message)]
pub struct CollisionEvent;

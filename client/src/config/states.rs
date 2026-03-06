use bevy::prelude::*;

#[derive(States, Debug, Clone, Eq, PartialEq, Hash, Default)]
pub enum GameState {
    #[default]
    Menu,
    Playing,
    Paused,
    GameOver,
    Lobby,
    Shop,
}

#[derive(Resource, Debug, Clone, Eq, PartialEq, Default)]
pub enum GameMode {
    #[default]
    Solo,
    Online,
}

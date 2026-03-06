use serde::{Deserialize, Serialize};

use crate::data::{BallState, PaddleState, ScoreState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ServerMessage {
    QueueJoined,
    MatchFound { side: PlayerSide },
    GameStateUpdate(GameSnapshot),
    GameEvent { event: GameEvent },
    GameOver { winner: PlayerSide },
    OpponentDisconnected,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum PlayerSide {
    Left,
    Right,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSnapshot {
    pub ball: BallState,
    pub left_paddle: PaddleState,
    pub right_paddle: PaddleState,
    pub score: ScoreState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GameEvent {
    BallHitPaddle,
    BallHitWall,
    PlayerScored { side: PlayerSide },
}

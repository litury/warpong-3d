use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClientMessage {
    JoinQueue,
    LeaveQueue,
    PlayerInput(PlayerInput),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInput {
    pub direction: PaddleDirection,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PaddleDirection {
    Up,
    Down,
    Idle,
}

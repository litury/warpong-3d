use std::collections::VecDeque;

use bevy::prelude::*;
use pong_shared::messages::{
    ClientMessage, PaddleDirection, PlayerInput, PlayerSide, ServerMessage,
};

#[derive(Resource, Default)]
pub struct MatchResult {
    pub player_side: Option<PlayerSide>,
    pub winner: Option<PlayerSide>,
}

use super::parts::websocket::WsClient;
use crate::config::states::GameMode;

const SERVER_URL: &str = "ws://localhost:3030";

#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    InQueue,
    InMatch(PlayerSide),
}

#[derive(Resource)]
pub struct NetworkClient {
    ws: Option<WsClient>,
    pub inbox: VecDeque<ServerMessage>,
    pub state: ConnectionState,
}

impl Default for NetworkClient {
    fn default() -> Self {
        Self {
            ws: None,
            inbox: VecDeque::new(),
            state: ConnectionState::Disconnected,
        }
    }
}

impl NetworkClient {
    pub fn connect(&mut self) {
        if self.ws.is_some() {
            return;
        }
        self.state = ConnectionState::Connecting;
        match WsClient::connect(SERVER_URL) {
            Ok(ws) => {
                self.ws = Some(ws);
                // Stay in Connecting — poll() will detect when ws.is_open()
                // and transition to Connected, then send JoinQueue
            }
            Err(e) => {
                bevy::log::error!("WS connect error: {e}");
                self.state = ConnectionState::Disconnected;
            }
        }
    }

    pub fn disconnect(&mut self) {
        if let Some(ws) = self.ws.take() {
            ws.close();
        }
        self.state = ConnectionState::Disconnected;
        self.inbox.clear();
    }

    pub fn send(&self, msg: &ClientMessage) {
        if let Some(ws) = &self.ws {
            if let Ok(json) = serde_json::to_string(msg) {
                ws.send_text(&json);
            }
        }
    }

    pub fn poll(&mut self) {
        if let Some(ws) = &self.ws {
            if ws.is_open() {
                // Connection just opened — send JoinQueue
                if self.state == ConnectionState::Connecting {
                    self.state = ConnectionState::InQueue;
                    if let Ok(json) = serde_json::to_string(&ClientMessage::JoinQueue) {
                        ws.send_text(&json);
                    }
                }
                for msg in ws.drain_inbox() {
                    self.inbox.push_back(msg);
                }
            } else if self.state != ConnectionState::Connecting {
                self.state = ConnectionState::Disconnected;
            }
        }
    }
}

pub fn connect_to_server(mut net: ResMut<NetworkClient>) {
    if net.state == ConnectionState::Disconnected {
        net.connect();
    }
}

pub fn disconnect_from_server(mut net: ResMut<NetworkClient>) {
    net.disconnect();
}

pub fn send_player_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    net: Res<NetworkClient>,
    game_mode: Res<GameMode>,
) {
    if *game_mode != GameMode::Online {
        return;
    }

    let direction = if keyboard.pressed(KeyCode::KeyW) || keyboard.pressed(KeyCode::ArrowUp) {
        PaddleDirection::Up
    } else if keyboard.pressed(KeyCode::KeyS) || keyboard.pressed(KeyCode::ArrowDown) {
        PaddleDirection::Down
    } else {
        PaddleDirection::Idle
    };

    net.send(&ClientMessage::PlayerInput(PlayerInput { direction }));
}

pub fn poll_server_messages(mut net: ResMut<NetworkClient>) {
    net.poll();
}

use bevy::prelude::*;

use super::parts::bindings;
use super::parts::callbacks::{LeaderboardEntry, SdkInbox, SdkMessage};
use crate::modules::game::setup::Scoreboard;

pub const LEADERBOARD_NAME: &str = "pong_wins";

#[derive(Resource, Default)]
pub struct LeaderboardData {
    pub entries: Vec<LeaderboardEntry>,
    pub score_submitted: bool,
}

pub fn submit_score(scoreboard: Option<Res<Scoreboard>>, mut lb_data: ResMut<LeaderboardData>) {
    if lb_data.score_submitted {
        return;
    }
    let score = scoreboard.map(|s| s.left as i32).unwrap_or(0);
    bindings::ysdk_set_score(LEADERBOARD_NAME, score);
    lb_data.score_submitted = true;
}

pub fn process_leaderboard_callbacks(
    mut lb_data: ResMut<LeaderboardData>,
    inbox: Res<SdkInbox>,
) {
    for msg in &inbox.messages {
        match msg {
            SdkMessage::LbScoreOk => {
                bindings::ysdk_get_leaderboard(LEADERBOARD_NAME, 10);
            }
            SdkMessage::LbEntries { entries } => {
                lb_data.entries = entries.clone();
            }
            SdkMessage::LbErr { msg } => {
                bevy::log::warn!("Leaderboard error: {msg}");
            }
            _ => {}
        }
    }
}

pub fn reset_leaderboard_data(mut lb_data: ResMut<LeaderboardData>) {
    lb_data.entries.clear();
    lb_data.score_submitted = false;
}

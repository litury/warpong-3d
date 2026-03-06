use bevy::prelude::*;
use pong_shared::config::*;

use crate::config::states::GameMode;
use crate::modules::game::setup::Scoreboard;
use crate::modules::network::client::MatchResult;

use super::parts::catalog::find_upgrade;
use super::parts::data::*;

pub fn award_coins(
    mut wallet: ResMut<Wallet>,
    scoreboard: Option<Res<Scoreboard>>,
    game_mode: Res<GameMode>,
    match_result: Res<MatchResult>,
) {
    let (left, right) = scoreboard
        .map(|s| (s.left, s.right))
        .unwrap_or((0, 0));

    let player_won = if *game_mode == GameMode::Online {
        match (match_result.winner, match_result.player_side) {
            (Some(winner), Some(side)) => winner == side,
            _ => left > right,
        }
    } else {
        left > right
    };

    let reward = match (&*game_mode, player_won) {
        (GameMode::Online, true) => 25,
        (GameMode::Online, false) => 3,
        (GameMode::Solo, true) => 10,
        (GameMode::Solo, false) => 3,
    };

    wallet.coins += reward;
    bevy::log::info!("Awarded {} coins (total: {})", reward, wallet.coins);
}

pub fn compute_effective_stats(
    mut stats: ResMut<EffectiveStats>,
    owned: Res<OwnedUpgrades>,
    game_mode: Res<GameMode>,
) {
    if *game_mode == GameMode::Online {
        // Online: use defaults, no gameplay upgrades
        stats.paddle_speed = PADDLE_SPEED;
        stats.paddle_height = PADDLE_HEIGHT;
        stats.ball_initial_speed = BALL_INITIAL_SPEED;
    } else {
        stats.paddle_speed = PADDLE_SPEED + owned.level(UpgradeId::PaddleSpeed) as f32 * 50.0;
        stats.paddle_height = PADDLE_HEIGHT + owned.level(UpgradeId::PaddleSize) as f32 * 15.0;
        stats.ball_initial_speed =
            BALL_INITIAL_SPEED + owned.level(UpgradeId::BallStartSpeed) as f32 * 30.0;
    }
}

pub fn try_buy_upgrade(
    wallet: &mut Wallet,
    owned: &mut OwnedUpgrades,
    id: UpgradeId,
) -> bool {
    let Some(def) = find_upgrade(id) else {
        return false;
    };
    let current_level = owned.level(id);
    if current_level >= def.max_level {
        return false;
    }
    let cost = def.costs[current_level as usize];
    if wallet.coins < cost {
        return false;
    }
    wallet.coins -= cost;
    owned.levels.insert(id, current_level + 1);
    true
}

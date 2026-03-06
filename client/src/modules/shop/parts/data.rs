use std::collections::HashMap;

use bevy::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Resource, Serialize, Deserialize, Clone, Debug)]
pub struct Wallet {
    pub coins: u32,
}

impl Default for Wallet {
    fn default() -> Self {
        Self { coins: 0 }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UpgradeId {
    // Gameplay (Solo only)
    PaddleSpeed,
    PaddleSize,
    BallStartSpeed,
    StickyPaddle,
    // Cosmetic - paddle colors
    ColorNeonGreen,
    ColorNeonBlue,
    ColorHotPink,
    ColorGold,
    // Cosmetic - ball trails
    TrailSimple,
    TrailRainbow,
    // Cosmetic - ball visual
    BallGlow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpgradeCategory {
    Gameplay,
    PaddleColor,
    BallTrail,
    BallVisual,
}

pub struct UpgradeDef {
    pub id: UpgradeId,
    pub name: &'static str,
    pub category: UpgradeCategory,
    pub max_level: u32,
    pub costs: &'static [u32],
    pub description: &'static str,
}

#[derive(Resource, Serialize, Deserialize, Clone, Debug, Default)]
pub struct OwnedUpgrades {
    pub levels: HashMap<UpgradeId, u32>,
}

impl OwnedUpgrades {
    pub fn level(&self, id: UpgradeId) -> u32 {
        self.levels.get(&id).copied().unwrap_or(0)
    }
}

#[derive(Resource, Serialize, Deserialize, Clone, Debug, Default)]
pub struct EquippedCosmetics {
    pub paddle_color: Option<UpgradeId>,
    pub ball_trail: Option<UpgradeId>,
}

#[derive(Resource, Default)]
pub struct EffectiveStats {
    pub paddle_speed: f32,
    pub paddle_height: f32,
    pub ball_initial_speed: f32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct ShopSaveData {
    pub wallet: Wallet,
    pub owned: OwnedUpgrades,
    pub equipped: EquippedCosmetics,
}

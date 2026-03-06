use super::data::{UpgradeCategory, UpgradeDef, UpgradeId};

pub const CATALOG: &[UpgradeDef] = &[
    // Gameplay upgrades (Solo only)
    UpgradeDef {
        id: UpgradeId::PaddleSpeed,
        name: "Swift Paddle",
        category: UpgradeCategory::Gameplay,
        max_level: 3,
        costs: &[50, 150, 400],
        description: "+50 paddle speed per level",
    },
    UpgradeDef {
        id: UpgradeId::PaddleSize,
        name: "Big Paddle",
        category: UpgradeCategory::Gameplay,
        max_level: 3,
        costs: &[50, 150, 400],
        description: "+15px paddle height per level",
    },
    UpgradeDef {
        id: UpgradeId::BallStartSpeed,
        name: "Fast Start",
        category: UpgradeCategory::Gameplay,
        max_level: 2,
        costs: &[100, 300],
        description: "+30 initial ball speed per level",
    },
    UpgradeDef {
        id: UpgradeId::StickyPaddle,
        name: "Sticky Paddle",
        category: UpgradeCategory::Gameplay,
        max_level: 1,
        costs: &[500],
        description: "Ball clings to paddle for 0.3s on hit",
    },
    // Cosmetic - paddle colors
    UpgradeDef {
        id: UpgradeId::ColorNeonGreen,
        name: "Neon Green",
        category: UpgradeCategory::PaddleColor,
        max_level: 1,
        costs: &[100],
        description: "Green paddle glow",
    },
    UpgradeDef {
        id: UpgradeId::ColorNeonBlue,
        name: "Neon Blue",
        category: UpgradeCategory::PaddleColor,
        max_level: 1,
        costs: &[100],
        description: "Blue paddle glow",
    },
    UpgradeDef {
        id: UpgradeId::ColorHotPink,
        name: "Hot Pink",
        category: UpgradeCategory::PaddleColor,
        max_level: 1,
        costs: &[100],
        description: "Pink paddle glow",
    },
    UpgradeDef {
        id: UpgradeId::ColorGold,
        name: "Gold",
        category: UpgradeCategory::PaddleColor,
        max_level: 1,
        costs: &[250],
        description: "Golden paddle",
    },
    // Cosmetic - ball trails
    UpgradeDef {
        id: UpgradeId::TrailSimple,
        name: "Basic Trail",
        category: UpgradeCategory::BallTrail,
        max_level: 1,
        costs: &[200],
        description: "Simple fading trail behind the ball",
    },
    UpgradeDef {
        id: UpgradeId::TrailRainbow,
        name: "Rainbow Trail",
        category: UpgradeCategory::BallTrail,
        max_level: 1,
        costs: &[500],
        description: "Colorful rainbow trail",
    },
    // Cosmetic - ball visual
    UpgradeDef {
        id: UpgradeId::BallGlow,
        name: "Ball Glow",
        category: UpgradeCategory::BallVisual,
        max_level: 1,
        costs: &[150],
        description: "Glowing ball effect",
    },
];

pub fn find_upgrade(id: UpgradeId) -> Option<&'static UpgradeDef> {
    CATALOG.iter().find(|u| u.id == id)
}

pub mod parts;
pub mod purchase;
mod shop_ui;

use bevy::prelude::*;

use crate::config::states::GameState;

pub use parts::data::{EffectiveStats, EquippedCosmetics, OwnedUpgrades, Wallet};

pub struct ShopPlugin;

impl Plugin for ShopPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Wallet>()
            .init_resource::<OwnedUpgrades>()
            .init_resource::<EquippedCosmetics>()
            .init_resource::<EffectiveStats>()
            .init_resource::<parts::save::CloudSaveTimer>()
            .add_systems(
                OnEnter(GameState::Playing),
                purchase::compute_effective_stats,
            )
            .add_systems(
                OnEnter(GameState::GameOver),
                purchase::award_coins,
            )
            .add_systems(OnEnter(GameState::Shop), shop_ui::setup_shop)
            .add_systems(OnExit(GameState::Shop), shop_ui::cleanup_shop)
            .add_systems(
                Update,
                (
                    shop_ui::handle_shop_buttons,
                    shop_ui::rebuild_shop_if_dirty,
                )
                    .chain()
                    .run_if(in_state(GameState::Shop)),
            )
            .add_systems(
                Update,
                (
                    parts::save::mark_save_dirty,
                    parts::save::flush_cloud_save,
                    parts::save::process_cloud_load,
                )
                    .chain(),
            );
    }
}

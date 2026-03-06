use bevy::prelude::*;

use crate::config::states::GameState;

use super::parts::catalog::CATALOG;
use super::parts::data::*;
use super::purchase::try_buy_upgrade;

#[derive(Component)]
pub struct ShopUi;

#[derive(Component)]
pub enum ShopButton {
    Back,
    Buy(UpgradeId),
    Equip(UpgradeId),
}

#[derive(Component)]
pub struct CoinDisplayShop;

#[derive(Resource)]
pub struct ShopDirty;

pub fn setup_shop(
    mut commands: Commands,
    wallet: Res<Wallet>,
    owned: Res<OwnedUpgrades>,
    equipped: Res<EquippedCosmetics>,
) {
    commands
        .spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                padding: UiRect::all(Val::Px(20.0)),
                row_gap: Val::Px(10.0),
                overflow: Overflow::scroll_y(),
                ..default()
            },
            BackgroundColor(Color::srgb(0.05, 0.05, 0.1)),
            ShopUi,
        ))
        .with_children(|parent| {
            // Title + coins
            parent
                .spawn(Node {
                    flex_direction: FlexDirection::Row,
                    width: Val::Percent(100.0),
                    justify_content: JustifyContent::SpaceBetween,
                    align_items: AlignItems::Center,
                    margin: UiRect::bottom(Val::Px(10.0)),
                    ..default()
                })
                .with_children(|row| {
                    row.spawn((
                        Text::new("SHOP"),
                        TextFont {
                            font_size: 40.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                    row.spawn((
                        Text::new(format!("{} coins", wallet.coins)),
                        TextFont {
                            font_size: 24.0,
                            ..default()
                        },
                        TextColor(Color::srgb(1.0, 0.85, 0.0)),
                        CoinDisplayShop,
                    ));
                });

            // Catalog items
            for def in CATALOG {
                let current_level = owned.level(def.id);
                let is_maxed = current_level >= def.max_level;
                let is_cosmetic = matches!(
                    def.category,
                    UpgradeCategory::PaddleColor
                        | UpgradeCategory::BallTrail
                        | UpgradeCategory::BallVisual
                );
                let is_equipped = match def.category {
                    UpgradeCategory::PaddleColor => equipped.paddle_color == Some(def.id),
                    UpgradeCategory::BallTrail => equipped.ball_trail == Some(def.id),
                    _ => false,
                };

                parent
                    .spawn(Node {
                        flex_direction: FlexDirection::Row,
                        width: Val::Percent(100.0),
                        max_width: Val::Px(500.0),
                        justify_content: JustifyContent::SpaceBetween,
                        align_items: AlignItems::Center,
                        padding: UiRect::all(Val::Px(8.0)),
                        ..default()
                    })
                    .with_children(|row| {
                        // Name + description
                        row.spawn(Node {
                            flex_direction: FlexDirection::Column,
                            ..default()
                        })
                        .with_children(|col| {
                            let level_text = if def.max_level > 1 {
                                format!("{} (Lv {}/{})", def.name, current_level, def.max_level)
                            } else if is_maxed {
                                format!("{} (Owned)", def.name)
                            } else {
                                def.name.to_string()
                            };
                            col.spawn((
                                Text::new(level_text),
                                TextFont {
                                    font_size: 18.0,
                                    ..default()
                                },
                                TextColor(Color::WHITE),
                            ));
                            col.spawn((
                                Text::new(def.description),
                                TextFont {
                                    font_size: 13.0,
                                    ..default()
                                },
                                TextColor(Color::srgba(1.0, 1.0, 1.0, 0.5)),
                            ));
                        });

                        // Action button
                        if is_cosmetic && is_maxed && !is_equipped {
                            // Owned but not equipped -> Equip button
                            row.spawn((
                                Button,
                                Node {
                                    width: Val::Px(100.0),
                                    height: Val::Px(36.0),
                                    justify_content: JustifyContent::Center,
                                    align_items: AlignItems::Center,
                                    ..default()
                                },
                                BackgroundColor(Color::srgb(0.2, 0.5, 0.7)),
                                ShopButton::Equip(def.id),
                            ))
                            .with_children(|btn| {
                                btn.spawn((
                                    Text::new("EQUIP"),
                                    TextFont {
                                        font_size: 14.0,
                                        ..default()
                                    },
                                    TextColor(Color::WHITE),
                                ));
                            });
                        } else if is_equipped {
                            // Already equipped
                            row.spawn((
                                Text::new("EQUIPPED"),
                                TextFont {
                                    font_size: 14.0,
                                    ..default()
                                },
                                TextColor(Color::srgb(0.3, 0.8, 0.3)),
                            ));
                        } else if is_maxed {
                            // Gameplay upgrade maxed
                            row.spawn((
                                Text::new("MAX"),
                                TextFont {
                                    font_size: 14.0,
                                    ..default()
                                },
                                TextColor(Color::srgba(1.0, 1.0, 1.0, 0.4)),
                            ));
                        } else {
                            // Can buy
                            let cost = def.costs[current_level as usize];
                            row.spawn((
                                Button,
                                Node {
                                    width: Val::Px(100.0),
                                    height: Val::Px(36.0),
                                    justify_content: JustifyContent::Center,
                                    align_items: AlignItems::Center,
                                    ..default()
                                },
                                BackgroundColor(Color::srgb(0.2, 0.6, 0.2)),
                                ShopButton::Buy(def.id),
                            ))
                            .with_children(|btn| {
                                btn.spawn((
                                    Text::new(format!("{} coins", cost)),
                                    TextFont {
                                        font_size: 14.0,
                                        ..default()
                                    },
                                    TextColor(Color::WHITE),
                                ));
                            });
                        }
                    });
            }

            // Back button
            parent
                .spawn((
                    Button,
                    Node {
                        width: Val::Px(200.0),
                        height: Val::Px(50.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        margin: UiRect::top(Val::Px(15.0)),
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.4, 0.4, 0.4)),
                    ShopButton::Back,
                ))
                .with_children(|btn| {
                    btn.spawn((
                        Text::new("BACK"),
                        TextFont {
                            font_size: 24.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });
        });
}

pub fn handle_shop_buttons(
    interaction_query: Query<(&Interaction, &ShopButton), Changed<Interaction>>,
    mut next_state: ResMut<NextState<GameState>>,
    mut wallet: ResMut<Wallet>,
    mut owned: ResMut<OwnedUpgrades>,
    mut equipped: ResMut<EquippedCosmetics>,
    mut commands: Commands,
    shop_query: Query<Entity, With<ShopUi>>,
) {
    let mut needs_rebuild = false;

    for (interaction, button) in &interaction_query {
        if *interaction != Interaction::Pressed {
            continue;
        }
        match button {
            ShopButton::Back => {
                next_state.set(GameState::Menu);
            }
            ShopButton::Buy(id) => {
                if try_buy_upgrade(&mut wallet, &mut owned, *id) {
                    needs_rebuild = true;
                }
            }
            ShopButton::Equip(id) => {
                let def = super::parts::catalog::find_upgrade(*id);
                if let Some(def) = def {
                    match def.category {
                        UpgradeCategory::PaddleColor => {
                            equipped.paddle_color = Some(*id);
                        }
                        UpgradeCategory::BallTrail => {
                            equipped.ball_trail = Some(*id);
                        }
                        _ => {}
                    }
                    needs_rebuild = true;
                }
            }
        }
    }

    if needs_rebuild {
        for entity in &shop_query {
            commands.entity(entity).despawn();
        }
        commands.insert_resource(ShopDirty);
    }
}

pub fn rebuild_shop_if_dirty(
    mut commands: Commands,
    dirty: Option<Res<ShopDirty>>,
    shop_query: Query<Entity, With<ShopUi>>,
    wallet: Res<Wallet>,
    owned: Res<OwnedUpgrades>,
    equipped: Res<EquippedCosmetics>,
) {
    if dirty.is_none() {
        return;
    }
    commands.remove_resource::<ShopDirty>();
    // Only rebuild if no shop UI exists (was despawned previous frame)
    if shop_query.is_empty() {
        setup_shop(commands, wallet, owned, equipped);
    }
}

pub fn cleanup_shop(mut commands: Commands, query: Query<Entity, With<ShopUi>>) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
    commands.remove_resource::<ShopDirty>();
}

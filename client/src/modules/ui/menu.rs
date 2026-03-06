use bevy::prelude::*;

use crate::config::states::{GameMode, GameState};
use crate::modules::shop::Wallet;
use crate::modules::yandex::PlayerData;

#[derive(Component)]
pub struct MenuUi;

#[derive(Component)]
pub enum MenuButton {
    Play,
    Online,
    Shop,
}

pub fn setup_menu(mut commands: Commands, player_data: Res<PlayerData>, wallet: Res<Wallet>) {
    commands
        .spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                row_gap: Val::Px(25.0),
                ..default()
            },
            BackgroundColor(Color::srgb(0.05, 0.05, 0.1)),
            MenuUi,
        ))
        .with_children(|parent| {
            // Player greeting
            if player_data.loaded && player_data.is_authorized && !player_data.name.is_empty() {
                parent.spawn((
                    Text::new(format!("Hello, {}!", player_data.name)),
                    TextFont {
                        font_size: 20.0,
                        ..default()
                    },
                    TextColor(Color::srgba(1.0, 1.0, 1.0, 0.6)),
                ));
            }

            // Title
            parent.spawn((
                Text::new("PONG"),
                TextFont {
                    font_size: 80.0,
                    ..default()
                },
                TextColor(Color::WHITE),
            ));

            // Play button (Solo vs AI)
            parent
                .spawn((
                    Button,
                    Node {
                        width: Val::Px(250.0),
                        height: Val::Px(65.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.2, 0.6, 0.2)),
                    MenuButton::Play,
                ))
                .with_children(|parent| {
                    parent.spawn((
                        Text::new("PLAY"),
                        TextFont {
                            font_size: 32.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });

            // Online button
            parent
                .spawn((
                    Button,
                    Node {
                        width: Val::Px(250.0),
                        height: Val::Px(65.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.2, 0.4, 0.8)),
                    MenuButton::Online,
                ))
                .with_children(|parent| {
                    parent.spawn((
                        Text::new("ONLINE"),
                        TextFont {
                            font_size: 32.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });

            // Shop button
            parent
                .spawn((
                    Button,
                    Node {
                        width: Val::Px(250.0),
                        height: Val::Px(65.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.6, 0.4, 0.1)),
                    MenuButton::Shop,
                ))
                .with_children(|parent| {
                    parent.spawn((
                        Text::new(format!("SHOP ({})", wallet.coins)),
                        TextFont {
                            font_size: 28.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });
        });
}

pub fn handle_menu_buttons(
    interaction_query: Query<(&Interaction, &MenuButton), Changed<Interaction>>,
    mut next_state: ResMut<NextState<GameState>>,
    mut game_mode: ResMut<GameMode>,
) {
    for (interaction, button) in &interaction_query {
        if *interaction == Interaction::Pressed {
            match button {
                MenuButton::Play => {
                    *game_mode = GameMode::Solo;
                    next_state.set(GameState::Playing);
                }
                MenuButton::Online => {
                    *game_mode = GameMode::Online;
                    next_state.set(GameState::Lobby);
                }
                MenuButton::Shop => {
                    next_state.set(GameState::Shop);
                }
            }
        }
    }
}

pub fn cleanup_menu(mut commands: Commands, query: Query<Entity, With<MenuUi>>) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
}

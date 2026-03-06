use bevy::prelude::*;

use crate::config::states::{GameMode, GameState};
use crate::modules::game::setup::Scoreboard;
use crate::modules::network::client::{MatchResult, NetworkClient};
use crate::modules::shop::Wallet;
use crate::modules::yandex::LeaderboardData;

#[derive(Component)]
pub struct GameOverUi;

#[derive(Component)]
pub enum GameOverButton {
    PlayAgain,
    NewOpponent,
    WatchAd,
    Menu,
}

#[derive(Component)]
pub struct LeaderboardContainer;

pub fn setup_game_over(
    mut commands: Commands,
    scoreboard: Option<Res<Scoreboard>>,
    game_mode: Res<GameMode>,
    match_result: Res<MatchResult>,
    wallet: Res<Wallet>,
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

    let coins_earned = match (&*game_mode, player_won) {
        (GameMode::Online, true) => 25,
        (GameMode::Online, false) => 3,
        (GameMode::Solo, true) => 10,
        (GameMode::Solo, false) => 3,
    };

    let result_text = if player_won { "YOU WIN!" } else { "YOU LOSE" };
    let result_color = if player_won {
        Color::srgb(0.2, 0.8, 0.2)
    } else {
        Color::srgb(0.8, 0.2, 0.2)
    };

    let is_online = *game_mode == GameMode::Online;

    commands
        .spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Percent(100.0),
                flex_direction: FlexDirection::Column,
                align_items: AlignItems::Center,
                justify_content: JustifyContent::Center,
                row_gap: Val::Px(15.0),
                ..default()
            },
            BackgroundColor(Color::srgba(0.0, 0.0, 0.0, 0.85)),
            GameOverUi,
        ))
        .with_children(|parent| {
            parent.spawn((
                Text::new(result_text),
                TextFont {
                    font_size: 60.0,
                    ..default()
                },
                TextColor(result_color),
            ));

            parent.spawn((
                Text::new(format!("{} : {}", left, right)),
                TextFont {
                    font_size: 30.0,
                    ..default()
                },
                TextColor(Color::WHITE),
            ));

            // Coins earned
            parent.spawn((
                Text::new(format!("+{} coins  (total: {})", coins_earned, wallet.coins)),
                TextFont {
                    font_size: 22.0,
                    ..default()
                },
                TextColor(Color::srgb(1.0, 0.84, 0.0)),
            ));

            // Watch Ad button
            parent
                .spawn((
                    Button,
                    Node {
                        width: Val::Px(250.0),
                        height: Val::Px(50.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.7, 0.5, 0.0)),
                    GameOverButton::WatchAd,
                ))
                .with_children(|parent| {
                    parent.spawn((
                        Text::new("WATCH AD +15"),
                        TextFont {
                            font_size: 24.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });

            // Primary action button (mode-dependent)
            if is_online {
                parent
                    .spawn((
                        Button,
                        Node {
                            width: Val::Px(250.0),
                            height: Val::Px(60.0),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.2, 0.4, 0.8)),
                        GameOverButton::NewOpponent,
                    ))
                    .with_children(|parent| {
                        parent.spawn((
                            Text::new("NEW OPPONENT"),
                            TextFont {
                                font_size: 28.0,
                                ..default()
                            },
                            TextColor(Color::WHITE),
                        ));
                    });
            } else {
                parent
                    .spawn((
                        Button,
                        Node {
                            width: Val::Px(250.0),
                            height: Val::Px(60.0),
                            justify_content: JustifyContent::Center,
                            align_items: AlignItems::Center,
                            ..default()
                        },
                        BackgroundColor(Color::srgb(0.2, 0.6, 0.2)),
                        GameOverButton::PlayAgain,
                    ))
                    .with_children(|parent| {
                        parent.spawn((
                            Text::new("PLAY AGAIN"),
                            TextFont {
                                font_size: 28.0,
                                ..default()
                            },
                            TextColor(Color::WHITE),
                        ));
                    });
            }

            // Menu button
            parent
                .spawn((
                    Button,
                    Node {
                        width: Val::Px(250.0),
                        height: Val::Px(60.0),
                        justify_content: JustifyContent::Center,
                        align_items: AlignItems::Center,
                        ..default()
                    },
                    BackgroundColor(Color::srgb(0.4, 0.4, 0.4)),
                    GameOverButton::Menu,
                ))
                .with_children(|parent| {
                    parent.spawn((
                        Text::new("MENU"),
                        TextFont {
                            font_size: 28.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });

            // Leaderboard container (populated dynamically)
            parent.spawn((
                Node {
                    flex_direction: FlexDirection::Column,
                    align_items: AlignItems::Center,
                    row_gap: Val::Px(4.0),
                    margin: UiRect::top(Val::Px(15.0)),
                    ..default()
                },
                LeaderboardContainer,
            ));
        });
}

pub fn handle_game_over_buttons(
    interaction_query: Query<(&Interaction, &GameOverButton), Changed<Interaction>>,
    mut next_state: ResMut<NextState<GameState>>,
    mut net: ResMut<NetworkClient>,
    mut ad_state: ResMut<crate::modules::yandex::ads::AdState>,
) {
    for (interaction, button) in &interaction_query {
        if *interaction == Interaction::Pressed {
            match button {
                GameOverButton::PlayAgain => {
                    next_state.set(GameState::Playing);
                }
                GameOverButton::NewOpponent => {
                    net.disconnect();
                    next_state.set(GameState::Lobby);
                }
                GameOverButton::WatchAd => {
                    if !ad_state.showing {
                        ad_state.showing = true;
                        crate::modules::yandex::parts::bindings::ysdk_show_rewarded_video();
                    }
                }
                GameOverButton::Menu => {
                    net.disconnect();
                    next_state.set(GameState::Menu);
                }
            }
        }
    }
}

pub fn update_leaderboard_display(
    mut commands: Commands,
    lb_data: Res<LeaderboardData>,
    container_query: Query<(Entity, Option<&Children>), With<LeaderboardContainer>>,
) {
    if !lb_data.is_changed() || lb_data.entries.is_empty() {
        return;
    }

    for (container, children) in &container_query {
        // Clear old children
        if let Some(children) = children {
            for child in children.iter() {
                commands.entity(child).despawn();
            }
        }

        // Add title
        let title = commands
            .spawn((
                Text::new("LEADERBOARD"),
                TextFont {
                    font_size: 20.0,
                    ..default()
                },
                TextColor(Color::srgb(0.8, 0.8, 0.2)),
            ))
            .id();
        commands.entity(container).add_child(title);

        // Add entries
        for entry in &lb_data.entries {
            let text = format!("{}. {} — {}", entry.rank, entry.name, entry.score);
            let entry_id = commands
                .spawn((
                    Text::new(text),
                    TextFont {
                        font_size: 16.0,
                        ..default()
                    },
                    TextColor(Color::srgba(1.0, 1.0, 1.0, 0.7)),
                ))
                .id();
            commands.entity(container).add_child(entry_id);
        }
    }
}

pub fn cleanup_game_over(mut commands: Commands, query: Query<Entity, With<GameOverUi>>) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
}

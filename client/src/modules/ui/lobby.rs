use bevy::prelude::*;

use crate::config::states::GameState;

#[derive(Component)]
pub struct LobbyUi;

#[derive(Component)]
pub struct LobbyButton;

pub fn setup_lobby(mut commands: Commands) {
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
            LobbyUi,
        ))
        .with_children(|parent| {
            parent.spawn((
                Text::new("SEARCHING FOR OPPONENT..."),
                TextFont {
                    font_size: 36.0,
                    ..default()
                },
                TextColor(Color::srgba(1.0, 1.0, 1.0, 0.8)),
            ));

            // Cancel button
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
                    BackgroundColor(Color::srgb(0.6, 0.2, 0.2)),
                    LobbyButton,
                ))
                .with_children(|parent| {
                    parent.spawn((
                        Text::new("CANCEL"),
                        TextFont {
                            font_size: 28.0,
                            ..default()
                        },
                        TextColor(Color::WHITE),
                    ));
                });
        });
}

pub fn handle_lobby_buttons(
    interaction_query: Query<&Interaction, (With<LobbyButton>, Changed<Interaction>)>,
    mut next_state: ResMut<NextState<GameState>>,
) {
    for interaction in &interaction_query {
        if *interaction == Interaction::Pressed {
            next_state.set(GameState::Menu);
        }
    }
}

pub fn cleanup_lobby(mut commands: Commands, query: Query<Entity, With<LobbyUi>>) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
}

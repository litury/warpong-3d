use bevy::prelude::*;

use crate::modules::game::setup::Scoreboard;
use crate::modules::shop::Wallet;

#[derive(Component)]
pub struct HudUi;

#[derive(Component)]
pub struct ScoreText;

#[derive(Component)]
pub struct CoinText;

pub fn setup_hud(mut commands: Commands, wallet: Res<Wallet>) {
    commands
        .spawn((
            Node {
                width: Val::Percent(100.0),
                height: Val::Auto,
                justify_content: JustifyContent::SpaceBetween,
                align_items: AlignItems::Start,
                padding: UiRect::all(Val::Px(10.0)),
                position_type: PositionType::Absolute,
                ..default()
            },
            HudUi,
        ))
        .with_children(|parent| {
            // Spacer left
            parent.spawn(Node::default());

            // Score center
            parent.spawn((
                Text::new("0 : 0"),
                TextFont {
                    font_size: 40.0,
                    ..default()
                },
                TextColor(Color::srgba(1.0, 1.0, 1.0, 0.5)),
                ScoreText,
            ));

            // Coins right
            parent.spawn((
                Text::new(format!("{}", wallet.coins)),
                TextFont {
                    font_size: 20.0,
                    ..default()
                },
                TextColor(Color::srgba(1.0, 0.84, 0.0, 0.6)),
                CoinText,
            ));
        });
}

pub fn update_score_text(
    scoreboard: Option<Res<Scoreboard>>,
    mut query: Query<&mut Text, With<ScoreText>>,
) {
    let Some(scoreboard) = scoreboard else { return };
    if !scoreboard.is_changed() {
        return;
    }

    for mut text in &mut query {
        **text = format!("{} : {}", scoreboard.left, scoreboard.right);
    }
}

pub fn update_coin_text(
    wallet: Res<Wallet>,
    mut query: Query<&mut Text, With<CoinText>>,
) {
    if !wallet.is_changed() {
        return;
    }
    for mut text in &mut query {
        **text = format!("{}", wallet.coins);
    }
}

pub fn cleanup_hud(mut commands: Commands, query: Query<Entity, With<HudUi>>) {
    for entity in &query {
        commands.entity(entity).despawn();
    }
}

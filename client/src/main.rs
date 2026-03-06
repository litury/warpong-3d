use bevy::prelude::*;
use bevy::camera::ScalingMode;

mod config;
mod modules;
mod shared;

use config::states::{GameMode, GameState};
use modules::game::GamePlugin;
use modules::network::NetworkPlugin;
use modules::ui::UiPlugin;
use modules::shop::ShopPlugin;
use modules::yandex::YandexPlugin;

fn main() {
    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Pong".to_string(),
                        canvas: Some("#bevy-canvas".to_string()),
                        fit_canvas_to_parent: true,
                        prevent_default_event_handling: true,
                        ..default()
                    }),
                    ..default()
                })
                .set(ImagePlugin::default_nearest()),
        )
        .init_state::<GameState>()
        .init_resource::<GameMode>()
        .add_systems(Startup, setup_camera)
        .add_plugins(GamePlugin)
        .add_plugins(NetworkPlugin)
        .add_plugins(UiPlugin)
        .add_plugins(ShopPlugin)
        .add_plugins(YandexPlugin)
        .run();
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::AutoMin {
                min_width: 800.0,
                min_height: 600.0,
            },
            ..OrthographicProjection::default_2d()
        }),
    ));
}

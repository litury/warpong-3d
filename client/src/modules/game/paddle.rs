use bevy::prelude::*;
use pong_shared::config::*;

use crate::shared::components::*;

pub fn player_input(
    keyboard: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut query: Query<(&mut Transform, &PaddleStats), With<PlayerControlled>>,
) {
    let half_h = ARENA_HEIGHT / 2.0;

    for (mut transform, stats) in &mut query {
        let bound = half_h - stats.height / 2.0 - 5.0;
        let mut direction = 0.0;

        if keyboard.pressed(KeyCode::KeyW) || keyboard.pressed(KeyCode::ArrowUp) {
            direction += 1.0;
        }
        if keyboard.pressed(KeyCode::KeyS) || keyboard.pressed(KeyCode::ArrowDown) {
            direction -= 1.0;
        }

        transform.translation.y += direction * stats.speed * time.delta_secs();
        transform.translation.y = transform.translation.y.clamp(-bound, bound);
    }
}

pub fn touch_input(
    touches: Res<Touches>,
    window_query: Query<&Window>,
    mut query: Query<(&mut Transform, &PaddleStats), With<PlayerControlled>>,
) {
    let half_h = ARENA_HEIGHT / 2.0;

    let Some(touch) = touches.iter().next() else { return };
    let Ok(window) = window_query.single() else { return };

    let window_height = window.height();

    // Convert touch Y (screen space, 0=top) to world Y (-half_h to +half_h)
    let normalized_y = 1.0 - (touch.position().y / window_height);
    let world_y = (normalized_y - 0.5) * ARENA_HEIGHT;

    for (mut transform, stats) in &mut query {
        let bound = half_h - stats.height / 2.0 - 5.0;
        transform.translation.y = world_y.clamp(-bound, bound);
    }
}

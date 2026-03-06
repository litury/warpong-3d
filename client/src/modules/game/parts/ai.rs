use bevy::prelude::*;
use pong_shared::config::*;

use crate::shared::components::*;

pub fn ai_paddle(
    time: Res<Time>,
    ball_query: Query<&Transform, With<Ball>>,
    mut paddle_query: Query<
        (&mut Transform, &PaddleStats),
        (With<Paddle>, With<AiControlled>, Without<Ball>),
    >,
) {
    let Ok(ball_transform) = ball_query.single() else {
        return;
    };

    let half_h = ARENA_HEIGHT / 2.0;

    for (mut paddle_transform, stats) in &mut paddle_query {
        let bound = half_h - stats.height / 2.0 - 5.0;
        let ai_speed = stats.speed * 0.85;
        let diff = ball_transform.translation.y - paddle_transform.translation.y;

        let dead_zone = 10.0;
        if diff.abs() > dead_zone {
            let direction = diff.signum();
            paddle_transform.translation.y += direction * ai_speed * time.delta_secs();
            paddle_transform.translation.y = paddle_transform.translation.y.clamp(-bound, bound);
        }
    }
}

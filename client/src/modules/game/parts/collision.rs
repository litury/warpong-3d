use bevy::prelude::*;
use pong_shared::config::*;

use crate::shared::components::*;
use crate::shared::events::CollisionEvent;

use super::physics;

pub fn check_collisions(
    mut ball_query: Query<(&mut Transform, &mut Velocity), With<Ball>>,
    paddle_query: Query<(&Transform, &PaddleStats), (With<Paddle>, Without<Ball>)>,
    mut collision_events: MessageWriter<CollisionEvent>,
) {
    let half_h = ARENA_HEIGHT / 2.0;
    let wall_thickness = 5.0;

    for (mut ball_transform, mut ball_velocity) in &mut ball_query {
        let ball_pos = ball_transform.translation;

        // Wall collisions (top/bottom)
        if ball_pos.y + BALL_SIZE / 2.0 > half_h - wall_thickness {
            ball_velocity.0.y = -ball_velocity.0.y.abs();
            ball_transform.translation.y = half_h - wall_thickness - BALL_SIZE / 2.0;
            collision_events.write(CollisionEvent);
        } else if ball_pos.y - BALL_SIZE / 2.0 < -half_h + wall_thickness {
            ball_velocity.0.y = ball_velocity.0.y.abs();
            ball_transform.translation.y = -half_h + wall_thickness + BALL_SIZE / 2.0;
            collision_events.write(CollisionEvent);
        }

        // Paddle collisions
        for (paddle_transform, paddle_stats) in &paddle_query {
            let paddle_pos = paddle_transform.translation;
            let paddle_h = paddle_stats.height;

            if aabb_collision(ball_pos, BALL_SIZE, paddle_pos, PADDLE_WIDTH, paddle_h) {
                let hit_offset = (ball_pos.y - paddle_pos.y) / (paddle_h / 2.0);

                physics::apply_paddle_bounce(&mut ball_velocity, hit_offset, paddle_pos.x > 0.0);

                // Push ball out of paddle
                if paddle_pos.x < 0.0 {
                    ball_transform.translation.x =
                        paddle_pos.x + PADDLE_WIDTH / 2.0 + BALL_SIZE / 2.0 + 1.0;
                } else {
                    ball_transform.translation.x =
                        paddle_pos.x - PADDLE_WIDTH / 2.0 - BALL_SIZE / 2.0 - 1.0;
                }

                collision_events.write(CollisionEvent);
            }
        }
    }
}

fn aabb_collision(
    a_pos: Vec3,
    a_size: f32,
    b_pos: Vec3,
    b_width: f32,
    b_height: f32,
) -> bool {
    let a_half = a_size / 2.0;
    let b_half_w = b_width / 2.0;
    let b_half_h = b_height / 2.0;

    a_pos.x - a_half < b_pos.x + b_half_w
        && a_pos.x + a_half > b_pos.x - b_half_w
        && a_pos.y - a_half < b_pos.y + b_half_h
        && a_pos.y + a_half > b_pos.y - b_half_h
}

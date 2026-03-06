use pong_shared::config::*;

use crate::shared::components::Velocity;

pub fn apply_paddle_bounce(velocity: &mut Velocity, hit_offset: f32, is_right_paddle: bool) {
    let speed = velocity.0.length().min(BALL_MAX_SPEED) + BALL_SPEED_INCREMENT;
    let angle = hit_offset.clamp(-1.0, 1.0) * std::f32::consts::FRAC_PI_4;

    let dir_x = if is_right_paddle { -1.0 } else { 1.0 };

    velocity.0.x = dir_x * speed * angle.cos();
    velocity.0.y = speed * angle.sin();
}

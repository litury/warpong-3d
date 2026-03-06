use bevy::prelude::*;
use pong_shared::config::BALL_SIZE;

use crate::modules::game::setup::GameEntity;
use crate::modules::shop::EquippedCosmetics;
use crate::modules::shop::parts::data::UpgradeId;
use crate::shared::components::Ball;

#[derive(Component)]
pub struct TrailParticle {
    pub lifetime: Timer,
}

pub fn spawn_ball_trail(
    mut commands: Commands,
    cosmetics: Res<EquippedCosmetics>,
    ball_query: Query<&Transform, With<Ball>>,
) {
    let trail = match cosmetics.ball_trail {
        Some(ref t) => t,
        None => return,
    };

    let Ok(ball_tf) = ball_query.single() else {
        return;
    };

    let color = match trail {
        UpgradeId::TrailSimple => Color::srgba(1.0, 1.0, 1.0, 0.5),
        UpgradeId::TrailRainbow => {
            let t = ball_tf.translation.x * 0.01 + ball_tf.translation.y * 0.01;
            let r = (t.sin() * 0.5 + 0.5).clamp(0.0, 1.0);
            let g = ((t + 2.1).sin() * 0.5 + 0.5).clamp(0.0, 1.0);
            let b = ((t + 4.2).sin() * 0.5 + 0.5).clamp(0.0, 1.0);
            Color::srgba(r, g, b, 0.6)
        }
        _ => return,
    };

    commands.spawn((
        Sprite {
            color,
            custom_size: Some(Vec2::new(BALL_SIZE * 0.6, BALL_SIZE * 0.6)),
            ..default()
        },
        Transform::from_translation(ball_tf.translation.truncate().extend(-0.5)),
        TrailParticle {
            lifetime: Timer::from_seconds(0.3, TimerMode::Once),
        },
        GameEntity,
    ));
}

pub fn fade_trail_particles(
    mut commands: Commands,
    time: Res<Time>,
    mut query: Query<(Entity, &mut TrailParticle, &mut Sprite)>,
) {
    for (entity, mut particle, mut sprite) in &mut query {
        particle.lifetime.tick(time.delta());
        let frac = particle.lifetime.elapsed().as_secs_f32()
            / particle.lifetime.duration().as_secs_f32();
        let alpha = (1.0 - frac).max(0.0);
        sprite.color = sprite.color.with_alpha(alpha);
        if frac >= 1.0 {
            commands.entity(entity).despawn();
        }
    }
}

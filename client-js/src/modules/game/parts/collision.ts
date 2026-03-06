// Port of client/src/modules/game/parts/collision.rs

export function aabbCollision(
  ax: number, ay: number, aSize: number,
  bx: number, by: number, bWidth: number, bHeight: number,
): boolean {
  const aHalf = aSize / 2;
  const bHalfW = bWidth / 2;
  const bHalfH = bHeight / 2;

  return (
    ax - aHalf < bx + bHalfW &&
    ax + aHalf > bx - bHalfW &&
    ay - aHalf < by + bHalfH &&
    ay + aHalf > by - bHalfH
  );
}

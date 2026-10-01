// Reference game for the arcade kit (see kit.js for the full ctx/input API).
// Basil runs forward; dodge the rocks by moving between three lanes.
export default function create(ctx) {
  const { THREE, scene, box, group, models } = ctx;
  scene.background = new THREE.Color('#bdeeff');

  const ground = group(scene);
  box(ground, 12, 1, 400, '#a9e35b', 0, -1, -190);
  const player = models.makePlayer();
  scene.add(player.root);

  const rocks = [];
  for (let i = 0; i < 30; i++) {
    const r = group(scene);
    box(r, 0.9, 0.7, 0.9, '#9aa0a8', 0, 0, 0);
    rocks.push(r);
  }

  let lane = 0;
  let z = 0;
  let speed = 8;

  function place() {
    rocks.forEach((r, i) => r.position.set((Math.floor(Math.random() * 3) - 1) * 2, 0, -15 - i * 9));
  }

  return {
    reset() {
      lane = 0;
      z = 0;
      speed = 8;
      place();
    },
    update(dt, input) {
      if (input.pressed.has('left')) lane = Math.max(-1, lane - 1);
      if (input.pressed.has('right')) lane = Math.min(1, lane + 1);
      speed += dt * 0.3;
      z -= speed * dt;
      player.root.position.x = ctx.lerp(player.root.position.x, lane * 2, Math.min(1, dt * 12));
      player.root.position.z = z;
      ctx.addScore(speed * dt * 10);
      ctx.setMeter((-z % 200) / 200, 'Next checkpoint');
      for (const r of rocks) {
        if (r.position.z > z + 6) r.position.z -= 30 * 9;
        if (Math.abs(r.position.z - z) < 0.6 && Math.abs(r.position.x - player.root.position.x) < 0.8) {
          ctx.emit(['#9aa0a8', '#ffffff'], player.root.position, 20);
          ctx.shake(0.4);
          ctx.end('Bonk.');
        }
      }
      ctx.camera.position.set(player.root.position.x * 0.5, 5, z + 8);
      ctx.camera.lookAt(player.root.position.x * 0.5, 0.5, z - 6);
      ctx.followSun(player.root.position);
    },
    idle(dt, t) {
      ctx.camera.position.set(Math.sin(t * 0.3) * 2, 5, z + 8);
      ctx.camera.lookAt(0, 0.5, z - 6);
    },
  };
}

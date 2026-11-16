// Blackwater Docks: a night container port, 40 x 30 m. Two bomb sites on the
// defenders' side (A Crane Bay north-west, B Container Stack north-east),
// three lanes between the spawns (A-long west, Mid centre, B-cut east), and
// containers, crates and a ship hull for corners and sightlines. Every solid
// is both a collider (Box3) and a shootable surface. The waypoint graph is
// the bots' map: nodes at lane junctions and site entries, edges along lanes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const CONTAINER_COLORS = ['#b5502a', '#2e6f6a', '#5a6b7d', '#8a6d2f'];

function letterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#10151c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createDock(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.55 : 0.9,
      metalness: 0.08,
    });
  }
  const containerMaterials = CONTAINER_COLORS.map((c) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(c), roughness: 0.75, metalness: 0.25,
  }));

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function container(x, z, yaw, colorIndex, stacked) {
    const mat = containerMaterials[colorIndex % containerMaterials.length];
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.5), mat);
    mesh.position.set(x, 1.3, z);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    if (stacked) {
      const top = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.5), containerMaterials[(colorIndex + 1) % containerMaterials.length]);
      top.position.set(x, 3.9, z);
      top.rotation.y = yaw;
      top.castShadow = true;
      top.receiveShadow = true;
      group.add(top);
      colliders.push(new THREE.Box3().setFromObject(top));
      shootables.push(top);
    }
    return mesh;
  }

  // Ground and perimeter: 40 x 30 m, 5 m walls, open sky so moonlight reaches in.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, materials.surface);
  box(0.4, 5, 30.4, -20.2, 2.5, 0, materials.surface);
  box(0.4, 5, 30.4, 20.2, 2.5, 0, materials.surface);
  box(40.4, 5, 0.4, 0, 2.5, -15.2, materials.surface);
  box(40.4, 5, 0.4, 0, 2.5, 15.2, materials.surface);

  // Ship hull along the north edge: a long dark slab with a slanted top, the
  // backdrop behind both sites.
  const hull = box(34, 4.2, 1.6, 0, 2.1, -14.4, materials.hairline);
  hull.rotation.x = 0;
  box(34, 0.5, 2.2, 0, 4.4, -14.2, materials.accent, false);

  // Site A, Crane Bay (north-west): two crane legs and a beam overhead, a
  // container and crates for cover, an orange pad marking the plant zone.
  box(0.9, 9, 0.9, -16.5, 4.5, -11, materials.hairline);
  box(0.9, 9, 0.9, -10.5, 4.5, -11, materials.hairline);
  box(7.2, 0.8, 1, -13.5, 9, -11, materials.hairline);
  box(1.1, 1.4, 0.7, -13.5, 8.0, -11, materials.accent, false);
  container(-15.5, -7.5, 0, 0, false);
  box(1.2, 1.2, 1.2, -11, 0.6, -6.5, materials.hairline);
  box(1.2, 1.2, 1.2, -9.8, 0.6, -6.5, materials.hairline);
  box(1.2, 1.2, 1.2, -10.4, 1.8, -6.5, materials.hairline);

  // Site B, Container Stack (north-east): two stacked containers and a crate
  // maze, a cyan pad marking the plant zone.
  container(13.5, -9.5, 0, 1, true);
  container(13.5, -5.5, Math.PI / 2, 2, false);
  box(1.2, 1.2, 1.2, 9.5, 0.6, -8, materials.hairline);
  box(1.2, 1.2, 1.2, 9.5, 0.6, -6.6, materials.hairline);
  box(2.4, 1.1, 1.2, 17.5, 0.55, -7, materials.hairline);

  // Mid lane cover: a container pair and crates splitting the centre.
  container(-3.5, 1.5, Math.PI / 2, 3, false);
  container(4.5, -1.5, Math.PI / 2, 0, false);
  box(1.2, 1.2, 1.2, -1, 0.6, 5.5, materials.hairline);
  box(1.2, 1.2, 1.2, 1, 0.6, -5.5, materials.hairline);

  // A-long (west) and B-cut (east) lane cover.
  box(1.2, 1.1, 3.6, -17.5, 0.55, 3, materials.hairline);
  box(3.6, 1.1, 1.2, -17.5, 0.55, -3, materials.hairline);
  box(1.2, 1.1, 3.6, 17.5, 0.55, 2, materials.hairline);
  box(1.6, 0.7, 1.6, 17.5, 0.35, 7.5, materials.hairline);
  box(1.6, 0.7, 1.6, -17.5, 0.35, 8.5, materials.hairline);

  // Site pads and letter signs, so a site reads at a glance.
  const padA = box(4.6, 0.06, 4.6, -13.5, 0.03, -8.5, materials.accent, false);
  padA.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.28 });
  const padB = box(4.6, 0.06, 4.6, 13.5, 0.03, -8.5, materials.friendly, false);
  padB.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.friendly), transparent: true, opacity: 0.28 });
  const signA = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: letterTexture('A', '#ff7a1a') }));
  signA.position.set(-13.5, 3.4, -13.2);
  group.add(signA);
  const signB = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: letterTexture('B', '#2ec4b6') }));
  signB.position.set(13.5, 3.4, -13.2);
  group.add(signB);

  // Light: dim blue moonlight with shadows, a cool sky fill, warm floods at
  // the sites and a cyan wash over mid.
  const sky = new THREE.HemisphereLight(new THREE.Color('#2a3a55'), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#bcd2ff'), 1.6);
  moon.position.set(12, 18, 8);
  moon.target.position.set(0, 0, -2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -24;
  moon.shadow.camera.right = 24;
  moon.shadow.camera.top = 20;
  moon.shadow.camera.bottom = -20;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);
  const floodA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 22, 1.8);
  floodA.position.set(-13.5, 6, -8.5);
  scene.add(floodA);
  const floodB = new THREE.PointLight(new THREE.Color(PALETTE.friendly), 50, 22, 1.8);
  floodB.position.set(13.5, 6, -8.5);
  scene.add(floodB);
  const floodMid = new THREE.PointLight(new THREE.Color('#e8e2d4'), 35, 18, 1.8);
  floodMid.position.set(0, 6, 2);
  scene.add(floodMid);

  const sites = {
    A: { center: new THREE.Vector3(-13.5, 0, -8.5), radius: 3.2, letter: 'A' },
    B: { center: new THREE.Vector3(13.5, 0, -8.5), radius: 3.2, letter: 'B' },
  };

  // Waypoint graph: nodes at lane junctions and site entries, edges along lanes.
  const nodes = {
    ravenSpawn: new THREE.Vector3(0, 0, 13),
    bulwarkSpawn: new THREE.Vector3(0, 0, -13),
    midSouth: new THREE.Vector3(0, 0, 7),
    midCenter: new THREE.Vector3(0, 0, 0),
    midNorth: new THREE.Vector3(0, 0, -6),
    aLongSouth: new THREE.Vector3(-17, 0, 8),
    aLongMid: new THREE.Vector3(-17, 0, 0),
    aLongNorth: new THREE.Vector3(-17, 0, -7),
    bCutSouth: new THREE.Vector3(17, 0, 8),
    bCutMid: new THREE.Vector3(17, 0, 0),
    bCutNorth: new THREE.Vector3(17, 0, -7),
    siteA: new THREE.Vector3(-13.5, 0, -8.5),
    siteB: new THREE.Vector3(13.5, 0, -8.5),
    aEntry: new THREE.Vector3(-9, 0, -8),
    bEntry: new THREE.Vector3(9, 0, -8),
  };
  const edges = {
    ravenSpawn: ['midSouth', 'aLongSouth', 'bCutSouth'],
    midSouth: ['ravenSpawn', 'midCenter', 'aLongSouth', 'bCutSouth'],
    midCenter: ['midSouth', 'midNorth', 'aLongMid', 'bCutMid'],
    midNorth: ['midCenter', 'bulwarkSpawn', 'aEntry', 'bEntry'],
    bulwarkSpawn: ['midNorth', 'aLongNorth', 'bCutNorth'],
    aLongSouth: ['ravenSpawn', 'midSouth', 'aLongMid'],
    aLongMid: ['aLongSouth', 'aLongNorth', 'midCenter'],
    aLongNorth: ['aLongMid', 'bulwarkSpawn', 'siteA'],
    bCutSouth: ['ravenSpawn', 'midSouth', 'bCutMid'],
    bCutMid: ['bCutSouth', 'bCutNorth', 'midCenter'],
    bCutNorth: ['bCutMid', 'bulwarkSpawn', 'siteB'],
    siteA: ['aLongNorth', 'aEntry'],
    siteB: ['bCutNorth', 'bEntry'],
    aEntry: ['midNorth', 'siteA'],
    bEntry: ['midNorth', 'siteB'],
  };

  return { colliders, shootables, group, sites, nodes, edges };
}

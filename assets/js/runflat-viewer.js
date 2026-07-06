/* THE TOOTA GROUP — interactive 3D RunFlat viewer (runflats.html)
   Drag to rotate, scroll/pinch to zoom, slider to explode. */
import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';

const host = document.getElementById('rf3d');
if (host) {
  host.textContent = '';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141c);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(3.4, 1.6, 4.6);

  /* lights */
  scene.add(new THREE.HemisphereLight(0x9aa4b5, 0x0b0e13, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const warm = new THREE.DirectionalLight(0xd8a94a, 0.7);
  warm.position.set(-5, 2, -4);
  scene.add(warm);
  const fill = new THREE.DirectionalLight(0x8fc8d8, 0.5);
  fill.position.set(-3, 1, 5);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.85;
  floor.receiveShadow = true;
  scene.add(floor);

  /* materials */
  const steel = new THREE.MeshStandardMaterial({ color: 0x99a1ac, metalness: 0.85, roughness: 0.35 });
  const steelDark = new THREE.MeshStandardMaterial({ color: 0x394254, metalness: 0.8, roughness: 0.45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2493b8, metalness: 0.15, roughness: 0.38 });

  const cast = m => { m.castShadow = true; return m; };
  const group = new THREE.Group();
  scene.add(group);

  /* rim */
  const barrel = cast(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.56, 72, 1, true), steel));
  barrel.rotation.x = Math.PI / 2;
  group.add(barrel);
  for (const z of [-0.29, 0.29]) {
    const fl = cast(new THREE.Mesh(new THREE.TorusGeometry(1.03, 0.05, 20, 72), steel));
    fl.position.z = z;
    group.add(fl);
  }
  const disc = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.985, 0.985, 0.07, 72), steelDark));
  disc.rotation.x = Math.PI / 2;
  disc.position.z = 0.12;
  group.add(disc);
  const hub = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 48), steel));
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.14;
  group.add(hub);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const lug = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), steel));
    lug.rotation.x = Math.PI / 2;
    lug.position.set(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0.18);
    group.add(lug);
  }

  /* blue 3-piece runflat */
  const HALF = 56 * Math.PI / 180;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 1.44, -HALF, HALF, false);
  shape.absarc(0, 0, 1.03, HALF, -HALF, true);
  const segGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 48 });
  segGeo.translate(0, 0, -0.21);

  const segs = [-30, 90, 210].map(deg => {
    const mid = deg * Math.PI / 180;
    const m = cast(new THREE.Mesh(segGeo, blue));
    m.rotation.z = mid;
    group.add(m);
    return { mesh: m, mid };
  });

  /* joint bolts */
  const boltProto = (() => {
    const g = new THREE.Group();
    const shaft = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 24), steel));
    const head = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 6), steel));
    head.position.y = 0.2;
    const nut = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 6), steel));
    nut.position.y = -0.2;
    g.add(shaft, head, nut);
    return g;
  })();
  const bolts = [30, 150, 270].map(deg => {
    const a = deg * Math.PI / 180;
    const b = boltProto.clone(true);
    b.rotation.z = a;
    b.position.set(Math.cos(a) * 1.23, Math.sin(a) * 1.23, 0);
    group.add(b);
    return { grp: b, a };
  });

  /* controls */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 2.2;
  controls.maxDistance = 10;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  /* explode slider */
  let explode = 0;
  const slider = document.getElementById('rf3d-explode');
  if (slider) slider.addEventListener('input', () => { explode = slider.value / 100; });

  function layout() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', layout);
  layout();

  renderer.setAnimationLoop(() => {
    segs.forEach(s => {
      const off = explode * 0.9;
      s.mesh.position.set(Math.cos(s.mid) * off, Math.sin(s.mid) * off, 0);
    });
    bolts.forEach(b => { b.grp.position.z = explode * 1.1; });
    controls.update();
    renderer.render(scene, camera);
  });
}

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function getPartColor(meshName) {
  const match = /^mesh(\d+)$/.exec(meshName || "");
  const index = match ? Number(match[1]) : null;

  if (index >= 302 && index <= 304) return "#f59e0b";
  if (index >= 202 && index <= 204) return "#64748b";
  if (index === 78 || index === 81) return "#22c55e";
  return "#3b82f6";
}

function getPartKind(meshName) {
  const match = /^mesh(\d+)$/.exec(meshName || "");
  const index = match ? Number(match[1]) : null;

  if (index >= 302 && index <= 304) return "core";
  if (index >= 202 && index <= 204) return "cladding";
  if (index === 78 || index === 81) return "moderator";
  return "breeder";
}

function colorModel(model) {
  model.traverse((object) => {
    if (!object.isMesh) return;

    const material = object.material?.clone();
    if (!material || !("color" in material)) return;

    material.color.set(getPartColor(object.name));
    material.roughness = 0.62;
    material.metalness = 0.08;
    object.material = material;
    object.userData.baseOpacity = material.opacity;
    object.userData.partKind = getPartKind(object.name);
  });
}

function setModelSimulationView(enabled) {
  scene.traverse((object) => {
    if (object.userData.isStructureOutline) {
      object.visible = enabled;
      return;
    }

    if (!object.isMesh || !object.userData.partKind) return;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;

      if (!enabled) {
        material.opacity = object.userData.baseOpacity ?? 1;
        material.transparent = material.opacity < 1;
        material.depthWrite = true;
        continue;
      }

      material.transparent = true;
      material.depthWrite = false;
      material.side = THREE.DoubleSide;

      const xray = simulation.guideActive ? 0.9 : simulation.settings.xrayView;
      if (object.userData.partKind === "cladding") material.opacity = THREE.MathUtils.lerp(0.04, 0.16, 1 - xray);
      else if (object.userData.partKind === "moderator") material.opacity = THREE.MathUtils.lerp(0.2, 0.56, 1 - xray);
      else if (object.userData.partKind === "breeder") material.opacity = THREE.MathUtils.lerp(0.015, 0.1, 1 - xray);
      else material.opacity = THREE.MathUtils.lerp(0.26, 0.72, 1 - xray);
    }
  });
}

function addStructureOutlines(model) {
  model.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;

    const edges = new THREE.EdgesGeometry(object.geometry, 22);
    const material = new THREE.LineBasicMaterial({
      color: getPartColor(object.name),
      transparent: true,
      opacity: object.userData.partKind === "breeder" ? 0.28 : 0.44,
      depthWrite: false,
    });
    const outline = new THREE.LineSegments(edges, material);
    outline.userData.isStructureOutline = true;
    outline.visible = false;
    object.add(outline);
  });
}

function createRodPreview(model) {
  rodPreviewLayer.clear();
  if (!model) return;

  const { center, radius, height } = simulation.geometry;
  const previewRadius = radius;
  const previewLength = height * 96;
  const extensionCenters = [
    center.y - height * 48.5,
    center.y + height * 48.5,
  ];
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0xb7c0cc,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shellGeometry = new THREE.CylinderGeometry(previewRadius, previewRadius, previewLength, 96, 1, true);
  for (const y of extensionCenters) {
    const shell = new THREE.Mesh(shellGeometry, shellMaterial.clone());
    shell.position.set(center.x, y, center.z);
    rodPreviewLayer.add(shell);
  }

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  for (const y of extensionCenters) {
    const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.1, radius * 0.1, previewLength, 18), coreMaterial.clone());
    core.position.set(center.x, y, center.z);
    rodPreviewLayer.add(core);
  }

  const bladeMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b82f6,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i += 1) {
    const angle = (Math.PI * 2 * i) / BLADE_COUNT;
    for (const y of extensionCenters) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.72, previewLength, radius * 0.026), bladeMaterial.clone());
      blade.position.set(
        center.x + Math.cos(angle) * radius * 0.38,
        y,
        center.z + Math.sin(angle) * radius * 0.38,
      );
      blade.rotation.y = -angle;
      rodPreviewLayer.add(blade);
    }
  }

  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0xdbeafe,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });

  for (let i = -96; i <= 96; i += 24) {
    if (Math.abs(i) < 12) continue;
    const points = [];
    for (let j = 0; j <= 80; j += 1) {
      const angle = (Math.PI * 2 * j) / 80;
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * previewRadius,
        center.y + i * height,
        center.z + Math.sin(angle) * previewRadius,
      ));
    }
    rodPreviewLayer.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial));
  }
}

function setRodPreviewVisible(visible) {
  rodPreviewLayer.visible = visible;
}

function createReactorEnvironment() {
  reactorEnvLayer.clear();
  const { center, radius, height } = simulation.geometry;
  const channelRadius = radius * 1.32;
  const channelLength = height * 10;
  const channelMaterial = new THREE.MeshBasicMaterial({
    color: 0x8ecbff,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const channel = new THREE.Mesh(new THREE.CylinderGeometry(channelRadius, channelRadius, channelLength, 96, 1, true), channelMaterial);
  channel.position.copy(center);
  reactorEnvLayer.add(channel);

  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0xc7d2fe,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (let i = -4; i <= 4; i += 1) {
    const points = [];
    for (let j = 0; j <= 96; j += 1) {
      const angle = (Math.PI * 2 * j) / 96;
      points.push(new THREE.Vector3(
        center.x + Math.cos(angle) * channelRadius,
        center.y + i * height,
        center.z + Math.sin(angle) * channelRadius,
      ));
    }
    reactorEnvLayer.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial));
  }

  const fluxMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  for (let i = 0; i < 18; i += 1) {
    const angle = (Math.PI * 2 * i) / 18;
    const y = center.y + ((i % 6) - 2.5) * height * 0.75;
    const outer = radius * 2.25;
    const inner = radius * 1.42;
    const points = [
      new THREE.Vector3(center.x + Math.cos(angle) * outer, y, center.z + Math.sin(angle) * outer),
      new THREE.Vector3(center.x + Math.cos(angle) * inner, y, center.z + Math.sin(angle) * inner),
    ];
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), fluxMaterial.clone());
    ray.userData.isFluxRay = true;
    ray.userData.baseOpacity = 0.1 + (i % 3) * 0.04;
    reactorEnvLayer.add(ray);
  }
}

function setReactorEnvironmentVisible(visible) {
  reactorEnvLayer.visible = visible;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060606);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 2000);
camera.position.set(2.2, 1.4, 2.2);
const minimapCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotateSpeed = 0.45;

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x202020, 1.1);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(3, 5, 2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
fillLight.position.set(-3, 2, -4);
scene.add(fillLight);

const simToggle = document.querySelector("#sim-toggle");
const simPanel = document.querySelector("#sim-panel");
const simStartButton = document.querySelector("#sim-start");
const simGuideButton = document.querySelector("#sim-guide");
const simPauseButton = document.querySelector("#sim-pause");
const simResetButton = document.querySelector("#sim-reset");
const simStatus = document.querySelector("#sim-status");
const cameraWideButton = document.querySelector("#camera-wide");
const cameraCoreButton = document.querySelector("#camera-core");
const cameraFlowButton = document.querySelector("#camera-flow");
const guideCard = document.querySelector("#guide-card");
const guideTitle = document.querySelector("#guide-title");
const guideText = document.querySelector("#guide-text");
const minimapFrame = document.querySelector("#minimap-frame");
const settingRodPreview = document.querySelector("#setting-rod-preview");
const settingReactorEnv = document.querySelector("#setting-reactor-env");
const settingAutoRotate = document.querySelector("#setting-auto-rotate");
const settingAutoPan = document.querySelector("#setting-auto-pan");
const settingMinimap = document.querySelector("#setting-minimap");

const simLayer = new THREE.Group();
scene.add(simLayer);

const rodPreviewLayer = new THREE.Group();
rodPreviewLayer.visible = false;
scene.add(rodPreviewLayer);

const reactorEnvLayer = new THREE.Group();
reactorEnvLayer.visible = false;
scene.add(reactorEnvLayer);

const simulation = {
  running: false,
  ready: false,
  model: null,
  guideActive: false,
  guideComplete: false,
  guideNeutron: null,
  guideTrails: [],
  guideStage: "idle",
  guideWaiting: false,
  guideAdvanceQueued: false,
  guideCapturePoint: new THREE.Vector3(),
  elapsed: 0,
  uiCarry: 0,
  spawnCarry: 0,
  ambientCarry: 0,
  virtualCarry: 0,
  cameraPanTime: 0,
  cameraPanOffset: new THREE.Vector3(),
  neutrons: [],
  products: [],
  totals: {
    neutrons: 0,
    thermalized: 0,
    captured: 0,
    tritium: 0,
    helium: 0,
  },
  geometry: {
    center: new THREE.Vector3(),
    radius: 1,
    height: 1,
  },
  settings: {
    fluxRate: 90000,
    visibleRate: 9,
    captureLikelihood: 1,
    dwellScale: 1,
    xrayView: 0.65,
    autoRotate: false,
    autoPan: false,
    minimap: false,
  },
};

const REPRESENTED_NEUTRONS = 12000;
const MAX_VISIBLE_NEUTRONS = 96;
const BLADE_COUNT = 6;

const neutronFastMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const neutronSlowMaterial = new THREE.MeshBasicMaterial({ color: 0xff9f1c });
const tritiumMaterial = new THREE.MeshBasicMaterial({ color: 0x39ffb3, transparent: true });
const heliumMaterial = new THREE.MeshBasicMaterial({ color: 0x8ecbff, transparent: true });
const trailFastMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
const trailSlowMaterial = new THREE.LineBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.58 });
const guideTrailMaterial = new THREE.LineBasicMaterial({ color: 0xfff7c2, transparent: true, opacity: 0.9, depthTest: false });
const GUIDE_TRAIL_MAX_POINTS = 180;
const GUIDE_TRAIL_DOT_COUNT = 34;
const captureFlashMaterial = new THREE.MeshBasicMaterial({
  color: 0xfff2a8,
  transparent: true,
  opacity: 0.58,
  side: THREE.DoubleSide,
});
const moderationFlashMaterial = new THREE.MeshBasicMaterial({
  color: 0xff9f1c,
  transparent: true,
  opacity: 0.38,
  side: THREE.DoubleSide,
});

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(canvas);
}

const glowTexture = createGlowTexture();

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function updateSimulationUi() {
  simStartButton.disabled = simulation.running || !simulation.ready;
  simGuideButton.disabled = !simulation.ready || (simulation.running && !simulation.guideActive);
  simPauseButton.disabled = !simulation.running;

  if (!simulation.ready) {
    simStatus.textContent = "Loading TPM model...";
  } else if (simulation.guideActive) {
    simStatus.textContent = simulation.guideWaiting
      ? "Guide paused. Click Next to advance the neutron to the next phase."
      : "Guide running. Watch the representative neutron move through this phase.";
  } else if (simulation.guideComplete) {
    simStatus.textContent = "Single neutron guide complete: the neutron captured in the breeder matrix and produced retained tritium/helium.";
  } else if (simulation.running) {
    simStatus.textContent = "Representative neutrons thermalise in the graphite matrix, capture on Li-6 breeder blades, and leave retained tritium/helium products.";
  } else {
    simStatus.textContent = "Simulation paused. Start to inject reactor neutrons into the TPM.";
  }

  simGuideButton.textContent = simulation.guideActive ? "Next" : "Guide";
}

function setGuideInfo(title, text, open = true) {
  guideTitle.textContent = title;
  guideText.textContent = text;
  guideCard.dataset.open = String(open);
}

function setSimulationReady(box) {
  const size = box.getSize(new THREE.Vector3());
  box.getCenter(simulation.geometry.center);
  simulation.geometry.radius = Math.max(size.x, size.z) * 0.48;
  simulation.geometry.height = size.y || size.length();
  updateMinimapCamera();
  simulation.ready = true;
  updateSimulationUi();
}

function updateMinimapCamera() {
  const { center, radius, height } = simulation.geometry;
  const viewRadius = radius * 1.35;
  minimapCamera.left = -viewRadius;
  minimapCamera.right = viewRadius;
  minimapCamera.top = viewRadius;
  minimapCamera.bottom = -viewRadius;
  minimapCamera.near = 0.01;
  minimapCamera.far = Math.max(height * 4, radius * 8);
  minimapCamera.position.set(center.x, center.y + height * 2, center.z);
  minimapCamera.up.set(0, 0, -1);
  minimapCamera.lookAt(center);
  minimapCamera.updateProjectionMatrix();
}

function createParticle(radius, material) {
  const geometry = new THREE.SphereGeometry(radius, 12, 8);
  const mesh = new THREE.Mesh(geometry, material);
  simLayer.add(mesh);
  return mesh;
}

function addGlow(mesh, color, size, opacity) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  sprite.userData.baseSize = size;
  mesh.add(sprite);
  return sprite;
}

function setGlow(mesh, color, size, opacity) {
  if (!mesh.userData.glow) return;
  mesh.userData.glow.material.color.set(color);
  mesh.userData.glow.material.opacity = opacity;
  mesh.userData.glow.material.depthTest = false;
  mesh.userData.glow.renderOrder = 21;
  mesh.userData.glow.scale.setScalar(size);
}

function setParticleOpacity(mesh, opacity) {
  mesh.material.opacity = opacity;
  for (const child of mesh.children) {
    if (child.material) child.material.opacity = opacity * 0.75;
  }
}

function createTrail(material) {
  const geometry = new THREE.BufferGeometry();
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 18;
  simLayer.add(line);
  return line;
}

function createGuideTrailMaterial(color = 0xfff7c2) {
  const material = guideTrailMaterial.clone();
  material.color.set(color);
  material.opacity = 0.95;
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

function setTrailPositions(particle) {
  const points = particle.trail.length > 1 ? particle.trail : [particle.mesh.position, particle.mesh.position];
  particle.trailLine.geometry.setFromPoints(points);
  particle.trailLine.geometry.computeBoundingSphere();
  updateGuideTrailDots(particle);
}

function createGuideTrailDots(radius) {
  const dots = [];

  for (let i = 0; i < GUIDE_TRAIL_DOT_COUNT; i += 1) {
    const geometry = new THREE.SphereGeometry(radius * 0.008, 8, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0xfff7c2,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const dot = new THREE.Mesh(geometry, material);
    dot.frustumCulled = false;
    dot.renderOrder = 18;
    dot.visible = false;
    simLayer.add(dot);
    dots.push(dot);
  }

  return dots;
}

function keepGuideTrailObject(object, life = 2.4) {
  object.userData.fadeBaseOpacity = object.material?.opacity ?? 1;
  simulation.guideTrails.push({
    object,
    life,
    maxLife: life,
  });
}

function updateGuideTrailDots(particle) {
  if (!particle.guideTrailDots) return;

  const colour = particle.moderated ? 0xff9f1c : 0xfff7c2;
  const points = particle.trail;
  const latestIndex = points.length - 1;

  for (let i = 0; i < particle.guideTrailDots.length; i += 1) {
    const dot = particle.guideTrailDots[i];
    const trailIndex = latestIndex - i * 3;
    if (trailIndex < 0) {
      dot.visible = false;
      continue;
    }

    const age = i / particle.guideTrailDots.length;
    dot.position.copy(points[trailIndex]);
    dot.material.color.set(colour);
    dot.material.opacity = (1 - age) * 0.62;
    dot.scale.setScalar(1 - age * 0.55);
    dot.visible = true;
  }
}

function pushTrailPoint(neutron, force = false) {
  const position = neutron.mesh.position.clone();
  const lastPoint = neutron.trail[neutron.trail.length - 1];
  const minDistance = simulation.geometry.radius * (neutron.guide ? 0.002 : 0.012);

  if (force || !lastPoint || lastPoint.distanceToSquared(position) > minDistance * minDistance) {
    neutron.trail.push(position);
  }

  const maxPoints = neutron.guide ? GUIDE_TRAIL_MAX_POINTS : 18;
  while (neutron.trail.length > maxPoints) neutron.trail.shift();
  setTrailPositions(neutron);
}

function createNeutron({ guide = false } = {}) {
  const { center, radius, height } = simulation.geometry;
  const angle = guide ? Math.PI * 0.18 : Math.random() * Math.PI * 2;
  const y = guide ? center.y + height * 0.08 : center.y + randomBetween(-height * 0.42, height * 0.42);
  const startRadius = guide ? radius * 2.45 : radius * randomBetween(1.45, 1.75);
  const entryRadius = guide ? radius * 1.08 : radius * randomBetween(0.52, 0.68);
  const entryAngle = guide ? angle : angle + randomBetween(-0.18, 0.18);

  const start = new THREE.Vector3(
    center.x + Math.cos(angle) * startRadius,
    y,
    center.z + Math.sin(angle) * startRadius,
  );
  const entry = new THREE.Vector3(
    center.x + Math.cos(entryAngle) * entryRadius,
    y + (guide ? 0 : randomBetween(-height * 0.04, height * 0.04)),
    center.z + Math.sin(entryAngle) * entryRadius,
  );

  const mesh = createParticle(radius * (guide ? 0.022 : 0.014), neutronFastMaterial);
  if (guide) {
    mesh.material = neutronFastMaterial.clone();
    mesh.material.depthTest = false;
    mesh.material.depthWrite = false;
    mesh.renderOrder = 20;
  }
  mesh.userData.glow = addGlow(mesh, 0xffffff, radius * (guide ? 0.24 : 0.085), guide ? 0.95 : 0.36);
  if (guide) {
    mesh.userData.glow.material.depthTest = false;
    mesh.userData.glow.renderOrder = 21;
  }
  const trailLine = createTrail(guide ? createGuideTrailMaterial() : trailFastMaterial);
  if (guide) trailLine.renderOrder = 19;
  mesh.position.copy(start);

  return {
    mesh,
    trailLine,
    guideTrailDots: guide ? createGuideTrailDots(radius) : null,
    trail: [start.clone()],
    velocity: entry.clone().sub(start).normalize().multiplyScalar(radius * (guide ? 0.26 : randomBetween(1.35, 1.7))),
    target: guide ? entry.clone() : null,
    scatterTimer: 0.04,
    captureTimer: randomBetween(1.3, 2.4) * simulation.settings.dwellScale,
    age: 0,
    matrixTime: 0,
    moderated: false,
    enteringMatrix: false,
    guide,
  };
}

function spawnReactionProducts(position) {
  simulation.totals.captured += REPRESENTED_NEUTRONS;
  simulation.totals.tritium += REPRESENTED_NEUTRONS;
  simulation.totals.helium += REPRESENTED_NEUTRONS;

  const { radius } = simulation.geometry;
  const productOffset = radius * 0.035;
  const flash = new THREE.Mesh(new THREE.RingGeometry(radius * 0.026, radius * 0.078, 36), captureFlashMaterial.clone());
  flash.position.copy(position);
  flash.lookAt(camera.position);
  simLayer.add(flash);
  simulation.products.push({
    mesh: flash,
    retainedAt: position.clone(),
    life: 0.85,
    maxLife: 0.85,
    isFlash: true,
  });

  const products = [
    { kind: "tritium", material: tritiumMaterial, offset: new THREE.Vector3(productOffset, 0, 0) },
    { kind: "helium", material: heliumMaterial, offset: new THREE.Vector3(-productOffset, 0, 0) },
  ];

  for (const product of products) {
    const material = product.material.clone();
    material.transparent = true;
    material.opacity = 1;
    const mesh = createParticle(radius * (product.kind === "tritium" ? 0.028 : 0.024), material);
    mesh.userData.glow = addGlow(
      mesh,
      product.kind === "tritium" ? 0x39ffb3 : 0x8ecbff,
      radius * (product.kind === "tritium" ? 0.12 : 0.1),
      0.7,
    );
    mesh.position.copy(position).add(product.offset);
    simulation.products.push({
      mesh,
      retainedAt: position.clone(),
      life: product.kind === "tritium" ? 3.0 : 2.6,
      maxLife: product.kind === "tritium" ? 3.0 : 2.6,
    });
  }

  for (let i = 0; i < 2; i += 1) {
    const material = captureFlashMaterial.clone();
    material.opacity = 0.34;
    const spark = createParticle(radius * 0.006, material);
    const offset = new THREE.Vector3(randomBetween(-1, 1), randomBetween(-0.35, 0.35), randomBetween(-1, 1))
      .normalize()
      .multiplyScalar(radius * randomBetween(0.02, 0.065));
    spark.position.copy(position).add(offset);
    simulation.products.push({
      mesh: spark,
      retainedAt: position.clone(),
      life: randomBetween(0.28, 0.5),
      maxLife: 0.5,
    });
  }
}

function removeParticle(particle, { keepTrail = false } = {}) {
  simLayer.remove(particle.mesh);
  for (const child of particle.mesh.children) {
    if (child.material) child.material.dispose();
  }
  particle.mesh.geometry.dispose();
  if (!keepTrail) {
    simLayer.remove(particle.trailLine);
    particle.trailLine.geometry.dispose();
    if (particle.guideTrailDots) {
      for (const dot of particle.guideTrailDots) {
        simLayer.remove(dot);
        dot.material.dispose();
      }
      particle.guideTrailDots[0]?.geometry.dispose();
    }
  } else {
    keepGuideTrailObject(particle.trailLine);
    if (particle.guideTrailDots) {
      for (const dot of particle.guideTrailDots) keepGuideTrailObject(dot);
    }
  }
}

function removeProduct(product) {
  simLayer.remove(product.mesh);
  for (const child of product.mesh.children) {
    if (child.material) child.material.dispose();
  }
  product.mesh.geometry.dispose();
  product.mesh.material.dispose();
}

function removeGuideTrailObject(entry) {
  const object = entry.object;
  simLayer.remove(object);
  if (object.geometry) object.geometry.dispose();
  if (object.material) object.material.dispose();
}

function updateGuideTrailRemnants(dt) {
  simulation.guideTrails = simulation.guideTrails.filter((entry) => {
    entry.life -= dt;
    const progress = Math.max(0, entry.life / entry.maxLife);

    if (entry.object.material) {
      entry.object.material.opacity = entry.object.userData.fadeBaseOpacity * progress;
    }

    if (entry.object.isMesh) {
      entry.object.scale.multiplyScalar(0.992);
    }

    if (entry.life <= 0) {
      removeGuideTrailObject(entry);
      return false;
    }

    return true;
  });
}

function spawnModerationFlash(position, guide = false) {
  const { radius } = simulation.geometry;
  const flashScale = guide ? 1 : 0.45;
  const flash = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.014 * flashScale, radius * 0.045 * flashScale, 24),
    moderationFlashMaterial.clone(),
  );
  flash.material.opacity = guide ? 0.38 : 0.18;
  flash.position.copy(position);
  flash.lookAt(camera.position);
  simLayer.add(flash);
  simulation.products.push({
    mesh: flash,
    retainedAt: position.clone(),
    life: guide ? 0.45 : 0.26,
    maxLife: guide ? 0.45 : 0.26,
    isFlash: true,
  });
}

function spawnThermalShimmer(position, guide = false) {
  const { radius } = simulation.geometry;
  const material = new THREE.MeshBasicMaterial({
    color: 0xff9f1c,
    transparent: true,
    opacity: guide ? 0.16 : 0.075,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const ringCount = guide ? 3 : 1;
  const baseSize = guide ? 0.07 : 0.028;
  const stepSize = guide ? 0.025 : 0.012;
  for (let i = 0; i < ringCount; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * (baseSize + i * stepSize), radius * (guide ? 0.0028 : 0.0014), 6, 32),
      material.clone(),
    );
    ring.position.copy(position);
    ring.rotation.set(
      randomBetween(0, Math.PI),
      randomBetween(0, Math.PI),
      randomBetween(0, Math.PI),
    );
    simLayer.add(ring);
    const life = guide ? 1.05 + i * 0.18 : 0.38;
    simulation.products.push({
      mesh: ring,
      retainedAt: position.clone(),
      life,
      maxLife: life,
      isShimmer: true,
      spin: guide ? randomBetween(0.8, 1.6) : randomBetween(0.35, 0.8),
    });
  }
}

function spawnScatterVector(position, direction, guide = false) {
  const { radius } = simulation.geometry;
  const length = radius * (guide ? 0.18 : 0.07);
  const start = position.clone().addScaledVector(direction, -length * 0.35);
  const end = position.clone().addScaledVector(direction, length * 0.65);
  const material = new THREE.LineBasicMaterial({
    color: guide ? 0xffd166 : 0xff9f1c,
    transparent: true,
    opacity: guide ? 0.72 : 0.24,
    depthWrite: false,
    depthTest: false,
  });
  const vector = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material);
  vector.frustumCulled = false;
  vector.renderOrder = guide ? 20 : 12;
  simLayer.add(vector);
  simulation.products.push({
    mesh: vector,
    retainedAt: position.clone(),
    life: guide ? 0.55 : 0.28,
    maxLife: guide ? 0.55 : 0.28,
    isVector: true,
  });
}

function thermalizeNeutron(neutron) {
  const { radius } = simulation.geometry;
  if (neutron.moderated) return;
  neutron.moderated = true;
  simulation.totals.thermalized += REPRESENTED_NEUTRONS;
  if (neutron.guide) {
    neutron.mesh.material.color.set(0xff9f1c);
    neutron.mesh.material.depthTest = false;
    neutron.mesh.material.depthWrite = false;
    neutron.mesh.renderOrder = 20;
    setGlow(neutron.mesh, 0xff9f1c, radius * 0.26, 1);
    neutron.trailLine.material.color.set(0xff9f1c);
    neutron.trailLine.material.opacity = 0.98;
    neutron.trailLine.material.depthTest = false;
    neutron.trailLine.material.depthWrite = false;
    neutron.trailLine.renderOrder = 19;
  } else {
    neutron.mesh.material = neutronSlowMaterial;
    setGlow(neutron.mesh, 0xff9f1c, radius * 0.115, 0.78);
    neutron.trailLine.material = trailSlowMaterial;
  }
  neutron.matrixTime = 0;
  neutron.scatterTimer = 0;
  spawnModerationFlash(neutron.mesh.position.clone(), neutron.guide);
  spawnThermalShimmer(neutron.mesh.position.clone(), neutron.guide);
  spawnMicroSparks(
    neutron.mesh.position.clone(),
    0xff9f1c,
    neutron.guide ? 16 : 1,
    neutron.guide ? 0.12 : 0.025,
    neutron.guide ? 0.9 : 0.22,
    neutron.guide ? 1 : 0.42,
  );
}

function spawnMicroSparks(position, color, count, spread, life = 0.5, scale = 1) {
  const { radius } = simulation.geometry;

  for (let i = 0; i < count; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const spark = createParticle(radius * 0.011 * scale, material);
    spark.userData.glow = addGlow(spark, color, radius * 0.052 * scale, 0.58 * Math.min(1, scale * 1.2));
    const offset = new THREE.Vector3(randomBetween(-1, 1), randomBetween(-0.4, 0.4), randomBetween(-1, 1))
      .normalize()
      .multiplyScalar(radius * randomBetween(spread * 0.2, spread));
    spark.position.copy(position).add(offset);
    simulation.products.push({
      mesh: spark,
      retainedAt: position.clone(),
      life: randomBetween(life * 0.55, life),
      maxLife: life,
    });
  }
}

function spawnAmbientMatrixSpark() {
  const { center, radius, height } = simulation.geometry;
  const angle = Math.random() * Math.PI * 2;
  const radialDistance = radius * randomBetween(0.2, 0.78);
  const position = new THREE.Vector3(
    center.x + Math.cos(angle) * radialDistance,
    center.y + randomBetween(-height * 0.42, height * 0.42),
    center.z + Math.sin(angle) * radialDistance,
  );
  const color = Math.random() < 0.7 ? 0xff9f1c : 0x39ffb3;
  spawnMicroSparks(position, color, 2, 0.04, randomBetween(0.42, 0.72));
}

function getRadialState(position) {
  const { center } = simulation.geometry;
  const dx = position.x - center.x;
  const dz = position.z - center.z;
  return {
    angle: Math.atan2(dz, dx),
    distance: Math.hypot(dx, dz),
  };
}

function isInBreederBlade(position) {
  const { radius } = simulation.geometry;
  const { angle, distance } = getRadialState(position);
  const bladeAngle = (Math.PI * 2) / BLADE_COUNT;
  const nearestBlade = Math.round(angle / bladeAngle) * bladeAngle;
  const angularOffset = Math.atan2(Math.sin(angle - nearestBlade), Math.cos(angle - nearestBlade));
  const perpendicularDistance = Math.abs(Math.sin(angularOffset) * distance);

  return distance > radius * 0.18 && distance < radius * 0.72 && perpendicularDistance < radius * 0.055;
}

function setRandomThermalVelocity(neutron) {
  const { center, radius, height } = simulation.geometry;
  const radial = getRadialState(neutron.mesh.position);
  const bladeAngle = Math.round(radial.angle / ((Math.PI * 2) / BLADE_COUNT)) * ((Math.PI * 2) / BLADE_COUNT);
  const alongBlade = new THREE.Vector3(Math.cos(bladeAngle), 0, Math.sin(bladeAngle));
  const tangent = new THREE.Vector3(-Math.sin(radial.angle), 0, Math.cos(radial.angle));
  const inward = center.clone().sub(neutron.mesh.position).setY(0).normalize();
  const scatter = new THREE.Vector3(randomBetween(-1, 1), randomBetween(-0.22, 0.22), randomBetween(-1, 1));
  const direction = scatter
    .add(alongBlade.multiplyScalar(0.34))
    .add(tangent.multiplyScalar(randomBetween(-0.45, 0.45)))
    .add(inward.multiplyScalar(0.22))
    .normalize();

  neutron.velocity.copy(direction.multiplyScalar(radius * randomBetween(0.16, 0.28)));
  if (neutron.guide || Math.random() < 0.22) {
    spawnScatterVector(neutron.mesh.position.clone(), direction, neutron.guide);
  }

  const yLimit = height * 0.46;
  if (Math.abs(neutron.mesh.position.y - center.y) > yLimit) {
    neutron.velocity.y += Math.sign(center.y - neutron.mesh.position.y) * radius * 0.18;
  }
}

function advanceNeutron(neutron, dt) {
  const { center, radius, height } = simulation.geometry;
  neutron.age += dt;
  neutron.scatterTimer -= dt;
  neutron.mesh.position.addScaledVector(neutron.velocity, dt);

  let radialDistance = Math.hypot(neutron.mesh.position.x - center.x, neutron.mesh.position.z - center.z);

  if (neutron.guide && simulation.guideWaiting) {
    neutron.velocity.set(0, 0, 0);
    pushTrailPoint(neutron);
    return true;
  }

  if (neutron.guide && simulation.guideStage === "inject" && neutron.target) {
    const remaining = neutron.target.distanceTo(neutron.mesh.position);
    if (remaining < radius * 0.04) {
      neutron.mesh.position.copy(neutron.target);
      neutron.velocity.set(0, 0, 0);
      simulation.guideWaiting = true;
      setGuideInfo("Placeholder title", "Placeholder text for neutron entry. The neutron has reached the TPM boundary and is ready to thermalise.");
      if (simulation.guideAdvanceQueued) {
        beginGuideThermalization(neutron);
      }
    }
  }

  if (!neutron.guide && !neutron.moderated && radialDistance < radius * 0.9) {
    if (!neutron.guide) thermalizeNeutron(neutron);
  }

  if (neutron.moderated) {
    neutron.matrixTime += dt;
    neutron.captureTimer -= dt;

    const matrixBoundary = radius * 0.82;
    if (neutron.guide && neutron.enteringMatrix && radialDistance <= matrixBoundary) {
      neutron.enteringMatrix = false;
    }
    const guideEnteringMatrix = neutron.guide && neutron.enteringMatrix && radialDistance > matrixBoundary;
    if (radialDistance > matrixBoundary && !guideEnteringMatrix) {
      const angle = Math.atan2(neutron.mesh.position.z - center.z, neutron.mesh.position.x - center.x);
      neutron.mesh.position.x = center.x + Math.cos(angle) * matrixBoundary;
      neutron.mesh.position.z = center.z + Math.sin(angle) * matrixBoundary;
      radialDistance = matrixBoundary;

      const inward = center.clone().sub(neutron.mesh.position).setY(0).normalize();
      neutron.velocity.reflect(inward.multiplyScalar(-1)).multiplyScalar(neutron.guide ? 0.48 : 0.72);
      neutron.velocity.addScaledVector(inward, radius * 0.18);
    }

    const yLimit = height * 0.46;
    if (Math.abs(neutron.mesh.position.y - center.y) > yLimit) {
      neutron.mesh.position.y = center.y + Math.sign(neutron.mesh.position.y - center.y) * yLimit;
      neutron.velocity.y *= -0.55;
    }

    if (neutron.scatterTimer <= 0) {
      setRandomThermalVelocity(neutron);
      neutron.scatterTimer = randomBetween(0.08, 0.18) * simulation.settings.dwellScale;
    }
  }

  const canCapture = neutron.moderated && neutron.matrixTime > 0.9 && neutron.captureTimer <= 0;
  if (!neutron.guide && canCapture && isInBreederBlade(neutron.mesh.position) && Math.random() < dt * 5.5 * simulation.settings.captureLikelihood) {
    spawnReactionProducts(neutron.mesh.position.clone());
    removeParticle(neutron, { keepTrail: true });
    return false;
  }

  if (neutron.age > 8.5) {
    if (neutron.guide) {
      neutron.age = 4;
      return true;
    }
    if (neutron.moderated) spawnReactionProducts(neutron.mesh.position.clone());
    removeParticle(neutron);
    return false;
  }

  pushTrailPoint(neutron);
  return true;
}

function advanceProduct(product, dt) {
  product.life -= dt;
  const progress = 1 - Math.max(0, product.life / product.maxLife);
  product.mesh.position.lerp(product.retainedAt, Math.min(1, dt * 4));
  if (product.isVector) {
    product.mesh.scale.setScalar(1 + progress * 0.4);
  } else if (product.isShimmer) {
    product.mesh.rotation.x += dt * product.spin;
    product.mesh.rotation.y += dt * product.spin * 0.7;
    product.mesh.scale.setScalar(0.7 + progress * 2.8);
  } else {
    product.mesh.scale.setScalar(product.isFlash ? 1 + progress * 2.4 : 1 - progress * 0.65);
  }
  setParticleOpacity(product.mesh, Math.max(0, 1 - progress));
  product.mesh.material.transparent = true;

  if (product.life <= 0) {
    removeProduct(product);
    return false;
  }

  return true;
}

function updateSimulation(dt) {
  if (simulation.guideActive) {
    simulation.elapsed += dt;
  }

  if (simulation.running && simulation.ready && !simulation.guideActive) {
    simulation.elapsed += dt;
    simulation.ambientCarry += dt * 5;
    simulation.virtualCarry += simulation.settings.fluxRate * dt;
    const countedNeutrons = Math.floor(simulation.virtualCarry);
    if (countedNeutrons > 0) {
      simulation.totals.neutrons += countedNeutrons;
      simulation.virtualCarry -= countedNeutrons;
    }

    simulation.spawnCarry += simulation.settings.visibleRate * dt;

    while (simulation.spawnCarry >= 1 && simulation.neutrons.length < MAX_VISIBLE_NEUTRONS) {
      simulation.neutrons.push(createNeutron());
      simulation.spawnCarry -= 1;
    }

    if (simulation.neutrons.length >= MAX_VISIBLE_NEUTRONS) {
      simulation.spawnCarry = Math.min(simulation.spawnCarry, 1);
    }

    while (simulation.ambientCarry >= 1) {
      spawnAmbientMatrixSpark();
      simulation.ambientCarry -= 1;
    }
  }

  simulation.neutrons = simulation.neutrons.filter((neutron) => advanceNeutron(neutron, dt));
  simulation.products = simulation.products.filter((product) => advanceProduct(product, dt));
  updateGuideTrailRemnants(dt);
  updateParticleVfx();
  updateGuideCamera(dt);
  simulation.uiCarry += dt;
  if (simulation.uiCarry > 0.15) {
    simulation.uiCarry = 0;
    updateSimulationUi();
  }
}

function updateParticleVfx() {
  const t = simulation.elapsed;
  if (reactorEnvLayer.visible) {
    for (const object of reactorEnvLayer.children) {
      if (object.userData.isFluxRay && object.material) {
        object.material.opacity = object.userData.baseOpacity * (0.72 + Math.sin(t * 2.4 + object.id) * 0.28);
      }
    }
  }

  for (const product of simulation.products) {
    if (product.mesh.userData.glow) {
      const pulse = 0.85 + Math.sin(t * 8 + product.mesh.id) * 0.12;
      product.mesh.userData.glow.scale.setScalar(product.mesh.userData.glow.userData.baseSize * pulse);
    }
  }
}

function updateGuideCamera(dt, snap = false) {
  if (!simulation.guideActive || !simulation.guideNeutron) return;

  const neutron = simulation.guideNeutron;
  const { center, radius } = simulation.geometry;
  const neutronPosition = neutron.mesh.position;
  const centerToNeutron = neutronPosition.clone().sub(center);
  const flatDirection = new THREE.Vector3(centerToNeutron.x, 0, centerToNeutron.z);
  if (flatDirection.lengthSq() < 0.0001) flatDirection.set(1, 0, 0);
  flatDirection.normalize();

  const sideDirection = new THREE.Vector3(-flatDirection.z, 0, flatDirection.x);
  const distanceFromCenter = Math.max(radius, center.distanceTo(neutronPosition));
  let desiredTarget;
  let desiredPosition;

  if (simulation.guideStage === "inject") {
    desiredTarget = center.clone().lerp(neutronPosition, 0.6);
    desiredPosition = desiredTarget.clone()
      .addScaledVector(flatDirection, Math.max(radius * 2.15, distanceFromCenter * 0.65 + radius * 0.95))
      .addScaledVector(sideDirection, radius * 0.82)
      .add(new THREE.Vector3(0, radius * 0.74, 0));
  } else if (simulation.guideStage === "thermal") {
    desiredTarget = center.clone().lerp(neutronPosition, 0.58);
    desiredPosition = desiredTarget.clone()
      .addScaledVector(flatDirection, radius * 1.85)
      .addScaledVector(sideDirection, radius * 0.72)
      .add(new THREE.Vector3(0, radius * 0.68, 0));
  } else {
    const captureTarget = simulation.guideCapturePoint.lengthSq() > 0 ? simulation.guideCapturePoint : center;
    desiredTarget = center.clone().lerp(captureTarget, 0.58);
    desiredPosition = desiredTarget.clone()
      .addScaledVector(flatDirection, radius * 1.8)
      .addScaledVector(sideDirection, radius * 0.68)
      .add(new THREE.Vector3(0, radius * 0.64, 0));
  }

  const positionBlend = snap ? 1 : Math.min(1, dt * 4.2);
  const targetBlend = snap ? 1 : Math.min(1, dt * 5.1);
  camera.position.lerp(desiredPosition, positionBlend);
  controls.target.lerp(desiredTarget, targetBlend);
}

function setSimulationCameraPreset(preset) {
  if (!simulation.ready || simulation.guideActive) return;

  const { center, radius, height } = simulation.geometry;
  simulation.settings.autoRotate = false;
  controls.autoRotate = false;
  settingAutoRotate.checked = false;
  simulation.settings.autoPan = false;
  settingAutoPan.checked = false;
  resetCameraNod();
  let offset;
  let target = center.clone();

  if (preset === "core") {
    offset = new THREE.Vector3(radius * 1.45, height * 0.16, radius * 1.0);
    target.add(new THREE.Vector3(0, height * 0.02, 0));
  } else if (preset === "flow") {
    offset = new THREE.Vector3(radius * 2.9, height * 0.08, radius * 0.42);
    target.add(new THREE.Vector3(0, height * 0.04, 0));
  } else {
    offset = new THREE.Vector3(radius * 2.8, height * 0.45, radius * 2.8);
  }

  camera.position.copy(center).add(offset);
  controls.target.copy(target);
  controls.update();
}

function updateCameraAutomation(dt) {
  if (!simulation.ready || simulation.guideActive) return;
  if (!simulation.settings.autoRotate && !simulation.settings.autoPan) return;

  const { center, height } = simulation.geometry;
  simulation.cameraPanTime += dt;

  if (simulation.settings.autoRotate) {
    const orbitOffset = camera.position.clone().sub(center);
    orbitOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.1);
    camera.position.copy(center).add(orbitOffset);
  }

  const desiredTargetOffset = new THREE.Vector3();
  if (simulation.settings.autoPan) {
    desiredTargetOffset.y = Math.sin(simulation.cameraPanTime * 0.48) * height * 0.04;
  }

  const targetDelta = desiredTargetOffset.sub(simulation.cameraPanOffset);
  simulation.cameraPanOffset.add(targetDelta);
  controls.target.add(targetDelta);
}

function resetCameraNod() {
  controls.target.sub(simulation.cameraPanOffset);
  simulation.cameraPanTime = 0;
  simulation.cameraPanOffset.set(0, 0, 0);
}

function renderMinimap() {
  if (!simulation.ready || !simulation.settings.minimap) return;

  const rect = minimapFrame.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const x = Math.round(rect.left);
  const y = Math.round(window.innerHeight - rect.bottom);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const rodVisible = rodPreviewLayer.visible;
  const reactorVisible = reactorEnvLayer.visible;

  rodPreviewLayer.visible = false;
  reactorEnvLayer.visible = false;

  renderer.clearDepth();
  renderer.setScissorTest(true);
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  renderer.render(scene, minimapCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);

  rodPreviewLayer.visible = rodVisible;
  reactorEnvLayer.visible = reactorVisible;
}

function startSimulation() {
  if (!simulation.ready) return;
  simulation.guideActive = false;
  simulation.guideComplete = false;
  simulation.guideStage = "idle";
  simulation.guideWaiting = false;
  setGuideInfo("Placeholder title", "Placeholder text.", false);
  simulation.running = true;
  setModelSimulationView(true);
  controls.autoRotate = false;
  updateSimulationUi();
}

function startSingleNeutronGuide() {
  if (!simulation.ready) return;
  resetSimulation();
  simulation.running = true;
  simulation.guideActive = true;
  simulation.guideComplete = false;
  simulation.guideStage = "inject";
  simulation.guideWaiting = false;
  simulation.guideAdvanceQueued = false;
  setModelSimulationView(true);
  controls.autoRotate = false;
  resetCameraNod();

  const neutron = createNeutron({ guide: true });
  simulation.guideNeutron = neutron;
  simulation.neutrons.push(neutron);
  simulation.totals.neutrons += REPRESENTED_NEUTRONS;
  setGuideInfo("Placeholder title", "Placeholder text for neutron injection. The neutron is moving toward the TPM from the surrounding reactor flux.");
  updateGuideCamera(0, true);
  updateSimulationUi();
}

function beginGuideThermalization(neutron) {
  simulation.guideStage = "thermal";
  simulation.guideWaiting = false;
  simulation.guideAdvanceQueued = false;
  thermalizeNeutron(neutron);
  const { center, radius } = simulation.geometry;
  const radial = getRadialState(neutron.mesh.position);
  const inwardTarget = new THREE.Vector3(
    center.x + Math.cos(radial.angle) * radius * 0.42,
    neutron.mesh.position.y,
    center.z + Math.sin(radial.angle) * radius * 0.42,
  );
  neutron.velocity.copy(inwardTarget.sub(neutron.mesh.position).normalize().multiplyScalar(radius * 0.48));
  neutron.enteringMatrix = true;
  neutron.scatterTimer = 0.55;
  setGuideInfo("Placeholder title", "Placeholder text for thermalisation. The neutron is now moderated and wanders through the graphite/breeder matrix.");
  updateSimulationUi();
}

function advanceSingleNeutronGuide() {
  if (!simulation.guideActive) {
    startSingleNeutronGuide();
    return;
  }

  const neutron = simulation.guideNeutron;
  if (!neutron) return;

  if (simulation.guideStage === "inject") {
    if (!simulation.guideWaiting) {
      simulation.guideAdvanceQueued = true;
      setGuideInfo("Placeholder title", "Placeholder text for neutron entry. Thermalisation is queued and will begin once the neutron reaches the TPM boundary.");
      updateSimulationUi();
      return;
    }
    beginGuideThermalization(neutron);
    updateSimulationUi();
    return;
  }

  if (simulation.guideStage === "thermal") {
    simulation.guideStage = "capture";
    simulation.guideWaiting = true;
    neutron.velocity.set(0, 0, 0);
    const capturePosition = neutron.mesh.position.clone();
    simulation.guideCapturePoint.copy(capturePosition);
    spawnReactionProducts(capturePosition);
    spawnMicroSparks(capturePosition, 0xfff2a8, 28, 0.2, 1.1);
    removeParticle(neutron, { keepTrail: true });
    simulation.neutrons = simulation.neutrons.filter((item) => item !== neutron);
    simulation.guideNeutron = null;
    simulation.guideStage = "complete";
    simulation.guideActive = false;
    simulation.guideComplete = true;
    simulation.running = false;
    setGuideInfo("Placeholder title", "Placeholder text for Li-6 capture. The reaction products are retained in the breeder matrix.");
    updateSimulationUi();
  }
}

function pauseSimulation() {
  simulation.running = false;
  controls.autoRotate = false;
  updateSimulationUi();
}

function resetSimulation() {
  pauseSimulation();
  setModelSimulationView(false);
  setGuideInfo("Placeholder title", "Placeholder text.", false);
  for (const neutron of simulation.neutrons) removeParticle(neutron);
  for (const product of simulation.products) removeProduct(product);
  for (const entry of simulation.guideTrails) removeGuideTrailObject(entry);
  simulation.neutrons = [];
  simulation.products = [];
  simulation.guideTrails = [];
  simulation.guideActive = false;
  simulation.guideComplete = false;
  simulation.guideNeutron = null;
  simulation.guideStage = "idle";
  simulation.guideWaiting = false;
  simulation.guideAdvanceQueued = false;
  simulation.elapsed = 0;
  simulation.uiCarry = 0;
  simulation.spawnCarry = 0;
  simulation.ambientCarry = 0;
  simulation.virtualCarry = 0;
  simulation.cameraPanTime = 0;
  resetCameraNod();
  simulation.totals = {
    neutrons: 0,
    thermalized: 0,
    captured: 0,
    tritium: 0,
    helium: 0,
  };
  updateSimulationUi();
}

simToggle.addEventListener("click", () => {
  const open = simPanel.dataset.open !== "true";
  simPanel.dataset.open = String(open);
  simToggle.setAttribute("aria-expanded", String(open));
});

simStartButton.addEventListener("click", startSimulation);
simGuideButton.addEventListener("click", advanceSingleNeutronGuide);
simPauseButton.addEventListener("click", pauseSimulation);
simResetButton.addEventListener("click", resetSimulation);
cameraWideButton.addEventListener("click", () => setSimulationCameraPreset("wide"));
cameraCoreButton.addEventListener("click", () => setSimulationCameraPreset("core"));
cameraFlowButton.addEventListener("click", () => setSimulationCameraPreset("flow"));

settingRodPreview.addEventListener("change", () => {
  setRodPreviewVisible(settingRodPreview.checked);
});

settingReactorEnv.addEventListener("change", () => {
  setReactorEnvironmentVisible(settingReactorEnv.checked);
});

settingAutoRotate.addEventListener("change", () => {
  simulation.settings.autoRotate = settingAutoRotate.checked;
  controls.autoRotate = false;
});

settingAutoPan.addEventListener("change", () => {
  simulation.settings.autoPan = settingAutoPan.checked;
  resetCameraNod();
});

settingMinimap.addEventListener("change", () => {
  simulation.settings.minimap = settingMinimap.checked;
  minimapFrame.dataset.open = String(simulation.settings.minimap);
});

updateSimulationUi();

const loader = new GLTFLoader();

loader.load(
  "/assets/models/TPM1.glb",
  (gltf) => {
    const model = gltf.scene;
    simulation.model = model;
    colorModel(model);
    addStructureOutlines(model);
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    setSimulationReady(box);
    createRodPreview(model);
    setRodPreviewVisible(settingRodPreview.checked);
    createReactorEnvironment();
    setReactorEnvironmentVisible(settingReactorEnv.checked);

    controls.target.copy(center);
    camera.near = size / 1000;
    camera.far = size * 10;
    camera.position.copy(center).add(new THREE.Vector3(size * 0.6, size * 0.3, size * 0.6));
    camera.updateProjectionMatrix();
  },
  undefined,
  (error) => {
    console.error("Failed to load 3D model:", error);
    simStatus.textContent = "Failed to load TPM model.";
  },
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateMinimapCamera();
});

let lastFrameTime = performance.now();

function animate(now = performance.now()) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  updateCameraAutomation(dt);
  controls.update();
  updateSimulation(dt);
  renderer.render(scene, camera);
  renderMinimap();
  requestAnimationFrame(animate);
}

animate();

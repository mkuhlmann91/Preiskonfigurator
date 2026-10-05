/* =========================================================================
   LED-WAND KONFIGURATOR
   Anpassbare Eckdaten (Gewichte, Feld-Name fürs CRM etc.) unten in CONFIG.
   ========================================================================= */

const CONFIG = {
  // Name des versteckten Feldes im echten Kontaktformular der Website.
  // Bitte an den tatsächlichen Feldnamen anpassen, falls abweichend.
  hiddenFieldName: 'ledwall_konfigurator',
  // Empfänger der Anfragen. Versand läuft über FormSubmit (formsubmit.co).
  // Beim allerersten Versand schickt FormSubmit eine Bestätigungs-Mail an diese
  // Adresse; erst nach Klick auf den Link dort werden Anfragen zugestellt.
  recipientEmail: 'hallo@ledwall-360.de',
  // Datenschutzerklärung, verlinkt an der Einwilligungs-Checkbox.
  privacyUrl: 'https://ledwall-360.de/datenschutz',
  // Gewichte pro Panel in kg (vom Kunden angegeben)
  weightPerPanel: {
    '0.5x0.5': { indoor: 6, outdoor: 6 },
    '1x0.5':   { indoor: 11, outdoor: 11 }
  },
  // Strom- + Datenkabel (je ca. 60 cm, von Panel zu Panel), pro Panel in kg
  cableWeightPerPanel: 0.5
};

const state = {
  location: 'indoor',   // 'indoor' | 'outdoor'
  mount: 'truss',       // 'truss' | 'wall' | 'floor'
  cols: 10,             // 10 × 0,5 m = 5 m Breite
  rows: 6,              // 6 × 0,5 m = 3 m Höhe (Aufteilung siehe getLayout)
  pitch: 2.9,
  gob: false,
  showEdges: true,
  showDummy: true,
  content: 'logo',      // 'logo' | 'pink' | 'promo' | 'custom'
  personDist: 3.5       // Abstand Figur ↔ Wand in m (folgt dem Pitch-Richtwert, bis man ihn verstellt)
};

// Raster für die Größe: Breite und Höhe in 50-cm-Schritten
function getPanelDims() {
  return { panelW: 0.5, panelH: 0.5 };
}

// Aufteilung der Wand: zuerst große Panels (0,5 × 1 m, hochkant), bei einem
// Rest von 50 cm eine Reihe kleiner Panels (0,5 × 0,5 m) oben.
function getLayout() {
  const cols = state.cols;
  const bigRows = Math.floor(state.rows / 2), smallRows = state.rows % 2;
  const rowHeights = [...Array(bigRows).fill(1), ...Array(smallRows).fill(0.5)]; // von unten nach oben
  const big = cols * bigRows, small = cols * smallRows;
  const weight = big * CONFIG.weightPerPanel['1x0.5'][state.location] + small * CONFIG.weightPerPanel['0.5x0.5'][state.location]
    + (big + small) * CONFIG.cableWeightPerPanel;
  return { cols, bigRows, smallRows, rowHeights, big, small, total: big + small, weight,
    totalWidth: cols * 0.5, totalHeight: state.rows * 0.5 };
}
function panelMixText(L) {
  const parts = [];
  if (L.big) parts.push(`${L.big}× 0,5×1m`);
  if (L.small) parts.push(`${L.small}× 0,5×0,5m`);
  return parts.join(' + ');
}

/* ---------------------------- THREE.JS SETUP ---------------------------- */

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
const isTouch = window.matchMedia('(pointer: coarse)').matches;
// Auflösung begrenzen: 1,5-fach sieht scharf aus und spart gegenüber 2-fach fast die
// Hälfte der Rechenarbeit. Ist der Rechner trotzdem zu langsam, wird automatisch
// weiter heruntergeregelt (siehe adaptQuality im Loop).
let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.outputEncoding = THREE.sRGBEncoding;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a0b, 14, 34);

const camera = new THREE.PerspectiveCamera(42, 1, 0.25, 400);
camera.position.set(6.5, 4, 9);

// Lighting
const ambientLight = new THREE.AmbientLight(0x8a8a95, 0.55);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b45, 0);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(6, 10, 6);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xe7007f, 3, 30);
rimLight.position.set(-6, 3, -4);
scene.add(rimLight);
const backLight = new THREE.PointLight(0xffffff, 0, 40);
backLight.position.set(2, 4, -7);
scene.add(backLight);
let rimBase = 1.8;
const fillLight = new THREE.PointLight(0xffffff, 1.2, 30);
fillLight.position.set(0, 2, 8);
scene.add(fillLight);

// Floor
const floorGeo = new THREE.PlaneGeometry(400, 400);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.85, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);


/* ------------------------- UMGEBUNG: INDOOR / OUTDOOR ---------------------- */
// Indoor = dunkle Halle / Showroom, Outdoor = Tageslicht mit Himmel, Platz und Bäumen.

const ENVIRONMENTS = {
  indoor: { wallColor: 0x77716a },
  outdoor: { wallColor: 0x5e5a54 }
};
const envGroup = new THREE.Group();
scene.add(envGroup);

const skyTexture = (() => {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3d86d8');
  g.addColorStop(0.55, '#9cc8ef');
  g.addColorStop(1, '#e4eef5');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
})();

function buildTree(x, z, h) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h * 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x3b2819, roughness: 0.9 }));
  trunk.position.y = h * 0.175;
  t.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(h * 0.32, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0x24501f, roughness: 0.9 }));
  crown.position.y = h * 0.62;
  crown.scale.y = 1.15;
  t.add(crown);
  t.position.set(x, 0, z);
  return t;
}

const fogBase = { near: 16, far: 36 };
function applyEnvironment() {
  envGroup.clear();
  const { panelW, panelH } = getPanelDims();
  const wallW = state.cols * panelW, wallH = state.rows * panelH;
  if (state.location === 'outdoor') {
    scene.background = skyTexture;
    scene.fog = new THREE.Fog(0xdbe8f2, 30, 75);
    hemiLight.color.set(0xcfe6ff);
    hemiLight.groundColor.set(0x5a6b45);
    Object.assign(fogBase, { near: 30, far: 75 });
    const k = Math.max(1, (wallW / 2 + 5) / 11);
    floorMat.color.set(0x2f5a26);   // Rasen
    floorMat.roughness = 1;
    rimBase = 0;
    ambientLight.intensity = 0.1;
    hemiLight.intensity = 0.45;
    keyLight.intensity = 0.8;
    fillLight.intensity = 0.3;
    keyLight.position.set(8, 14, 10);
    // gepflasterter Platz vor der Wand
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(10 * k, 48),
      new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.95 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.004, 3);
    envGroup.add(plaza);
    [[-11, -6, 5], [-7, -10, 6], [-2, -13, 5.5], [4, -12, 6.5], [9, -9, 5], [12, -4, 6], [-13, 2, 5.5], [14, 4, 5]]
      .forEach(([x, z, h]) => envGroup.add(buildTree(x * k, z * k, h)));
    buildPlazaDecor(wallW);
  } else {
    // Heller Showroom: warme helle Wände, Betonboden, Pflanzen und Lounge
    scene.background = new THREE.Color(0xbfb9b1);
    scene.fog = new THREE.Fog(0xbfb9b1, 24, 60);
    Object.assign(fogBase, { near: 24, far: 60 });
    floorMat.color.set(0x4a4642);   // geschliffener Beton
    floorMat.roughness = 0.85;
    rimBase = 0.5;
    ambientLight.intensity = 0.2;
    hemiLight.color.set(0xfff6ea);
    hemiLight.groundColor.set(0x6a625a);
    hemiLight.intensity = 0.45;
    keyLight.intensity = 0.6;
    fillLight.intensity = 0.25;
    keyLight.position.set(6, 12, 8);
    const hallMat = new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 0.95 });
    const hallW = Math.max(36, wallW + 16), hallH = Math.max(9, wallH + 6);
    [[0, -14, 0, hallW], [-hallW / 2, 3, Math.PI / 2, 34], [hallW / 2, 3, -Math.PI / 2, 34]].forEach(([x, z, ry, w]) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, hallH), hallMat);
      wall.position.set(x, hallH / 2, z);
      wall.rotation.y = ry;
      envGroup.add(wall);
    });
    // Sockelleiste an den Hallenwänden
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x6f6961, roughness: 0.8 });
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(hallW, 0.12, 0.03), skirtMat);
    skirt.position.set(0, 0.06, -13.98);
    envGroup.add(skirt);
    buildShowroomDecor(wallW);
  }
}

/* ------------------------------ PLATZ-DEKO (OUTDOOR) ----------------------- */

const woodMat = () => new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 });
const darkMetalMat = () => new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.6 });

// Parkbank: Holzlatten auf zwei schwarzen Metallgestellen, Sitzfläche zeigt nach +z
function buildBench(x, z, rotY) {
  const g = new THREE.Group();
  const wood = woodMat(), metal = darkMetalMat();
  const len = 1.8;
  for (let i = 0; i < 3; i++) {           // Sitzlatten
    const slat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.035, 0.11), wood);
    slat.position.set(0, 0.45, -0.15 + i * 0.13);
    g.add(slat);
  }
  for (let i = 0; i < 2; i++) {           // Rückenlehne
    const slat = new THREE.Mesh(new THREE.BoxGeometry(len, 0.11, 0.035), wood);
    slat.position.set(0, 0.62 + i * 0.15, -0.24 - i * 0.03);
    slat.rotation.x = -0.18;
    g.add(slat);
  }
  [-len / 2 + 0.15, len / 2 - 0.15].forEach(lx => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 0.42), metal);
    leg.position.set(lx, 0.225, -0.02);
    g.add(leg);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.04), metal);
    back.position.set(lx, 0.66, -0.26);
    back.rotation.x = -0.18;
    g.add(back);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.45), metal);
    arm.position.set(lx, 0.66, -0.02);
    g.add(arm);
  });
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

// Straßenlaterne mit warm leuchtendem Kopf
function buildStreetLamp(x, z, h = 4) {
  const g = new THREE.Group();
  const metal = darkMetalMat();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 10), metal);
  pole.position.y = h / 2;
  g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.35, 12), metal);
  base.position.y = 0.175;
  g.add(base);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.28, 12), metal);
  head.position.y = h + 0.1;
  g.add(head);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
  glow.position.y = h - 0.05;
  g.add(glow);
  g.position.set(x, 0, z);
  return g;
}

// Mülleimer: dunkler Zylinder mit Holzverkleidung
function buildBin(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.85, 16), darkMetalMat());
  body.position.y = 0.425;
  g.add(body);
  const wood = woodMat();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.025), wood);
    slat.position.set(Math.sin(a) * 0.245, 0.42, Math.cos(a) * 0.245);
    slat.rotation.y = a;
    g.add(slat);
  }
  g.position.set(x, 0, z);
  return g;
}

// Holz-Pflanzkübel mit Gras und pinken Blüten
function buildPlanter(x, z, rotY = 0) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.55), woodMat());
  box.position.y = 0.25;
  g.add(box);
  const soil = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }));
  soil.position.y = 0.5;
  g.add(soil);
  const green = new THREE.MeshStandardMaterial({ color: 0x3f7a2e, roughness: 0.9 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xe7007f, roughness: 0.6 });
  for (let i = 0; i < 7; i++) {
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (i % 3) * 0.03, 10, 8), green);
    bush.position.set(-0.54 + i * 0.18, 0.6, (i % 2 ? 0.08 : -0.08));
    g.add(bush);
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), pink);
    bloom.position.set(-0.54 + i * 0.18 + 0.05, 0.76 + (i % 2) * 0.04, (i % 2 ? 0.02 : -0.04));
    g.add(bloom);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function buildPlazaDecor(wallW) {
  const side = wallW / 2;
  // alles vor der Wandebene (z > 0) und seitlich, damit Figur und Abstandslinie frei bleiben
  envGroup.add(buildStreetLamp(-side - 1.0, 0.9));
  envGroup.add(buildStreetLamp(side + 1.0, 0.9));
  envGroup.add(buildBench(side + 2.4, 2.4, -Math.PI / 2 - 0.35));
  envGroup.add(buildBench(-side - 2.6, 3.2, Math.PI / 2 + 0.35));
  envGroup.add(buildBin(side + 2.2, 3.9));
  envGroup.add(buildPlanter(-side - 1.9, 0.9, Math.PI / 2));
  envGroup.add(buildPlanter(side + 3.6, 0.9, 0));
}

/* --------------------------- SHOWROOM-DEKO (INDOOR) ------------------------ */

function buildPlant(x, z, h = 1.4) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.4 }));
  pot.position.y = 0.25;
  g.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), new THREE.MeshStandardMaterial({ color: 0x3a2a1e }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.49;
  g.add(soil);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7f45, roughness: 0.8 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x2f6a38, roughness: 0.8 });
  // buschige Krone aus mehreren Kugeln
  [[0, h * 0.75, 0, 0.42], [0.2, h * 0.6, 0.1, 0.3], [-0.2, h * 0.62, -0.08, 0.32], [0.05, h * 0.95, -0.05, 0.3], [-0.1, h * 0.5, 0.18, 0.26]]
    .forEach(([lx, ly, lz, r], i) => {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), i % 2 ? leafMat2 : leafMat);
      leaf.position.set(lx, ly, lz);
      g.add(leaf);
    });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, h * 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x5a4632 }));
  stem.position.y = 0.5 + h * 0.2;
  g.add(stem);
  g.position.set(x, 0, z);
  return g;
}

function buildSofa(x, z, rotY) {
  const g = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.9 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0xe7007f, roughness: 0.8 });
  const leg = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.4, metalness: 0.6 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.22, 0.85), fabric);
  seat.position.y = 0.32;
  g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.2), fabric);
  back.position.set(0, 0.62, -0.33);
  g.add(back);
  [-1, 1].forEach((sx) => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.4, 0.85), fabric);
    arm.position.set(sx * 0.91, 0.45, 0);
    g.add(arm);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.12), cushion);
    pillow.position.set(sx * 0.55, 0.6, -0.17);
    pillow.rotation.x = -0.2;
    g.add(pillow);
    [-1, 1].forEach((sz) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8), leg);
      l.position.set(sx * 0.9, 0.1, sz * 0.35);
      g.add(l);
    });
  });
  // Couchtisch davor
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 28),
    new THREE.MeshStandardMaterial({ color: 0xb08a62, roughness: 0.6 }));
  top.position.set(0, 0.42, 0.95);
  g.add(top);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.4, 12), leg);
  foot.position.set(0, 0.2, 0.95);
  g.add(foot);
  // Teppich unter der Lounge
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.4), new THREE.MeshStandardMaterial({ color: 0x8c8277, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.006, 0.45);
  g.add(rug);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}

function buildBarTable(x, z) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.35, metalness: 0.7 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 28),
    new THREE.MeshStandardMaterial({ color: 0xf4f1ec, roughness: 0.35 }));
  top.position.y = 1.1;
  g.add(top);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.08, 10), metal);
  pole.position.y = 0.55;
  g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.03, 24), metal);
  base.position.y = 0.015;
  g.add(base);
  // kleine Vase mit pinker Blume
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  vase.position.y = 1.2;
  g.add(vase);
  const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe7007f, roughness: 0.6 }));
  bloom.position.y = 1.32;
  g.add(bloom);
  g.position.set(x, 0, z);
  return g;
}

function buildFloorSpot(x, z, aimX) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1e1e20, roughness: 0.4, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 8), metal);
  pole.position.y = 0.8;
  g.add(pole);
  [0, 2.1, 4.2].forEach((a) => {
    const legM = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), metal);
    legM.position.set(Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18);
    legM.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(legM);
  });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.26, 16), metal);
  head.position.y = 1.65;
  head.rotation.z = Math.sign(aimX - x) * 0.9;
  g.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
  lens.position.set(Math.sign(aimX - x) * 0.11, 1.58, 0);
  lens.rotation.y = Math.sign(aimX - x) * Math.PI / 2;
  g.add(lens);
  g.position.set(x, 0, z);
  return g;
}

function buildShowroomDecor(wallW) {
  const side = wallW / 2;
  // vor der Wandebene (z > 0), damit bei Wandmontage nichts durch die Fassade ragt
  envGroup.add(buildPlant(-side - 1.0, 0.6, 1.5));
  envGroup.add(buildPlant(side + 1.0, 0.6, 1.3));
  envGroup.add(buildPlant(-side - 3.6, 5.2, 1.1));
  envGroup.add(buildSofa(-side - 2.6, 2.6, Math.PI / 3));
  envGroup.add(buildBarTable(side + 2.2, 2.4));
  envGroup.add(buildBarTable(side + 3.4, 3.6));
  envGroup.add(buildFloorSpot(-side - 0.9, 1.4, 0));
  envGroup.add(buildFloorSpot(side + 0.9, 1.4, 0));
}


/* -------------------------- CUSTOM ORBIT CONTROLS ------------------------ */
/* Ein Finger / Maus = Rotieren, zwei Finger = Pinch-Zoom, Mausrad = Zoom (Desktop) */

const orbit = { theta: 0.5, phi: 1.15, radius: 13, target: new THREE.Vector3(0, 1.6, 0) };
// Je größer die Wand, desto weiter darf man zurückgehen
function maxOrbitRadius() {
  const { panelW, panelH } = getPanelDims();
  return Math.max(24, Math.max(state.cols * panelW, state.rows * panelH) * 2.2);
}
let isDragging = false, lastX = 0, lastY = 0;
const activePointers = new Map();
let pinchStartDist = null, pinchStartRadius = null;

function pinchDistance() {
  const pts = [...activePointers.values()];
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 1) {
    isDragging = true; lastX = e.clientX; lastY = e.clientY;
  } else if (activePointers.size === 2) {
    isDragging = false;
    pinchStartDist = pinchDistance();
    pinchStartRadius = orbit.radius;
  }
});
function releasePointer(e) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchStartDist = null;
  if (activePointers.size === 0) isDragging = false;
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
window.addEventListener('pointermove', (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2 && pinchStartDist) {
    const dist = pinchDistance();
    const scale = pinchStartDist / dist;
    orbit.radius = Math.min(Math.max(pinchStartRadius * scale, 1.2), maxOrbitRadius());
    return;
  }
  if (!isDragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  orbit.theta -= dx * 0.006;
  orbit.phi = Math.min(Math.max(orbit.phi - dy * 0.006, 0.4), 1.5);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  orbit.radius = Math.min(Math.max(orbit.radius + e.deltaY * 0.01 * Math.max(orbit.radius / 8, 0.25), 1.2), maxOrbitRadius());
}, { passive: false });

// Die Kamera folgt der Maus weich nach (statt ruckartig bei jedem Mausevent).
const view = { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: orbit.target.clone() };
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 14);
  view.theta += (orbit.theta - view.theta) * k;
  view.phi += (orbit.phi - view.phi) * k;
  view.radius += (orbit.radius - view.radius) * k;
  view.target.lerp(orbit.target, k);
  const { theta, phi, radius, target } = view;
  camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
  camera.position.y = target.y + radius * Math.cos(phi);
  camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
  camera.lookAt(target);
}

/* ------------------------------ LED TEXTURE ------------------------------ */

// Pixel-Maske: Eine Textur-Kachel entspricht 0,5 × 0,5 m Wandfläche und enthält
// so viele LED-Punkte, wie ein echtes Panel mit diesem Pitch hat (500 mm / Pitch).
// Sie wird per Multiplikation über den Wandinhalt gelegt: weiß = LED, dunkel = Fuge.
const MASK_GAP = '#262628';
const TILE_M = 0.5;
const ledTextureCache = {};
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
function makeLedTexture(pitchMm) {
  if (ledTextureCache[pitchMm]) return ledTextureCache[pitchMm];
  const dotsPerSide = Math.round((TILE_M * 1000) / pitchMm);
  const size = 2048;
  const step = size / dotsPerSide;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = MASK_GAP;
  ctx.fillRect(0, 0, size, size);

  // Einen LED-Punkt einmal zeichnen und dann stempeln (schneller als je ein Gradient).
  const dotPx = Math.max(2, Math.ceil(step));
  const dot = document.createElement('canvas');
  dot.width = dot.height = dotPx;
  const dctx = dot.getContext('2d');
  const r = dotPx * 0.42;
  const grad = dctx.createRadialGradient(dotPx / 2, dotPx / 2, 0, dotPx / 2, dotPx / 2, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad;
  dctx.beginPath();
  dctx.arc(dotPx / 2, dotPx / 2, r, 0, Math.PI * 2);
  dctx.fill();

  for (let y = 0; y < dotsPerSide; y++) {
    for (let x = 0; x < dotsPerSide; x++) {
      ctx.globalAlpha = 0.85 + Math.random() * 0.15;
      ctx.drawImage(dot, x * step + (step - dotPx) / 2, y * step + (step - dotPx) / 2);
    }
  }
  ctx.globalAlpha = 1;
  // Eigene Mipmaps: Sobald die LED-Punkte aus der Entfernung nicht mehr einzeln
  // erkennbar sind, blendet die Maske in Weiß über. So bleibt die Wand beim
  // Rauszoomen genauso hell wie aus der Nähe (wie beim echten Hinsehen).
  const mipmaps = [cnv];
  let prev = cnv, level = 0;
  while (prev.width > 1) {
    level++;
    const w = Math.max(1, prev.width >> 1);
    const c = document.createElement('canvas');
    c.width = c.height = w;
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.drawImage(prev, 0, 0, w, w);
    const dotTexels = step / Math.pow(2, level);
    const fade = clamp((7 - dotTexels) / 6, 0, 1);
    if (fade > 0) {
      x.globalAlpha = fade;
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, w, w);
      x.globalAlpha = 1;
    }
    mipmaps.push(c);
    prev = c;
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.mipmaps = mipmaps;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  ledTextureCache[pitchMm] = tex;
  return tex;
}

/* ----------------------------- WANDINHALT ------------------------------- */
// Der Inhalt wird jedes Frame in ein Canvas gezeichnet, das genau das
// Seitenverhältnis der Wand hat, und als Textur auf die Wand gelegt.

const content = {
  canvas: document.createElement('canvas'),
  texture: null,
  media: null,      // HTMLImageElement oder HTMLVideoElement (eigene Datei)
  mediaUrl: null
};
content.texture = new THREE.CanvasTexture(content.canvas);
content.texture.encoding = THREE.sRGBEncoding;
content.texture.anisotropy = maxAnisotropy;

function sizeContentCanvas(totalWidth, totalHeight) {
  const w = 1280;
  const h = Math.round(clamp((w * totalHeight) / totalWidth, 160, 2048));
  if (content.canvas.width !== w || content.canvas.height !== h) {
    content.canvas.width = w;
    content.canvas.height = h;
    content.texture.dispose();
  }
}

function drawCover(ctx, el, W, H) {
  const iw = el.videoWidth || el.naturalWidth || el.width;
  const ih = el.videoHeight || el.naturalHeight || el.height;
  if (!iw || !ih) return;
  const scale = Math.max(W / iw, H / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

// LEDWALL-360-Logo als Bild. Ein Video lieferte auf manchen Handys (v. a. iPhone)
// nur schwarze Frames, die Bewegung kommt ohnehin aus der Canvas-Animation.
const logoImage = new Image();
logoImage.src = '/assets/ledwall360-logo.jpg';
function logoSource() {
  if (logoImage.complete && logoImage.naturalWidth) return [logoImage, logoImage.naturalWidth, logoImage.naturalHeight];
  return null;
}

// Pinker Verlauf mit langsam rotierenden Lichtstrahlen (Werbung und Logo)
function promoBackground(ctx, W, H, t) {
  const sway = 0.5 + 0.5 * Math.sin(t * 0.3);
  const bg = ctx.createLinearGradient(W * (0.2 * sway), 0, W, H);
  bg.addColorStop(0, '#e7007f');
  bg.addColorStop(1, '#5a0032');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.45);
  ctx.rotate(t * 0.08);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -W * 0.12); ctx.lineTo(W, W * 0.12); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

const motifs = {
  // Kräftiges Pink (LEDWALL 360) mit weichen, langsam wandernden Lichtflächen
  pink(ctx, W, H, t) {
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#2b0019');
    bg.addColorStop(0.5, '#6e003c');
    bg.addColorStop(1, '#22001a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const blobs = [
      { c: '231,0,127', fx: 0.07, fy: 0.05, px: 0.0, py: 1.0, r: 0.8, a: 0.55 },
      { c: '255,70,170', fx: 0.05, fy: 0.08, px: 2.1, py: 0.3, r: 0.55, a: 0.4 },
      { c: '150,0,255', fx: 0.04, fy: 0.06, px: 4.0, py: 2.2, r: 0.6, a: 0.3 },
      { c: '255,0,90', fx: 0.06, fy: 0.04, px: 5.2, py: 3.7, r: 0.5, a: 0.35 }
    ];
    const R = Math.max(W, H);
    blobs.forEach((b) => {
      const x = W * (0.5 + 0.45 * Math.sin(t * b.fx * 2 + b.px));
      const y = H * (0.5 + 0.45 * Math.cos(t * b.fy * 2 + b.py));
      const r = R * b.r * (0.9 + 0.1 * Math.sin(t * 0.25 + b.px));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.c},${b.a})`);
      g.addColorStop(1, `rgba(${b.c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    });
    // feiner Lichtstreifen, der langsam diagonal durchläuft
    const sx = ((t * 0.06) % 1.6 - 0.3) * W;
    const sg = ctx.createLinearGradient(sx - W * 0.15, 0, sx + W * 0.15, H);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,180,220,0.10)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  },

  // Bewegter Werbungs-Hintergrund mit schwebendem LEDWALL-360-Logo
  logo(ctx, W, H, t) {
    promoBackground(ctx, W, H, t);
    const src = logoSource();
    if (!src) return;
    const [v, vw, vh] = src;
    const pulse = 1 + 0.05 * Math.sin(t * 0.5);
    const scale = Math.min((W * 0.72) / vw, (H * 0.72) / vh) * pulse;
    const dw = vw * scale, dh = vh * scale;
    const cx = W / 2 + Math.sin(t * 0.35) * W * 0.05;
    const cy = H / 2 + Math.sin(t * 0.55 + 1) * H * 0.06;
    // dunklere Zone hinter dem Logo, damit die pinke "360" nicht im Hintergrund verschwindet
    const shade = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(dw, dh) * 0.62);
    shade.addColorStop(0, 'rgba(14,0,8,0.78)');
    shade.addColorStop(0.65, 'rgba(14,0,8,0.45)');
    shade.addColorStop(1, 'rgba(14,0,8,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    // "screen" blendet den schwarzen Videohintergrund aus, das Logo bleibt stehen
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(v, cx - dw / 2, cy - dh / 2, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
  },

  promo(ctx, W, H, t) {
    promoBackground(ctx, W, H, t);
    const pulse = 1 + 0.07 * Math.sin(t * 2.2);
    const fs = Math.min(W * 0.16, H * 0.42) * pulse;
    const bob = Math.sin(t * 1.1) * H * 0.03;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${fs}px Inter, Arial, sans-serif`;
    ctx.fillText('SALE −30 %', W / 2, H * 0.42 + bob);
    // Laufschrift
    const bandH = Math.max(H * 0.16, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, H - bandH, W, bandH);
    ctx.fillStyle = '#e7007f';
    ctx.font = `700 ${bandH * 0.5}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'left';
    const msg = 'Neue Kollektion  ·  Jetzt im Store  ·  Nur diese Woche  ·  ';
    const mw = ctx.measureText(msg).width;
    const off = -((t * 45) % mw);
    for (let x = off; x < W; x += mw) ctx.fillText(msg, x, H - bandH / 2);
  },

  custom(ctx, W, H, t) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (content.media) drawCover(ctx, content.media, W, H);
  }
};

function drawContent(t) {
  const ctx = content.canvas.getContext('2d');
  const W = content.canvas.width, H = content.canvas.height;
  (motifs[state.content] || motifs.logo)(ctx, W, H, t);
  content.texture.needsUpdate = true;
}

/* ------------------------------ WALL BUILDING ----------------------------- */

const wallGroup = new THREE.Group();
scene.add(wallGroup);
const supportGroup = new THREE.Group();
scene.add(supportGroup);

let seamMaterial;

function curvedPoint(u, v, totalWidth, totalHeight, bendDeg) {
  // u,v in [0,1]. Bend only along horizontal axis (x/z), like real flex/curtain panels.
  const y = (v - 0.5) * totalHeight;
  if (Math.abs(bendDeg) < 0.5) {
    return { x: (u - 0.5) * totalWidth, y, z: 0, nx: 0, ny: 0, nz: 1 };
  }
  const angleTotal = (bendDeg * Math.PI) / 180;
  const sign = angleTotal > 0 ? 1 : -1;
  const absAngle = Math.abs(angleTotal);
  const radius = totalWidth / absAngle;
  const theta = (u - 0.5) * absAngle;
  const x = radius * Math.sin(theta);
  const z = -sign * radius * (1 - Math.cos(theta));
  // outward normal points from curvature center (0,0,-sign*radius) toward (x,z)
  const cz = -sign * radius;
  let nX = x - 0, nZ = z - cz;
  const len = Math.hypot(nX, nZ) || 1;
  nX /= len; nZ /= len;
  return { x, y, z, nx: nX, ny: 0, nz: nZ };
}

function buildWallMeshes() {
  wallGroup.clear();

  const L = getLayout();
  const cols = L.cols, rows = L.rowHeights.length;
  const totalWidth = L.totalWidth;
  const totalHeight = L.totalHeight;
  const rowEdges = [0];
  L.rowHeights.forEach((h) => rowEdges.push(rowEdges[rowEdges.length - 1] + h));
  const bend = 0; // nur starre Panels
  const thickness = 0.09;

  const segX = cols, segY = rows;
  const frontPos = [], backPos = [], uvs = [];
  const gridPoints = [];

  for (let j = 0; j <= segY; j++) {
    const row = [];
    for (let i = 0; i <= segX; i++) {
      const u = i / segX, v = rowEdges[j] / totalHeight;
      const p = curvedPoint(u, v, totalWidth, totalHeight, bend);
      row.push(p);
    }
    gridPoints.push(row);
  }

  const idx = (i, j) => j * (segX + 1) + i;
  const frontIndices = [], backIndices = [];

  for (let j = 0; j <= segY; j++) {
    for (let i = 0; i <= segX; i++) {
      const p = gridPoints[j][i];
      frontPos.push(p.x, p.y, p.z);
      backPos.push(p.x - p.nx * thickness, p.y - p.ny * thickness, p.z - p.nz * thickness);
      uvs.push(i / segX, rowEdges[j] / totalHeight);
    }
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
      frontIndices.push(a, b, c, a, c, d);
      backIndices.push(a, c, b, a, d, c);
    }
  }

  const frontGeo = new THREE.BufferGeometry();
  frontGeo.setAttribute('position', new THREE.Float32BufferAttribute(frontPos, 3));
  frontGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  frontGeo.setIndex(frontIndices);
  frontGeo.computeVertexNormals();

  const backGeo = new THREE.BufferGeometry();
  backGeo.setAttribute('position', new THREE.Float32BufferAttribute(backPos, 3));
  backGeo.setIndex(backIndices);
  backGeo.computeVertexNormals();

  sizeContentCanvas(totalWidth, totalHeight);

  const contentMat = new THREE.MeshBasicMaterial({ map: content.texture, toneMapped: false });
  // Etwas mehr Sättigung und Helligkeit, damit die Wand wie ein echtes LED-Bild leuchtet
  contentMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float ledLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = clamp(mix(vec3(ledLuma), diffuseColor.rgb, 1.3) * 1.15, 0.0, 1.0);`);
  };
  const frontMesh = new THREE.Mesh(frontGeo, contentMat);
  wallGroup.add(frontMesh);

  const mask = makeLedTexture(state.pitch);
  mask.repeat.set(totalWidth / TILE_M, totalHeight / TILE_M);
  const maskMat = new THREE.MeshBasicMaterial({
    map: mask, transparent: true, premultipliedAlpha: true,
    blending: THREE.MultiplyBlending, depthWrite: false
  });
  const maskMesh = new THREE.Mesh(frontGeo.clone(), maskMat);
  maskMesh.position.z += 0.0015;
  wallGroup.add(maskMesh);

  const backMat = new THREE.MeshStandardMaterial({
    color: state.gob ? 0x1c1c1f : 0x161618,
    roughness: 0.6,
    metalness: 0.3
  });
  const backMesh = new THREE.Mesh(backGeo, backMat);
  wallGroup.add(backMesh);

  // Perimeter side ribbon for a sense of physical depth
  const sidePos = [];
  function pushQuad(pA, pB, pA2, pB2) {
    sidePos.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pB2.x, pB2.y, pB2.z);
    sidePos.push(pA.x, pA.y, pA.z, pB2.x, pB2.y, pB2.z, pA2.x, pA2.y, pA2.z);
  }
  function backOf(p) { return { x: p.x - p.nx * thickness, y: p.y - p.ny * thickness, z: p.z - p.nz * thickness }; }
  for (let i = 0; i < segX; i++) { // bottom & top edges
    const b1 = gridPoints[0][i], b2 = gridPoints[0][i + 1];
    pushQuad(b1, b2, backOf(b1), backOf(b2));
    const t1 = gridPoints[segY][i], t2 = gridPoints[segY][i + 1];
    pushQuad(t2, t1, backOf(t2), backOf(t1));
  }
  for (let j = 0; j < segY; j++) { // left & right edges
    const l1 = gridPoints[j][0], l2 = gridPoints[j + 1][0];
    pushQuad(l2, l1, backOf(l2), backOf(l1));
    const r1 = gridPoints[j][segX], r2 = gridPoints[j + 1][segX];
    pushQuad(r1, r2, backOf(r1), backOf(r2));
  }
  const sideGeo = new THREE.BufferGeometry();
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  sideGeo.computeVertexNormals();
  const sideMesh = new THREE.Mesh(sideGeo, backMat);
  wallGroup.add(sideMesh);

  // Panel-Fugen als echte 3D-Geometrie (statt dünner GL-Linien), damit sie auch
  // aus der Nähe klar erkennbar bleiben und nicht auf 1px zusammenschrumpfen.
  function buildSeamGeometry(points2D, hw) {
    const pos = [];
    function tangentAt(i, j) {
      let a, b;
      if (i === 0) { a = points2D[j][0]; b = points2D[j][1]; }
      else if (i === segX) { a = points2D[j][segX - 1]; b = points2D[j][segX]; }
      else { a = points2D[j][i - 1]; b = points2D[j][i + 1]; }
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: dx / len, z: dz / len };
    }
    // Vertikale Fugen (zwischen Spalten), Breite entlang der Wandkrümmung
    for (let i = 0; i <= segX; i++) {
      for (let j = 0; j < segY; j++) {
        const p1 = points2D[j][i], p2 = points2D[j + 1][i];
        const t1 = tangentAt(i, j), t2 = tangentAt(i, j + 1);
        const a1 = { x: p1.x + t1.x * hw, y: p1.y, z: p1.z + t1.z * hw };
        const a2 = { x: p1.x - t1.x * hw, y: p1.y, z: p1.z - t1.z * hw };
        const b1 = { x: p2.x + t2.x * hw, y: p2.y, z: p2.z + t2.z * hw };
        const b2 = { x: p2.x - t2.x * hw, y: p2.y, z: p2.z - t2.z * hw };
        pos.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, b2.x, b2.y, b2.z);
        pos.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
      }
    }
    // Horizontale Fugen (zwischen Reihen), Breite in Y (Krümmung ist Y-invariant)
    for (let j = 0; j <= segY; j++) {
      for (let i = 0; i < segX; i++) {
        const p1 = points2D[j][i], p2 = points2D[j][i + 1];
        const a1 = { x: p1.x, y: p1.y + hw, z: p1.z };
        const a2 = { x: p1.x, y: p1.y - hw, z: p1.z };
        const b1 = { x: p2.x, y: p2.y + hw, z: p2.z };
        const b2 = { x: p2.x, y: p2.y - hw, z: p2.z };
        pos.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, b2.x, b2.y, b2.z);
        pos.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }

  const seamBias = 0.0035;
  const frontBiasedGrid = gridPoints.map(row => row.map(p => ({
    x: p.x + p.nx * seamBias, y: p.y + p.ny * seamBias, z: p.z + p.nz * seamBias
  })));
  const backBiasedGrid = gridPoints.map(row => row.map(p => ({
    x: p.x - p.nx * (thickness + seamBias), y: p.y - p.ny * (thickness + seamBias), z: p.z - p.nz * (thickness + seamBias)
  })));

  const seamGroup = new THREE.Group();
  const seamGeoFront = buildSeamGeometry(frontBiasedGrid, 0.011);
  seamMaterial = new THREE.MeshBasicMaterial({ color: 0x0a0a0c, side: THREE.DoubleSide });
  const seamMeshFront = new THREE.Mesh(seamGeoFront, seamMaterial);
  seamGroup.add(seamMeshFront);

  const seamGeoBack = buildSeamGeometry(backBiasedGrid, 0.009);
  const seamMaterialBack = new THREE.MeshBasicMaterial({ color: 0x3a3a3f, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
  const seamMeshBack = new THREE.Mesh(seamGeoBack, seamMaterialBack);
  seamGroup.add(seamMeshBack);

  seamGroup.visible = state.showEdges;
  wallGroup.add(seamGroup);

  // GOB: transparente Schutzschicht vor den LEDs, nur als leichter Glanz sichtbar
  if (state.gob) {
    const coat = new THREE.Group();
    const gloss = new THREE.Mesh(frontGeo.clone(), new THREE.MeshPhongMaterial({
      color: 0xffffff, transparent: true, opacity: 0.05, shininess: 90, specular: 0x666666, depthWrite: false
    }));
    gloss.position.z += 0.006;
    coat.add(gloss);
    // sichtbare Kante der Harzschicht
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.25 });
    const ew = 0.012;
    [[totalWidth + ew * 2, ew, 0, totalHeight / 2 + ew / 2], [totalWidth + ew * 2, ew, 0, -totalHeight / 2 - ew / 2],
     [ew, totalHeight, totalWidth / 2 + ew / 2, 0], [ew, totalHeight, -totalWidth / 2 - ew / 2, 0]].forEach(([w, h, x, y]) => {
      const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.008), edgeMat);
      e.position.set(x, y, 0.004);
      coat.add(e);
    });
    wallGroup.add(coat);
  }

  buildBackside(L, thickness);

  return { totalWidth, totalHeight, gridPoints, thickness };
}

/* ------------------------------ RÜCKSEITE --------------------------------- */
// Alles als InstancedMesh, damit auch 30 × 30 m flüssig bleiben.
const backLeds = { group: null, sets: [] };
const _m4 = new THREE.Matrix4();
const _ledColor = new THREE.Color();

function makeCableGeometry(len, sag) {
  // durchhängendes Kabel von (0,0,0) bis (len,0,0)
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    pts.push(new THREE.Vector3(u * len, -sag * 4 * u * (1 - u), -0.012 * Math.sin(Math.PI * u)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.007, 5, false);
}

function buildBackside(L, thickness) {
  const group = new THREE.Group();
  backLeds.sets = [];
  const y0 = -L.totalHeight / 2;
  if (L.bigRows) buildBacksideBand(group, L.totalWidth, L.cols, L.bigRows, 1, y0, thickness);
  if (L.smallRows) buildBacksideBand(group, L.totalWidth, L.cols, L.smallRows, 0.5, y0 + L.bigRows, thickness);
  backLeds.group = group;
  wallGroup.add(group);
}

function buildBacksideBand(group, totalWidth, cols, rows, panelH, yStart, thickness) {
  // Nachgebaut nach der Panel-Rückseite: schwarzes Gehäuse mit Querstreben,
  // senkrechter Mittelsteg (Netzteil + Empfangskarte) mit Status-LEDs,
  // Strom (rote Stecker) oben, Daten (orange Stecker) unten, Griffe an den Seiten.
  const panelW = 0.5, n = cols * rows;
  const backZ = -thickness;
  const centers = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      centers.push([-totalWidth / 2 + (i + 0.5) * panelW, yStart + (j + 0.5) * panelH]);
    }
  }
  function instanced(geo, mat, count, place) {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
    let k = 0;
    place((x, y, z, rz = 0) => {
      _m4.makeRotationZ(rz);
      _m4.setPosition(x, y, z);
      mesh.setMatrixAt(k++, _m4);
    });
    mesh.count = k;
    group.add(mesh);
    return mesh;
  }
  const mat = (color, rough = 0.6, metal = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  const each = (fn) => (put) => centers.forEach(([x, y]) => fn(put, x, y));

  const sw = Math.min(0.11, panelW * 0.22);   // Breite Mittelsteg
  const yP = panelH * 0.14, yD = -panelH * 0.14; // Höhe Strom- / Datenanschluss
  const plugX = sw / 2 + 0.022;

  // Gehäuse und Querstreben
  instanced(new THREE.BoxGeometry(panelW * 0.95, panelH * 0.95, 0.012), mat(0x17181b, 0.8), n,
    each((put, x, y) => put(x, y, backZ - 0.006)));
  const bars = panelH >= 1 ? [-0.36, -0.12, 0.12, 0.36] : [-0.28, 0.28];
  instanced(new THREE.BoxGeometry(panelW * 0.9, 0.028, 0.016), mat(0x232428, 0.55, 0.4), n * bars.length,
    each((put, x, y) => bars.forEach((f) => put(x, y + f * panelH, backZ - 0.018))));
  // Mittelsteg mit Rillen
  instanced(new THREE.BoxGeometry(sw, panelH * 0.86, 0.04), mat(0x111214, 0.6), n,
    each((put, x, y) => put(x, y, backZ - 0.03)));
  const grooves = [-0.018, -0.006, 0.006, 0.018];
  instanced(new THREE.BoxGeometry(0.005, panelH * 0.22, 0.004), mat(0x0b0b0d, 0.8, 0.1), n * grooves.length * 2,
    each((put, x, y) => grooves.forEach((g) => { put(x + g, y + panelH * 0.27, backZ - 0.051); put(x + g, y - panelH * 0.27, backZ - 0.051); })));
  // Griffe links und rechts
  instanced(new THREE.BoxGeometry(0.022, panelH * 0.24, 0.035), mat(0x141518, 0.5, 0.3), n * 2,
    each((put, x, y) => { put(x - panelW * 0.4, y, backZ - 0.03); put(x + panelW * 0.4, y, backZ - 0.03); }));
  // Buchsen (blau = Strom, silber = Daten) und Stecker (rot / orange)
  const sockets = (yy) => each((put, x, y) => { put(x - sw / 2 - 0.006, y + yy, backZ - 0.03); put(x + sw / 2 + 0.006, y + yy, backZ - 0.03); });
  instanced(new THREE.BoxGeometry(0.014, 0.034, 0.03), mat(0x1e5fd9, 0.5), n * 2, sockets(yP));
  instanced(new THREE.BoxGeometry(0.014, 0.028, 0.026), mat(0xb8bcc4, 0.35, 0.8), n * 2, sockets(yD));
  const plugs = (yy) => each((put, x, y) => { put(x - plugX + 0.006, y + yy, backZ - 0.03); put(x + plugX - 0.006, y + yy, backZ - 0.03); });
  instanced(new THREE.BoxGeometry(0.03, 0.026, 0.026), mat(0xe0321e, 0.45), n * 2, plugs(yP));
  instanced(new THREE.BoxGeometry(0.028, 0.02, 0.022), mat(0xf08a1e, 0.45), n * 2, plugs(yD));

  // Kabel (schwarz) zum Nachbarpanel: Strom in jeder Reihe, Daten als Schlange
  const cableMat = mat(0x0e0e10, 0.55, 0.1);
  const span = panelW - 2 * plugX;
  const hP = makeCableGeometry(span, Math.min(0.14, panelH * 0.14)), hD = makeCableGeometry(span, Math.min(0.11, panelH * 0.11));
  const horiz = (yy) => (put) => {
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols - 1; i++) {
      const [x, y] = centers[j * cols + i];
      put(x + plugX, y + yy, backZ - 0.032);
    }
  };
  instanced(hP, cableMat, rows * (cols - 1), horiz(yP));
  instanced(hD, cableMat, rows * (cols - 1), horiz(yD));
  // senkrecht zwischen den Reihen: Daten abwechselnd am rechten/linken Rand, Strom links
  const vGeo = makeCableGeometry(panelH, 0.06);
  instanced(vGeo, cableMat, rows, (put) => {
    for (let j = 0; j < rows - 1; j++) {
      const right = j % 2 === 0;
      const [x, y] = centers[j * cols + (right ? cols - 1 : 0)];
      put(x + (right ? plugX : -plugX), y + yD, backZ - 0.032, Math.PI / 2);
    }
  });
  instanced(vGeo, cableMat, rows, (put) => {
    for (let j = 0; j < rows - 1; j++) {
      const [x, y] = centers[j * cols];
      put(x - plugX, y + yP, backZ - 0.032, Math.PI / 2);
    }
  });

  // Status-LEDs mittig auf dem Steg: grün = Betrieb, orange = Datensignal
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const ledMesh = instanced(new THREE.SphereGeometry(0.0065, 8, 6), ledMat, n * 2,
    each((put, x, y) => { put(x + 0.009, y - panelH * 0.02, backZ - 0.051); put(x - 0.009, y - panelH * 0.02, backZ - 0.051); }));
  const phases = Array.from({ length: n * 2 }, () => Math.random() * 10);
  const kinds = Array.from({ length: n * 2 }, (_, k) => k % 2);
  for (let k = 0; k < n * 2; k++) ledMesh.setColorAt(k, _ledColor.set(0x00ff66));
  backLeds.sets.push({ mesh: ledMesh, phases, kinds });
}

function updateBackLeds(t) {
  // Rückseite nur zeichnen, wenn man sie auch sieht
  if (backLeds.group) backLeds.group.visible = camera.position.z < 0.3;
  // nur aktualisieren, wenn man auf die Rückseite schaut
  if (camera.position.z > wallGroup.position.z) return;
  backLeds.sets.forEach(({ mesh: m, phases, kinds }) => {
  if (!m.instanceColor) return;
  for (let k = 0; k < m.count; k++) {
    const ph = phases[k];
    if (kinds[k] === 0) {
      const on = Math.sin(t * 2.2 + ph) > -0.3;
      _ledColor.setRGB(0, on ? 1 : 0.08, on ? 0.4 : 0.03);
    } else {
      const on = Math.sin(t * 17 + ph * 3) * Math.sin(t * 5.3 + ph) > 0.1;
      _ledColor.setRGB(on ? 1 : 0.1, on ? 0.55 : 0.05, 0);
    }
    m.setColorAt(k, _ledColor);
  }
  m.instanceColor.needsUpdate = true;
  });
}

/* ------------------------------ SUPPORT RIGS ------------------------------ */

function buildSupport(dims) {
  supportGroup.clear();
  const { totalWidth, totalHeight } = dims;
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3f, roughness: 0.4, metalness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5, metalness: 0.6 });

  if (state.mount === 'truss') {
    const wallBottomY = 1.6; // lifted off the ground
    wallGroup.position.y = wallBottomY + totalHeight / 2;
    const trussY = wallBottomY + totalHeight + 0.35;
    const trussLen = totalWidth + 0.8;

    // Truss box (simple triangular truss look via 3 tubes + cross bars)
    const trussGroup = new THREE.Group();
    const tubeR = 0.035;
    [-0.28, 0.28].forEach((dz) => {
      [0.28, -0.05].forEach((dy) => {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(tubeR, tubeR, trussLen, 8), metalMat);
        tube.rotation.z = Math.PI / 2;
        tube.position.set(0, dy, dz);
        trussGroup.add(tube);
      });
    });
    const braceCount = Math.max(4, Math.round(trussLen * 1.5));
    for (let i = 0; i <= braceCount; i++) {
      const x = -trussLen / 2 + (i / braceCount) * trussLen;
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), metalMat);
      brace.rotation.x = Math.PI / 2.6 * (i % 2 === 0 ? 1 : -1);
      brace.position.set(x, 0.13, 0);
      trussGroup.add(brace);
    }
    trussGroup.position.y = trussY;
    supportGroup.add(trussGroup);

    // Hanging bars + cables down to wall
    const barCount = Math.min(Math.max(Math.round(totalWidth / 1.2), 2), 10);
    for (let i = 0; i < barCount; i++) {
      const x = -totalWidth / 2 + (i + 0.5) * (totalWidth / barCount);
      const cableGeo = new THREE.CylinderGeometry(0.008, 0.008, trussY - (wallBottomY + totalHeight) + 0.05, 6);
      const cable = new THREE.Mesh(cableGeo, darkMat);
      cable.position.set(x, (trussY + (wallBottomY + totalHeight)) / 2, totalWidth > 0 ? 0 : 0);
      supportGroup.add(cable);

      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.2), metalMat);
      bar.position.set(x, wallBottomY + totalHeight + 0.03, 0);
      supportGroup.add(bar);
    }
  }

  if (state.mount === 'wall') {
    const wallBottomY = 1.0;
    wallGroup.position.y = wallBottomY + totalHeight / 2;
    const wallZ = -0.24; // Gebäudewand direkt hinter der LED-Wand (ca. 15 cm Abstand)

    // Gebäudefassade vom Boden bis über die LED-Wand
    const buildingH = Math.max(wallBottomY + totalHeight + 1.6, 4.5);
    const buildingW = totalWidth + 8;
    const facadeMat = new THREE.MeshStandardMaterial({ map: makeFacadeTexture(buildingW, buildingH, totalWidth), roughness: 0.92 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xb9b3aa, roughness: 0.95 });
    const building = new THREE.Group();
    building.name = 'building';
    // nur die Vorderseite trägt die Fassade, die übrigen Seiten bleiben schlicht
    const body = new THREE.Mesh(new THREE.BoxGeometry(buildingW, buildingH, 0.3),
      [sideMat, sideMat, sideMat, sideMat, facadeMat, sideMat]);
    body.position.set(0, buildingH / 2, wallZ - 0.15);
    building.add(body);
    // Sockel und Gesims als echte Vorsprünge
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x3b3b3e, roughness: 0.7 });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(buildingW, 0.45, 0.08), trimMat);
    plinth.position.set(0, 0.225, wallZ + 0.04);
    building.add(plinth);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(buildingW + 0.2, 0.22, 0.2), trimMat);
    cornice.position.set(0, buildingH - 0.11, wallZ + 0.1);
    building.add(cornice);
    supportGroup.add(building);

    // Zwei waagerechte Montageschienen über die ganze Breite, mit Wandhaltern
    const railMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.35, metalness: 0.85 });
    const railZ = -0.14;
    [0.22, 0.78].forEach((f) => {
      const y = wallBottomY + totalHeight * f;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(totalWidth - 0.1, 0.06, 0.04), railMat);
      rail.position.set(0, y, railZ);
      supportGroup.add(rail);
      const holders = Math.max(2, Math.round(totalWidth) + 1);
      for (let i = 0; i < holders; i++) {
        const x = -totalWidth / 2 + 0.15 + (i / (holders - 1)) * (totalWidth - 0.3);
        const armLen = railZ - wallZ;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, armLen), darkMat);
        arm.position.set(x, y, wallZ + armLen / 2);
        supportGroup.add(arm);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.012), railMat);
        plate.position.set(x, y, wallZ + 0.006);
        supportGroup.add(plate);
      }
    });
  }

  if (state.mount === 'floor') {
    // Ground Beam (20 cm) als Schutz unter der ersten Panelreihe
    const beamH = 0.2;
    wallGroup.position.y = beamH + totalHeight / 2;
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.55, metalness: 0.5 });
    const backZ = -0.09; // Rückseite der Panels

    const beam = new THREE.Group();
    const beamBody = new THREE.Mesh(new THREE.BoxGeometry(totalWidth, beamH - 0.04, 0.12), steelMat);
    beamBody.position.set(0, 0.04 + (beamH - 0.04) / 2, backZ / 2);
    beam.add(beamBody);
    // Füße mit Gummipuffern alle 50 cm
    const padMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 });
    const pads = Math.max(2, Math.round(totalWidth / 0.5) + 1);
    for (let i = 0; i < pads; i++) {
      const x = -totalWidth / 2 + 0.08 + (i / (pads - 1)) * (totalWidth - 0.16);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.04, 14), padMat);
      pad.position.set(x, 0.02, backZ / 2);
      beam.add(pad);
    }
    supportGroup.add(beam);

    // Stacking Structures: Stahlrahmen 50 cm tief hinter der Wand, alle 1 m.
    // Erster Rahmen 1,20 m (Ground Beam + erste Panelreihe), darüber je 1 m.
    const segments = [];
    const topY = beamH + totalHeight;
    let y0 = 0;
    while (y0 < topY - 0.05) {
      const h = Math.min(y0 === 0 ? 1.2 : 1.0, topY - y0);
      segments.push([y0, h]);
      y0 += h;
    }
    const tube = 0.04, depth = 0.5;
    const frameCount = Math.max(2, Math.round(totalWidth));
    for (let i = 0; i < frameCount; i++) {
      const x = -totalWidth / 2 + (i + 0.5) * (totalWidth / frameCount);
      segments.forEach(([sy, h]) => {
        const f = buildStackingFrame(h, depth, tube, steelMat);
        f.position.set(x, sy, backZ);
        supportGroup.add(f);
      });
    }
  }
}

// Stacking Structure wie im Foto: Rechteck aus Vierkantrohr mit Mittelstrebe und
// Eckstreben an der Wandseite. Lokal: y von 0 bis h, z von 0 (Wand) bis -depth.
function buildStackingFrame(h, depth, tube, mat) {
  const g = new THREE.Group();
  const bar = (len, x, y, z, rotX = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(tube, tube, len), mat);
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    g.add(m);
  };
  const post = (y0, y1, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(tube, y1 - y0, tube), mat);
    m.position.set(0, (y0 + y1) / 2, z);
    g.add(m);
  };
  const zw = -tube / 2, zr = -depth + tube / 2;
  post(0, h, zw);                       // Wandseite
  post(0, h, zr);                       // Rückseite
  [tube / 2, h - tube / 2, h / 2].forEach((y) => bar(depth, 0, y, -depth / 2)); // oben, unten, Mitte
  // Eckstreben an der Wandseite (oben und unten), 45°
  const c = Math.min(0.14, h * 0.15);
  const diag = Math.hypot(c, c);
  bar(diag, 0, h - tube - c / 2, -tube - c / 2, Math.PI / 4);
  bar(diag, 0, tube + c / 2, -tube - c / 2, -Math.PI / 4);
  // Verbindungslasche zur Panel-Rückseite
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.01), mat);
  plate.position.set(0, h - 0.08, 0.004);
  g.add(plate);
  return g;
}

// Fassadentextur: Betonplatten mit Fugen, Sockel, Gesims (ohne Fenster)
function makeFacadeTexture(bw, bh, ledW) {
  const ppm = Math.min(64, 2048 / Math.max(bw, bh));
  const c = document.createElement('canvas');
  c.width = Math.round(bw * ppm); c.height = Math.round(bh * ppm);
  const ctx = c.getContext('2d');
  const outdoor = state.location === 'outdoor';
  const X = (m) => (m + bw / 2) * ppm, Y = (m) => c.height - m * ppm;
  ctx.fillStyle = outdoor ? '#d8d3cb' : '#c9c3ba';
  ctx.fillRect(0, 0, c.width, c.height);
  // Plattenraster 2,5 × 1,25 m mit leichter Tonvariation
  const pw = 2.5, ph = 1.25;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let px = -bw / 2 - (bw / 2 % pw); px < bw / 2; px += pw) {
    for (let py = 0.45; py < bh; py += ph) {
      const v = Math.round((rnd() - 0.5) * 14);
      ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
      ctx.fillRect(X(px), Y(py + ph), pw * ppm, ph * ppm);
      // Ankerlöcher wie bei Sichtbeton
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      [[0.3, 0.3], [pw - 0.3, 0.3], [0.3, ph - 0.3], [pw - 0.3, ph - 0.3]].forEach(([ax, ay]) => {
        ctx.beginPath(); ctx.arc(X(px + ax), Y(py + ay), Math.max(1.2, 0.025 * ppm), 0, Math.PI * 2); ctx.fill();
      });
    }
  }
  ctx.strokeStyle = 'rgba(60,55,50,0.45)';
  ctx.lineWidth = Math.max(1, 0.015 * ppm);
  for (let px = -bw / 2 - (bw / 2 % pw); px < bw / 2; px += pw) { ctx.beginPath(); ctx.moveTo(X(px), 0); ctx.lineTo(X(px), c.height); ctx.stroke(); }
  for (let py = 0.45; py < bh; py += ph) { ctx.beginPath(); ctx.moveTo(0, Y(py)); ctx.lineTo(c.width, Y(py)); ctx.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = maxAnisotropy;
  return t;
}

/* --------------------------- VIEWING DISTANCE / PERSON --------------------- */

const distanceGroup = new THREE.Group();
scene.add(distanceGroup);

function makeLabelSprite(text) {
  // In 4-facher Auflösung zeichnen, damit die Schrift auch nah dran und auf
  // hochauflösenden Bildschirmen scharf bleibt.
  const S = 4;
  const cnv = document.createElement('canvas');
  cnv.width = 256 * S; cnv.height = 96 * S;
  const ctx = cnv.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = 'rgba(10,10,11,0.85)';
  roundRect(ctx, 4, 20, 248, 56, 14);
  ctx.fill();
  ctx.strokeStyle = '#e7007f';
  ctx.lineWidth = 2.5;
  roundRect(ctx, 4, 20, 248, 56, 14);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px "Inter", "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 49);
  const tex = new THREE.CanvasTexture(cnv);
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = maxAnisotropy;
  // fog: false – sonst verblasst das Label im Nebel und wirkt verwaschen
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.4, 0.52, 1);
  sprite.renderOrder = 10;
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function buildDummyFigure() {
  // Weiße 3D-Figur (ca. 1,78 m) mit pinken Akzenten: Cap, Uhr und Sneaker.
  const g = new THREE.Group();
  const mat = (color, rough = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const body = mat(0xf2f2f4, 0.45);
  const pink = mat(0xe7007f, 0.4);
  const sole = mat(0xffffff, 0.6);
  const mesh = (geo, m) => new THREE.Mesh(geo, m);

  // Gegliedertes Körperteil: Zylinder mit abgerundeten Enden
  function limb(len, rTop, rBottom, m) {
    const lg = new THREE.Group();
    const c = mesh(new THREE.CylinderGeometry(rTop, rBottom, len, 16), m);
    c.position.y = -len / 2;
    lg.add(c);
    lg.add(mesh(new THREE.SphereGeometry(rTop, 16, 12), m));
    const bottom = mesh(new THREE.SphereGeometry(rBottom, 16, 12), m);
    bottom.position.y = -len;
    lg.add(bottom);
    return lg;
  }

  // --- Beine & pinke Sneaker ---
  const hipY = 0.93;
  [-1, 1].forEach((side) => {
    const thigh = limb(0.43, 0.088, 0.066, body);
    thigh.position.set(side * 0.095, hipY, 0);
    g.add(thigh);
    const shin = limb(0.40, 0.064, 0.052, body);
    shin.position.set(side * 0.095, hipY - 0.43, 0);
    g.add(shin);
    const foot = mesh(new THREE.BoxGeometry(0.10, 0.065, 0.24), pink);
    foot.position.set(side * 0.095, 0.055, 0.05);
    g.add(foot);
    const toe = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 16), pink);
    toe.position.set(side * 0.095, 0.055, 0.17);
    g.add(toe);
    const soleMesh = mesh(new THREE.BoxGeometry(0.112, 0.026, 0.31), sole);
    soleMesh.position.set(side * 0.095, 0.013, 0.07);
    g.add(soleMesh);
  });

  // Becken und Oberkörper (glatt, ohne Kleidung, wie eine 3D-Figur)
  const pelvis = mesh(new THREE.CylinderGeometry(0.165, 0.15, 0.16, 20), body);
  pelvis.scale.z = 0.65;
  pelvis.position.y = hipY + 0.03;
  g.add(pelvis);
  const profile = [
    [0.150, 0.00], [0.148, 0.08], [0.160, 0.22], [0.182, 0.36],
    [0.190, 0.44], [0.170, 0.50], [0.110, 0.54], [0.055, 0.56], [0.0, 0.56]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = mesh(new THREE.LatheGeometry(profile, 28), body);
  torso.scale.z = 0.62;
  torso.position.y = hipY + 0.06;
  g.add(torso);
  const shoulderY = hipY + 0.06 + 0.46;

  // Hals und großer runder Kopf ohne Gesicht
  const neck = mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.09, 14), body);
  neck.position.y = shoulderY + 0.09;
  g.add(neck);
  const headY = shoulderY + 0.25;
  const head = mesh(new THREE.SphereGeometry(0.125, 28, 22), body);
  head.position.y = headY;
  g.add(head);

  // Pinke Cap: Kuppel plus Schirm nach vorne
  const capDome = mesh(new THREE.SphereGeometry(0.131, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), pink);
  capDome.position.set(0, headY + 0.012, 0);
  g.add(capDome);
  const brim = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), pink);
  brim.scale.set(0.95, 1, 0.95);
  brim.position.set(0, headY + 0.05, 0.075);
  brim.rotation.x = 0.15;
  g.add(brim);
  const button = mesh(new THREE.SphereGeometry(0.014, 10, 8), pink);
  button.position.set(0, headY + 0.135, 0);
  g.add(button);

  // --- Arme, links mit pinker Uhr ---
  [-1, 1].forEach((side) => {
    const arm = new THREE.Group();
    arm.add(limb(0.29, 0.06, 0.048, body));
    const foreGroup = new THREE.Group();
    foreGroup.position.y = -0.29;
    foreGroup.rotation.x = -0.18; // Ellbogen leicht gebeugt
    foreGroup.add(limb(0.26, 0.047, 0.038, body));
    const hand = mesh(new THREE.SphereGeometry(0.048, 14, 12), body);
    hand.scale.set(0.65, 1.4, 1);
    hand.position.y = -0.33;
    foreGroup.add(hand);
    if (side === -1) {
      const band = mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.03, 18), pink);
      band.position.y = -0.235;
      foreGroup.add(band);
      const face = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 18), pink);
      face.rotation.z = Math.PI / 2;
      face.position.set(-0.044, -0.235, 0);
      foreGroup.add(face);
    }
    arm.add(foreGroup);
    arm.position.set(side * 0.205, shoulderY - 0.02, 0);
    arm.rotation.z = side * 0.09;
    g.add(arm);
  });

  return g;
}

function viewingDistanceForPitch(pitchMm) {
  // Vom Kunden vorgegebene Richtwerte für den empfohlenen Mindestabstand.
  // 1,5 / 2 / 3,9 sind daraus abgeleitet (ca. 1,2–1,3 m pro mm Pitch).
  const table = { 1.5: 2, 2: 2.5, 2.6: 3, 2.9: 3.5, 3.9: 5 };
  return table[pitchMm] ?? pitchMm;
}

function buildDistanceIndicator(dims) {
  // Alte Label-Texturen freigeben, sonst sammelt sich beim Schieben des Reglers Grafikspeicher an
  distanceGroup.traverse(o => {
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    if (o.geometry) o.geometry.dispose();
  });
  distanceGroup.clear();
  const wallFrontZ = 0; // Vorderseite der Wand liegt näherungsweise bei z=0 (siehe curvedPoint)
  const dist = state.personDist;

  // Boden-Linie mit Endmarkierungen (seitlich versetzt, damit sie den Dummy nicht verdeckt)
  const lineX = -1.1;
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(lineX, 0.015, wallFrontZ),
    new THREE.Vector3(lineX, 0.015, wallFrontZ + dist)
  ]);
  distanceGroup.add(new THREE.Line(lineGeo, lineMat));

  [wallFrontZ, wallFrontZ + dist].forEach((z) => {
    const tickGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(lineX - 0.12, 0.015, z), new THREE.Vector3(lineX + 0.12, 0.015, z)
    ]);
    distanceGroup.add(new THREE.Line(tickGeo, lineMat));
  });

  // Distanz-Label über der Linienmitte
  const label = makeLabelSprite(`${fmtM(dist)}m`);
  label.position.set(lineX, 0.55, wallFrontZ + dist / 2);
  distanceGroup.add(label);

  // Figur vor der Wand im eingestellten Abstand, mit Blick zur Wand
  const person = buildDummyFigure();
  person.position.set(0.9, 0, wallFrontZ + dist);
  person.rotation.y = Math.PI;
  person.visible = state.showDummy;
  distanceGroup.add(person);
  [...distanceGroup.children].forEach((c) => { if (c !== person) c.visible = state.showDummy; });

  return dist;
}



function updateHUD(dims) {
  const L = getLayout();
  const pitchMm = state.pitch;
  const resX = Math.round((dims.totalWidth * 1000) / pitchMm);
  const resY = Math.round((dims.totalHeight * 1000) / pitchMm);
  const totalWeight = Math.round(L.weight);

  document.getElementById('hudSize').textContent = `${fmtM(dims.totalWidth)}m × ${fmtM(dims.totalHeight)}m`;
  document.getElementById('hudPanels').textContent = `${L.total} (${panelMixText(L)})`;
  document.getElementById('hudPitch').textContent = `P${pitchMm}`;
  document.getElementById('hudRes').textContent = `${resX} × ${resY} px`;
  document.getElementById('hudWeight').textContent = `${totalWeight} kg`;
  document.getElementById('hudSummary').textContent = `${fmtM(dims.totalWidth)}m × ${fmtM(dims.totalHeight)}m · P${pitchMm} · ${totalWeight} kg`;
  document.getElementById('hudDistance').textContent = `${fmtM(viewingDistanceForPitch(pitchMm))}m (Richtwert)`;
}

/* ------------------------------ MAIN REBUILD ------------------------------- */

function rebuild() {
  applyEnvironment();
  const dims = buildWallMeshes();
  buildSupport(dims);
  buildDistanceIndicator(dims);
  orbit.target.set(0, dims.totalHeight / 2 + (state.mount === 'floor' ? 0.3 : 1.2), 0);
  updateHUD(dims);
  updateConfigPreview();
  updateSizeDisplay();
}

/* -------------------------------- RESIZE ----------------------------------- */

function resize() {
  const el = document.querySelector('.viewer');
  const w = el.clientWidth, h = el.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
// Sobald die Schrift geladen ist, Abstands-Label einmal neu zeichnen (sonst Ersatzschrift)
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rebuild());
window.addEventListener('orientationchange', () => setTimeout(resize, 300));

/* --------------------------------- LOOP ------------------------------------ */

let clock = new THREE.Clock();
let lastContentT = -1;
let slowFrames = 0;
// Fällt die Bildrate dauerhaft unter ca. 40 fps, Auflösung schrittweise senken (bis 1-fach).
function adaptQuality(dt) {
  if (pixelRatio <= 1 || document.hidden) return;
  slowFrames = dt > 0.025 && dt < 0.25 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
  if (slowFrames > 45) {
    pixelRatio = Math.max(1, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    slowFrames = 0;
  }
}
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;
  updateCamera(dt);
  adaptQuality(dt);
  // Der Wandinhalt muss nicht 60-mal pro Sekunde neu auf die Grafikkarte:
  // 30 Bilder pro Sekunde reichen für die Animation und halbieren den Aufwand.
  if (t - lastContentT >= 1 / 30) {
    drawContent(t);
    lastContentT = t;
  }
  updateBackLeds(t);
  if (scene.fog) {
    scene.fog.near = Math.max(fogBase.near, view.radius * 0.8);
    scene.fog.far = Math.max(fogBase.far, view.radius * 2 + 10);
  }
  // Von hinten: pinkes Streiflicht aus, neutrales Licht an, damit die Rückseite schwarz wirkt
  const front = clamp(camera.position.z / 3 + 0.5, 0, 1);
  rimLight.intensity = rimBase * front;
  backLight.intensity = 0.6 * (1 - front);
  const building = supportGroup.getObjectByName('building');
  if (building) building.visible = camera.position.z > -0.2;
  renderer.render(scene, camera);
}

/* ============================== UI WIRING ================================= */

// Auf dem Handy klappt ein Tipp irgendwo auf den Kasten ihn auf oder zu
document.getElementById('hud').addEventListener('click', () => {
  if (!window.matchMedia('(max-width: 860px)').matches) return;
  const hud = document.getElementById('hud');
  hud.classList.toggle('collapsed');
  document.getElementById('hudToggle').setAttribute('aria-expanded', String(!hud.classList.contains('collapsed')));
});

function setActive(container, value, attr = 'data-val') {
  container.querySelectorAll('.seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute(attr) === value);
  });
}

function updateGobVisibility() {
  const gobField = document.getElementById('gobField');
  const isIndoor = state.location === 'indoor';
  gobField.style.display = isIndoor ? 'block' : 'none';
  if (!isIndoor && state.gob) {
    state.gob = false;
    document.getElementById('gobToggle').checked = false;
  }
}

document.getElementById('segLocation').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  state.location = btn.getAttribute('data-val');
  setActive(document.getElementById('segLocation'), state.location);
  updateGobVisibility();
  applyEnvironment();
  rebuild();
});
document.getElementById('dummyToggle').addEventListener('change', (e) => {
  state.showDummy = e.target.checked;
  document.getElementById('distField').style.display = state.showDummy ? 'block' : 'none';
  rebuild();
});

const PITCHES = [1.5, 2, 2.6, 2.9, 3.9];
// Gröbster Pitch, dessen Mindestabstand zum eingestellten Abstand passt.
function recommendedPitchForDistance(d) {
  const fitting = PITCHES.filter((p) => viewingDistanceForPitch(p) <= d + 1e-9);
  return fitting.length ? fitting[fitting.length - 1] : PITCHES[0];
}
function updateDistDisplay() {
  document.getElementById('distRange').value = state.personDist;
  document.getElementById('distVal').textContent = `${fmtM(state.personDist)}m`;
  const reco = recommendedPitchForDistance(state.personDist);
  document.getElementById('pitchRecoText').textContent = reco === state.pitch
    ? `✓ P${reco} passt zu ${fmtM(state.personDist)}m Abstand`
    : `Für ${fmtM(state.personDist)}m empfehlen wir P${reco}`;
  document.getElementById('pitchReco').classList.toggle('match', reco === state.pitch);
}
document.getElementById('pitchRecoBtn').addEventListener('click', () => {
  state.pitch = recommendedPitchForDistance(state.personDist);
  document.getElementById('pitchSelect').value = String(state.pitch);
  updateDistDisplay();
  rebuild();
});
document.getElementById('segContent').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  state.content = btn.getAttribute('data-val');
  setActive(document.getElementById('segContent'), state.content);
  document.getElementById('uploadLabel').classList.remove('active');
});
document.getElementById('contentFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (content.mediaUrl) URL.revokeObjectURL(content.mediaUrl);
  if (content.media && content.media.pause) content.media.pause();
  content.mediaUrl = URL.createObjectURL(file);
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video');
    v.src = content.mediaUrl; v.muted = true; v.loop = true; v.playsInline = true;
    v.play().catch(() => {});
    content.media = v;
  } else {
    const img = new Image();
    img.src = content.mediaUrl;
    content.media = img;
  }
  state.content = 'custom';
  setActive(document.getElementById('segContent'), '');
  document.getElementById('uploadLabel').classList.add('active');
  document.getElementById('uploadText').textContent = `✓ ${file.name}`;
});

document.getElementById('distRange').addEventListener('input', (e) => {
  state.personDist = parseFloat(e.target.value);
  updateDistDisplay();
  rebuild();
});
document.getElementById('segMount').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn'); if (!btn) return;
  state.mount = btn.getAttribute('data-val');
  setActive(document.getElementById('segMount'), state.mount);
  rebuild();
});

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
function fmtM(v) { return v.toFixed(1).replace('.', ','); }

// Maximal 30 × 30 m Wandfläche
const MAX_WALL_M = 30;
const LIMITS = {
  get cols() { return [2, Math.round(MAX_WALL_M / getPanelDims().panelW)]; },
  get rows() { return [2, Math.round(MAX_WALL_M / getPanelDims().panelH)]; } // in 0,5-m-Schritten
};

function updateSizeDisplay() {
  const { panelW, panelH } = getPanelDims();
  const colsInput = document.getElementById('colsVal');
  const rowsInput = document.getElementById('rowsVal');
  // Während der Eingabe nicht überschreiben
  if (document.activeElement !== colsInput) colsInput.value = fmtM(state.cols * panelW);
  if (document.activeElement !== rowsInput) rowsInput.value = fmtM(state.rows * panelH);
  const L = getLayout();
  const rowsCount = [L.bigRows, L.smallRows].filter(Boolean).join(' + ');
  document.getElementById('colsPanelsLabel').innerHTML = `${state.cols} Panel${state.cols === 1 ? '' : 's'}<br>nebeneinander`;
  document.getElementById('rowsPanelsLabel').innerHTML = `${rowsCount} Panel${L.bigRows + L.smallRows === 1 ? '' : 's'}<br>übereinander`;
  document.getElementById('panelTotal').innerHTML = `<b>Gesamt: ${L.total} Panels</b><br>${panelMixText(L)}`;
}

// Eingetippte Meter auf 50 cm runden (Komma oder Punkt erlaubt).
function applySizeInput(input, key) {
  const { panelW, panelH } = getPanelDims();
  const unit = key === 'cols' ? panelW : panelH;
  const meters = parseFloat(String(input.value).replace(',', '.').replace(/[^0-9.]/g, ''));
  if (!isNaN(meters) && meters > 0) {
    state[key] = clamp(Math.round(meters / unit), LIMITS[key][0], LIMITS[key][1]);
  }
  input.blur();
  updateSizeDisplay();
  rebuild();
}
[['colsVal', 'cols'], ['rowsVal', 'rows']].forEach(([id, key]) => {
  const input = document.getElementById(id);
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') applySizeInput(input, key); });
  input.addEventListener('change', () => applySizeInput(input, key));
});

document.getElementById('colsMinus').addEventListener('click', () => {
  state.cols = clamp(state.cols - 1, ...LIMITS.cols);
  updateSizeDisplay();
  rebuild();
});
document.getElementById('colsPlus').addEventListener('click', () => {
  state.cols = clamp(state.cols + 1, ...LIMITS.cols);
  updateSizeDisplay();
  rebuild();
});
document.getElementById('rowsMinus').addEventListener('click', () => {
  state.rows = clamp(state.rows - 1, ...LIMITS.rows);
  updateSizeDisplay();
  rebuild();
});
document.getElementById('rowsPlus').addEventListener('click', () => {
  state.rows = clamp(state.rows + 1, ...LIMITS.rows);
  updateSizeDisplay();
  rebuild();
});

document.getElementById('pitchSelect').addEventListener('change', (e) => {
  state.pitch = parseFloat(e.target.value);
  // Figur springt auf den neuen empfohlenen Abstand; danach frei verstellbar.
  state.personDist = viewingDistanceForPitch(state.pitch);
  updateDistDisplay();
  rebuild();
});
document.getElementById('gobToggle').addEventListener('change', (e) => {
  state.gob = e.target.checked;
  rebuild();
});

/* ------------------------------ CONFIG TEXT -------------------------------- */

function buildConfigText() {
  const L = getLayout();
  const totalWidth = L.totalWidth.toFixed(1);
  const totalHeight = L.totalHeight.toFixed(1);
  const totalWeight = Math.round(L.weight);
  const mountLabel = { truss: 'Hängend an Traverse (Hanging Bars)', wall: 'Feststehend / schwebend an der Wand', floor: 'Auf dem Boden (Ground Beam + Stacking Structures)' }[state.mount];

  const lines = [
    `Bereich: ${document.body.dataset.track === 'fest' ? 'Festinstallation' : 'Mobil (Events / Vermietung)'}`,
    `Einsatzort: ${state.location === 'indoor' ? 'Indoor' : 'Outdoor'}`,
    `Wandgröße: ${totalWidth} × ${totalHeight} m`,
    `Panels: ${L.big} × 0,5 × 1 m (hochkant)${L.small ? ` + ${L.small} × 0,5 × 0,5 m (oberste Reihe)` : ''}`,
    `Panelanzahl gesamt: ${L.total}`,
    `Pixel Pitch: P${state.pitch}`,
    `Auflösung ca.: ${Math.round((totalWidth * 1000) / state.pitch)} × ${Math.round((totalHeight * 1000) / state.pitch)} px`,
    `Empf. Betrachtungsabstand ca.: ${viewingDistanceForPitch(state.pitch).toFixed(1)} m`,
    `Aufbauart: ${mountLabel}`,
    `GOB-Beschichtung: ${state.gob ? 'Ja' : 'Nein'}`,
    `Gewicht ca.: ${totalWeight} kg (inkl. Kabel)`
  ];
  return lines.join('\n');
}

function updateConfigPreview() {
  const el = document.getElementById('configPreview');
  if (el) el.textContent = buildConfigText();
}

/* ------------------------------- MODAL / SEND ------------------------------ */

const modalOverlay = document.getElementById('modalOverlay');
document.getElementById('openModalBtn').addEventListener('click', () => {
  updateConfigPreview();
  document.getElementById('formView').style.display = 'block';
  document.getElementById('successBox').classList.remove('show');
  showFormError('');
  modalOverlay.classList.add('open');
});
document.getElementById('closeModalBtn').addEventListener('click', () => modalOverlay.classList.remove('open'));
document.getElementById('modalCloseX').addEventListener('click', () => modalOverlay.classList.remove('open'));
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove('open'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') modalOverlay.classList.remove('open'); });
document.getElementById('closeSuccessBtn').addEventListener('click', () => modalOverlay.classList.remove('open'));

document.getElementById('privacyLink').href = CONFIG.privacyUrl;

function showFormError(html) {
  const el = document.getElementById('formError');
  el.innerHTML = html;
  el.classList.toggle('show', !!html);
}

function validateForm() {
  const name = document.getElementById('fName');
  const email = document.getElementById('fEmail');
  const consent = document.getElementById('fConsent');
  const problems = [];
  name.classList.toggle('invalid', !name.value.trim());
  if (!name.value.trim()) problems.push('Name');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
  email.classList.toggle('invalid', !emailOk);
  if (!emailOk) problems.push('gültige E-Mail-Adresse');
  consent.closest('.consent-row').classList.toggle('invalid', !consent.checked);
  if (!consent.checked) problems.push('Einwilligung zum Datenschutz');
  return problems;
}

function mailtoFallbackLink(payload) {
  const body = encodeURIComponent(
    `Name: ${payload.fields.name}\nFirma: ${payload.fields.company}\nE-Mail: ${payload.fields.email}\nTelefon: ${payload.fields.phone}\n\nNachricht:\n${payload.fields.message}\n\n--- Konfiguration ---\n${payload.konfiguration}`
  );
  return `mailto:${CONFIG.recipientEmail}?subject=${encodeURIComponent('LEDWALL Konfigurator Anfrage')}&body=${body}`;
}

const submitBtn = document.getElementById('submitBtn');
submitBtn.addEventListener('click', async () => {
  showFormError('');
  const problems = validateForm();
  if (problems.length) {
    showFormError(`Bitte ergänzen: ${problems.join(', ')}.`);
    return;
  }

  const payload = {
    type: 'ledwall-konfigurator-anfrage',
    fields: {
      name: document.getElementById('fName').value.trim(),
      company: document.getElementById('fCompany').value.trim(),
      email: document.getElementById('fEmail').value.trim(),
      phone: document.getElementById('fPhone').value.trim(),
      message: document.getElementById('fMessage').value.trim()
    },
    hiddenFieldName: CONFIG.hiddenFieldName,
    konfiguration: buildConfigText()
  };

  // Spam-Bot hat das unsichtbare Feld ausgefüllt: so tun, als wäre alles gut.
  if (document.getElementById('fHoney').value) {
    document.getElementById('formView').style.display = 'none';
    document.getElementById('successBox').classList.add('show');
    return;
  }

  // Wenn eingebettet, zusätzlich an die übergeordnete Seite melden
  // (z.B. für Tracking). Der eigentliche Versand läuft unten per FormSubmit.
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, '*');
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Wird gesendet …';
  // Antwortet der Versanddienst nicht, nach 15 s abbrechen und die E-Mail-Alternative zeigen
  const abort = new AbortController();
  const abortTimer = setTimeout(() => abort.abort(), 15000);
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${CONFIG.recipientEmail}`, {
      method: 'POST',
      signal: abort.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        _subject: `LEDWALL Konfigurator Anfrage – ${payload.fields.name}${payload.fields.company ? ' (' + payload.fields.company + ')' : ''}`,
        _replyto: payload.fields.email,
        _template: 'box',
        _captcha: 'false',
        Name: payload.fields.name,
        Firma: payload.fields.company || '–',
        'E-Mail': payload.fields.email,
        Telefon: payload.fields.phone || '–',
        Nachricht: payload.fields.message || '–',
        Konfiguration: payload.konfiguration
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${res.status}`);

    document.getElementById('formView').style.display = 'none';
    document.getElementById('successBox').classList.add('show');
  } catch (err) {
    console.error('Anfrage konnte nicht gesendet werden:', err);
    showFormError(`Die Anfrage konnte leider nicht gesendet werden. Bitte versuchen Sie es erneut oder schreiben Sie uns direkt per <a href="${mailtoFallbackLink(payload)}">E-Mail an ${CONFIG.recipientEmail}</a>.`);
  } finally {
    clearTimeout(abortTimer);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Anfrage absenden';
  }
});

/* ------------------------------ TEILEN ------------------------------------- */

function showToast(text) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Konfiguration steckt im Link (#…), damit ein Empfänger dieselbe Wand sieht.
function configToHash() {
  const q = new URLSearchParams({
    ort: state.location, aufbau: state.mount,
    b: state.cols, hm: state.rows, pitch: state.pitch,
    gob: state.gob ? 1 : 0, abstand: state.personDist,
    inhalt: state.content === 'custom' ? 'logo' : state.content
  });
  return '#' + q.toString();
}
function applyHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.has('ort')) return false;
  const pick = (v, allowed, def) => (allowed.includes(v) ? v : def);
  state.location = pick(q.get('ort'), ['indoor', 'outdoor'], state.location);
  state.mount = pick(q.get('aufbau'), ['truss', 'wall', 'floor'], state.mount);
  // Aufbauart, die es in diesem Konfigurator nicht gibt (z. B. Wand bei Mobil), auf Standard zurücksetzen
  if (!document.querySelector(`#segMount [data-val="${state.mount}"]`)) state.mount = 'truss';
  const num = (k, def) => { const n = parseFloat(q.get(k)); return isNaN(n) ? def : n; };
  state.cols = clamp(Math.round(num('b', state.cols)), LIMITS.cols[0], LIMITS.cols[1]);
  // alte Links: h = Panelreihen des gewählten Typs (0,5 × 1 m zählte doppelt)
  const legacyRows = q.has('h') ? num('h', 3) * (q.get('panel') === '0.5x0.5' ? 1 : 2) : state.rows;
  state.rows = clamp(Math.round(num('hm', legacyRows)), LIMITS.rows[0], LIMITS.rows[1]);
  const pitch = num('pitch', state.pitch);
  state.pitch = PITCHES.includes(pitch) ? pitch : state.pitch;
  state.gob = q.get('gob') === '1' && state.location === 'indoor';
  state.personDist = clamp(num('abstand', viewingDistanceForPitch(state.pitch)), 1, 15);
  state.content = pick(q.get('inhalt'), ['logo', 'pink', 'promo'], state.content);
  // Oberfläche nachziehen
  setActive(document.getElementById('segLocation'), state.location);
  setActive(document.getElementById('segMount'), state.mount);
  setActive(document.getElementById('segContent'), state.content);
  document.getElementById('pitchSelect').value = String(state.pitch);
  document.getElementById('gobToggle').checked = state.gob;
  return true;
}
function shareUrl() {
  return location.href.split('#')[0] + configToHash();
}

document.getElementById('shareLinkBtn').addEventListener('click', async () => {
  const url = shareUrl();
  history.replaceState(null, '', configToHash());
  if (navigator.share && window.matchMedia('(hover:none)').matches) {
    try { await navigator.share({ title: 'LED-Wand Konfiguration', url }); return; } catch (e) { /* abgebrochen */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link kopiert ✓');
  } catch (e) {
    window.prompt('Link zum Kopieren:', url);
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.getElementById('pdfBtn').addEventListener('click', () => {
  // Bild direkt nach dem Rendern abgreifen (ohne preserveDrawingBuffer).
  renderer.render(scene, camera);
  const img = renderer.domElement.toDataURL('image/jpeg', 0.9);
  const date = new Date().toLocaleDateString('de-DE');
  const rows = buildConfigText().split('\n').map((line) => {
    const k = line.indexOf(':');
    return `<tr><td>${escapeHtml(line.slice(0, k))}</td><td>${escapeHtml(line.slice(k + 1).trim())}</td></tr>`;
  }).join('');
  const w = window.open('', '_blank');
  if (!w) { showToast('Bitte Pop-ups erlauben, um das PDF zu erstellen.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>LED-Wand Konfiguration ${date}</title>
<style>
  body{font-family:Inter,Arial,sans-serif;color:#111;margin:32px;}
  h1{font-size:22px;margin:0 0 4px;} .sub{color:#666;font-size:12px;margin:0 0 18px;}
  img{width:100%;border-radius:8px;margin-bottom:18px;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  td{padding:7px 4px;border-bottom:1px solid #e5e5e5;} td:first-child{color:#666;width:45%;}
  .foot{margin-top:22px;font-size:12px;color:#444;line-height:1.6;word-break:break-all;}
  a{color:#e7007f;}
  @page{margin:14mm;}
</style></head><body>
<h1>LED-Wand Konfiguration</h1>
<p class="sub">Erstellt am ${date}</p>
<img src="${img}" alt="Vorschau der LED-Wand">
<table>${rows}</table>
<p class="foot">Konfiguration online öffnen: <a href="${escapeHtml(shareUrl())}">${escapeHtml(shareUrl())}</a><br>
Angebot anfragen: <a href="mailto:${CONFIG.recipientEmail}">${CONFIG.recipientEmail}</a></p>
<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
</body></html>`);
  w.document.close();
});

/* --------------------------- INFO TOOLTIPS (i) ------------------------------ */

document.querySelectorAll('.info-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = btn.closest('.info-wrap');
    const wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.info-wrap.open').forEach((w) => w.classList.remove('open'));
    if (!wasOpen) {
      wrap.classList.add('open');
      // am Handy nicht über den Bildschirmrand hinausragen lassen
      const pop = wrap.querySelector('.tooltip-pop');
      pop.style.left = '0px';
      const r = pop.getBoundingClientRect();
      const over = r.right - (window.innerWidth - 12);
      if (over > 0) pop.style.left = `${-Math.min(over, r.left - 12)}px`;
    }
  });
});
document.addEventListener('click', () => {
  document.querySelectorAll('.info-wrap.open').forEach((w) => w.classList.remove('open'));
});

/* --------------------------------- INIT ------------------------------------ */

resize();
state.personDist = viewingDistanceForPitch(state.pitch);
applyHash();
applyEnvironment();
updateGobVisibility();
updateDistDisplay();
// Auf dem Desktop ist die Infobox immer offen
if (!window.matchMedia('(max-width: 860px)').matches) document.getElementById('hud').classList.remove('collapsed');
rebuild();
animate();

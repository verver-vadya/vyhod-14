// Маска суши и стран для глобуса на главной (src/data/land.ts). Запускается вручную, когда меняется список стран:
//   npm i --no-save world-atlas@2.0.2 topojson-client@3.1.0 && node tools/gen-land.cjs
// Источник — Natural Earth 1:50m (общественное достояние) из пакета world-atlas.
// Сетка 0,5°: 0 море, 1 суша, 2… страны из CODES. Хранится сериями: заглавная буква значения и длина в 36-ричной записи.
const fs = require("fs");
const path = require("path");
const topo = require("topojson-client");

const W = 720, H = 360, STEP = 0.5;
// Трёхбуквенный код как в countries.ts и числовой код ISO 3166 в Natural Earth
const CODES = [["ITA", "380"], ["ESP", "724"], ["FRA", "250"], ["GRC", "300"], ["HUN", "348"], ["CHN", "156"], ["JPN", "392"], ["IND", "356"], ["VNM", "704"], ["IDN", "360"]];
const grid = new Uint8Array(W * H);

function rings(geom) {
  const all = geom.type === "Polygon" ? geom.coordinates : geom.type === "MultiPolygon" ? geom.coordinates.flat() : [];
  // Кольца через линию перемены дат (Чукотка) разворачиваем в непрерывные: долгота может выйти за ±180
  return all.map((ring) => {
    let off = 0;
    return ring.map(([x, y], i) => {
      if (i) { const d = x - ring[i - 1][0]; if (d > 180) off -= 360; else if (d < -180) off += 360; }
      return [x + off, y];
    });
  });
}
// Построчная заливка по правилу чёт-нечет, по центрам клеток
function fill(geom, val) {
  const rs = rings(geom);
  for (let r = 0; r < H; r++) {
    const lat = 90 - (r + 0.5) * STEP;
    const xs = [];
    for (const ring of rs) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[j], [x2, y2] = ring[i];
        if ((y1 > lat) !== (y2 > lat)) xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil((xs[k] + 180) / STEP - 0.5), c1 = Math.floor((xs[k + 1] + 180) / STEP - 0.5);
      for (let c = c0; c <= c1; c++) grid[r * W + (((c % W) + W) % W)] = val;
    }
  }
}

const land = require("world-atlas/land-50m.json");
for (const f of topo.feature(land, land.objects.land).features) fill(f.geometry, 1);
const world = require("world-atlas/countries-50m.json");
const feats = topo.feature(world, world.objects.countries).features;
CODES.forEach(([code, id], i) => {
  const f = feats.find((f) => f.id === id);
  if (!f) throw new Error(`Нет страны ${code} (${id})`);
  let g = f.geometry;
  // У Франции только европейская часть: заморские территории не в шенгене
  if (code === "FRA") g = { type: "MultiPolygon", coordinates: g.coordinates.filter((p) => p[0].every(([x, y]) => x > -10 && x < 20 && y > 40)) };
  fill(g, i + 2);
});

let runs = "", prev = grid[0], n = 0;
for (let i = 1; i <= grid.length; i++) {
  const v = i < grid.length ? grid[i] : -1;
  if (v === prev) { n++; continue; }
  runs += String.fromCharCode(65 + prev) + (n + 1).toString(36);
  prev = v; n = 0;
}

const out = `// Создано tools/gen-land.cjs из Natural Earth 1:50m, руками не править.
// Сетка ${W}×${H} (шаг ${STEP}°) с севера на юг и с запада на восток: A море, B суша, C… страны из LAND_CODES.
export const LAND_W = ${W};
export const LAND_H = ${H};
export const LAND_CODES = ${JSON.stringify(CODES.map(([c]) => c))};
export const LAND = "${runs}";
`;
fs.writeFileSync(path.join(__dirname, "../src/data/land.ts"), out);
console.log(`src/data/land.ts: ${runs.length} знаков`);

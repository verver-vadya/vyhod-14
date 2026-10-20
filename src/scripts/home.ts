// Главная: заставка, видео, табло вылетов, виджеты, самолёт маршрута, паспорт и небо по прокрутке
import { fontsReady, makeCell, reduce, setWord, setWordInstant } from "./flap";
import { countries } from "../data/countries";
import { rowOf } from "../lib/board";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const store = {
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};
const fmtTime = (tz: string) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date());

// ---------- заставка «посадка»: талон, штамп «Одобрено», отрыв корешка ----------
const html = document.documentElement;
let introResolve!: () => void;
const introDone = new Promise<void>((r) => (introResolve = r));
const intro = document.getElementById("intro")!;

function finishIntro() {
  store.set("v14-intro", "1");
  html.classList.remove("has-intro");
  intro.remove();
  introResolve();
}

if (!html.classList.contains("has-intro")) {
  intro.remove();
  introResolve();
} else {
  const pass = intro.querySelector(".intro__pass")!;
  const stamp = intro.querySelector(".intro__stamp")!;
  const stub = intro.querySelector(".intro__stub")!;
  intro.querySelector(".intro__time")!.textContent = fmtTime("Europe/Moscow");
  const anims = [
    pass.animate([{ opacity: 0, transform: "translateY(48px) rotate(-2deg)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: "cubic-bezier(0.35, 0, 0.15, 1)", fill: "both" }),
    // Штамп бьёт с ускорением: так выглядит удар, а не наплыв
    stamp.animate([{ opacity: 0, transform: "rotate(-14deg) scale(1.9)" }, { opacity: 0.92, transform: "rotate(-12deg) scale(1)" }], { duration: 220, delay: 640, easing: "cubic-bezier(0.55, 0, 0.9, 0.45)", fill: "both" }),
    stub.animate([{ transform: "none", opacity: 1 }, { transform: "translate(70px, 28px) rotate(11deg)", opacity: 0 }], { duration: 560, delay: 1120, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" }),
    pass.animate([{ opacity: 1 }, { opacity: 0, transform: "translateX(-24px) scale(0.98)" }], { duration: 420, delay: 1320, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }),
  ];
  const bg = intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, delay: 1450, easing: "cubic-bezier(0.35, 0, 0.15, 1)", fill: "forwards" });
  const early = setTimeout(introResolve, 1250);
  bg.finished.then(finishIntro, () => {});

  let skipped = false;
  const skip = () => {
    if (skipped) return;
    skipped = true;
    clearTimeout(early);
    anims.forEach((a) => a.pause());
    bg.cancel();
    intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }).finished.then(finishIntro);
    removeEventListener("keydown", skip);
    removeEventListener("wheel", skip);
    removeEventListener("touchstart", skip);
  };
  intro.addEventListener("click", skip);
  addEventListener("keydown", skip);
  addEventListener("wheel", skip, { passive: true });
  addEventListener("touchstart", skip, { passive: true });
}

// ---------- видео: кадр из него стоит постером, само видео подгружается после первой отрисовки ----------
const video = document.getElementById("hero-video") as HTMLVideoElement;
const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
if (!reduce.matches && !conn?.saveData) {
  const phone = matchMedia("(max-width: 760px)").matches;
  const wide = innerWidth * (devicePixelRatio || 1) > 1800;
  const name = phone ? "hero-phone" : wide ? "hero-2560" : "hero-1600";
  // WebM легче (Chrome, Android, Firefox), MP4 для Safari
  const ext = video.canPlayType('video/webm; codecs="vp9"') ? "webm" : "mp4";
  video.src = `${BASE}/assets/video/${name}.${ext}`;
  video.addEventListener("playing", () => video.classList.add("is-playing"), { once: true });
  video.play().catch(() => {});
} else {
  video.remove();
}

// ---------- табло вылетов ----------
// Строки появляются после заставки, потом раз в 4,2 с одна строка перещёлкивается на следующую страну
const board = document.getElementById("hero-board")!;
const rows = [...board.querySelectorAll<HTMLAnchorElement>(".row")];
const flights = countries.map((c) => rowOf(c));
const order = ["italiya", "kitay", "franciya", "indiya", "yaponiya"].map((s) => flights.findIndex((f) => f.slug === s));
const shown = order.slice(0, rows.length);

function setRow(row: HTMLAnchorElement, i: number, baseDelay = 0) {
  const f = flights[i];
  row.href = `${BASE}/vizy/${f.slug}/`;
  row.setAttribute("aria-label", f.label);
  const words = row.querySelectorAll(".word");
  words[5].classList.toggle("is-ok", f.ok);
  return Promise.all([...words].map((w, k) => setWord(w, f.words[k], baseDelay + k * 60)));
}

// Пустое табло до первого перещёлкивания; без JS остаются строки из HTML
if (!reduce.matches) rows.forEach((r) => r.querySelectorAll(".word").forEach((w) => setWordInstant(w, "")));
const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;

Promise.all([introDone, fontsReady]).then(() => {
  rows.forEach((r, k) => setRow(r, shown[k], 120 + k * 150));
  if (reduce.matches) return;
  let next = 0;
  let slot = 0;
  setInterval(() => {
    if (document.hidden) return;
    const rect = board.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    // Меняем только видимые строки: на низком экране и на телефоне их меньше
    const live = rows.filter(visible);
    if (!live.length) return;
    slot %= live.length;
    const k = rows.indexOf(live[slot]);
    do next = (next + 1) % flights.length; while (shown.includes(next));
    shown[k] = next;
    setRow(rows[k], next);
    slot++;
  }, 4200);
});

// Часы Петербурга в шапке табло
const clock = document.getElementById("clock")!;
const tick = () => { clock.textContent = fmtTime("Europe/Moscow"); };
tick();
setInterval(tick, 15000);

// ---------- виджеты: время и погода в городах, курс евро ----------
const CITIES: [string, string, number, number][] = [
  ["РИМ", "Europe/Rome", 41.9, 12.5],
  ["ТОКИО", "Asia/Tokyo", 35.68, 139.69],
  ["ПАРИЖ", "Europe/Paris", 48.86, 2.35],
  ["ПЕКИН", "Asia/Shanghai", 39.9, 116.4],
  ["МАДРИД", "Europe/Madrid", 40.42, -3.7],
  ["ДЕЛИ", "Asia/Kolkata", 28.61, 77.21],
];
const wCity = document.createElement("span");
wCity.className = "word";
for (let i = 0; i < 7; i++) wCity.append(makeCell(" "));
document.getElementById("w-city")!.append(wCity);
const wTime = document.getElementById("w-time")!;
const wWeather = document.getElementById("w-weather")!;
let weather: { t: number; c: number }[] | null = null;
let cityIdx = 0;

const WX = (c: number) => (c === 0 ? "ясно" : c <= 2 ? "малооблачно" : c === 3 ? "пасмурно" : c <= 48 ? "туман" : c <= 57 ? "морось" : c <= 67 ? "дождь" : c <= 77 ? "снег" : c <= 82 ? "ливень" : c <= 86 ? "снегопад" : "гроза");
const temp = (t: number) => { const r = Math.round(t); return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r) + "°"; };
const showWeather = () => { const w = weather?.[cityIdx]; wWeather.textContent = w ? `${temp(w.t)}, ${WX(w.c)}` : ""; };

function showCity(first: boolean) {
  const [name, tz] = CITIES[cityIdx];
  setWord(wCity, name, first ? 300 : 0, 60, 3);
  wTime.textContent = fmtTime(tz);
  showWeather();
}
Promise.all([introDone, fontsReady]).then(() => {
  showCity(true);
  setInterval(() => {
    if (document.hidden) return;
    cityIdx = (cityIdx + 1) % CITIES.length;
    showCity(false);
  }, 5000);
});

(async () => {
  const KEY = "v14-weather";
  try {
    const cached = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (cached && Date.now() - cached.at < 30 * 60 * 1000) { weather = cached.data; showWeather(); return; }
  } catch { /* без кэша */ }
  try {
    const api = "https://api.open-meteo.com/v1/forecast?latitude=" + CITIES.map((c) => c[2]).join(",") +
      "&longitude=" + CITIES.map((c) => c[3]).join(",") + "&current=temperature_2m,weather_code";
    const res = await fetch(api);
    if (!res.ok) return;
    const json = await res.json();
    const list = Array.isArray(json) ? json : [json];
    weather = list.map((x) => ({ t: x.current.temperature_2m, c: x.current.weather_code }));
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), data: weather })); } catch { /* без кэша */ }
    showWeather();
  } catch { /* без погоды виджет показывает только время */ }
})();

(async () => {
  try {
    const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js");
    if (!res.ok) return;
    const eur = (await res.json()).Valute.EUR.Value as number;
    const nf = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
    document.getElementById("w-eur")!.textContent = nf.format(eur) + " ₽";
    document.getElementById("w-fee")!.textContent = `Сбор за шенген 90 € ≈ ${nf0.format(eur * 90)} ₽`;
    document.getElementById("w-rate")!.hidden = false;
  } catch { /* без курса виджет скрыт */ }
})();

// ---------- всё, что зависит от прокрутки ----------
// маршрут: самолёт летит вместе с прокруткой
const route = document.getElementById("route")!;
const track = route.querySelector<HTMLElement>(".route__track")!;
const stops = [...route.querySelectorAll(".stop")];
function updateRoute(vh: number) {
  const r = route.getBoundingClientRect();
  if (r.bottom < -200 || r.top > vh + 200) return;
  const p = clamp((vh * 0.9 - r.top) / (vh * 0.55));
  track.style.setProperty("--p", p.toFixed(4));
  track.style.setProperty("--w", String(track.clientWidth));
  stops.forEach((s, i) => s.classList.toggle("is-passed", p >= i / (stops.length - 1) - 0.001 && p > 0.02));
}

// паспорт: обложка открывается, страницы листаются, визы и штампы проявляются
const passport = document.getElementById("passport")!;
const book = document.getElementById("book")!;
const leaves = [...book.querySelectorAll<HTMLElement>(".leaf")].sort((a, b) => +a.dataset.leaf! - +b.dataset.leaf!);
const marks = [...book.querySelectorAll<HTMLElement>("[data-s]")];
const listItems = [...document.querySelectorAll("#passport-list li")];
const STEPS = [[0.24, 0.36], [0.47, 0.6], [0.5, 0.62], [0.79, 0.95]];
const LEAF_TURNS = [[0.06, 0.26], [0.4, 0.56], [0.72, 0.86]];
const stepCount: Record<string, number> = {};
const markIndex = new Map<HTMLElement, number>();
marks.forEach((m) => {
  const s = m.dataset.s!;
  stepCount[s] = (stepCount[s] || 0) + 1;
  markIndex.set(m, stepCount[s] - 1);
});

function renderPassport(p: number) {
  const open = ease(seg(p, LEAF_TURNS[0][0], LEAF_TURNS[0][1]));
  book.style.setProperty("--shift", (1 - open).toFixed(4));
  leaves.forEach((leaf, i) => {
    const a = -180 * ease(seg(p, LEAF_TURNS[i][0], LEAF_TURNS[i][1]));
    leaf.style.setProperty("--a", a.toFixed(2));
    leaf.style.zIndex = String(a > -90 ? 10 - i : 10 + i);
  });
  const stepK = STEPS.map(([a, b]) => seg(p, a, b));
  marks.forEach((m) => {
    const [a, b] = STEPS[+m.dataset.s!];
    // внутри шага штампы ложатся по очереди
    const n = stepCount[m.dataset.s!];
    const len = (b - a) * (n > 1 ? 0.55 : 1);
    const start = a + (n > 1 ? (markIndex.get(m)! / (n - 1)) * (b - a) * 0.45 : 0);
    m.style.setProperty("--k", ease(seg(p, start, start + len)).toFixed(3));
  });
  listItems.forEach((li, i) => li.classList.toggle("is-on", stepK[i] > 0.5));
}
function updatePassport(vh: number) {
  const r = passport.getBoundingClientRect();
  if (r.bottom < -100 || r.top > vh + 100) return;
  const total = passport.offsetHeight - vh;
  renderPassport(total > 0 ? clamp(-r.top / total) : 0.98);
}

// небо: рассвет → день → золотой час → закат, слои плавно сменяют друг друга
const ORDER = ["dawn", "day", "gold", "sunset"];
const skyLayers = ORDER.map((n) => document.querySelector<HTMLElement>(`.sky--${n}`)!);
const skySections = [...document.querySelectorAll<HTMLElement>("[data-sky]")];
let anchors: { name: string; y: number }[] = [];
function measureSky() {
  anchors = skySections.map((s) => ({ name: s.dataset.sky!, y: s.getBoundingClientRect().top + scrollY + s.offsetHeight / 2 }));
}
function updateSky(vh: number) {
  const y = scrollY + vh / 2;
  let from = anchors[0], to = anchors[0], t = 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y >= anchors[i].y) { from = anchors[i]; to = anchors[i + 1]; t = clamp((y - anchors[i].y) / (anchors[i + 1].y - anchors[i].y)); }
  }
  if (y >= anchors[anchors.length - 1].y) { from = to = anchors[anchors.length - 1]; t = 0; }
  const fi = ORDER.indexOf(from.name), ti = ORDER.indexOf(to.name);
  // слои лежат по порядку, верхний проявляется поверх нижнего
  skyLayers.forEach((layer, i) => { layer.style.opacity = (i <= fi ? 1 : i === ti ? t : 0).toFixed(3); });
}

let ticking = false;
function onFrame() {
  ticking = false;
  const vh = innerHeight;
  updateRoute(vh);
  updatePassport(vh);
  updateSky(vh);
}
const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } };
addEventListener("scroll", request, { passive: true });
addEventListener("resize", () => { measureSky(); request(); });
addEventListener("load", () => { measureSky(); request(); });
measureSky();
if (reduce.matches) renderPassport(0.98);
onFrame();

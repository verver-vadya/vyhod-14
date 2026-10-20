// Главная: заставка, видео, табло вылетов, виджеты, паспорт, самолёт маршрута и небо по прокрутке
import { fontsReady, makeCell, reduce, setWord, setWordInstant } from "./led";
import { countries } from "../data/countries";
import { rowOf } from "../lib/board";
import { gsap } from "./motion";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const store = {
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};
const fmtTime = (tz: string) => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date());

// ---------- заставка «посадка» и первый экран одной сценой ----------
// Талон въезжает, штамп «Одобрено», корешок отрывается, талон уходит, и пока гаснет фон,
// под ним проявляется первый экран: фото чуть отъезжает, заголовок поднимается строками,
// за ним кнопки, виджеты и табло. Табло зажигает строки последним.
const html = document.documentElement;
let introResolve!: () => void;
const introDone = new Promise<void>((r) => (introResolve = r));
const intro = document.getElementById("intro")!;

if (!html.classList.contains("has-intro")) {
  intro.remove();
  introResolve();
} else {
  intro.querySelector(".intro__time")!.textContent = fmtTime("Europe/Moscow");
  // Шрифты подгружены заранее; ждём их, чтобы строки заголовка разбились как на экране, но не дольше 600 мс
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 600))]).then(playIntro);
}

function playIntro() {
  const pass = intro.querySelector(".intro__pass")!;
  const title = document.querySelector<HTMLElement>(".hero__title")!;
  const split = new SplitText(title, { type: "lines", mask: "lines", linesClass: "ln" });
  title.classList.add("is-lines");
  const text = document.querySelectorAll(".hero .eyebrow, .hero__actions .btn");
  // Курс евро может появиться позже, пока идёт сцена: его тоже ведём, чтобы он не возник раньше соседей
  const widgets = document.querySelectorAll(".widgets > .widget");
  const board = document.querySelector(".hero-board .board");

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    store.set("v14-intro", "1");
    html.classList.remove("has-intro");
    intro.remove();
  };

  const tl = gsap.timeline({
    onComplete: () => {
      split.revert();
      title.classList.remove("is-lines");
      gsap.set([title, text, widgets, board, ".hero__media"], { clearProps: "all" });
    },
  });
  tl.fromTo(pass, { opacity: 0, y: 48, rotation: -2 }, { opacity: 1, y: 0, rotation: 0, duration: 0.52 })
    // Штамп бьёт с ускорением: так выглядит удар, а не наплыв
    .fromTo(".intro__stamp", { opacity: 0, rotation: -14, scale: 1.9 }, { opacity: 0.92, rotation: -12, scale: 1, duration: 0.22, ease: "hit" }, 0.64)
    .to(".intro__stub", { x: 70, y: 28, rotation: 11, opacity: 0, duration: 0.56, ease: "close" }, 1.12)
    .to(pass, { x: -24, scale: 0.98, opacity: 0, duration: 0.42, ease: "close" }, 1.32)
    .addLabel("hero", 1.45)
    .to(intro, { opacity: 0, duration: 0.52, onComplete: finish }, "hero")
    .fromTo(".hero__media", { scale: 1.06 }, { scale: 1, duration: 1.8 }, "hero")
    .fromTo(text[0], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, "hero+=0.1")
    .set(title, { opacity: 1 }, "hero")
    .fromTo(split.lines, { yPercent: 130 }, { yPercent: 0, duration: 0.7, stagger: 0.08 }, "hero+=0.15")
    .fromTo([...text].slice(1), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 }, "hero+=0.5")
    .fromTo(widgets, { opacity: 0, x: 16 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.05 }, "hero+=0.55")
    .fromTo(board, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7 }, "hero+=0.65")
    // Строки табло начинают загораться, когда само табло почти встало на место
    .call(introResolve, [], "hero+=1");

  // Пропуск: сразу к моменту, когда заставка гаснет; первый экран доигрывает как обычно
  let skipped = false;
  const skip = () => {
    if (skipped) return;
    skipped = true;
    if (tl.time() < tl.labels.hero) tl.seek("hero");
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
// Строки появляются после заставки, потом раз в 4,2 с одна строка меняется на следующую страну
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

// Табло погашено до первого заполнения; без JS остаются строки из HTML
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
wCity.dataset.overlapOk = "";
wCity.append(Object.assign(document.createElement("span"), { className: "visually-hidden" }));
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
  setWord(wCity, name, first ? 300 : 0);
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
// Прогресс каждой сцены ведёт ScrollTrigger со сглаживанием (scrub): колесо мыши двигает страницу
// ступеньками, а сцена плавно догоняет. На телефоне прокрутка и так плавная, поэтому догон короче.
const scrub = () => (matchMedia("(pointer: coarse)").matches ? 0.35 : 0.7);

// маршрут: самолёт летит вместе с прокруткой
const route = document.getElementById("route")!;
const track = route.querySelector<HTMLElement>(".route__track")!;
const stops = [...route.querySelectorAll(".stop")];
function renderRoute(p: number) {
  track.style.setProperty("--p", p.toFixed(4));
  stops.forEach((s, i) => s.classList.toggle("is-passed", p >= i / (stops.length - 1) - 0.001 && p > 0.02));
}

// паспорт: листают сами. Обложка открывается, страницы переворачиваются, визы и штампы проявляются
const book = document.getElementById("book")!;
const bookWrap = document.getElementById("book-wrap")!;
const leaves = [...book.querySelectorAll<HTMLElement>(".leaf")].sort((a, b) => +a.dataset.leaf! - +b.dataset.leaf!);
const marks = [...book.querySelectorAll<HTMLElement>("[data-s]")];
const listItems = [...document.querySelectorAll("#passport-list li")];
// Каждый переворот начинается ровно с разворота (см. SPREADS ниже), чтобы после нажатия не было паузы
const STEPS = [[0.2, 0.35], [0.48, 0.6], [0.51, 0.63], [0.78, 0.98]];
const LEAF_TURNS = [[0, 0.22], [0.37, 0.53], [0.63, 0.8]];
marks.forEach((m, i) => (m.dataset.mi = String(i)));
const stepCount: Record<string, number> = {};
const markIndex = new Map<HTMLElement, number>();
marks.forEach((m) => {
  const s = m.dataset.s!;
  stepCount[s] = (stepCount[s] || 0) + 1;
  markIndex.set(m, stepCount[s] - 1);
});

// Гибкий лист: каждая страница режется на вертикальные полосы, вложенные друг в друга.
// Полоса поворачивается чуть сильнее предыдущей, и лист в полёте выгибается, как бумага.
// В каждой полосе лежит копия лица страницы, сдвинутая так, что видна только её часть.
const STRIPS = 6;
const stripsOf = new Map<HTMLElement, HTMLElement[]>();
const shadesOf = new Map<HTMLElement, HTMLElement[]>();
const copiesOf = new Map<HTMLElement, HTMLElement[]>();
leaves.forEach((leaf) => {
  const front = leaf.querySelector<HTMLElement>(".leaf__front")!;
  const back = leaf.querySelector<HTMLElement>(".leaf__back")!;
  const strips: HTMLElement[] = [];
  const shades: HTMLElement[] = [];
  let parent: HTMLElement = leaf;
  for (let i = 0; i < STRIPS; i++) {
    const strip = document.createElement("div");
    strip.className = "strip";
    if (i) strip.style.left = "calc(100% - 0.5px)";
    for (const [face, side] of [[front, "front"], [back, "back"]] as const) {
      const slice = document.createElement("div");
      slice.className = `slice slice--${side}`;
      const copy = face.cloneNode(true) as HTMLElement;
      copy.classList.add("slice__face");
      // Оборот страницы виден зеркально: полоса у корешка показывает край оборота, дальний от корешка
      copy.style.setProperty("--i", String(side === "front" ? i : STRIPS - 1 - i));
      const shade = document.createElement("i");
      shade.className = "slice__shade";
      slice.append(copy, shade);
      strip.append(slice);
      shades.push(shade);
      copy.querySelectorAll<HTMLElement>("[data-s]").forEach((m) => {
        const orig = marks[+m.dataset.mi!];
        if (!copiesOf.has(orig)) copiesOf.set(orig, []);
        copiesOf.get(orig)!.push(m);
      });
    }
    parent.append(strip);
    strips.push(strip);
    parent = strip;
  }
  front.remove();
  back.remove();
  stripsOf.set(leaf, strips);
  shadesOf.set(leaf, shades);
});

// Изгиб на полосу в градусах: в середине переворота лист выгнут сильнее всего, лёг — снова ровный
const BEND = 9;
// Переворот по кривой проекта soft: лист сразу трогается с места и мягко ложится
const turnEase = gsap.parseEase("soft");
const lastA = leaves.map(() => 0);
const lag = leaves.map(() => 1);

function renderPassport(p: number) {
  const open = turnEase(seg(p, LEAF_TURNS[0][0], LEAF_TURNS[0][1]));
  book.style.setProperty("--shift", (1 - open).toFixed(4));
  leaves.forEach((leaf, i) => {
    const a = -180 * turnEase(seg(p, LEAF_TURNS[i][0], LEAF_TURNS[i][1]));
    // Свободный край отстаёт от корешка: при листании вперёд гнётся в одну сторону, назад — в другую
    if (a !== lastA[i]) lag[i] = a < lastA[i] ? 1 : -1;
    lastA[i] = a;
    const b = BEND * Math.sin((Math.PI * -a) / 180) * lag[i];
    leaf.style.setProperty("--a", a.toFixed(2));
    leaf.style.zIndex = String(a > -90 ? 10 - i : 10 + i);
    stripsOf.get(leaf)!.forEach((st, k) => st.style.setProperty("--b", k ? b.toFixed(2) : "0"));
    // Тень на изгибе: чем круче полоса повёрнута к свету, тем она темнее
    const shades = shadesOf.get(leaf)!;
    for (let k = 0; k < STRIPS; k++) {
      const turn = a + b * k;
      const sh = (0.16 * Math.abs(Math.sin((turn * Math.PI) / 180)) * Math.abs(b)) / BEND;
      shades[k * 2].style.opacity = shades[k * 2 + 1].style.opacity = sh.toFixed(3);
    }
  });
  const stepK = STEPS.map(([a, b]) => seg(p, a, b));
  marks.forEach((m) => {
    const [a, b] = STEPS[+m.dataset.s!];
    // внутри шага штампы ложатся по очереди
    const n = stepCount[m.dataset.s!];
    const len = (b - a) * (n > 1 ? 0.55 : 1);
    const start = a + (n > 1 ? (markIndex.get(m)! / (n - 1)) * (b - a) * 0.45 : 0);
    const k = ease(seg(p, start, start + len)).toFixed(3);
    m.style.setProperty("--k", k);
    copiesOf.get(m)?.forEach((c) => c.style.setProperty("--k", k));
  });
  listItems.forEach((li, i) => li.classList.toggle("is-on", stepK[i] > 0.5));
}

// Развороты: обложка, данные и Италия, Китай и Япония, отметки. p — положение «ленты» renderPassport
const SPREADS = [0, 0.37, 0.63, 1];
// Неразрывный пробел держит «и Япония» вместе, когда название переносится
const SPREAD_NAMES = ["Обложка", "Италия", "Китай и\u00a0Япония", "Отметки о въезде"];
const navBtns = [...document.querySelectorAll<HTMLButtonElement>(".book-nav__btn")];
const bookName = document.getElementById("book-name")!;
const bookCount = document.getElementById("book-count")!;
const book$ = { p: 0 };
let spread = 0;

// Подпись разворота уезжает в сторону листания, новая приезжает с другой стороны; строка с номером стоит на месте
function showSpread(dir = 0) {
  navBtns[0].disabled = spread === 0;
  navBtns[1].disabled = spread === SPREADS.length - 1;
  const name = SPREAD_NAMES[spread], count = `${spread + 1} из ${SPREADS.length}`;
  if (!dir || reduce.matches) { bookName.textContent = name; bookCount.textContent = count; return; }
  gsap.killTweensOf([bookName, bookCount]);
  gsap.timeline()
    .to([bookName, bookCount], { opacity: 0, x: -8 * dir, duration: 0.15, ease: "close" })
    .call(() => { bookName.textContent = name; bookCount.textContent = count; })
    .fromTo([bookName, bookCount], { opacity: 0, x: 8 * dir }, { opacity: 1, x: 0, duration: 0.25, ease: "soft", stagger: 0.04 });
}
function goTo(i: number) {
  const from = book$.p;
  const prev = spread;
  spread = clamp(i, 0, SPREADS.length - 1);
  if (spread !== prev) showSpread(Math.sign(spread - prev));
  const to = SPREADS[spread];
  // Лента идёт равномерно, плавность даёт кривая каждого переворота и штампа.
  // Один разворот — около полутора секунд: страница спокойно переворачивается, штампы ложатся следом
  gsap.to(book$, {
    p: to, duration: reduce.matches ? 0 : 0.3 + Math.abs(to - from) * 4.8, ease: "none", overwrite: true,
    onUpdate: () => renderPassport(book$.p),
  });
}
navBtns.forEach((b) => b.addEventListener("click", () => goTo(spread + +b.dataset.dir!)));
document.querySelectorAll<HTMLButtonElement>("#passport-list [data-go]").forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.go!)));

// Страницу можно тянуть пальцем или мышью: паспорт идёт за рукой, отпустили — доворачивается.
// Короткое нажатие листает по стороне: правая половина вперёд, левая назад.
let drag: { x: number; w: number; base: number; moved: boolean; t: number; lastX: number; lastT: number; v: number } | null = null;
bookWrap.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  gsap.killTweensOf(book$);
  drag = { x: e.clientX, w: book.offsetWidth / 2, base: spread, moved: false, t: e.timeStamp, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
});
bookWrap.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 6) return;
  if (!drag.moved) { drag.moved = true; bookWrap.setPointerCapture(e.pointerId); }
  const dt = e.timeStamp - drag.lastT;
  if (dt > 0) drag.v = (e.clientX - drag.lastX) / dt;
  drag.lastX = e.clientX; drag.lastT = e.timeStamp;
  // Тянем влево — вперёд, вправо — назад; на краях паспорт сопротивляется
  const k = -dx / drag.w;
  const next = clamp(drag.base + Math.sign(k), 0, SPREADS.length - 1);
  const span = SPREADS[next] - SPREADS[drag.base];
  book$.p = SPREADS[drag.base] + (span ? clamp(Math.abs(k)) * Math.abs(span) * Math.sign(span) : 0);
  renderPassport(book$.p);
});
const endDrag = (e: PointerEvent) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) {
    const r = book.getBoundingClientRect();
    // Закрытый паспорт открывается нажатием в любое место обложки
    goTo(spread === 0 || e.clientX > r.left + r.width / 2 ? spread + 1 : spread - 1);
    return;
  }
  const k = (d.x - e.clientX) / d.w;
  // Решает либо пройденная треть, либо быстрый взмах
  const fast = Math.abs(d.v) > 0.5;
  const dir = fast ? Math.sign(-d.v) : Math.abs(k) > 0.33 ? Math.sign(k) : 0;
  goTo(d.base + dir);
};
bookWrap.addEventListener("pointerup", endDrag);
bookWrap.addEventListener("pointercancel", () => { if (drag) { drag = null; goTo(spread); } });
showSpread();
renderPassport(0);

// небо: рассвет → день → золотой час → закат, слои плавно сменяют друг друга
const ORDER = ["dawn", "day", "gold", "sunset"];
const skyLayers = ORDER.map((n) => document.querySelector<HTMLElement>(`.sky--${n}`)!);
const skySections = [...document.querySelectorAll<HTMLElement>("[data-sky]")];
let anchors: { name: string; y: number }[] = [];
function measureSky() {
  anchors = skySections.map((s) => ({ name: s.dataset.sky!, y: s.getBoundingClientRect().top + scrollY + s.offsetHeight / 2 }));
}
function renderSky(y: number) {
  if (!anchors.length) return;
  let from = anchors[0], to = anchors[0], t = 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y >= anchors[i].y) { from = anchors[i]; to = anchors[i + 1]; t = clamp((y - anchors[i].y) / (anchors[i + 1].y - anchors[i].y)); }
  }
  if (y >= anchors[anchors.length - 1].y) { from = to = anchors[anchors.length - 1]; t = 0; }
  const fi = ORDER.indexOf(from.name), ti = ORDER.indexOf(to.name);
  // слои лежат по порядку, верхний проявляется поверх нижнего
  skyLayers.forEach((layer, i) => { layer.style.opacity = (i <= fi ? 1 : i === ti ? t : 0).toFixed(3); });
}

measureSky();
const mm = gsap.matchMedia();
mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
  if (ctx.conditions!.reduce) {
    // Без движения: маршрут пройден, небо меняется без догона, паспорт листается без анимации
    renderRoute(1);
    ScrollTrigger.create({ start: 0, end: "max", onUpdate: () => renderSky(scrollY + innerHeight / 2), onRefresh: () => { measureSky(); renderSky(scrollY + innerHeight / 2); } });
    return;
  }
  const route$ = { p: 0 };
  gsap.to(route$, {
    p: 1, ease: "none", onUpdate: () => renderRoute(route$.p),
    scrollTrigger: { trigger: route, start: "top 90%", end: "top 35%", scrub: scrub(), onRefresh: () => track.style.setProperty("--w", String(track.clientWidth)) },
  });
  // Небо считаем по сглаженной середине экрана
  const sky$ = { y: 0 };
  gsap.to(sky$, {
    y: () => ScrollTrigger.maxScroll(window), ease: "none", onUpdate: () => renderSky(sky$.y + innerHeight / 2),
    scrollTrigger: { start: 0, end: "max", scrub: scrub(), invalidateOnRefresh: true, onRefresh: measureSky },
  });
});
track.style.setProperty("--w", String(track.clientWidth));
renderSky(scrollY + innerHeight / 2);
addEventListener("load", () => ScrollTrigger.refresh());

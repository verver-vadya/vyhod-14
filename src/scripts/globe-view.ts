// Земля «Куда летим»: шар из светодиодных точек на WebGL. Суша горит тускло, наши страны ярко, выбранная — янтарным.
// От Пулково к аэропорту страны поднимается дуга рейса из точек, по ней бежит огонёк. Шар крутят мышью и пальцем
// (на телефоне только по горизонтали, вертикальный жест листает страницу), сам он медленно вращается, пока его не тронули.
// Без WebGL и при «уменьшить движение» вместо шара та же картина плоской точечной картой без анимации.
// Грузится лениво из globe.ts, рисует кадры, только пока секция на экране.
import { gsap } from "./motion";
import { LAND, LAND_CODES, LAND_H, LAND_W } from "../data/land";
import { countries, home, hubs, type Hub } from "../data/countries";

type V3 = [number, number, number];
const D = Math.PI / 180;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const vec = (lat: number, lon: number): V3 => [Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D), Math.cos(lat * D) * Math.cos(lon * D)];
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = (hex: string): V3 => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---------- маска суши: клетка 0,5°, 0 море, 1 суша, 2… страны ----------
const grid = new Uint8Array(LAND_W * LAND_H);
{
  let i = 0;
  for (const m of LAND.matchAll(/([A-Z])([0-9a-z]+)/g)) {
    const v = m[1].charCodeAt(0) - 65, n = parseInt(m[2], 36);
    grid.fill(v, i, i + n);
    i += n;
  }
}
// Значение маски → номер страны в countries (или -1)
const kindToIdx = [-1, -1, ...LAND_CODES.map((code) => countries.findIndex((c) => c.code === code))];
const cellAt = (lat: number, lon: number) => {
  const r = clamp(Math.floor((90 - lat) / 0.5), 0, LAND_H - 1);
  const c = ((Math.floor((lon + 180) / 0.5) % LAND_W) + LAND_W) % LAND_W;
  return grid[r * LAND_W + c];
};
// Страна под точкой; мелкие страны ловим с запасом в полтора градуса, чтобы в них было легко попасть пальцем
function countryAt(lat: number, lon: number, reach = 3) {
  const own = kindToIdx[cellAt(lat, lon)];
  if (own >= 0) return own;
  let best = -1, bestD = Infinity;
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      const k = kindToIdx[cellAt(lat + dr * 0.5, lon + (dc * 0.5) / Math.max(0.2, Math.cos(lat * D)))];
      const d = dr * dr + dc * dc;
      if (k >= 0 && d < bestD) { best = k; bestD = d; }
    }
  }
  return best;
}

// ---------- общее для шара и плоской карты: список, талоны, подписи ----------
interface View {
  resize(): void;
  select(i: number, instant: boolean): void;
  hover(i: number): void;
}

export function init() {
  const section = document.getElementById("globe")!;
  const stage = document.getElementById("globe-stage")!;
  const canvas = document.getElementById("globe-canvas") as HTMLCanvasElement;
  const list = document.getElementById("globe-list")!;
  const empty = document.getElementById("globe-empty")!;
  const cards = [...document.querySelectorAll<HTMLElement>(".gcard")];
  const tagHome = document.getElementById("globe-home")!;
  const tagDest = document.getElementById("globe-dest")!;
  const tagHover = document.getElementById("globe-hover")!;
  const hint = document.getElementById("globe-hint")!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Без JS строки списка — ссылки на страницы стран; здесь они становятся кнопками, которые показывают маршрут
  const rows = [...list.querySelectorAll<HTMLAnchorElement>("a.groute")].map((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.className;
    b.dataset.slug = a.dataset.slug;
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-controls", "globe-cards");
    b.innerHTML = a.innerHTML;
    a.replaceWith(b);
    return b;
  });

  // Подпись над точкой: прячется, когда точка уходит за край шара
  const place = (el: HTMLElement, x: number, y: number, on: boolean) => {
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.classList.toggle("is-off", !on);
  };

  // Подписи Пулково и аэропорта расходятся в стороны от дуги, чтобы она их не перечёркивала,
  // но не вылезают за край: тогда подпись переходит на другую сторону точки
  const widths = new Map<HTMLElement, number>();
  const sides = (hx: number, bx: number, w: number) => {
    const fit = (el: HTMLElement, x: number, left: boolean) => {
      const tw = (widths.get(el) || el.offsetWidth) + 16;
      return left ? x - tw >= 0 : x + tw <= w;
    };
    let homeLeft = bx > hx, destLeft = bx <= hx;
    if (!fit(tagHome, hx, homeLeft)) homeLeft = !homeLeft;
    if (!fit(tagDest, bx, destLeft)) destLeft = !destLeft;
    tagHome.classList.toggle("is-left", homeLeft);
    tagDest.classList.toggle("is-left", destLeft);
  };

  let sel = -1;
  let view: View;
  const gl = !reduce ? canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true }) : null;
  if (gl) view = globeView(gl);
  else {
    stage.classList.add("is-flat");
    section.classList.add("globe--flat");
    view = flatView();
  }

  function select(i: number) {
    if (i < 0 || i === sel) return;
    const prev = cards.find((c) => !c.hidden);
    sel = i;
    rows.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    // в ленте на телефоне выбранная страна выезжает в видимую часть, страница при этом не прокручивается
    if (list.scrollWidth > list.clientWidth) {
      const li = rows[i].parentElement!;
      const left = li.offsetLeft - list.offsetLeft, right = left + li.offsetWidth;
      if (left < list.scrollLeft + 16 || right > list.scrollLeft + list.clientWidth - 16) {
        list.scrollTo({ left: left - (list.clientWidth - li.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
      }
    }
    const card = cards[i];
    empty.hidden = true;
    if (prev) prev.hidden = true;
    card.hidden = false;
    const h = hubs[countries[i].slug];
    tagDest.innerHTML = `<b>${h.code}</b> ${h.city}`;
    widths.set(tagDest, tagDest.offsetWidth);
    if (!widths.get(tagHome)) widths.set(tagHome, tagHome.offsetWidth);
    if (!reduce) gsap.fromTo(card, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, clearProps: "opacity,transform" });
    view.select(i, reduce);
  }
  rows.forEach((b, i) => {
    b.addEventListener("click", () => select(i));
    b.addEventListener("pointerenter", () => view.hover(i));
    b.addEventListener("pointerleave", () => view.hover(-1));
    b.addEventListener("focus", () => view.hover(i));
    b.addEventListener("blur", () => view.hover(-1));
  });

  new ResizeObserver(() => view.resize()).observe(stage);

  // ---------- шар ----------
  function globeView(gl: WebGLRenderingContext): View {
    const fine = matchMedia("(pointer: fine)").matches;
    // Точки по спирали Фибоначчи: ровная сетка без сгущения у полюсов. На телефоне вдвое реже
    const N = innerWidth < 761 ? 26000 : 56000;
    const pos = new Float32Array(N * 3), kind = new Float32Array(N);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * golden;
      pos.set([r * Math.sin(a), y, r * Math.cos(a)], i * 3);
      const v = cellAt(Math.asin(y) / D, Math.atan2(Math.sin(a), Math.cos(a)) / D);
      kind[i] = v < 2 ? v : 2 + kindToIdx[v];
    }
    const pitch = Math.sqrt((4 * Math.PI) / N); // расстояние между соседними точками, радиан

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = (vs: string, fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return p;
    };
    // Светодиод: ядро и мягкий ореол, как у точек табло
    const dotFs = `precision mediump float;
      varying vec4 vCol;
      void main() {
        float r = length(gl_PointCoord * 2.0 - 1.0);
        float k = max(1.0 - smoothstep(0.42, 0.6, r), (1.0 - smoothstep(0.0, 1.0, r)) * 0.32);
        if (k < 0.01) discard;
        gl_FragColor = vec4(vCol.rgb, 1.0) * vCol.a * k;
      }`;
    const earth = program(`
      attribute vec3 aPos; attribute float aKind;
      uniform mat3 uRot; uniform vec2 uScale; uniform float uSize, uSel, uHov, uSelT;
      uniform vec3 uLed, uPick;
      varying vec4 vCol;
      void main() {
        vec3 p = uRot * aPos;
        if (p.z <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
        gl_Position = vec4(p.xy * uScale, 0.0, 1.0);
        vec3 c = uLed; float a = 0.09; float s = 0.8;
        if (aKind > 0.5) { a = 0.3; s = 1.0; }
        if (aKind > 1.5) {
          a = 0.95;
          if (abs(aKind - uHov) < 0.1) { c = mix(uLed, vec3(1.0), 0.35); s = 1.15; a = 1.0; }
          if (abs(aKind - uSel) < 0.1) { c = mix(uLed, uPick, uSelT); s = 1.0 + 0.2 * uSelT; a = 1.0; }
        }
        // к краю шара точки тускнеют и мельчают: так читается объём
        vCol = vec4(c, a * (0.2 + 0.8 * smoothstep(0.0, 0.6, p.z)));
        gl_PointSize = uSize * s * (0.55 + 0.45 * p.z);
      }`, dotFs);
    const flight = program(`
      attribute vec3 aPos; attribute float aT;
      uniform mat3 uRot; uniform vec2 uScale; uniform float uSize, uProg, uHead;
      uniform vec3 uPick;
      varying vec4 vCol;
      void main() {
        vec3 p = uRot * aPos;
        // за шаром дугу не видно
        bool hidden = p.z < 0.0 && length(p.xy) < 1.0;
        float on = hidden ? 0.0 : step(aT, uProg);
        float head = exp(-pow((aT - uHead) * 16.0, 2.0));
        gl_Position = vec4(p.xy * uScale, 0.0, 1.0);
        gl_PointSize = on > 0.0 ? uSize * (0.8 + 0.7 * head) : 0.0;
        vCol = vec4(mix(uPick, vec3(1.0), head * 0.6), on * (0.6 + 0.4 * head));
      }`, dotFs);

    const buf = (data: Float32Array) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };
    const bPos = buf(pos), bKind = buf(kind);
    const bArc = gl.createBuffer()!;
    let arcN = 0;
    const loc = (p: WebGLProgram) => (n: string) => gl.getUniformLocation(p, n);
    const ue = loc(earth), uf = loc(flight);
    const aPos = gl.getAttribLocation(earth, "aPos"), aKind = gl.getAttribLocation(earth, "aKind");
    const fPos = gl.getAttribLocation(flight, "aPos"), fT = gl.getAttribLocation(flight, "aT");

    const led = rgb(css("--led") || "#dcf352"), pick = rgb(css("--led-wait") || "#ffc23a");
    gl.useProgram(earth);
    gl.uniform3fv(ue("uLed"), led);
    gl.uniform3fv(ue("uPick"), pick);
    gl.useProgram(flight);
    gl.uniform3fv(uf("uPick"), pick);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    // Поворот: точка (lat, lon) смотрит на зрителя. Матрица по столбцам, как ждёт WebGL
    const state = { lat: 32, lon: 64, selT: 0, prog: 0, t0: 0 };
    const rot = new Float32Array(9);
    const setRot = () => {
      const cp = Math.cos(state.lat * D), sp = Math.sin(state.lat * D), cl = Math.cos(state.lon * D), sl = Math.sin(state.lon * D);
      rot.set([cl, -sp * sl, cp * sl, 0, cp, sp, -sl, -sp * cl, cp * cl]);
    };
    const apply = (v: V3): V3 => [
      rot[0] * v[0] + rot[3] * v[1] + rot[6] * v[2],
      rot[1] * v[0] + rot[4] * v[1] + rot[7] * v[2],
      rot[2] * v[0] + rot[5] * v[1] + rot[8] * v[2],
    ];

    let w = 0, h = 0, R = 0, dpr = 1;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      R = Math.min(w, h) / 2 / 1.2; // запас под дугу, которая поднимается над шаром
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      wake();
    };

    // Дуга: большой круг от Пулково до аэропорта, поднятая над поверхностью тем выше, чем дальше лететь
    const homeV = vec(home.lat, home.lon);
    const buildArc = (hub: Hub) => {
      const b = vec(hub.lat, hub.lon);
      const om = Math.acos(clamp(homeV[0] * b[0] + homeV[1] * b[1] + homeV[2] * b[2], -1, 1));
      const n = Math.max(12, Math.ceil(om / (pitch * 0.9)));
      const lift = 0.04 + 0.28 * (om / Math.PI);
      const data = new Float32Array((n + 1) * 4);
      for (let i = 0; i <= n; i++) {
        const t = i / n, s = Math.sin(om);
        const k1 = Math.sin((1 - t) * om) / s, k2 = Math.sin(t * om) / s, up = 1 + lift * Math.sin(Math.PI * t);
        data.set([(homeV[0] * k1 + b[0] * k2) * up, (homeV[1] * k1 + b[1] * k2) * up, (homeV[2] * k1 + b[2] * k2) * up, t], i * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, bArc);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      arcN = n + 1;
    };

    // ---------- кадр ----------
    let hov = -1, hovAt: { lat: number; lon: number } | null = null, auto = true, idleAt = 0, visible = false, running = false, last = 0;
    let drag: { id: number; x: number; y: number; sx: number; sy: number; t: number; vx: number; vy: number; moved: boolean } | null = null;
    let spin = { vx: 0, vy: 0 }; // инерция после броска, °/с
    let tween: ReturnType<typeof gsap.to> | null = null;
    let first = true;

    const frame = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!drag) {
        if (Math.abs(spin.vx) + Math.abs(spin.vy) > 0.5) {
          state.lon -= spin.vx * dt;
          state.lat = clamp(state.lat + spin.vy * dt, -25, 70);
          const k = Math.exp(-dt * 3.5);
          spin.vx *= k; spin.vy *= k;
        } else if (auto) state.lon += 5 * dt;
        else if (sel < 0 && !tween?.isActive() && now - idleAt > 6000) auto = true;
      }
      setRot();
      gl.clear(gl.COLOR_BUFFER_BIT);
      const sx = (R / w) * 2, sy = (R / h) * 2;
      const size = Math.max(2, R * pitch * 1.15) * dpr;

      gl.useProgram(earth);
      gl.uniformMatrix3fv(ue("uRot"), false, rot);
      gl.uniform2f(ue("uScale"), sx, sy);
      gl.uniform1f(ue("uSize"), size);
      gl.uniform1f(ue("uSel"), sel >= 0 ? sel + 2 : -1);
      gl.uniform1f(ue("uHov"), hov >= 0 ? hov + 2 : -1);
      gl.uniform1f(ue("uSelT"), state.selT);
      gl.bindBuffer(gl.ARRAY_BUFFER, bPos);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bKind);
      gl.enableVertexAttribArray(aKind);
      gl.vertexAttribPointer(aKind, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, N);
      gl.disableVertexAttribArray(aKind);

      if (arcN && state.prog > 0) {
        // огонёк пролетает дугу за 2,4 с и ждёт 0,8 с
        const cycle = ((now - state.t0) / 1000) % 3.2;
        const head = state.prog < 1 ? state.prog : -0.2 + (cycle / 2.4) * 1.4;
        gl.useProgram(flight);
        gl.uniformMatrix3fv(uf("uRot"), false, rot);
        gl.uniform2f(uf("uScale"), sx, sy);
        gl.uniform1f(uf("uSize"), size * 1.4);
        gl.uniform1f(uf("uProg"), state.prog);
        gl.uniform1f(uf("uHead"), head);
        gl.bindBuffer(gl.ARRAY_BUFFER, bArc);
        gl.enableVertexAttribArray(fPos);
        gl.vertexAttribPointer(fPos, 3, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(fT);
        gl.vertexAttribPointer(fT, 1, gl.FLOAT, false, 16, 12);
        gl.drawArrays(gl.POINTS, 0, arcN);
        gl.disableVertexAttribArray(fT);
      }

      // подписи Пулково, аэропорта и страны под курсором
      const at = (hub: Hub, el: HTMLElement, show: boolean) => {
        const p = apply(vec(hub.lat, hub.lon)), x = w / 2 + p[0] * R;
        place(el, x, h / 2 - p[1] * R, show && p[2] > 0.12);
        return x;
      };
      const hx = at(home, tagHome, true);
      if (sel >= 0) {
        const bx = at(hubs[countries[sel].slug], tagDest, state.prog > 0.95);
        sides(hx, bx, w);
      }
      // название страны: над точкой Земли, куда навели курсор, а если навели на строку списка — над её аэропортом.
      // Точку храним в координатах Земли, поэтому подпись едет вместе со страной, когда глобус крутят
      if (hov >= 0 && hov !== sel) {
        tagHover.textContent = countries[hov].name;
        if (hovAt) {
          const p = apply(vec(hovAt.lat, hovAt.lon));
          place(tagHover, w / 2 + p[0] * R, h / 2 - p[1] * R, p[2] > 0.12);
        } else at(hubs[countries[hov].slug], tagHover, true);
      } else tagHover.classList.add("is-off");

      if (first) { first = false; stage.classList.add("is-live"); }
    };

    // Кадры идут, только пока секция видна и вкладка открыта
    const tick = () => frame(performance.now());
    const wake = () => {
      if (visible && !document.hidden && !running) { running = true; last = 0; gsap.ticker.add(tick); }
      else if ((!visible || document.hidden) && running) { running = false; gsap.ticker.remove(tick); }
      if (!running && w) tick(); // один кадр, чтобы шар не стоял пустым
    };
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; wake(); }, { rootMargin: "100px 0px" }).observe(stage);
    document.addEventListener("visibilitychange", wake);

    // ---------- мышь и палец ----------
    const toLatLon = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const x = (cx - r.left - w / 2) / R, y = -(cy - r.top - h / 2) / R, d = x * x + y * y;
      if (d > 1) return null;
      const z = Math.sqrt(1 - d);
      // обратный поворот: транспонированная матрица
      const v = [rot[0] * x + rot[1] * y + rot[2] * z, rot[3] * x + rot[4] * y + rot[5] * z, rot[6] * x + rot[7] * y + rot[8] * z];
      return { lat: Math.asin(clamp(v[1], -1, 1)) / D, lon: Math.atan2(v[0], v[2]) / D };
    };
    const pickAt = (cx: number, cy: number) => {
      const ll = toLatLon(cx, cy);
      return ll ? countryAt(ll.lat, ll.lon) : -1;
    };
    const stop = () => { auto = false; idleAt = performance.now(); };

    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      stop();
      tween?.kill();
      spin = { vx: 0, vy: 0 };
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), vx: 0, vy: 0, moved: false };
      if (e.pointerType === "mouse") canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) {
        if (e.pointerType === "mouse") {
          const ll = toLatLon(e.clientX, e.clientY), i = ll ? countryAt(ll.lat, ll.lon) : -1;
          hovAt = ll;
          if (i !== hov || i >= 0) { hov = i; wake(); }
          canvas.classList.toggle("is-pointing", i >= 0);
        }
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
      const dt = Math.max(1, now - drag.t) / 1000;
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) {
        drag.moved = true;
        canvas.classList.add("is-dragging");
        hint.classList.add("is-off");
        if (e.pointerType !== "mouse") canvas.setPointerCapture(e.pointerId);
      }
      if (!drag.moved) return;
      // Пальцем крутим и по вертикали, как мышью: страница под глобусом не листается (touch-action: none)
      const degX = (dx / R) / D, degY = (dy / R) / D;
      state.lon -= degX;
      state.lat = clamp(state.lat + degY, -25, 70);
      // скорость сглаживаем, чтобы бросок не зависел от последнего дёрнувшегося кадра
      drag.vx = drag.vx * 0.6 + (degX / dt) * 0.4;
      drag.vy = drag.vy * 0.6 + (degY / dt) * 0.4;
      wake();
    });
    const end = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag;
      drag = null;
      canvas.classList.remove("is-dragging");
      idleAt = performance.now();
      if (!d.moved && e.type === "pointerup") select(pickAt(e.clientX, e.clientY));
      else if (d.moved && performance.now() - d.t < 80) spin = { vx: clamp(d.vx, -400, 400), vy: clamp(d.vy, -200, 200) };
    };
    // Safari иногда начинает прокрутку страницы, даже если touch-action запрещает: держим палец на глобусе сами
    canvas.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { hovAt = null; if (!drag && hov >= 0) { hov = -1; wake(); } });
    if (!fine) hint.textContent = "Покрутите пальцем";

    resize();
    return {
      resize,
      hover(i) { hov = i; hovAt = null; wake(); },
      select(i) {
        stop();
        spin = { vx: 0, vy: 0 };
        const hub = hubs[countries[i].slug];
        buildArc(hub);
        // поворачиваем шар к середине маршрута, чтобы были видны и Петербург, и страна. Смотрим чуть снизу:
        // так дуга, поднятая над поверхностью, видна горбом над картой, а не прямой линией
        const b = vec(hub.lat, hub.lon);
        const m = [homeV[0] + b[0], homeV[1] + b[1], homeV[2] + b[2]];
        const len = Math.hypot(m[0], m[1], m[2]);
        const om = Math.acos(clamp(homeV[0] * b[0] + homeV[1] * b[1] + homeV[2] * b[2], -1, 1));
        const lat = clamp(Math.asin(m[1] / len) / D - 14 - 14 * (om / Math.PI), -25, 60);
        let lon = Math.atan2(m[0], m[2]) / D;
        lon = state.lon + ((((lon - state.lon) % 360) + 540) % 360) - 180;
        tween?.kill();
        tween = gsap.to(state, { lat, lon, duration: 1.2, ease: "soft" });
        gsap.fromTo(state, { selT: 0 }, { selT: 1, duration: 0.5 });
        gsap.fromTo(state, { prog: 0 }, { prog: 1, duration: 1.1, delay: 0.35, ease: "soft", onComplete: () => { state.t0 = performance.now(); } });
        tagDest.classList.add("is-off");
        wake();
      },
    };
  }

  // ---------- плоская карта: без WebGL и при «уменьшить движение» ----------
  function flatView(): View {
    const ctx = canvas.getContext("2d")!;
    // Европа, Индия, Китай, Япония и Бали; по горизонтали сжато, как на широте 35°
    const W0 = -14, W1 = 150, N0 = 72, S0 = -14, KX = Math.cos(35 * D);
    const led = css("--led") || "#dcf352", pick = css("--led-wait") || "#ffc23a";
    let w = 0, h = 0, s = 1, hov = -1;
    const xy = (lat: number, lon: number) => [(lon - W0) * KX * s, (N0 - lat) * s];

    const draw = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // шаг сетки такой, чтобы между точками было не меньше 5 px
      const step = Math.max(0.5, Math.ceil(5 / s / 0.5) * 0.5);
      const r = Math.max(1, step * s * 0.3);
      for (let lat = N0 - step / 2; lat > S0; lat -= step) {
        for (let lon = W0 + step / 2; lon < W1; lon += step) {
          const v = cellAt(lat, lon), k = kindToIdx[v];
          ctx.globalAlpha = v === 0 ? 0.09 : v === 1 ? 0.3 : 0.95;
          ctx.fillStyle = k >= 0 && k === sel ? pick : k >= 0 && k === hov ? "#f4fbc8" : led;
          const [x, y] = xy(lat, lon);
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      const [hx, hy] = xy(home.lat, home.lon);
      place(tagHome, hx, hy, true);
      if (sel >= 0) {
        // дуга рейса точками: кривая над прямой от Пулково до аэропорта
        const hub = hubs[countries[sel].slug];
        const [bx, by] = xy(hub.lat, hub.lon);
        const len = Math.hypot(bx - hx, by - hy);
        const cx = (hx + bx) / 2, cy = (hy + by) / 2 - len * 0.28;
        const n = Math.max(10, Math.round(len / (r * 3.2)));
        ctx.fillStyle = pick;
        for (let i = 0; i <= n; i++) {
          const t = i / n, u = 1 - t;
          ctx.beginPath();
          ctx.arc(u * u * hx + 2 * u * t * cx + t * t * bx, u * u * hy + 2 * u * t * cy + t * t * by, r * 1.1, 0, Math.PI * 2);
          ctx.fill();
        }
        place(tagDest, bx, by, true);
        sides(hx, bx, w);
      }
      if (hov >= 0 && hov !== sel) {
        const hub = hubs[countries[hov].slug];
        const [x, y] = xy(hub.lat, hub.lon);
        tagHover.textContent = countries[hov].name;
        place(tagHover, x, y, true);
      } else tagHover.classList.add("is-off");
      stage.classList.add("is-live");
    };
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = rect.width; h = rect.height;
      s = Math.min(w / ((W1 - W0) * KX), h / (N0 - S0));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    };
    const pickAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const lon = (e.clientX - rect.left) / s / KX + W0, lat = N0 - (e.clientY - rect.top) / s;
      return countryAt(lat, lon);
    };
    canvas.addEventListener("click", (e) => select(pickAt(e as PointerEvent)));
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const i = pickAt(e);
      canvas.classList.toggle("is-pointing", i >= 0);
      if (i !== hov) { hov = i; draw(); }
    });
    canvas.addEventListener("pointerleave", () => { if (hov >= 0) { hov = -1; draw(); } });
    resize();
    return {
      resize,
      hover(i) { hov = i; draw(); },
      select() { draw(); },
    };
  }
}

// Светодиодное табло: знак — ячейка с сеткой погашенных точек, горящие точки берутся из маски знака
// (data-c у ячейки → правило в led.css). Разметку рисует Led.astro, здесь только смена надписей.
import { gsap } from "./motion";
import { ledChar } from "../lib/ledFont";

export const reduce = matchMedia("(prefers-reduced-motion: reduce)");

export function makeCell(ch: string) {
  const c = document.createElement("span");
  c.className = "cell";
  c.dataset.c = ledChar(ch);
  c.setAttribute("aria-hidden", "true");
  c.append(document.createElement("i"));
  return c;
}

const fit = (word: Element, text: string) => {
  const cells = [...word.querySelectorAll<HTMLElement>(".cell")];
  const chars = [...text.toUpperCase().padEnd(cells.length, " ").slice(0, cells.length)].map(ledChar);
  return { cells, lit: cells.map((c) => c.firstElementChild!), chars };
};
// Текст для читалок лежит рядом с точками
const say = (word: Element, text: string) => {
  const t = word.querySelector(".visually-hidden");
  if (t) t.textContent = text;
};

export function setWordInstant(word: Element, text: string) {
  const { cells, lit, chars } = fit(word, text);
  gsap.killTweensOf(lit);
  cells.forEach((c, i) => (c.dataset.c = chars[i]));
  gsap.set(lit, { opacity: 1 });
  say(word, text);
}

// Смена надписи: изменившиеся знаки гаснут разом, новые загораются слева направо
export function setWord(word: Element, text: string, delay = 0) {
  const { cells, lit, chars } = fit(word, text);
  say(word, text);
  const changed = cells.map((c, i) => c.dataset.c !== chars[i]);
  if (!changed.some(Boolean)) return Promise.resolve();
  if (reduce.matches) {
    setWordInstant(word, text);
    return Promise.resolve();
  }
  gsap.killTweensOf(lit);
  const off = lit.filter((_, i) => changed[i]);
  const on = lit.filter((_, i) => changed[i] && chars[i] !== " ");
  const tl = gsap.timeline({ delay: delay / 1000 });
  tl.to(off, { opacity: 0, duration: 0.12, ease: "close" })
    .call(() => cells.forEach((c, i) => { if (changed[i]) c.dataset.c = chars[i]; }))
    .fromTo(on, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "soft", stagger: 0.03 });
  return tl.then(() => {});
}

export const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();

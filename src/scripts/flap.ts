// Перекидные ячейки табло. Ячейка — четыре половинки: верх и низ текущего знака
// и две створки, которые переворачиваются (верхняя падает, нижняя ложится на место).
// Разметку ячеек рисует Flap.astro, здесь только смена знаков.

export const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const ABC = "АБВГДЕЖЗИКЛМНОПРСТУФЦШЯ0123456789";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Cell = HTMLElement & { _run?: number };
const part = (cell: Element, k: string) => cell.querySelector(`.${k} > i`) as HTMLElement;

export function makeCell(ch: string) {
  const c = document.createElement("span");
  c.className = "cell";
  c.dataset.c = ch;
  for (const k of ["t", "b", "ft", "fb"]) {
    const s = document.createElement("span");
    s.className = k;
    const i = document.createElement("i");
    i.textContent = ch;
    s.append(i);
    c.append(s);
  }
  return c;
}

function flipOnce(cell: Cell, next: string, half: number) {
  const prev = cell.dataset.c!;
  if (prev === next) return Promise.resolve();
  part(cell, "t").textContent = next;
  part(cell, "b").textContent = prev;
  part(cell, "ft").textContent = prev;
  part(cell, "fb").textContent = next;
  cell.dataset.c = next;
  const ft = cell.querySelector(".ft") as HTMLElement;
  const fb = cell.querySelector(".fb") as HTMLElement;
  // Створка падает с ускорением и ложится с торможением, как настоящая
  ft.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], { duration: half, easing: "ease-in", fill: "forwards" });
  return fb
    .animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: half, delay: half, easing: "ease-out", fill: "forwards" })
    .finished.then(() => {
      part(cell, "b").textContent = next;
      part(cell, "ft").textContent = next;
      ft.getAnimations().forEach((a) => a.cancel());
      fb.getAnimations().forEach((a) => a.cancel());
    }, () => {});
}

export function setInstant(cell: Cell, ch: string) {
  cell._run = (cell._run || 0) + 1;
  cell.dataset.c = ch;
  for (const k of ["t", "b", "ft", "fb"]) part(cell, k).textContent = ch;
}

// Ячейка пролистывает несколько случайных знаков и встаёт на нужный; новый вызов отменяет старый
async function flipTo(cell: Cell, target: string, delay: number, half: number, extra: number) {
  if (reduce.matches) return setInstant(cell, target);
  if (cell.dataset.c === target) return;
  const run = (cell._run || 0) + 1;
  cell._run = run;
  await wait(delay);
  const steps = 2 + Math.floor(Math.random() * extra);
  for (let s = 0; s < steps; s++) {
    if (cell._run !== run) return;
    await flipOnce(cell, ABC[Math.floor(Math.random() * ABC.length)], half);
  }
  if (cell._run === run) await flipOnce(cell, target, half);
}

const fit = (word: Element, text: string) => {
  const cells = [...word.children] as Cell[];
  return { cells, chars: text.toUpperCase().padEnd(cells.length, " ").slice(0, cells.length) };
};

export function setWord(word: Element, text: string, baseDelay = 0, half = 70, extra = 4) {
  const { cells, chars } = fit(word, text);
  return Promise.all(cells.map((c, i) => flipTo(c, chars[i], baseDelay + i * 28, half, extra)));
}

export function setWordInstant(word: Element, text: string) {
  const { cells, chars } = fit(word, text);
  cells.forEach((c, i) => setInstant(c, chars[i]));
}

export const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();

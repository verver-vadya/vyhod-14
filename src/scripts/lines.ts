// Заголовок раздела поднимается по строкам из-под маски, подпись над ним и ссылка под ним проявляются следом.
// Модуль грузится только на страницах с такими заголовками (src/scripts/site.ts).
import { gsap } from "./motion";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(SplitText);

export async function riseHead(head: HTMLElement, delay: number) {
  const h = head.querySelector("h2")!;
  // Строки считаем по настоящему шрифту, иначе перенос в анимации разойдётся с итоговым
  await document.fonts.ready;
  const split = new SplitText(h, { type: "lines", mask: "lines", linesClass: "ln" });
  h.classList.add("is-lines");
  const kids = [...head.children];
  const before = kids.slice(0, kids.indexOf(h));
  const after = kids.slice(kids.indexOf(h) + 1);

  const tl = gsap.timeline({
    delay,
    onComplete: () => {
      split.revert();
      h.classList.remove("is-lines");
      gsap.set([...before, ...after], { clearProps: "opacity,transform" });
    },
  });
  if (before.length) tl.fromTo(before, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 0);
  tl.fromTo(split.lines, { yPercent: 130 }, { yPercent: 0, duration: 0.8, stagger: 0.08 }, 0.05);
  if (after.length) tl.fromTo(after, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.05 }, 0.3);
  head.classList.add("is-in", "is-split");
}

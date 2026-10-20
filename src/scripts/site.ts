// Общее для всех страниц: меню на телефоне и появление блоков при прокрутке

// Без этого Safari на iPhone не показывает нажатие (:active) на кнопках и ссылках
document.addEventListener("touchstart", () => {}, { passive: true });

const html = document.documentElement;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

// ---------- меню: лист опускается сверху, закрывается крестиком, по Esc, ссылкой и тапом мимо пунктов ----------
const menu = document.getElementById("menu") as HTMLDialogElement | null;
const burger = document.querySelector<HTMLButtonElement>(".burger");
if (menu && burger && typeof menu.showModal === "function") {
  let closing = false;
  const open = async () => {
    if (menu.open) return;
    menu.showModal();
    html.classList.add("has-menu");
    // Кадр, в котором окно встаёт поверх страницы, проходит без движения: так выезд не теряет кадры
    await nextFrame();
    await nextFrame();
    if (menu.open) menu.classList.add("is-open");
  };
  const close = () => {
    if (!menu.open || closing) return;
    closing = true;
    menu.classList.remove("is-open");
    const ms = parseFloat(getComputedStyle(html).getPropertyValue("--d-close")) || 320;
    setTimeout(() => { closing = false; menu.close(); }, ms);
  };
  burger.addEventListener("click", open);
  menu.querySelector(".menu__close")!.addEventListener("click", close);
  menu.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  menu.addEventListener("click", (e) => {
    const t = e.target as Element;
    // Ссылка уводит на другую страницу; пустое место листа и затемнение закрывают меню
    if (t.closest("a")) { menu.classList.remove("is-open"); return; }
    if (t === menu || t.classList.contains("menu__panel") || t.classList.contains("menu__bar")) close();
  });
  menu.addEventListener("close", () => {
    menu.classList.remove("is-open");
    html.classList.remove("has-menu");
    burger.focus({ preventScroll: true });
  });
  // На широком экране меню не нужно: если окно растянули с открытым меню, закрываем
  matchMedia("(min-width: 1101px)").addEventListener("change", (e) => { if (e.matches && menu.open) menu.close(); });
}

// ---------- появление при прокрутке: один раз, несколько блоков сразу — по очереди, не больше 4 шагов ----------
const reveals = document.querySelectorAll<HTMLElement>(".reveal");
if (reveals.length) {
  if (!("IntersectionObserver" in window)) reveals.forEach((el) => el.classList.add("is-in"));
  else {
    const io = new IntersectionObserver((entries) => {
      let n = 0;
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.setProperty("--delay", `${Math.min(n++, 4) * 50}ms`);
        el.classList.add("is-in");
        io.unobserve(el);
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    reveals.forEach((el) => io.observe(el));
  }
}

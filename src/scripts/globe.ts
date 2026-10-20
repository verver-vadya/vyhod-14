// Земля на главной грузится, когда до неё остаётся пара экранов: шар, карта суши и WebGL — в globe-view.ts.
// Пока модуль не пришёл, строки списка остаются ссылками на страницы стран.
const stage = document.getElementById("globe-stage");
if (stage) {
  const load = () => import("./globe-view").then((m) => m.init());
  if (!("IntersectionObserver" in window)) load();
  else {
    const io = new IntersectionObserver((e) => {
      if (!e.some((x) => x.isIntersecting)) return;
      io.disconnect();
      load();
    }, { rootMargin: "1200px 0px" });
    io.observe(stage);
  }
}

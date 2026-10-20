// Строки табло из данных стран: общие для сборки страницы и для скрипта, который меняет строки
import type { Country } from "../data/countries";
import { countries } from "../data/countries";

const nbsp = (s: string) => s.replace(/ /g, " ");

// Через n рабочих дней от сегодня, «28.10»
export function workdaysFrom(n: number, from = new Date()) {
  const d = new Date(from);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) left--;
  }
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Статус для табло. withDate: false при сборке, чтобы на странице не стояла вчерашняя дата
export function statusOf(c: Country, withDate = true) {
  const s = c.status;
  if (s.kind === "open") return { text: "ПРИЁМ ОТКРЫТ", ok: true, say: "приём открыт" };
  if (s.kind === "online") return { text: "ОНЛАЙН", ok: true, say: "оформляем онлайн" };
  if (s.kind === "urgent") return { text: `СРОЧНО ${s.days} ДН`, ok: false, say: `срочно за ${s.days} дня` };
  const date = withDate ? workdaysFrom(s.days) : "";
  return { text: withDate ? `ЗАПИСЬ ${date}` : "ЗАПИСЬ", ok: false, say: withDate ? `ближайшая запись ${date}` : "запись на ближайшую дату" };
}

export const COLS = [
  ["c-code", 3, "Код"],
  ["c-country", 9, "Направление"],
  ["c-visa", 8, "Виза"],
  ["c-term", 5, "Срок"],
  ["c-price", 8, "Услуги от"],
  ["c-status", 12, "Статус"],
] as const;

export function rowOf(c: Country, withDate = true) {
  const st = statusOf(c, withDate);
  const price = `${c.price.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;
  return {
    slug: c.slug,
    ok: st.ok,
    words: [c.code, c.name, c.boardVisa, `${c.days} ДН`, price, st.text],
    label: nbsp(`${c.name}: ${c.visa}, от ${c.days} рабочих дней, услуги от ${c.price.toLocaleString("ru-RU")} ₽, ${st.say}`),
  };
}

export const flights = () => countries.map((c) => rowOf(c));

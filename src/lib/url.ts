// Адрес внутри сайта с учётом корня (на превью сайт живёт в /vyhod-14/)
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
export const url = (path: string) => base + path;
export const asset = (path: string) => `${base}/assets/${path}`;

// Деньги по-русски: 13 000 ₽ с неразрывными пробелами
export const rub = (n: number) => `${n.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;

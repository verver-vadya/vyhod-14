// Всё о компании в одном месте: меняется здесь, а не на страницах
export const site = {
  name: "Выход 14",
  city: "Санкт-Петербург",
  phone: "+7 812 000-14-14",
  phoneHref: "tel:+78120001414",
  email: "hello@vyhod14.example",
  telegram: "https://t.me/vyhod14_example",
  telegramName: "@vyhod14_example",
  address: "Лиговский пр., 50, офис 14",
  addressFull: "Санкт-Петербург, Лиговский проспект, 50, офис 14",
  metro: "Площадь Восстания",
  walk: "5 минут пешком от метро",
  hours: [
    ["Пн–Пт", "9:00–20:00"],
    ["Сб", "10:00–16:00"],
    ["Вс", "выходной"],
  ],
  // Адрес в Яндекс Картах: там же «Маршрут» (без ключей и встроенной карты)
  routeHref: "https://yandex.ru/maps/?text=" + encodeURIComponent("Санкт-Петербург, Лиговский проспект, 50"),
  // Адрес формы Formspree: вписать вместо YOUR_FORM_ID; пока его нет, форма честно пишет, что не подключена
  formAction: "https://formspree.io/f/YOUR_FORM_ID",
  author: "https://verver-vadya.github.io/site-portfolio/",
};

export const nav = [
  { href: "/vizy/", label: "Визы" },
  { href: "/uslugi/", label: "Услуги и цены" },
  { href: "/status/", label: "Статус заявки" },
  { href: "/o-nas/", label: "О нас" },
  { href: "/kontakty/", label: "Контакты" },
];

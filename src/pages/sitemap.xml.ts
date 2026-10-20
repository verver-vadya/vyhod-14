// Карта сайта для поисковиков: все страницы, кроме 404
import type { APIRoute } from "astro";
import { countries } from "../data/countries";

export const GET: APIRoute = ({ site }) => {
  const paths = [
    "/", "/vizy/", ...countries.map((c) => `/vizy/${c.slug}/`),
    "/uslugi/", "/status/", "/o-nas/", "/kontakty/", "/zayavka/", "/privacy/",
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${new URL(p, site)}</loc></url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
};

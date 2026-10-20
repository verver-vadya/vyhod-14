// Сайт собирается в обычные HTML-файлы (папка dist). Превью живёт на GitHub Pages по адресу /vyhod-14/,
// поэтому корень сайта берём из BASE_PATH, который подставляет сборка в .github/workflows/pages.yml.
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://example.ru",
  base: process.env.BASE_PATH || "/",
  trailingSlash: "always",
  build: { format: "directory", inlineStylesheets: "never" },
  devToolbar: { enabled: false },
});

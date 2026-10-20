// Маски знаков светодиодного табло: для каждого знака — SVG с горящими точками сетки 5×7
import { LED_CHARS, glyphPath } from "../lib/ledFont";

// В адресе экранируем только угловые скобки: остальное браузеры читают как есть, а файл втрое меньше
const mask = (d: string) =>
  `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 7'><path d='${d}'/></svg>`.replace(/</g, "%3C").replace(/>/g, "%3E")}")`;

export function GET() {
  const css = LED_CHARS.filter((ch) => ch !== " ")
    .map((ch) => `.cell[data-c="${ch}"]{--g:${mask(glyphPath(ch))}}`)
    .join("\n");
  return new Response(css + "\n", { headers: { "Content-Type": "text/css; charset=utf-8" } });
}

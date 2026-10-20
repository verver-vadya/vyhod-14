// GSAP для сайта: плагины и кривые из правил движения проекта (setup/motion-examples.md), без отскоков
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(ScrollTrigger, CustomEase);

// Те же кривые, что --ease-* в global.css
CustomEase.create("soft", "0.35,0,0.15,1");
CustomEase.create("close", "0.4,0,0.2,1");
CustomEase.create("hover", "0.45,0,0.25,1");
CustomEase.create("quick", "0.23,1,0.32,1");

gsap.defaults({ ease: "soft", duration: 0.5 });

export { gsap, ScrollTrigger };

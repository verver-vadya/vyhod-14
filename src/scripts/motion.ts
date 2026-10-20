// GSAP для сайта: кривые из правил движения проекта (setup/motion-examples.md), без отскоков
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// Те же кривые, что --ease-* в global.css
CustomEase.create("soft", "0.35,0,0.15,1");
CustomEase.create("close", "0.4,0,0.2,1");
CustomEase.create("hover", "0.45,0,0.25,1");
CustomEase.create("quick", "0.23,1,0.32,1");
// Удар штампа: разгон к концу, как у руки со штампом
CustomEase.create("hit", "0.55,0,0.9,0.45");

gsap.defaults({ ease: "soft", duration: 0.5 });

export { gsap };

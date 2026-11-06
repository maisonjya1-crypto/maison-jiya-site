import { JIYA_LOGO } from "./brand-marks";

/* Ouverture de la boutique : le logo JIYA apparaît au centre d'un cadran de montre,
   pendant que montres, bijoux et portefeuilles tournent autour.
   - rendu côté serveur (aucun JavaScript client ajouté au bundle) ;
   - une seule fois par session, passable d'un toucher ou d'une touche ;
   - jamais affichée si l'appareil demande moins d'animations ;
   - le site est déjà chargé dessous : l'animation ne retarde ni le contenu ni Google. */

const ORBIT: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "watch", label: "Montre", icon: <><rect x="18" y="3" width="12" height="9" rx="2" /><rect x="18" y="36" width="12" height="9" rx="2" /><circle cx="24" cy="24" r="11.5" /><circle cx="24" cy="24" r="8.5" strokeOpacity=".5" /><path d="M35.5 22h3v4h-3" /><path d="M24 18v6l4 2.5" /></> },
  { key: "ring", label: "Bague", icon: <><circle cx="24" cy="30" r="12" /><circle cx="24" cy="30" r="9" strokeOpacity=".5" /><path d="M17.5 13.5 21 8h6l3.5 5.5L24 20.5Z" /><path d="M17.5 13.5h13M21 8l3 12.5M27 8l-3 12.5" strokeOpacity=".6" /></> },
  { key: "wallet", label: "Portefeuille", icon: <><rect x="6" y="13" width="36" height="24" rx="4" /><path d="M9 13l20-6 3 6" /><path d="M42 20H32a4 4 0 0 0 0 8h10" /><circle cx="32.5" cy="24" r="1.3" /></> },
  { key: "necklace", label: "Collier", icon: <><path d="M8 7c2 15 8.5 23 16 23s14-8 16-23" strokeDasharray="1.5 2.6" /><path d="M24 30.5 19.5 36 24 43l4.5-7Z" /><path d="M19.5 36h9" strokeOpacity=".6" /></> },
  { key: "bracelet", label: "Bracelet", icon: <><ellipse cx="24" cy="22" rx="16" ry="10" /><ellipse cx="24" cy="22" rx="12" ry="6.5" strokeOpacity=".5" /><path d="M24 32v3" /><circle cx="24" cy="38" r="2.8" /></> },
  { key: "earrings", label: "Boucles d'oreilles", icon: <><circle cx="15" cy="9" r="2.2" /><path d="M15 11.2v5.3M15 16.5l-5 9 5 9.5 5-9.5Z" /><circle cx="33" cy="9" r="2.2" /><path d="M33 11.2v5.3M33 16.5l-5 9 5 9.5 5-9.5Z" /></> },
];

const INTRO_SCRIPT = `(function(){var el=document.getElementById("mj-intro");if(!el)return;function set(v){el.setAttribute("data-state",v)}try{if(sessionStorage.getItem("mj-intro-seen")){set("off");return}sessionStorage.setItem("mj-intro-seen","1")}catch(e){}if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches){set("off");return}function skip(){if(el.getAttribute("data-state")!=="off")set("skip");setTimeout(function(){set("off")},450)}el.addEventListener("click",skip);addEventListener("keydown",skip,{once:true});setTimeout(function(){set("off")},3400)})();`;

export default function BrandIntro() {
  return <>
    <div id="mj-intro" className="mj-intro" aria-hidden="true" data-state="play">
      <div className="mj-intro-stage">
        <span className="mj-intro-bezel" />
        <div className="mj-intro-orbit">
          {ORBIT.map((item, index) => <span key={item.key} className="mj-intro-item" style={{ "--i": index } as React.CSSProperties}>
            <svg viewBox="0 0 48 48" role="img" aria-label={item.label}>{item.icon}</svg>
          </span>)}
        </div>
        <svg className="mj-intro-logo" viewBox={`0 0 ${JIYA_LOGO.width} ${JIYA_LOGO.height}`}>
          <path className="mj-intro-glyphs" fillRule="evenodd" d={JIYA_LOGO.glyphs} />
          <path className="mj-intro-script" fillRule="evenodd" d={JIYA_LOGO.script} />
          <path className="mj-intro-tagline" fillRule="evenodd" d={JIYA_LOGO.tagline} />
        </svg>
      </div>
    </div>
    <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
  </>;
}

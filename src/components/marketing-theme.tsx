"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";

import { AnimatedGradient } from "@/components/ui/animated-gradient";

type MarketingTheme = "machine" | "portrait";

const MarketingThemeContext = createContext<{
  theme: MarketingTheme;
  setTheme: (theme: MarketingTheme) => void;
} | null>(null);

export function MarketingThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MarketingTheme>("machine");

  useEffect(() => {
    const stored = window.localStorage.getItem("project-l-marketing-theme");
    if (stored === "machine" || stored === "portrait") {
      queueMicrotask(() => setTheme(stored));
    }
  }, []);

  const selectTheme = (nextTheme: MarketingTheme) => {
    setTheme(nextTheme);
    window.localStorage.setItem("project-l-marketing-theme", nextTheme);
  };

  return (
    <MarketingThemeContext.Provider value={{ theme, setTheme: selectTheme }}>
      <div className="marketing-theme-shell" data-theme={theme}>
        {children}
      </div>
    </MarketingThemeContext.Provider>
  );
}

function useMarketingTheme() {
  const context = useContext(MarketingThemeContext);
  if (!context) throw new Error("Marketing theme controls require a provider.");
  return context;
}

export function MarketingThemeSwitch() {
  const { theme, setTheme } = useMarketingTheme();
  const isPortrait = theme === "portrait";

  return (
    <button
      aria-label={`Switch to ${isPortrait ? "Machine" : "Portrait"} theme`}
      aria-pressed={isPortrait}
      className="marketing-theme-switch"
      onClick={() => setTheme(isPortrait ? "machine" : "portrait")}
      type="button"
    >
      <span className="theme-switch-track" aria-hidden="true">
        <i className="theme-switch-thumb">
          {isPortrait ? <Sun size={12} /> : <Moon size={12} />}
        </i>
      </span>
      <span>{isPortrait ? "Portrait" : "Machine"}</span>
    </button>
  );
}

export function MarketingHeroVisual() {
  const { theme } = useMarketingTheme();

  if (theme === "machine") {
    return (
      <AnimatedGradient
        className="aurora-field"
        config={{
          preset: "custom",
          color1: "#07020f",
          color2: "#30105c",
          color3: "#ff1f8f",
          rotation: -28,
          proportion: 63,
          scale: 0.72,
          speed: 10,
          distortion: 26,
          swirl: 58,
          swirlIterations: 8,
          softness: 96,
          offset: 180,
          shape: "Edge",
          shapeSize: 56,
        }}
        noise={{ opacity: 0.2, scale: 0.8 }}
      />
    );
  }

  return (
    <div className="portrait-memory-wall" aria-hidden="true">
      <article className="memory-card memory-card-one">
        <div className="memory-site memory-site-type">
          <span>STUDIO / 24</span>
          <strong>MOVE<br />WITH<br />ME.</strong>
        </div>
        <p>Motion portfolio · Shanghai</p>
      </article>

      <article className="memory-card memory-card-two">
        <div className="memory-site memory-site-editorial">
          <span>FIELD NOTES</span>
          <strong>Ideas worth<br />keeping.</strong>
          <i />
        </div>
        <p>Independent journal · London</p>
      </article>

      <article className="memory-card memory-card-three">
        <div className="memory-site memory-site-product">
          <span>NEW OBJECTS</span>
          <i />
          <strong>Arc / 01</strong>
        </div>
        <p>Product launch · Copenhagen</p>
      </article>

      <article className="memory-card memory-card-four">
        <div className="memory-site memory-site-ai">
          <span>SOFT SIGNALS</span>
          <strong>Listen<br />closer.</strong>
        </div>
        <p>Interactive archive · Tokyo</p>
      </article>
    </div>
  );
}

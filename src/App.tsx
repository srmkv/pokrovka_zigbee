import { useEffect, useState } from "react";
import SideBar from "./components/SideBar";
import MainContent from "./components/MainContent";
import { UiPopupProvider } from "./contexts/UiPopupContext";
import { ThemeId, isThemeId } from "./types/theme";
const App = () => {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const saved = localStorage.getItem("ui-theme");
    return isThemeId(saved) ? saved : "dark";
  });
  // Боковая панель: на десктопе всегда видима, на мобильном — выезжающий drawer.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("ui-theme", theme);
    // Держим фон <html> и theme-color в синхроне с темой (см. также public/index.html).
    const bg = { dark: "#181825", light: "#ece2d4", midnight: "#04060c", day: "#eaf1fa" }[theme] || "#181825";
    document.documentElement.style.backgroundColor = bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bg);
  }, [theme]);

  // Блокируем прокрутку фона, пока открыт мобильный drawer.
  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <UiPopupProvider>
    <div className={`app-shell flex w-full h-screen overflow-x-hidden theme-${theme}`}>
      {/* Затемнение под мобильным drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      {/* Сайдбар: статичный на десктопе (lg+), выезжающий слева на мобильном */}
      <aside
        className={`app-sidebar fixed inset-y-0 left-0 z-40 w-[86%] max-w-[360px] overflow-y-auto custom-scroll
          transform transition-transform duration-300 ease-out
          lg:static lg:z-auto lg:w-auto lg:max-w-[430px] lg:min-w-[320px] lg:translate-x-0 lg:transform-none
          h-screen ${navOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
          ${theme === "light" ? "bg-[#eef3f8]" : "bg-[#100E1D]"}`}
      >
        {/* Кнопка закрытия — только на мобильном */}
        <button
          type="button"
          onClick={() => setNavOpen(false)}
          aria-label="Закрыть"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/25 text-lg text-gray-100 lg:hidden"
        >
          ✕
        </button>
        <SideBar />
      </aside>
      {/* MainContent только с вертикальным скроллом и кастомным скроллом */}
      <main className={`app-main flex-1 min-w-0 h-screen overflow-hidden custom-scroll ${theme === "light" ? "bg-[#f5f7fb]" : "bg-[#181825]"}`}>
        <MainContent theme={theme} setTheme={setTheme} onOpenNav={() => setNavOpen(true)} />
      </main>
    </div>
    </UiPopupProvider>
  );
};

export default App;

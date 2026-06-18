import { useEffect, useState } from "react";
import SideBar from "./components/SideBar";
import MainContent from "./components/MainContent";
import { UiPopupProvider } from "./contexts/UiPopupContext";
const App = () => {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("ui-theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    localStorage.setItem("ui-theme", theme);
  }, [theme]);

  return (
    <UiPopupProvider>
    <div className={`app-shell flex w-full h-screen ${theme === "light" ? "theme-light" : "theme-dark"}`}>
      {/* Сайдбар с фоном */}
      <aside className={`app-sidebar max-w-[430px] min-w-[320px] h-screen ${theme === "light" ? "bg-[#eef3f8]" : "bg-[#100E1D]"}`}>
        <SideBar />
      </aside>
      {/* MainContent только с вертикальным скроллом и кастомным скроллом */}
      <main className={`app-main flex-1 h-screen overflow-hidden custom-scroll ${theme === "light" ? "bg-[#f5f7fb]" : "bg-[#181825]"}`}>
        <MainContent theme={theme} setTheme={setTheme} />
      </main>
    </div>
    </UiPopupProvider>
  );
};

export default App;

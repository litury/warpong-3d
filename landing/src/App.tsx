import { Header } from "./components";
import { Hero } from "./modules/hero";
import { Features } from "./modules/features";
import { Gameplay } from "./modules/gameplay";
import { OpenSource } from "./modules/openSource";
import { TechStack } from "./modules/techStack";
import { Footer } from "./modules/footer";

export function App() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <hr className="divider" />
        <Features />
        <hr className="divider" />
        <Gameplay />
        <hr className="divider" />
        <OpenSource />
        <hr className="divider" />
        <TechStack />
      </main>
      <Footer />
    </>
  );
}

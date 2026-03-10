import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: { port: 5174 },
    build: { target: "es2020" },
    define: {
      __WS_URL__: JSON.stringify(env.WS_URL || "ws://localhost:3030"),
    },
  };
});

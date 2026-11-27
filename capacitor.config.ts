import type { CapacitorConfig } from "@capacitor/cli";

// Identidade oficial nas lojas (Apple e Google). Não alterar após a primeira publicação.
// CAP_LIVE_RELOAD=1 aponta o app para a prévia (somente testes em aparelho; nunca em build de loja).
const liveReload = process.env.CAP_LIVE_RELOAD === "1";

const config: CapacitorConfig = {
  appId: "br.com.olaaura.app",
  appName: "Olá Aura",
  webDir: "dist",
  ...(liveReload
    ? {
        server: {
          url: "https://a534aec4-6141-4bea-8ef0-2c1bd0914adb.lovableproject.com/meu-espaco?forceHideBadge=true",
          cleartext: true,
        },
      }
    : {}),
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#ffffff", showSpinner: false },
  },
};

export default config;

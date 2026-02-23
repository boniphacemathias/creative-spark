import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { aiApiPlugin } from "./vite.ai-api-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::", // already correct for external access
    port: 8080,
    allowedHosts: [
      "confessable-unpictorially-imelda.ngrok-free.dev"
    ],
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    aiApiPlugin(),
    mode === "development" && componentTagger()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
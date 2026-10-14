import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // During development, send /api requests to the Node server.
    proxy: { "/api": "http://localhost:4000" },
  },
});

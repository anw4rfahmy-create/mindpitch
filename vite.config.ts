import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Daftar seluruh aset hasil build (JS, CSS, font) agar service worker bisa pra-cache untuk mode offline penuh.
function precache(): Plugin {
  let out = "dist";
  return {
    name: "mindpitch-precache",
    apply: "build",
    configResolved(c) {
      out = c.build.outDir;
    },
    closeBundle() {
      const files = readdirSync(join(out, "assets")).filter((f) => !f.endsWith(".woff"));
      writeFileSync(join(out, "precache.json"), JSON.stringify(files.map((f) => "assets/" + f)));
    },
  };
}

export default defineConfig({
  plugins: [react(), precache()],
  base: "./",
  build: { target: "es2020", sourcemap: false },
});

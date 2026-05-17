import path from "path";
import fs from "fs";
import { defineConfig } from "prisma/config";

// Load .env from monorepo root if DATABASE_URL not already set
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf-8");
    for (const line of text.split("\n")) {
      if (line.startsWith("#") || !line.trim() || !line.includes("=")) continue;
      const eqIdx = line.indexOf("=");
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});

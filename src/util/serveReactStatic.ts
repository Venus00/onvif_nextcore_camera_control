// Serve React static build from ../nxtcor-react/dist
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

export function setupReactStatic(app: ReturnType<typeof express>) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientBuildPath = path.join(__dirname, "../../nxtcor-react/dist");

    // Serve static files
    app.use(express.static(clientBuildPath));

    // Serve index.html for all non-API routes (SPA fallback)
    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(clientBuildPath, "index.html"));
    });
}

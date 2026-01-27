// Serve React static build from ../nxtcor-react/dist
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

export function setupReactStatic(app: ReturnType<typeof express>) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientBuildPath = path.join(__dirname, "../../nxtcor-react/dist");
    app.use(express.static(clientBuildPath));
    app.get("*", (req, res) => {
        res.sendFile(path.join(clientBuildPath, "index.html"));
    });
}

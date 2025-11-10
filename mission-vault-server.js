const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const MANIFEST_PATH = path.join(UPLOAD_DIR, "_manifest.json");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Impossible de lire le manifeste :", error);
    return [];
  }
}

function saveManifest(entries) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

let manifest = loadManifest();

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${timestamp}__${sanitized}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers PDF sont autorisés."));
    }
  },
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
});

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/files", (_, res) => {
  manifest.sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
  res.json(manifest);
});

app.post("/api/upload", upload.array("files"), (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: "Aucun fichier reçu." });
  }

  const entries = req.files.map((file) => ({
    id: path.basename(file.filename),
    storedName: path.basename(file.filename),
    originalName: file.originalname,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }));

  manifest.push(...entries);
  saveManifest(manifest);
  res.status(201).json(entries);
});

app.delete("/api/files/:id", (req, res) => {
  const { id } = req.params;
  const index = manifest.findIndex((entry) => entry.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Fichier introuvable." });
  }

  const target = manifest[index];
  const filePath = path.join(UPLOAD_DIR, target.storedName);

  fs.promises
    .unlink(filePath)
    .then(() => {
      manifest.splice(index, 1);
      saveManifest(manifest);
      res.status(204).end();
    })
    .catch((error) => {
      console.error("Suppression impossible :", error);
      res.status(500).json({ error: "Impossible de supprimer ce fichier." });
    });
});

app.get("/api/files/:id", (req, res) => {
  const { id } = req.params;
  const entry = manifest.find((item) => item.id === id);

  if (!entry) {
    return res.status(404).json({ error: "Fichier introuvable." });
  }

  const filePath = path.join(UPLOAD_DIR, entry.storedName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Fichier introuvable." });
  }

  res.download(filePath, entry.originalName);
});

app.listen(PORT, () => {
  console.log(`Mission Vault opérational sur http://localhost:${PORT}`);
});


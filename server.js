const express = require("express");
const path    = require("path");

const app  = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;

function safeResolve(urlPath) {
  const resolved = path.resolve(ROOT, urlPath.replace(/^[/\\]+/, ""));
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep) ? resolved : null;
}

app.use(express.static(ROOT, {
  dotfiles: "ignore",
  index: "index.html",
}));

app.get("*", (req, res) => {
  const filePath = safeResolve(req.path + ".html");
  if (!filePath) return res.status(403).send("Forbidden");
  res.sendFile(filePath, err => {
    if (err) res.status(404).send("404 Not Found: " + req.path);
  });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  PHS Schedule site → http://${HOST}:${PORT}\n`);
});

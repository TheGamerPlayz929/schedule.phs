const express = require("express");
const path    = require("path");
const fs      = require("fs");

const app  = express();
const PORT = 8080;
const ROOT = __dirname;

app.use(express.static(ROOT));

app.get("*", (req, res) => {
  const filePath = path.join(ROOT, req.path + ".html");
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (!err) return res.sendFile(filePath);
    res.status(404).send("404 Not Found: " + req.path);
  });
});

app.listen(PORT, () => {
  console.log(`\n  PHS Schedule site → http://localhost:${PORT}\n`);
});

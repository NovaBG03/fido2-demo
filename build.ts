await Bun.build({
  entrypoints: ["./src/main.tsx"],
  outdir: "./dist",
  minify: false,
  target: "browser",
  naming: "[name].[ext]",
});

// Copy index.html to dist with script reference
const html = `<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FIDO2 / WebAuthn Демо</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/main.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>`;

await Bun.write("./dist/index.html", html);
console.log("Build complete!");

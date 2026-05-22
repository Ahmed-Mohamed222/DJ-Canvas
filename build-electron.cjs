const { packager } = require("@electron/packager");

(async () => {
  const electronVersion = require("electron/package.json").version;
  const paths = await packager({
    dir: ".",
    name: "DJCanvas",
    appVersion: "1.0.0",
    electronVersion,
    platform: "win32",
    arch: "x64",
    out: "electron-release",
    overwrite: true,
    asar: true,
    ignore: [
      /^\/electron-release/,
      /^\/electron-app/,
      /^\/\.git/,
      /^\/\.lovable/,
      /^\/src/,
      /^\/bun\.lock/,
      /^\/vite\.config\.ts/,
      /^\/vite\.electron\.config\.ts/,
      /^\/tsconfig\.json/,
      /^\/eslint\.config\.js/,
      /^\/components\.json/,
      /^\/wrangler\.jsonc/,
      /^\/\.prettier/,
      /^\/build-electron\.cjs/,
    ],
    executableName: "DJCanvas",
  });
  console.log("Packaged to:", paths.join(", "));
})();

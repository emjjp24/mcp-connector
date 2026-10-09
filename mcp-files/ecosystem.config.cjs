// pm2 keeps both processes alive and restarts them after a crash.
// Run `npm run build` first, then:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "mcp-files",
      script: "dist/server.js",
      autorestart: true,
      max_restarts: 20,
    },
    {
      name: "mcp-tunnel",
      script: "C:\\Windows\\System32\\cmd.exe",
      args: "/d /s /c start-ngrok.cmd",
      interpreter: "none",
      autorestart: true,
    },
  ],
};
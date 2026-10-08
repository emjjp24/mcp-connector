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
      script: "ngrok",
      args: "http --url=YOUR-STATIC-DOMAIN.ngrok-free.app 8000",
      interpreter: "none",
      autorestart: true,
    },
  ],
};
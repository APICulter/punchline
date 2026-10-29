// PM2 configuration for Punchline (see README, "Deploying on a VPS").
//   pm2 start deploy/ecosystem.config.js     first start
//   pm2 reload punchline                      after an update (games in progress are saved and resumed)
//   pm2 logs punchline                        logs
//
// ONE instance in fork mode only: games live in the memory of the process. Do not use
// cluster mode or more instances (see README, "Can one process handle it?").
const path = require("path");

const root = path.join(__dirname, "..");

module.exports = {
	apps: [
		{
			name: "punchline",
			cwd: root,
			script: "app.js",
			exec_mode: "fork",
			instances: 1,

			// restart after a crash (the server exits with code 1 on a fatal error)
			autorestart: true,
			restart_delay: 1000,
			exp_backoff_restart_delay: 200,
			max_restarts: 50,
			min_uptime: "10s",
			// restart before the VPS runs out of memory (games are saved on the way out)
			max_memory_restart: "600M",

			// PM2 stops the app with SIGINT: the server saves the games and exits within ~5 s
			kill_timeout: 8000,
			// the server sends "ready" once MongoDB is connected, games restored and the port open
			wait_ready: true,
			listen_timeout: 20000,

			env: {
				NODE_ENV: "production",
				PORT: 3000,
				// only nginx (same machine) can reach the Node port
				HOST: "127.0.0.1",
				PUBLIC_URL: "https://punchline.example.com",
				// nginx on the same machine: trust its X-Forwarded-* headers only
				TRUST_PROXY: "loopback",
				// MONGODB_URI: "mongodb://127.0.0.1:27017/punchline", // overrides databaseUrl of config.properties
			},

			// logs (JSON lines from the server); rotate them with: pm2 install pm2-logrotate
			out_file: path.join(root, "logs", "punchline-out.log"),
			error_file: path.join(root, "logs", "punchline-error.log"),
			merge_logs: true,
			time: false,
		},
	],
};

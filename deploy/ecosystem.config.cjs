// =============================================================================
//  OLIMP-LIDER — PM2 ecosystem
//  Barcha yo'llar __dirname ga nisbatan -> server root da ishlaydi
//  (root yoki ubuntu, x86 yoki ARM, /root/olimp yoki /home/ubuntu/olimp)
//
//  Ishga tushirish:
//    pm2 start ecosystem.config.cjs --only olimp
//    pm2 save && pm2 startup
// =============================================================================
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'olimp',
      script: path.join(__dirname, 'server', 'index.js'),
      cwd: __dirname,
      instances: 1,            // 1 ta instance (Neon kesh va PM2 cluster moslashuvi)
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 3000,
      max_memory_restart: '600M',   // 1 GB RAM server uchun xavfsiz

      // 1 GB RAM server uchun Node heap limiti (OS + native xotira joy qoldiriladi)
      node_args: ['--max-old-space-size=600'],

      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },

      // Log fayllari
      out_file: path.join(__dirname, 'logs', 'out.log'),
      error_file: path.join(__dirname, 'logs', 'error.log'),
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      watch: false,
    },
  ],
};

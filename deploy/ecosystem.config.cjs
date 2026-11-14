// =============================================================================
//  OLIMP-LIDER вЂ” PM2 ecosystem
//  Oracle instance'da PM2 boshqaruvchi uchun.
//
//  Ishga tushirish:
//    pm2 start ecosystem.config.cjs --only olimp
//    pm2 save && pm2 startup
//
//  Muhit o'zgaruvchilari .env.local'dan o'qiladi (server/index.js uni o'zi
//  yuklaydi) вЂ” shuning uchun bu yerda qo'shimcha o'zgaruvchi kerak emas.
// =============================================================================
module.exports = {
  apps: [
    {
      name: 'olimp',
      script: 'server/index.js',
      cwd: '/home/ubuntu/olimp',
      instances: 1,            // 1 ta instance: SQLite/Neon kesh va PM2 cluster moslashuvi
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 3000,
      max_memory_restart: '600M',   // A1 (12 GB) bilan xavfsiz; E2.Micro (1 GB) da bu limit past

      // .env.local ni avtomatik yuklash
      // 1 GB RAM server uchun heap limiti (OS + native xotira joy qoldiriladi)
      node_args: ['--max-old-space-size=600'],

      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },

      // Log fayllari
      out_file: '/home/ubuntu/olimp/logs/out.log',
      error_file: '/home/ubuntu/olimp/logs/error.log',
      merge_logs: true,
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      watch: false,
    },
  ],
};


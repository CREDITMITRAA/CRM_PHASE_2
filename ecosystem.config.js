module.exports = {
  apps: [{
    name: 'crm-back',
    script: './app.js',
    instances: 1, // Single instance for t2.micro (1GB RAM)
    exec_mode: 'fork',
    
    // Memory management for t2.micro (1GB total RAM)
    max_memory_restart: '700M', // Restart if memory exceeds 700MB (leave room for OS and other processes)
    
    // Node.js memory settings
    node_args: '--max-old-space-size=512 --expose-gc', // 512MB heap, enable manual GC
    
    // Auto restart settings
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Environment variables
    env: {
      NODE_ENV: 'production'
    },
    
    // Advanced PM2 settings for memory-constrained environments
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};


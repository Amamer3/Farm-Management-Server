# Farm Management Server - Deployment Guide

This document provides comprehensive deployment instructions for the Farm Management Server.

## Prerequisites

- Node.js 18+ and npm 8+
- Redis server (for caching)
- Firebase project with Firestore enabled
- Environment variables configured

## Environment Setup

### 1. Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Application
NODE_ENV=production
PORT=3000

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# CORS Configuration
CORS_ORIGIN=https://your-frontend-domain.com

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Logging
LOG_LEVEL=info
```

### 2. Firebase Setup

1. Create a Firebase project
2. Enable Firestore Database
3. Enable Authentication
4. Create a service account and download the key
5. Configure Firestore security rules

### 3. Redis Setup

```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis connection
redis-cli ping
```

## Deployment Methods

### Method 1: Direct Deployment

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd farm-management-server
   npm install
   ```

2. **Build Application**
   ```bash
   npm run build
   ```

3. **Start Production Server**
   ```bash
   npm start
   ```

### Method 2: PM2 Process Manager

1. **Install PM2**
   ```bash
   npm install -g pm2
   ```

2. **Create PM2 Configuration**
   ```bash
   # Create ecosystem.config.js
   cat > ecosystem.config.js << EOF
   module.exports = {
     apps: [{
       name: 'farm-management-server',
       script: 'dist/app.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production',
         PORT: 3000
       },
       error_file: './logs/err.log',
       out_file: './logs/out.log',
       log_file: './logs/combined.log',
       time: true
     }]
   }
   EOF
   ```

3. **Start with PM2**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

### Method 3: Systemd Service

1. **Create Service File**
   ```bash
   sudo nano /etc/systemd/system/farm-management.service
   ```

2. **Service Configuration**
   ```ini
   [Unit]
   Description=Farm Management Server
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/path/to/farm-management-server
   ExecStart=/usr/bin/node dist/app.js
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production
   Environment=PORT=3000

   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and Start Service**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable farm-management
   sudo systemctl start farm-management
   ```

## Reverse Proxy Setup

### Nginx Configuration

1. **Install Nginx**
   ```bash
   sudo apt-get install nginx
   ```

2. **Create Site Configuration**
   ```bash
   sudo nano /etc/nginx/sites-available/farm-management
   ```

3. **Nginx Configuration**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. **Enable Site**
   ```bash
   sudo ln -s /etc/nginx/sites-available/farm-management /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

### SSL with Let's Encrypt

1. **Install Certbot**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx
   ```

2. **Obtain SSL Certificate**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

## Monitoring and Logging

### 1. Log Management

- Logs are stored in the `logs/` directory
- Use logrotate to manage log files:

```bash
sudo nano /etc/logrotate.d/farm-management
```

```bash
/path/to/farm-management-server/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload farm-management
    endscript
}
```

### 2. Health Monitoring

- Health check endpoint: `GET /health`
- Metrics endpoint: `GET /metrics`
- Set up monitoring with tools like:
  - Prometheus + Grafana
  - New Relic
  - DataDog

### 3. Backup Strategy

1. **Database Backup**
   ```bash
   # Firestore backup (if using Firebase)
   gcloud firestore export gs://your-backup-bucket/backup-$(date +%Y%m%d)
   ```

2. **Application Backup**
   ```bash
   # Backup application files
   tar -czf farm-management-backup-$(date +%Y%m%d).tar.gz /path/to/farm-management-server
   ```

## Performance Optimization

### 1. Redis Configuration

```bash
# Optimize Redis for production
sudo nano /etc/redis/redis.conf
```

Key settings:
- `maxmemory 2gb`
- `maxmemory-policy allkeys-lru`
- `save 900 1`
- `save 300 10`
- `save 60 10000`

### 2. Node.js Optimization

```bash
# Set Node.js production optimizations
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=2048"
```

### 3. Database Optimization

- Enable Firestore indexes for frequently queried fields
- Use pagination for large datasets
- Implement proper caching strategies

## Security Considerations

### 1. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### 2. Environment Security

- Never commit `.env` files
- Use strong, unique passwords
- Rotate secrets regularly
- Enable Firebase security rules

### 3. Application Security

- Enable rate limiting
- Use HTTPS in production
- Implement proper CORS policies
- Regular security audits

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   sudo lsof -i :3000
   sudo kill -9 <PID>
   ```

2. **Redis Connection Issues**
   ```bash
   redis-cli ping
   sudo systemctl status redis-server
   ```

3. **Firebase Authentication Issues**
   - Check service account key format
   - Verify project ID
   - Ensure Firestore is enabled

### Log Analysis

```bash
# View application logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log

# View system logs
journalctl -u farm-management -f
```

## Maintenance

### Regular Tasks

1. **Update Dependencies**
   ```bash
   npm audit
   npm update
   ```

2. **Monitor Performance**
   - Check `/metrics` endpoint
   - Monitor memory usage
   - Review error logs

3. **Backup Verification**
   - Test backup restoration
   - Verify data integrity

### Scaling Considerations

1. **Horizontal Scaling**
   - Use load balancer
   - Multiple application instances
   - Shared Redis instance

2. **Database Scaling**
   - Firestore auto-scales
   - Consider read replicas
   - Implement caching layers

## Support

For deployment issues:
1. Check logs first
2. Verify environment variables
3. Test individual components
4. Contact support team

---

**Note**: This deployment guide assumes a Linux environment. Adjust commands for your specific operating system.

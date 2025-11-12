# Farm Management API

A comprehensive RESTful API for poultry farm management, built with Node.js, TypeScript, Express, and Firebase.

## Features

- 🔐 **Authentication & Authorization** - JWT-based auth with role-based access control
- 🐔 **Bird Management** - Track bird inventory, health, and production
- 🥚 **Egg Collection** - Record and analyze daily egg collections
- 🌾 **Feed Management** - Monitor feed inventory and consumption
- 💊 **Medicine Tracking** - Manage medicine inventory and usage
- 📊 **Analytics & Reports** - Comprehensive statistics and reporting
- 👥 **User Management** - Multi-role user system (Worker, Manager, Admin)
- 🔒 **Security** - Rate limiting, CORS, helmet, and audit logging
- 📝 **Logging** - Structured logging with Winston
- 🔥 **Firebase Integration** - Firestore database and Firebase Auth

## Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Logging**: Winston
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Custom middleware
- **Documentation**: OpenAPI/Swagger ready

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Firestore enabled
- Firebase service account key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd farm-management-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Firebase configuration (see [Firebase Setup Guide](./firebase-setup.md))

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

6. **Verify installation**
   ```bash
   curl http://localhost:3000/health
   ```

## Project Structure

```
src/
├── config/           # Configuration files
│   └── config.ts     # Environment configuration
├── controllers/      # Route controllers
│   ├── authController.ts
│   ├── birdController.ts
│   ├── collectionController.ts
│   ├── feedController.ts
│   ├── medicineController.ts
│   ├── statsController.ts
│   └── userController.ts
├── middleware/       # Custom middleware
│   ├── auth.ts       # Authentication & authorization
│   ├── validation.ts # Request validation
│   ├── errorHandler.ts
│   ├── requestLogger.ts
│   └── rateLimiter.ts
├── models/           # TypeScript interfaces
│   └── types.ts      # Data models and types
├── routes/           # API routes
│   ├── auth.ts
│   ├── birds.ts
│   ├── collections.ts
│   ├── feed.ts
│   ├── medicine.ts
│   ├── stats.ts
│   └── users.ts
├── services/         # Business logic services
│   ├── firebaseService.ts
│   └── firestoreService.ts
├── utils/            # Utility functions
│   └── logger.ts     # Logging configuration
├── app.ts            # Express app setup
└── server.ts         # Server entry point
```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication

All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### User Roles

- **FARM_WORKER**: Basic access to record data
- **FARM_MANAGER**: Full farm management access
- **SUPER_ADMIN**: System administration access

### API Endpoints

#### Authentication (`/api/auth`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| POST | `/register` | Register new user | Public |
| POST | `/login` | User login | Public |
| GET | `/profile` | Get user profile | Protected |
| PUT | `/profile` | Update profile | Protected |
| POST | `/change-password` | Change password | Protected |
| POST | `/logout` | User logout | Protected |
| POST | `/forgot-password` | Reset password | Public |
| POST | `/verify-email` | Verify email | Protected |

#### Users (`/api/users`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get all users | Manager+ |
| GET | `/:id` | Get user by ID | Manager+ |
| POST | `/` | Create user | Manager+ |
| PUT | `/:id` | Update user | Manager+ |
| DELETE | `/:id` | Deactivate user | Admin |
| PATCH | `/:id/reactivate` | Reactivate user | Admin |

#### Birds (`/api/birds`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get all birds | All |
| GET | `/statistics` | Get bird statistics | All |
| GET | `/:id` | Get bird by ID | All |
| POST | `/` | Add new bird | Manager+ |
| PUT | `/:id` | Update bird | Manager+ |
| DELETE | `/:id` | Remove bird | Manager+ |
| PATCH | `/bulk-update` | Bulk update birds | Manager+ |
| PATCH | `/:id/health-status` | Update health status | Worker+ |

#### Collections (`/api/collections`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get egg collections | All |
| GET | `/daily-summary` | Get daily summary | All |
| GET | `/:id` | Get collection by ID | All |
| POST | `/` | Record collection | Worker+ |
| PUT | `/:id` | Update collection | Worker+ |
| DELETE | `/:id` | Delete collection | Manager+ |

#### Feed (`/api/feed`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get feed inventory | All |
| GET | `/low-stock` | Get low stock alerts | All |
| GET | `/:id` | Get feed by ID | All |
| POST | `/` | Add feed | Manager+ |
| PUT | `/:id` | Update feed | Manager+ |
| DELETE | `/:id` | Remove feed | Manager+ |
| POST | `/consumption` | Record consumption | Worker+ |

#### Medicine (`/api/medicine`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/` | Get medicine inventory | All |
| GET | `/expired` | Get expired alerts | All |
| GET | `/:id` | Get medicine by ID | All |
| POST | `/` | Add medicine | Manager+ |
| PUT | `/:id` | Update medicine | Manager+ |
| DELETE | `/:id` | Remove medicine | Manager+ |
| POST | `/usage` | Record usage | Worker+ |

#### Statistics (`/api/stats`)

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/dashboard` | Dashboard stats | All |
| GET | `/eggs/production` | Egg production stats | All |
| GET | `/eggs/trends` | Production trends | All |
| GET | `/financial/summary` | Financial summary | Manager+ |
| GET | `/performance/overview` | Performance metrics | Manager+ |
| POST | `/export/report` | Export reports | Manager+ |

### Request/Response Examples

#### Register User
```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "worker@farm.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe",
  "role": "FARM_WORKER"
}
```

#### Record Egg Collection
```bash
POST /api/collections
Authorization: Bearer <token>
Content-Type: application/json

{
  "date": "2024-01-15",
  "birdId": "bird-123",
  "quantity": 25,
  "quality": "GRADE_A",
  "notes": "Good quality eggs"
}
```

#### Get Dashboard Statistics
```bash
GET /api/stats/dashboard
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "totalBirds": 150,
    "todayEggs": 120,
    "weeklyProduction": 840,
    "feedStock": 500,
    "alerts": 2
  }
}
```

## Environment Variables

See `.env.example` for all available configuration options:

- **NODE_ENV**: Environment (development/production)
- **PORT**: Server port (default: 3000)
- **FIREBASE_***: Firebase configuration
- **JWT_SECRET**: JWT signing secret
- **CORS_ALLOWED_ORIGINS**: Allowed CORS origins

## Security Features

- **Authentication**: Firebase Auth integration
- **Authorization**: Role-based access control
- **Rate Limiting**: Configurable rate limits
- **CORS**: Cross-origin resource sharing
- **Helmet**: Security headers
- **Input Validation**: Request validation middleware
- **Audit Logging**: Comprehensive audit trails
- **Error Handling**: Secure error responses

## Development

### Available Scripts

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint

# Testing
npm test
```

### Code Style

- TypeScript with strict mode
- ESLint for code quality
- Prettier for formatting
- Conventional commits

### Adding New Features

1. Create TypeScript interfaces in `src/models/types.ts`
2. Implement controller in `src/controllers/`
3. Add routes in `src/routes/`
4. Add validation middleware if needed
5. Update API documentation

## Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production Firebase project
- [ ] Set secure JWT secret
- [ ] Configure CORS for production domains
- [ ] Set up proper logging
- [ ] Configure rate limiting
- [ ] Set up monitoring
- [ ] Configure backup strategy

### Docker Deployment

```dockerfile
# Dockerfile example
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring & Logging

- **Health Check**: `GET /health`
- **API Info**: `GET /api`
- **Logs**: Stored in `logs/` directory
- **Error Tracking**: Winston logger with file rotation
- **Performance**: Request timing and metrics

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Update documentation
6. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions:
- Create an issue on GitHub
- Check the [Firebase Setup Guide](./firebase-setup.md)
- Review the API documentation above

## Changelog

### v1.0.0
- Initial release
- Complete API implementation
- Firebase integration
- Authentication and authorization
- Comprehensive logging and monitoring
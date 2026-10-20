# Server Documentation

## Overview
Concise documentation for the backend server built with NestJS, Prisma, and MinIO.

## Tech Stack
- **Framework:** NestJS (TypeScript)
- **Database / ORM:** Prisma ORM
- **Object Storage:** MinIO
- **Authentication:** Auth0 / JWT & Allegro OAuth2

## Architecture & Modules
- `AppModule`: Application root module with `/health` check.
- `AllegroAuthModule`: Manages OAuth2 authorization, token exchange, refresh, and user profiles with Allegro.
- `BatchesModule`: Handles batch operations.
- `OrganizationsModule`: Manages organization resources.
- `MinioModule`: Handles file uploads and storage interactions with MinIO.
- `PrismaModule`: Provides Prisma database service.

## Implemented API Endpoints

### Health Check
- `GET /health`
  - **Auth:** None
  - **Description:** Returns service operational status.

### Allegro Authentication (`/auth/allegro`)
- `GET /auth/allegro/login`
  - **Auth:** None
  - **Description:** Redirects to Allegro OAuth2 authorization page.
- `GET /auth/allegro/callback`
  - **Query Params:** `code`, `state`
  - **Auth:** None
  - **Description:** Handles Allegro OAuth2 callback, exchanges authorization code for tokens, and fetches Allegro user details.
- `POST /auth/allegro/refresh`
  - **Body:** `{ "refresh_token": "string" }`
  - **Auth:** None
  - **Description:** Refreshes an expired Allegro OAuth token.

### Batches (`/batches`)
- `POST /batches`
  - **Auth:** `AllegroAuthGuard`
  - **Body:** `CreateBatchDto`
  - **Description:** Creates a new batch associated with the authenticated Allegro user.

### Organizations (`/organizations`)
- `POST /organizations`
  - **Auth:** `AllegroAuthGuard`
  - **Body:** `CreateOrganizationDto`
  - **Description:** Creates a new organization associated with the authenticated Allegro user.

## Project Structure
```text
src/
├── api/
│   ├── allegro-auth/     # Allegro OAuth2 authentication flow
│   ├── auth/             # Guards and Auth0/JWT strategies
│   ├── batches/          # Batches domain logic and endpoints
│   └── organizations/    # Organizations domain logic and endpoints
├── minio/                # MinIO object storage service integration
├── prisma/               # Prisma service and database definitions
├── app.controller.ts     # Health check controller
├── app.module.ts         # Root module
└── main.ts               # Application entry point
```
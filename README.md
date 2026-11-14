# Asian Car Club — Car Rental Platform

A full-stack car-rental booking MVP with a React customer storefront, customer accounts, an admin dashboard, MongoDB persistence, date-based availability checks, and Razorpay checkout integration.

## Stack
- Frontend: React 18 + Vite + React Router + Lucide
- Backend: Node.js + Express
- Database: MongoDB Atlas + Mongoose
- Authentication: JWT + bcrypt password hashing
- Payments: Razorpay Orders API + server-side signature verification
- Image uploads: multipart upload to the API's `server/uploads` folder (use persistent storage or replace with Cloudinary/S3 for production)

## Run locally
Requirements: Node.js 20+, npm, and a MongoDB Atlas database (or local MongoDB).

1. Create a MongoDB Atlas cluster and database user. Add your development IP to Network Access (for quick testing you can temporarily allow `0.0.0.0/0`; tighten this before production).
2. In `server`, copy `.env.example` to `.env`, then set `MONGODB_URI`, a long random `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` (12+ characters). `CLIENT_URL=http://localhost:5173`.
3. Import the starter cars and create the initial admin account:
   ```bash
   cd server
   npm install
   npm run seed
   ```
4. Start the API in one terminal:
   ```bash
   cd server
   npm run dev
   ```
5. In a second terminal:
   ```bash
   cd client
   cp .env.example .env
   npm install
   npm run dev
   ```
6. Open `http://localhost:5173`. Sign in to the admin panel at `/admin` using `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Environment variables
Server (`server/.env`):
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: long, unique secret; never commit it
- `CLIENT_URL`: deployed frontend origin (comma-separated origins supported by current CORS setup)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`: first admin account seeded by `npm run seed`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`: Razorpay test keys initially; use live keys only after account/KYC activation
- `PORT`: platform-provided port or 5000

Client (`client/.env`):
- `VITE_API_URL`: API base URL including `/api`, e.g. `https://your-api.onrender.com/api`

## Deploy today (manual deployment; account credentials required)
### 1. MongoDB Atlas
Create a production cluster, database user, and connection string. Use a strong password and restrict network access as much as your host permits.

### 2. Backend on Render (or another Node host)
- Create a Web Service from this repository, root directory `server`.
- Build command: `npm install`
- Start command: `npm start`
- Add all server environment variables above in the host dashboard.
- After first deploy, use the Render shell or a one-off job to run `npm run seed` once. Set `CLIENT_URL` to the deployed frontend URL.
- Configure persistent storage mounted at `/opt/render/project/src/uploads` (or use an external image CDN) because uploaded files stored on an ephemeral filesystem can disappear on redeploy. Do not assume free hosting includes persistent disks.

### 3. Frontend on Vercel / Netlify
- Import the same repository; set root directory to `client`.
- Build command: `npm run build`; output directory: `dist`.
- Add `VITE_API_URL=https://YOUR-BACKEND-HOST/api`.
- Redeploy after adding the environment variable.
- Update backend `CLIENT_URL` to the final frontend domain.

### 4. Payments
- Create a Razorpay account and configure website/business details and required KYC.
- Add Razorpay **Test Mode** key ID and secret to the backend environment; redeploy.
- Test a booking and payment using Razorpay's published test credentials/cards.
- For real customer payments, activate live mode and replace server secrets with live keys. Razorpay is not a free payment processor: test mode has no real charge, while live transactions generally incur gateway fees. Confirm current rates and settlement requirements with Razorpay.

## Included functionality
- 18 sample vehicles from the supplied car list and daily INR prices
- Customer registration/login and personal booking history
- Rental date range and number-of-days calculation (rounded up to full 24-hour rental days)
- Stock-aware overlapping date booking check
- Admin overview with total revenue, booking count, fleet count, paid bookings and six-month revenue graph
- Admin vehicle create/edit/delete, image upload, stock and daily rate management
- Admin manual availability block toggle
- Booking list with customer contact/address, dates, payment status and accept/reject/completed workflow
- Razorpay order creation and server-side payment signature verification
- Contact details: 8822696074, WhatsApp, Instagram

## Important launch checklist
This is a deployable starter/MVP, not a substitute for operational/legal setup. Before accepting real bookings:
- Set your real business address, rental terms, cancellation/refund policy, deposit/security rules, insurance and driver eligibility requirements.
- Confirm whether bookings require payment before admin acceptance; current workflow allows booking request first and payment from the customer booking page.
- Configure persistent image storage or a CDN.
- Add Razorpay webhook handling and reconcile payment status against provider events before relying on automated fulfilment. The current app verifies checkout signatures but does not yet process webhooks/refunds.
- Add rate limiting, email/SMS notifications, audit logs, backups, privacy policy and terms. Test concurrent booking attempts and all admin permissions.
- Set a unique high-entropy `JWT_SECRET`; do not expose Razorpay secret or MongoDB URI in the frontend.
- Review car image usage/licensing and replace broken example asset paths with photos you own.

## API overview
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/cars`, `GET /api/cars/:id`
- `POST /api/bookings`, `GET /api/bookings/mine`
- `POST /api/payments/order`, `POST /api/payments/verify`
- Admin: `GET /api/admin/summary`, `GET/POST /api/admin/cars`, `PUT/DELETE /api/admin/cars/:id`, `PATCH /api/admin/cars/:id/block`, `GET /api/admin/bookings`, `PATCH /api/admin/bookings/:id`

## Notes
- Sample prices are INR per day exactly as supplied. The two Scorpio N entries remain separate sample listings with different rates, as in the source data.
- `stock` means the number of identical units available for the selected date range. `manualBlocked` blocks the whole listing until the admin unblocks it.
- The initial admin account is created from server environment variables by the seed script. Never use the sample password in production.

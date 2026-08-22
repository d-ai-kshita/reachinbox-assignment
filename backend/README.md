# ReachInbox - Full-Stack Email Job Scheduler

A full-stack email scheduling application built as part of the ReachInbox Software Development Intern assignment.

The application allows users to authenticate with Google, upload email leads, schedule email campaigns, and monitor scheduled and sent emails through a dashboard.

## 🚀 Features

### Authentication
- Google OAuth 2.0 authentication
- Persistent login sessions
- User name, email and avatar displayed in the dashboard
- Logout support

### Email Scheduling
- Schedule emails for a specific date and time
- Upload CSV/TXT files containing email leads
- Automatically process recipient email addresses
- Configure delay between individual emails
- Configure hourly email sending limit
- View scheduled emails
- View sent emails

### Backend
- TypeScript
- Express.js
- BullMQ
- Redis
- PostgreSQL
- Prisma ORM
- Nodemailer
- Ethereal Email
- Configurable worker concurrency
- Persistent delayed jobs
- Idempotent email processing
- Database-backed email status tracking

### Frontend
- React
- TypeScript
- Modern CSS
- Responsive dashboard
- Scheduled and Sent email sections
- Compose email modal
- CSV/TXT lead upload
- Loading and empty states

---

# 🏗️ Architecture

```text
                    ┌─────────────────────┐
                    │     React Frontend  │
                    │   localhost:5173    │
                    └──────────┬──────────┘
                               │
                               │ HTTP API
                               ▼
                    ┌─────────────────────┐
                    │   Express Backend   │
                    │   localhost:5000    │
                    └───────┬───────┬─────┘
                            │       │
                 ┌──────────┘       └──────────┐
                 ▼                             ▼
        ┌────────────────┐            ┌────────────────┐
        │   PostgreSQL   │            │ Redis / BullMQ │
        │  Email States  │            │ Delayed Jobs   │
        └────────────────┘            └───────┬────────┘
                                              │
                                              ▼
                                      ┌────────────────┐
                                      │ BullMQ Worker  │
                                      │  Concurrency   │
                                      └───────┬────────┘
                                              │
                                              ▼
                                      ┌────────────────┐
                                      │ Ethereal SMTP │
                                      └────────────────┘
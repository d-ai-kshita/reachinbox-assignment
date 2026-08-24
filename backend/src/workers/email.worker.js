"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = require("../config/prisma");
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new ioredis_1.default(redisUrl, {
    maxRetriesPerRequest: null,
});
const rateLimitConnection = new ioredis_1.default(redisUrl, {
    maxRetriesPerRequest: null,
});
const concurrency = Number(process.env.WORKER_CONCURRENCY || 5);
const maxEmailsPerHour = Number(process.env.MAX_EMAILS_PER_HOUR || 200);
const minEmailDelayMs = Number(process.env.MIN_EMAIL_DELAY_MS || 2000);
const SEND_DELAY_KEY = "reachinbox:email-send-delay";
async function acquireSendSlot() {
    const result = await rateLimitConnection.set(SEND_DELAY_KEY, "1", "PX", minEmailDelayMs, "NX");
    if (result === "OK") {
        return 0;
    }
    const ttl = await rateLimitConnection.pttl(SEND_DELAY_KEY);
    return Math.max(ttl, 100);
}
const worker = new bullmq_1.Worker("email-queue", async (job, token) => {
    console.log(`Processing email job: ${job.id}`);
    const emailJob = await prisma_1.prisma.emailJob.findUnique({
        where: {
            id: job.data.emailJobId,
        },
    });
    if (!emailJob) {
        throw new Error("Email job not found");
    }
    // Idempotency protection.
    // If this email was already sent, never send it again.
    if (emailJob.status === "SENT") {
        console.log(`Email ${emailJob.id} already sent. Skipping.`);
        return {
            success: true,
            skipped: true,
        };
    }
    /*
     * Global minimum delay between email sends.
     *
     * Redis SET NX PX makes this safe even if multiple
     * worker instances are running.
     */
    const delay = await acquireSendSlot();
    if (delay > 0) {
        console.log(`Rate spacing active. Delaying job ${job.id} by ${delay}ms`);
        await job.moveToDelayed(Date.now() + delay, token);
        throw new bullmq_1.DelayedError();
    }
    await prisma_1.prisma.emailJob.update({
        where: {
            id: emailJob.id,
        },
        data: {
            status: "PROCESSING",
            attempts: {
                increment: 1,
            },
        },
    });
    try {
        const account = await nodemailer_1.default.createTestAccount();
        const transporter = nodemailer_1.default.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.user,
                pass: account.pass,
            },
        });
        const info = await transporter.sendMail({
            from: `"ReachInbox" <${account.user}>`,
            to: emailJob.recipientEmail,
            subject: emailJob.subject,
            text: emailJob.body,
        });
        const previewUrl = nodemailer_1.default.getTestMessageUrl(info);
        /*
         * Mark SENT only after SMTP successfully accepts
         * the email.
         */
        await prisma_1.prisma.emailJob.update({
            where: {
                id: emailJob.id,
            },
            data: {
                status: "SENT",
                sentAt: new Date(),
                errorMessage: previewUrl || null,
            },
        });
        console.log(`Email sent to ${emailJob.recipientEmail}`);
        console.log(`Ethereal preview: ${previewUrl}`);
        return {
            success: true,
            previewUrl,
        };
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : "Unknown email error";
        await prisma_1.prisma.emailJob.update({
            where: {
                id: emailJob.id,
            },
            data: {
                status: "FAILED",
                failedAt: new Date(),
                errorMessage: message,
            },
        });
        throw error;
    }
}, {
    connection,
    concurrency,
    /*
     * Redis-backed global BullMQ rate limiter.
     *
     * This applies across workers/instances, not just
     * inside this Node.js process.
     */
    limiter: {
        max: maxEmailsPerHour,
        duration: 60 * 60 * 1000,
    },
});
worker.on("completed", (job) => {
    console.log(`Email job completed: ${job.id}`);
});
worker.on("failed", (job, error) => {
    console.error(`Email job failed: ${job?.id}`, error.message);
});
console.log(`Email worker is running with concurrency=${concurrency}`);
console.log(`Hourly email limit=${maxEmailsPerHour}`);
console.log(`Minimum email delay=${minEmailDelayMs}ms`);
//# sourceMappingURL=email.worker.js.map
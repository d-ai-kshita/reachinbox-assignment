"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const prisma_1 = require("../config/prisma");
const connection = new ioredis_1.default(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});
const worker = new bullmq_1.Worker("email-queue", async (job) => {
    console.log(`Processing email job: ${job.id}`);
    const emailJob = await prisma_1.prisma.emailJob.findUnique({
        where: {
            id: job.data.emailJobId,
        },
    });
    if (!emailJob) {
        throw new Error("Email job not found");
    }
    if (emailJob.status === "SENT") {
        console.log(`Email ${emailJob.id} already sent. Skipping.`);
        return;
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
        const message = error instanceof Error ? error.message : "Unknown email error";
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
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
});
worker.on("completed", (job) => {
    console.log(`Email job completed: ${job.id}`);
});
worker.on("failed", (job, error) => {
    console.error(`Email job failed: ${job?.id}`, error.message);
});
console.log("Email worker is running");
//# sourceMappingURL=email.worker.js.map
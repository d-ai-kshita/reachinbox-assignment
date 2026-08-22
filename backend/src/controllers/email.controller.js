"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleEmails = void 0;
const prisma_1 = require("../config/prisma");
const email_queue_1 = require("../queue/email.queue");
const scheduleEmails = async (req, res) => {
    try {
        const { userId, senderId, subject, body, startTime, delayMs = 2000, hourlyLimit, recipients, } = req.body;
        if (!userId ||
            !senderId ||
            !subject ||
            !body ||
            !startTime ||
            !hourlyLimit ||
            !Array.isArray(recipients) ||
            recipients.length === 0) {
            return res.status(400).json({
                message: "Missing required fields",
            });
        }
        const sender = await prisma_1.prisma.sender.findFirst({
            where: {
                id: senderId,
                userId,
            },
        });
        if (!sender) {
            return res.status(404).json({
                message: "Sender not found",
            });
        }
        const startDate = new Date(startTime);
        if (isNaN(startDate.getTime())) {
            return res.status(400).json({
                message: "Invalid start time",
            });
        }
        const campaign = await prisma_1.prisma.campaign.create({
            data: {
                userId,
                senderId,
                subject,
                body,
                startTime: startDate,
                delayMs: Number(delayMs),
                hourlyLimit: Number(hourlyLimit),
            },
        });
        const jobs = [];
        for (let i = 0; i < recipients.length; i++) {
            const recipientEmail = String(recipients[i]).trim();
            if (!recipientEmail)
                continue;
            const scheduledAt = new Date(startDate.getTime() + i * Number(delayMs));
            const idempotencyKey = `${campaign.id}:${recipientEmail}:${i}`;
            const emailJob = await prisma_1.prisma.emailJob.create({
                data: {
                    campaignId: campaign.id,
                    senderId,
                    recipientEmail,
                    subject,
                    body,
                    scheduledAt,
                    idempotencyKey,
                },
            });
            const delay = Math.max(0, scheduledAt.getTime() - Date.now());
            const bullmqJob = await email_queue_1.emailQueue.add("send-email", {
                emailJobId: emailJob.id,
            }, {
                delay,
                jobId: emailJob.id,
            });
            await prisma_1.prisma.emailJob.update({
                where: {
                    id: emailJob.id,
                },
                data: {
                    bullmqJobId: bullmqJob.id ?? emailJob.id,
                },
            });
            jobs.push(emailJob);
        }
        return res.status(201).json({
            message: "Emails scheduled successfully",
            campaignId: campaign.id,
            totalScheduled: jobs.length,
        });
    }
    catch (error) {
        console.error("Schedule email error:", error);
        return res.status(500).json({
            message: "Failed to schedule emails",
        });
    }
};
exports.scheduleEmails = scheduleEmails;
//# sourceMappingURL=email.controller.js.map
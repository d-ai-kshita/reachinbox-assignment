import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { emailQueue } from "../queue/email.queue";

export const scheduleEmails = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      senderId,
      subject,
      body,
      startTime,
      delayMs = 2000,
      hourlyLimit,
      recipients,
    } = req.body;

    if (
      !userId ||
      !senderId ||
      !subject ||
      !body ||
      !startTime ||
      !hourlyLimit ||
      !Array.isArray(recipients) ||
      recipients.length === 0
    ) {
      return res.status(400).json({
        message: "Missing required fields",
      });
    }

    const sender = await prisma.sender.findFirst({
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

    const campaign = await prisma.campaign.create({
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

      if (!recipientEmail) continue;

      const scheduledAt = new Date(
        startDate.getTime() + i * Number(delayMs)
      );

      const idempotencyKey = `${campaign.id}:${recipientEmail}:${i}`;

      const emailJob = await prisma.emailJob.create({
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

      const bullmqJob = await emailQueue.add(
        "send-email",
        {
          emailJobId: emailJob.id,
        },
        {
          delay,
          jobId: emailJob.id,
        }
      );

      console.log("BULLMQ JOB ADDED:", bullmqJob.id);
      console.log("EMAIL JOB ID:", emailJob.id);
      console.log("SCHEDULED AT:", scheduledAt.toISOString());
      console.log("DELAY:", delay);

      await prisma.emailJob.update({
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
  } catch (error) {
    console.error("Schedule email error:", error);

    return res.status(500).json({
      message: "Failed to schedule emails",
    });
  }
};

export const getScheduledEmails = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        message: "userId is required",
      });
    }

    const emails = await prisma.emailJob.findMany({
      where: {
        campaign: {
          userId,
        },
        status: "SCHEDULED",
      },
      orderBy: {
        scheduledAt: "asc",
      },
    });

    return res.status(200).json(emails);
  } catch (error) {
    console.error("Get scheduled emails error:", error);

    return res.status(500).json({
      message: "Failed to fetch scheduled emails",
    });
  }
};

export const getSentEmails = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        message: "userId is required",
      });
    }

    const emails = await prisma.emailJob.findMany({
      where: {
        campaign: {
          userId,
        },
        status: "SENT",
      },
      orderBy: {
        sentAt: "desc",
      },
    });

    return res.status(200).json(emails);
  } catch (error) {
    console.error("Get sent emails error:", error);

    return res.status(500).json({
      message: "Failed to fetch sent emails",
    });
  }
};
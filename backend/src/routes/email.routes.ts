import { Router } from "express";
import {
  scheduleEmails,
  getScheduledEmails,
  getSentEmails,
} from "../controllers/email.controller";

const router = Router();

router.post("/schedule", scheduleEmails);

router.get("/scheduled", getScheduledEmails);

router.get("/sent", getSentEmails);

export default router;
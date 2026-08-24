"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("../config/passport"));
const router = (0, express_1.Router)();
router.get("/google", passport_1.default.authenticate("google", {
    scope: ["profile", "email"],
}));
router.get("/google/callback", passport_1.default.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/login`,
}), (_req, res) => {
    res.redirect(process.env.FRONTEND_URL);
});
router.get("/me", (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            authenticated: false,
        });
    }
    return res.json({
        authenticated: true,
        user: req.user,
    });
});
router.post("/logout", (req, res) => {
    req.logout((error) => {
        if (error) {
            return res.status(500).json({
                message: "Logout failed",
            });
        }
        req.session.destroy(() => {
            res.clearCookie("connect.sid");
            return res.json({
                message: "Logged out successfully",
            });
        });
    });
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map
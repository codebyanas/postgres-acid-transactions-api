import { Router } from "express";
import { signupUser, getUsers } from "../controllers/user.controller";

const router = Router();

router.post("/signup", signupUser);
router.get("/", getUsers);

export default router;
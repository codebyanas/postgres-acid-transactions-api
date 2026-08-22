import { Request, Response } from "express";
import { prisma } from "../config/db";

// 1. Signup Route: Creates User + Auto-creates Wallet atomically
export const signupUser = async (req: Request, res: Response): Promise<void> => {
  const { name, email } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          wallet: {
            create: {
              balance: 1000.0, // Initial sign-up bonus
            },
          },
        },
        include: { wallet: true },
      });
      return newUser;
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully with automatic wallet creation.",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// 2. Get All Users Route
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      include: { wallet: true },
    });
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
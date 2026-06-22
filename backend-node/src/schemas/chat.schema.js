import { z } from 'zod';

export const chatRequestSchema = z.object({
  body: z.object({
    message: z.string({
      required_error: "Message is required",
      invalid_type_error: "Message must be a string",
    }).trim().min(1, "A non-empty 'message' string is required."),
    pageContext: z.string().optional(),
    sessionId: z.string().optional(),
    stream: z.boolean().optional().default(false),
  }),
});

export const loginRequestSchema = z.object({
  body: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  })
});

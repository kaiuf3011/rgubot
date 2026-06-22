import { z } from 'zod';

const schema = z.object({
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

try {
  schema.parse({ body: { message: "" } });
  console.log("Success");
} catch (error) {
  console.log(error.constructor.name);
  console.log("errors:", error.errors);
  console.log("issues:", error.issues);
}

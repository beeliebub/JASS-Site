import { z } from "zod";

export const serverTargetSchema = z.object({
  host: z.string().trim().min(1).max(300),
  port: z.number().int().min(1).max(65535),
});

export const serverStatusRequestSchema = z.object({
  servers: z.array(serverTargetSchema).max(5),
});

export type ServerTarget = z.infer<typeof serverTargetSchema>;

import { z } from "zod";

export const resourcePackUpdateSchema = z.object({
  active: z.boolean(),
});

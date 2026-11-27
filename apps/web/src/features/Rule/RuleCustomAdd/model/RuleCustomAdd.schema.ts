import { z } from 'zod';

export const CustomRuleSchema = z.object({
  address: z.string(),
  device: z.string(),
  outbound: z.string().min(1),
});
export type CustomRuleForm = z.infer<typeof CustomRuleSchema>;

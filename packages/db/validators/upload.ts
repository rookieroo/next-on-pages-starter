// packages/shared-types/src/validators.ts
import { z } from 'zod';

const fileSchema = z.instanceof(File).refine((file) => file.size <= 10 * 1024 * 1024, {
    message: "File size must be less than 10MB",
  });

// User schema
export const UploadFileSchema = z.object({
  key: z.string(),
  file: fileSchema,
});

export type Upload = z.infer<typeof UploadFileSchema>;
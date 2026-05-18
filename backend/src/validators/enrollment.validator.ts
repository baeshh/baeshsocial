import { z } from 'zod'

export const updateEnrollmentStatusSchema = z.object({
  status: z.enum(['enrolled', 'completed', 'rejected', 'withdrawn']),
})

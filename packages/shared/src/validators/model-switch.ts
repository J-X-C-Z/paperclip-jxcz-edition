import { z } from "zod";

/** One assignment inside a model-switch profile: the harness, the model id, and
 * optional extra adapter config carried with the switch (for example the MiMo
 * Code executable path). */
export const modelSwitchAssignmentSchema = z
  .object({
    adapterType: z.string().trim().min(1),
    model: z.string().trim().min(1),
    adapterConfig: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ModelSwitchAssignment = z.infer<typeof modelSwitchAssignmentSchema>;

/** A named "配置文件": `default` covers every title without an override. */
export const modelSwitchProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    default: modelSwitchAssignmentSchema,
    titles: z.record(z.string(), modelSwitchAssignmentSchema).default({}),
  })
  .strict();

export type ModelSwitchProfile = z.infer<typeof modelSwitchProfileSchema>;

/** Stored rows keep the profile without its name (the name is its own column). */
export const modelSwitchProfileDataSchema = modelSwitchProfileSchema.omit({ name: true });

export type ModelSwitchProfileData = z.infer<typeof modelSwitchProfileDataSchema>;

export const saveModelSwitchProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    profile: modelSwitchProfileDataSchema,
  })
  .strict();

export type SaveModelSwitchProfile = z.infer<typeof saveModelSwitchProfileSchema>;

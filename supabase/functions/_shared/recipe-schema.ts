// Shared by Edge Functions and (from M5) the client. Imports only 'zod'.
import { z } from 'zod'
import { AISLES } from './aisles.ts'

export const CANONICAL_UNITS = [
  'g', 'kg', 'ml', 'dl', 'l', 'ts', 'ss', 'krm', 'stk', 'fedd',
  'pk', 'boks', 'bunt', 'neve', 'klype', 'skive', 'kvist',
] as const

export const CanonicalUnit = z.enum(CANONICAL_UNITS)

export const IngredientSchema = z.object({
  original_text: z.string(),
  amount: z.number().nullable(),
  amount_max: z.number().nullable(),
  unit: CanonicalUnit.nullable(),
  original_amount: z.number().nullable(),
  original_unit: z.string().nullable(),
  name: z.string(),
  note: z.string().nullable(),
  scalable: z.boolean(),
  food_match: z.string().nullable(),
  /** Store section, for the shopping list. Null when unsure. */
  aisle: z.enum(AISLES).nullable(),
})

export const OVEN_MODES = [
  'over_under', 'varmluft', 'overvarme', 'undervarme', 'grill', 'varmluft_grill',
] as const
export const OVEN_RACKS = ['nederst', 'midten', 'overst'] as const

/** One oven setting. A recipe lists them in the order they are used. */
export const OvenStepSchema = z.object({
  temp_c: z.number().nullable(),
  mode: z.enum(OVEN_MODES).nullable(),
  minutes: z.number().nullable(),
  minutes_max: z.number().nullable(),
  rack: z.enum(OVEN_RACKS).nullable(),
  note: z.string().nullable(),
})
export type OvenStep = z.infer<typeof OvenStepSchema>

export const RecipeSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  servings: z.number().nullable(),
  servings_unit: z.string().nullable(),
  prep_minutes: z.number().nullable(),
  total_minutes: z.number().nullable(),
  original_language: z.string(),
  ingredient_groups: z.array(
    z.object({
      name: z.string().nullable(),
      ingredients: z.array(IngredientSchema),
    }),
  ),
  steps: z.array(z.object({ group_name: z.string().nullable(), text: z.string() })),
  oven: z.array(OvenStepSchema),
  tips: z.array(z.string()),
  tags: z.array(z.string()),
  corrections: z.array(
    z.object({ field: z.string(), before: z.string(), after: z.string(), reason: z.string() }),
  ),
  warnings: z.array(z.string()),
})

export type Recipe = z.infer<typeof RecipeSchema>

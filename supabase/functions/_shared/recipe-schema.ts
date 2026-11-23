// Shared by Edge Functions and (from M5) the client. Imports only 'zod'.
import { z } from 'zod'

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
})

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
  tips: z.array(z.string()),
  tags: z.array(z.string()),
  corrections: z.array(
    z.object({ field: z.string(), before: z.string(), after: z.string(), reason: z.string() }),
  ),
  warnings: z.array(z.string()),
})

export type Recipe = z.infer<typeof RecipeSchema>

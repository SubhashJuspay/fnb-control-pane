import { z } from 'zod';

export const tableShapeSchema = z.enum(['RECT', 'CIRCLE']);
export type TableShape = z.infer<typeof tableShapeSchema>;

export const tableManualStateSchema = z.enum(['NONE', 'CLEANING']);
export type TableManualState = z.infer<typeof tableManualStateSchema>;

export const tableStateSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING']);
export type TableState = z.infer<typeof tableStateSchema>;

export const createSectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().min(0).default(0),
});
export type CreateSectionInput = z.infer<typeof createSectionSchema>;

export const updateSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

export const archiveSectionSchema = z.object({ id: z.string().uuid() });
export type ArchiveSectionInput = z.infer<typeof archiveSectionSchema>;

export const reorderSectionsSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;

export const createTableSchema = z.object({
  label: z.string().trim().min(1).max(40),
  capacity: z.number().int().min(1).max(99).default(2),
  shape: tableShapeSchema.default('RECT'),
  positionX: z.number().int().min(0).max(10_000),
  positionY: z.number().int().min(0).max(10_000),
  width: z.number().int().min(20).max(500).default(80),
  height: z.number().int().min(20).max(500).default(80),
  rotation: z.number().int().min(0).max(359).default(0),
  sectionId: z.string().uuid().optional().nullable(),
});
export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = createTableSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export const archiveTableSchema = z.object({ id: z.string().uuid() });
export type ArchiveTableInput = z.infer<typeof archiveTableSchema>;

export const assignTableServerSchema = z.object({
  tableId: z.string().uuid(),
  assignedServerId: z.string().uuid().nullable(),
});
export type AssignTableServerInput = z.infer<typeof assignTableServerSchema>;

export const setTableManualStateSchema = z.object({
  tableId: z.string().uuid(),
  manualState: tableManualStateSchema,
});
export type SetTableManualStateInput = z.infer<typeof setTableManualStateSchema>;

export const openTicketAtTableSchema = z.object({
  tableId: z.string().uuid(),
  customerLabel: z.string().trim().max(120).optional().nullable(),
  partySize: z.number().int().min(1).max(99).optional(),
});
export type OpenTicketAtTableInput = z.infer<typeof openTicketAtTableSchema>;

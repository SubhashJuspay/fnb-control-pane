import { builder } from '../../builder.js';
import { TableManualStateEnum, TableShapeEnum } from '../../enums.js';

// ─── Section ───────────────────────────────────────────────────
export const CreateSectionInput = builder.inputType('CreateSectionInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    sortOrder: t.int({ required: false }),
  }),
});

export const UpdateSectionInput = builder.inputType('UpdateSectionInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    name: t.string({ required: false }),
    sortOrder: t.int({ required: false }),
  }),
});

export const ArchiveSectionInput = builder.inputType('ArchiveSectionInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const ReorderSectionsInput = builder.inputType('ReorderSectionsInput', {
  fields: (t) => ({
    orderedIds: t.field({ type: ['UUID'], required: true }),
  }),
});

// ─── Table ─────────────────────────────────────────────────────
export const CreateTableInput = builder.inputType('CreateTableInput', {
  fields: (t) => ({
    label: t.string({ required: true }),
    capacity: t.int({ required: false }),
    shape: t.field({ type: TableShapeEnum, required: false }),
    positionX: t.int({ required: true }),
    positionY: t.int({ required: true }),
    width: t.int({ required: false }),
    height: t.int({ required: false }),
    rotation: t.int({ required: false }),
    sectionId: t.field({ type: 'UUID', required: false }),
  }),
});

export const UpdateTableInput = builder.inputType('UpdateTableInput', {
  fields: (t) => ({
    id: t.field({ type: 'UUID', required: true }),
    label: t.string({ required: false }),
    capacity: t.int({ required: false }),
    shape: t.field({ type: TableShapeEnum, required: false }),
    positionX: t.int({ required: false }),
    positionY: t.int({ required: false }),
    width: t.int({ required: false }),
    height: t.int({ required: false }),
    rotation: t.int({ required: false }),
    sectionId: t.field({ type: 'UUID', required: false }),
  }),
});

export const ArchiveTableInput = builder.inputType('ArchiveTableInput', {
  fields: (t) => ({ id: t.field({ type: 'UUID', required: true }) }),
});

export const AssignTableServerInput = builder.inputType('AssignTableServerInput', {
  fields: (t) => ({
    tableId: t.field({ type: 'UUID', required: true }),
    assignedServerId: t.field({ type: 'UUID', required: false }),
  }),
});

export const SetTableManualStateInput = builder.inputType('SetTableManualStateInput', {
  fields: (t) => ({
    tableId: t.field({ type: 'UUID', required: true }),
    manualState: t.field({ type: TableManualStateEnum, required: true }),
  }),
});

export const OpenTicketAtTableInput = builder.inputType('OpenTicketAtTableInput', {
  fields: (t) => ({
    tableId: t.field({ type: 'UUID', required: true }),
    customerLabel: t.string({ required: false }),
    partySize: t.int({ required: false }),
  }),
});

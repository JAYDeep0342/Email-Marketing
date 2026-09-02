import { api, apiCall } from '@/lib/api';
import type { PaginatedEnvelope } from '@/types/api';

/**
 * Automations API — hand-mirrored against server/src/modules/automations.
 *
 * Step config shapes (per stepType), confirmed from
 * steps/step-executor.service.ts and sending/email.processor.ts
 * (loadAutomationSource) — NOT just the DTO, which only validates presence
 * of a generic object:
 *   send_email : { templateId, subject, preheader?, signatureId?, fromName?, fromEmail? }
 *   wait       : { minutes?, hours?, days? }
 *   add_tag / remove_tag : { tagId }
 *   add_to_list: { listId }
 *   condition  : { kind: 'has_tag', tagId, onFalse: 'exit' | 'continue' }
 *   exit       : {}
 */

export const TRIGGER_TYPES = [
  'contact_created',
  'contact_added_to_list',
  'email_opened',
  'email_clicked',
  'form_submitted',
  'manual',
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const STEP_TYPES = [
  'send_email',
  'wait',
  'add_tag',
  'remove_tag',
  'add_to_list',
  'condition',
  'exit',
] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const AUTOMATION_STATUSES = ['draft', 'active', 'paused'] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

export interface AutomationStep {
  id?: string;
  stepOrder: number;
  stepType: StepType;
  config: Record<string, any>;
}

export interface Automation {
  id: string;
  name: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  status: AutomationStatus;
  steps: AutomationStep[];
  createdAt: string;
  updatedAt: string;
}

export interface PageParams {
  page: number;
  limit: number;
}

export function fetchAutomations(params: PageParams) {
  return api.get<PaginatedEnvelope<Automation>>('/automations', { params });
}

export function fetchAutomation(id: string) {
  return apiCall<Automation>(() => api.get(`/automations/${id}`));
}

export interface AutomationPayload {
  name: string;
  triggerType: TriggerType;
  triggerConfig?: Record<string, any>;
}

export function createAutomation(payload: AutomationPayload) {
  return apiCall<Automation>(() => api.post('/automations', payload));
}

export function updateAutomation(
  id: string,
  payload: Partial<Pick<AutomationPayload, 'name' | 'triggerConfig'>>,
) {
  return apiCall<Automation>(() => api.patch(`/automations/${id}`, payload));
}

export function deleteAutomation(id: string) {
  return apiCall<{ message: string }>(() => api.delete(`/automations/${id}`));
}

export function setAutomationSteps(id: string, steps: AutomationStep[]) {
  return apiCall<Automation>(() =>
    api.put(`/automations/${id}/steps`, {
      steps: steps.map(({ stepOrder, stepType, config }) => ({ stepOrder, stepType, config })),
    }),
  );
}

export function activateAutomation(id: string) {
  return apiCall<Automation>(() => api.post(`/automations/${id}/activate`));
}

export function pauseAutomation(id: string) {
  return apiCall<Automation>(() => api.post(`/automations/${id}/pause`));
}

export function enrollContact(id: string, contactId: string) {
  return apiCall<{ message: string; runId?: string }>(() =>
    api.post(`/automations/${id}/enroll`, { contactId }),
  );
}

export interface AutomationRun {
  id: string;
  status: string;
  contactId: string;
  currentStepId: string | null;
  nextRunAt: string | null;
  startedAt: string;
  completedAt: string | null;
}

export function fetchRuns(id: string, params: PageParams) {
  return api.get<PaginatedEnvelope<AutomationRun>>(`/automations/${id}/runs`, { params });
}

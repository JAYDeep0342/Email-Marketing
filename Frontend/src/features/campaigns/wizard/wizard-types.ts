/**
 * Shared wizard state, lifted to the page and passed down to each step.
 *
 * Selections carry the display fields the Confirm step needs (name, count,
 * verified flag, html) alongside the id — so Confirm never has to re-fetch
 * lists/segments/signatures/templates just to render a summary.
 */

export interface TargetSelection {
  type: 'list' | 'segment';
  id: string;
  name: string;
  count: number;
}

export interface SignatureSelection {
  id: string;
  name: string;
  isVerified: boolean;
}

export interface SetupValues {
  name: string;
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  signature: SignatureSelection | null;
}

export interface TemplateSelection {
  id: string;
  name: string;
  html: string | null;
}

/**
 * Step 3's full draft: either an existing template is picked, or custom HTML
 * is being composed (and only turned into a real Template row when the user
 * advances past this step). Lifted to the wizard page — same "parent owns
 * state, steps are controlled" pattern as every other step — so the page's
 * Next handler can create the template from `customName`/`customHtml`.
 */
export interface TemplateDraft {
  mode: 'existing' | 'custom';
  existing: TemplateSelection | null;
  customName: string;
  customHtml: string;
}

export const EMPTY_TEMPLATE_DRAFT: TemplateDraft = {
  mode: 'existing',
  existing: null,
  customName: '',
  customHtml: '',
};

export type ScheduleChoice = { mode: 'now' } | { mode: 'later'; when: string };

export const EMPTY_SETUP: SetupValues = {
  name: '',
  subject: '',
  preheader: '',
  fromName: '',
  fromEmail: '',
  signature: null,
};

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { isValidEmail, normalizeEmail } from '../../common/utils/email.util';
import { SubmitFormDto } from './dto/forms.dto';
import {
  AUTOMATION_TRIGGER_EVENT,
  TRIGGER_CONTACT_CREATED,
  TRIGGER_FORM_SUBMITTED,
} from './forms.constants';

/**
 * Public unauthenticated form submission.
 *
 * Same shape as UnsubscribeService.consume():
 *   1. There is NO tenant on the request. Look up the form's owning tenant
 *      via form_public_lookup(uuid), a SECURITY DEFINER function that sees
 *      across RLS. That gives us the tenantId (and listId) to work under.
 *   2. Everything else runs inside withTenant(tenantId) so RLS enforces
 *      isolation for the contact upsert, list join, submission insert, and
 *      any downstream reads.
 *
 * Duplicate-submission policy (per the design agreed for v1):
 *   - Contacts upserted by email. New / soft-deleted-revived contact -> emit
 *     `contact_created` exactly once. Existing subscribed contact -> update
 *     name/attributes only, no re-emit.
 *   - `form_submitted` is emitted on EVERY successful submit — analytics and
 *     "re-submit triggers followup" both depend on that.
 */

interface FormLookupRow {
  id: string;
  tenant_id: string;
  list_id: string | null;
  is_active: boolean;
  fields: any;
  settings: any;
}

@Injectable()
export class FormsSubmissionsService {
  private readonly logger = new Logger(FormsSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async submit(formId: string, dto: SubmitFormDto, ipAddress: string | null) {
    // --- 1. Cross-RLS form lookup ---
    // Parametrised query, and formId is already validated as a UUID at the
    // controller boundary by class-validator on the param, so no injection risk.
    const rows = await this.prisma.$queryRaw<FormLookupRow[]>`
      SELECT id, tenant_id, list_id, is_active, fields, settings
      FROM form_public_lookup(${formId}::uuid)
    `;
    const form = rows[0];
    if (!form) throw new NotFoundException('Form not found');
    if (!form.is_active) {
      // Deliberately a 400 not a 404: the form exists, it's just disabled.
      // Distinguishing helps embedded widgets show a "form closed" message
      // instead of a generic "not found".
      throw new BadRequestException('This form is no longer accepting submissions');
    }

    const email = normalizeEmail(dto.email);
    if (!isValidEmail(email)) {
      throw new BadRequestException('Invalid email');
    }

    // --- 2. Tenant-scoped writes ---
    const result = await this.prisma.withTenant(form.tenant_id, async (tx) => {
      // Suppression → contact.status mapping. Same mapping ContactsService uses;
      // duplicated here (small, stable) rather than importing to keep Forms
      // independent of the Contacts service surface.
      const suppression = await tx.suppression.findFirst({
        where: { email },
        select: { reason: true },
      });
      const suppressedStatus = suppression
        ? suppression.reason === 'complaint'
          ? 'complained'
          : suppression.reason === 'hard_bounce'
            ? 'bounced'
            : 'unsubscribed'
        : null;

      // Look up existing contact by email — including soft-deleted, so we
      // "revive" instead of hitting the partial-unique conflict on recreate.
      const existing = await tx.contact.findFirst({
        where: { email },
        select: {
          id: true,
          status: true,
          deletedAt: true,
          attributes: true,
          firstName: true,
          lastName: true,
        },
      });

      // Merge incoming custom `data` into contact.attributes. Existing keys
      // are overwritten by fresh values from the submission — a common
      // "latest submission wins" convention.
      const mergedAttributes = existing
        ? { ...((existing.attributes as object) ?? {}), ...(dto.data ?? {}) }
        : (dto.data ?? {});

      let contactId: string;
      let contactCreatedOrRevived = false;

      if (!existing) {
        // Brand new contact.
        const created = await tx.contact.create({
          data: {
            tenantId: form.tenant_id,
            email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            attributes: mergedAttributes as any,
            // If suppressed, use the mapped status; otherwise subscribed
            // (single opt-in — DOI is a future addition).
            status: suppressedStatus ?? 'subscribed',
          },
          select: { id: true },
        });
        contactId = created.id;
        contactCreatedOrRevived = true;
      } else if (existing.deletedAt) {
        // Soft-deleted revive. Reset deletedAt, take fresh values, respect
        // suppression if present. Treated as a "new" contact for automation
        // purposes — this is the same behaviour Mailchimp/HubSpot show.
        await tx.contact.updateMany({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            firstName: dto.firstName ?? existing.firstName,
            lastName: dto.lastName ?? existing.lastName,
            attributes: mergedAttributes as any,
            status: suppressedStatus ?? 'subscribed',
          },
        });
        contactId = existing.id;
        contactCreatedOrRevived = true;
      } else {
        // Existing live contact. Update name/attributes only — do NOT flip
        // the status back to 'subscribed' if they've unsubscribed/complained,
        // and do NOT re-emit contact_created. Suppression, once earned, stays.
        await tx.contact.updateMany({
          where: { id: existing.id },
          data: {
            firstName: dto.firstName ?? existing.firstName,
            lastName: dto.lastName ?? existing.lastName,
            attributes: mergedAttributes as any,
          },
        });
        contactId = existing.id;
      }

      // Auto-add to the form's linked list, if any. `skipDuplicates` makes
      // repeat submissions idempotent from the list's POV.
      if (form.list_id) {
        await tx.listContact.createMany({
          data: [{ listId: form.list_id, contactId }],
          skipDuplicates: true,
        });
      }

      // Always log the submission row. Analytics + re-submit visibility both
      // rely on this being 1-per-submit.
      const submission = await tx.formSubmission.create({
        data: {
          tenantId: form.tenant_id,
          formId: form.id,
          contactId,
          data: (dto.data ?? {}) as any,
          ipAddress: ipAddress ?? undefined,
        },
        select: { id: true },
      });

      return {
        submissionId: submission.id,
        contactId,
        contactCreatedOrRevived,
      };
    });

    // --- 3. Fire triggers (outside the tx, non-blocking) ---
    // .emit() is synchronous+fire-and-forget in EventEmitter2. AutomationTriggerListener
    // (Step 15) already wraps its handler in try/catch, so a bad listener can't
    // 500 this response.
    if (result.contactCreatedOrRevived) {
      this.events.emit(AUTOMATION_TRIGGER_EVENT, {
        tenantId: form.tenant_id,
        triggerType: TRIGGER_CONTACT_CREATED,
        contactId: result.contactId,
      });
    }
    this.events.emit(AUTOMATION_TRIGGER_EVENT, {
      tenantId: form.tenant_id,
      triggerType: TRIGGER_FORM_SUBMITTED,
      contactId: result.contactId,
      // Extra context so a form_submitted automation can filter by formId.
      // The Step 15 listener passes the whole payload to matchers.
      formId: form.id,
      submissionId: result.submissionId,
    });

    return {
      message: 'Submission received',
      submissionId: result.submissionId,
    };
  }
}
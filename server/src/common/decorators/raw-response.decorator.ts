import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'raw_response';

/**
 * Skip the standard { success, data } wrapper for this route.
 * Use for third-party integrations that expect an exact raw body
 * (e.g. Stripe/webhook acknowledgements).
 */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);

import {
  EmailRequest,
  RenderedEmail,
} from '../../../../core/entities/email.js';

export const EMAIL_RENDERER = Symbol('EMAIL_RENDERER');

export interface EmailRendererPort {
  render(request: EmailRequest): Promise<RenderedEmail>;
}

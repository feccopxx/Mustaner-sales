export interface OutboundAction {
  confirmsMeeting?: boolean;
  meetingReservationId?: string;
  confirmsEnrollment?: boolean;
  enrollmentConfirmationId?: string;
  confirmsPayment?: boolean;
  paymentConfirmationId?: string;
}

export type OutboundValidation = { valid: true } | { valid: false; reason: 'MISSING_MEETING_RESERVATION' | 'MISSING_ENROLLMENT_CONFIRMATION' | 'MISSING_PAYMENT_CONFIRMATION' };

export function validateOutboundAction(action: OutboundAction): OutboundValidation {
  if (action.confirmsMeeting && !action.meetingReservationId) return { valid: false, reason: 'MISSING_MEETING_RESERVATION' };
  if (action.confirmsEnrollment && !action.enrollmentConfirmationId) return { valid: false, reason: 'MISSING_ENROLLMENT_CONFIRMATION' };
  if (action.confirmsPayment && !action.paymentConfirmationId) return { valid: false, reason: 'MISSING_PAYMENT_CONFIRMATION' };
  return { valid: true };
}

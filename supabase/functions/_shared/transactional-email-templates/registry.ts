/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as dunningPaymentFailed } from './dunning-payment-failed.tsx'
import { template as checkoutRecovery } from './checkout-recovery.tsx'
import { template as checkoutRecovery1 } from './checkout-recovery-1.tsx'
import { template as checkoutRecovery2 } from './checkout-recovery-2.tsx'
import { template as checkoutRecovery3 } from './checkout-recovery-3.tsx'
import { template as welcome } from './welcome.tsx'
import { template as planLimitReached } from './plan-limit-reached.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'dunning-payment-failed': dunningPaymentFailed,
  'checkout-recovery': checkoutRecovery,
  'checkout-recovery-1': checkoutRecovery1,
  'checkout-recovery-2': checkoutRecovery2,
  'checkout-recovery-3': checkoutRecovery3,
  'welcome': welcome,
  'plan-limit-reached': planLimitReached,
}

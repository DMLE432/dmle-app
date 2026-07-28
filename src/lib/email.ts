import 'server-only';

import { formatStatusLabel } from '@/lib/status';
import { createServiceRoleClient } from '@/lib/supabase/admin';

export const LOGISTICS_ONLY_WARNING =
  'Use logistics-only details. Do not enter or request patient names, DOB, MRN, diagnosis, test results, insurance information, or specimen identifiers.';

type EmailRecipient = string | null | undefined;

type ShipmentEmailDetails = {
  id?: string;
  title: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupAt: string;
  requiredBy: string;
  offeredPrice: number;
};

type ProfileContact = {
  id: string;
  email: string | null;
  full_name: string | null;
  organization_name: string | null;
};

type JobNotificationDetails = {
  id: string;
  shipper_id: string;
  title: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_at: string;
  required_by: string;
  offered_price: number;
};

type BidNotificationDetails = {
  id: string;
  courier_id: string;
  amount: number;
  eta_minutes: number;
  note: string | null;
};

function normalizeEmail(email: EmailRecipient) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized || null;
}

function getAppLink(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  return baseUrl ? `${baseUrl}${path}` : path;
}

function getAdminEmail() {
  return normalizeEmail(process.env.DMLE_ADMIN_EMAIL);
}

function isEmailConfigured(subject: string) {
  if (!process.env.RESEND_API_KEY || !process.env.DMLE_FROM_EMAIL?.trim()) {
    console.warn(`Email disabled for "${subject}". Missing RESEND_API_KEY or DMLE_FROM_EMAIL.`);
    return false;
  }

  return true;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.filter(Boolean).join('\n');
}

async function sendLogisticsEmail({ to, subject, text }: { to: EmailRecipient; subject: string; text: string }) {
  const recipient = normalizeEmail(to);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DMLE_FROM_EMAIL?.trim();

  if (!recipient) {
    console.warn(`Email skipped for "${subject}". Missing recipient email.`);
    return;
  }

  if (!isEmailConfigured(subject) || !apiKey || !from) {
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text
      })
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      console.error(`Email send failed for "${subject}".`, { status: response.status, responseText });
    }
  } catch (error) {
    console.error(`Email send failed for "${subject}".`, error);
  }
}

async function getProfileContact(profileId: string): Promise<ProfileContact | null> {
  const supabase = createServiceRoleClient();

  if (!supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, organization_name')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    console.error('Notification profile lookup failed:', error);
    return null;
  }

  return data;
}

async function getJobDetails(jobId: string): Promise<JobNotificationDetails | null> {
  const supabase = createServiceRoleClient();

  if (!supabase) return null;

  const { data, error } = await supabase
    .from('jobs')
    .select('id, shipper_id, title, pickup_address, dropoff_address, pickup_at, required_by, offered_price')
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    console.error('Notification job lookup failed:', error);
    return null;
  }

  return data;
}

async function getBidDetails(bidId: string): Promise<BidNotificationDetails | null> {
  const supabase = createServiceRoleClient();

  if (!supabase) return null;

  const { data, error } = await supabase
    .from('bids')
    .select('id, courier_id, amount, eta_minutes, note')
    .eq('id', bidId)
    .maybeSingle();

  if (error) {
    console.error('Notification bid lookup failed:', error);
    return null;
  }

  return data;
}

async function getApprovedCourierEmails() {
  const supabase = createServiceRoleClient();

  if (!supabase) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'courier')
    .eq('courier_status', 'approved')
    .not('email', 'is', null);

  if (error) {
    console.error('Approved courier email lookup failed:', error);
    return [];
  }

  return Array.from(new Set((data ?? []).map((profile) => normalizeEmail(profile.email)).filter(Boolean))) as string[];
}

export async function notifyCourierSignupPending({
  courierName,
  organizationName,
  courierEmail
}: {
  courierName: string;
  organizationName: string | null;
  courierEmail: string;
}) {
  const subject = 'DMLE courier approval needed';
  if (!isEmailConfigured(subject)) return;

  await sendLogisticsEmail({
    to: getAdminEmail(),
    subject,
    text: compactLines([
      'A new courier account is pending approval in DMLE.',
      '',
      `Courier: ${courierName}`,
      organizationName ? `Organization: ${organizationName}` : null,
      `Email: ${courierEmail}`,
      '',
      `Admin dashboard: ${getAppLink('/admin')}`,
      '',
      LOGISTICS_ONLY_WARNING
    ])
  });
}

export async function notifyCourierReview({
  courierEmail,
  courierName,
  decision
}: {
  courierEmail: EmailRecipient;
  courierName: string | null;
  decision: 'approved' | 'rejected';
}) {
  const approved = decision === 'approved';
  const subject = approved ? 'Your DMLE courier account is approved' : 'DMLE courier account review update';

  if (!isEmailConfigured(subject)) return;

  await sendLogisticsEmail({
    to: courierEmail,
    subject,
    text: compactLines([
      `Hello${courierName ? ` ${courierName}` : ''},`,
      '',
      approved
        ? 'Your courier account is approved. You can now log in to view open shipment requests and submit bids.'
        : 'Your courier account is not approved for bidding at this time.',
      '',
      approved ? `Courier dashboard: ${getAppLink('/courier')}` : `DMLE support: ${getAdminEmail() ?? 'DMLE admin'}`,
      '',
      LOGISTICS_ONLY_WARNING
    ])
  });
}

export async function notifyApprovedCouriersOfNewShipment(shipment: ShipmentEmailDetails) {
  const subject = 'New DMLE shipment request available';
  if (!isEmailConfigured(subject)) return;

  const courierEmails = await getApprovedCourierEmails();

  await Promise.all(
    courierEmails.map((courierEmail) =>
      sendLogisticsEmail({
        to: courierEmail,
        subject,
        text: compactLines([
          'A new DMLE shipment request is available for approved couriers.',
          '',
          `Shipment: ${shipment.title}`,
          `Pickup address: ${shipment.pickupAddress}`,
          `Delivery address: ${shipment.dropoffAddress}`,
          `Pickup time: ${formatDateTime(shipment.pickupAt)}`,
          `Deadline: ${formatDateTime(shipment.requiredBy)}`,
          `Offered price: ${formatMoney(shipment.offeredPrice)}`,
          '',
          `Courier dashboard: ${getAppLink('/courier')}`,
          '',
          LOGISTICS_ONLY_WARNING
        ])
      })
    )
  );
}

export async function notifyShipperOfNewBid({
  jobId,
  amount,
  etaMinutes,
  note
}: {
  jobId: string;
  amount: number;
  etaMinutes: number;
  note: string | null;
}) {
  const subject = 'New bid received on your DMLE shipment';
  if (!isEmailConfigured(subject)) return;

  const job = await getJobDetails(jobId);
  if (!job) return;

  const shipper = await getProfileContact(job.shipper_id);

  await sendLogisticsEmail({
    to: shipper?.email,
    subject,
    text: compactLines([
      'A courier submitted a new bid on your DMLE shipment.',
      '',
      `Shipment: ${job.title}`,
      `Bid amount: ${formatMoney(amount)}`,
      `ETA: ${etaMinutes} minutes`,
      note ? `Bid note: ${note}` : null,
      '',
      `Shipper dashboard: ${getAppLink('/shipper')}`,
      '',
      LOGISTICS_ONLY_WARNING
    ])
  });
}

export async function notifyBidAccepted({ jobId, bidId }: { jobId: string; bidId: string }) {
  if (!isEmailConfigured('Bid accepted notifications')) return;

  const [job, bid] = await Promise.all([getJobDetails(jobId), getBidDetails(bidId)]);

  if (!job || !bid) return;

  const [courier, shipper] = await Promise.all([getProfileContact(bid.courier_id), getProfileContact(job.shipper_id)]);

  await Promise.all([
    sendLogisticsEmail({
      to: courier?.email,
      subject: 'Your DMLE bid was accepted',
      text: compactLines([
        'Your bid was accepted and the shipment is now assigned to you.',
        '',
        `Shipment: ${job.title}`,
        `Pickup address: ${job.pickup_address}`,
        `Delivery address: ${job.dropoff_address}`,
        `Pickup time: ${formatDateTime(job.pickup_at)}`,
        `Deadline: ${formatDateTime(job.required_by)}`,
        '',
        `Courier dashboard: ${getAppLink('/courier')}`,
        '',
        LOGISTICS_ONLY_WARNING
      ])
    }),
    sendLogisticsEmail({
      to: shipper?.email,
      subject: 'DMLE shipment assigned',
      text: compactLines([
        'Your DMLE shipment was assigned to the accepted courier.',
        '',
        `Shipment: ${job.title}`,
        `Shipper dashboard: ${getAppLink('/shipper')}`,
        '',
        LOGISTICS_ONLY_WARNING
      ])
    })
  ]);
}

export async function notifyShipperOfStatusUpdate({
  jobId,
  status,
  timestamp,
  statusNote,
  receivedByName,
  deliveryNotes
}: {
  jobId: string;
  status: 'picked_up' | 'in_transit' | 'delivered';
  timestamp: string;
  statusNote: string | null;
  receivedByName: string | null;
  deliveryNotes: string | null;
}) {
  const statusLabel = formatStatusLabel(status);
  const subject = `DMLE shipment ${statusLabel.toLowerCase()}`;

  if (!isEmailConfigured(subject)) return;

  const job = await getJobDetails(jobId);
  if (!job) return;

  const shipper = await getProfileContact(job.shipper_id);

  await sendLogisticsEmail({
    to: shipper?.email,
    subject,
    text: compactLines([
      'Your DMLE shipment status was updated.',
      '',
      `Shipment: ${job.title}`,
      `New status: ${statusLabel}`,
      `Timestamp: ${formatDateTime(timestamp)}`,
      statusNote ? `Status note: ${statusNote}` : null,
      status === 'delivered' && receivedByName ? `Received by: ${receivedByName}` : null,
      status === 'delivered' && deliveryNotes ? `Delivery notes: ${deliveryNotes}` : null,
      '',
      `Shipment details: ${getAppLink(`/shipments/${job.id}`)}`,
      '',
      LOGISTICS_ONLY_WARNING
    ])
  });
}

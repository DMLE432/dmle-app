export type StatusTone = 'slate' | 'green' | 'amber' | 'red';

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  assigned: 'Assigned',
  approved: 'Approved',
  cancelled: 'Cancelled',
  completed: 'Completed',
  declined: 'Declined',
  delivered: 'Delivered',
  in_transit: 'In transit',
  open: 'Open',
  pending: 'Pending',
  picked_up: 'Picked up',
  rejected: 'Rejected'
};

export function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function getStatusTone(status: string): StatusTone {
  if (status === 'open' || status === 'accepted' || status === 'approved' || status === 'delivered' || status === 'completed') return 'green';
  if (status === 'pending' || status === 'assigned' || status === 'picked_up' || status === 'in_transit') return 'amber';
  if (status === 'declined' || status === 'rejected' || status === 'cancelled') return 'red';
  return 'slate';
}

export function isCompletedShipmentStatus(status: string) {
  return status === 'delivered' || status === 'completed';
}

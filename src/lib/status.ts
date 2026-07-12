export type StatusTone = 'slate' | 'green' | 'amber' | 'red';

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  assigned: 'Assigned',
  cancelled: 'Cancelled',
  completed: 'Completed',
  declined: 'Declined',
  delivered: 'Delivered',
  in_transit: 'In transit',
  open: 'Open',
  pending: 'Pending',
  picked_up: 'Picked up'
};

export function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

export function getStatusTone(status: string): StatusTone {
  if (status === 'open' || status === 'accepted' || status === 'delivered' || status === 'completed') return 'green';
  if (status === 'pending' || status === 'assigned' || status === 'picked_up' || status === 'in_transit') return 'amber';
  if (status === 'declined' || status === 'cancelled') return 'red';
  return 'slate';
}

export function isCompletedShipmentStatus(status: string) {
  return status === 'delivered' || status === 'completed';
}

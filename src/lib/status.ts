export type StatusTone = 'slate' | 'green' | 'amber' | 'red';

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  assigned: 'Assigned',
  approved: 'Approved',
  cancelled: 'Cancelled',
  completed: 'Completed',
  declined: 'Rejected',
  delivered: 'Delivered',
  en_route_to_pickup: 'En route to pickup',
  in_transit: 'In transit',
  open: 'Open',
  pending: 'Pending',
  picked_up: 'Picked up',
  rejected: 'Rejected'
};

export function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function formatStatusLabel(status: string) {
  const normalizedStatus = normalizeStatus(status);
  const fallbackLabel = normalizedStatus.replaceAll('_', ' ');
  return STATUS_LABELS[normalizedStatus] ?? fallbackLabel.charAt(0).toUpperCase() + fallbackLabel.slice(1);
}

export function getStatusTone(status: string): StatusTone {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus === 'open' || normalizedStatus === 'accepted' || normalizedStatus === 'approved' || normalizedStatus === 'delivered' || normalizedStatus === 'completed') return 'green';
  if (normalizedStatus === 'pending' || normalizedStatus === 'assigned' || normalizedStatus === 'picked_up' || normalizedStatus === 'in_transit' || normalizedStatus === 'en_route_to_pickup') return 'amber';
  if (normalizedStatus === 'declined' || normalizedStatus === 'rejected' || normalizedStatus === 'cancelled') return 'red';
  return 'slate';
}

export function isCompletedShipmentStatus(status: string) {
  const normalizedStatus = normalizeStatus(status);
  return normalizedStatus === 'delivered' || normalizedStatus === 'completed';
}
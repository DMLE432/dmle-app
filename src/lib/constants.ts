export const APP_NAME = 'DMLE';

export const roleLabels = {
  shipper: 'Shipper',
  courier: 'Courier',
  admin: 'Admin'
} as const;

export type UserRole = keyof typeof roleLabels;

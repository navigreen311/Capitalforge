'use client';

/**
 * NotificationDrawer — re-exports the NotificationInbox component
 * under the layout/ path for feature 2B compatibility.
 *
 * The canonical implementation lives in @/components/notification-inbox.tsx
 * and is already wired into the Header via useNotificationInbox().
 */
export {
  NotificationInbox as NotificationDrawer,
  useNotificationInbox,
} from '@/components/notification-inbox';
// Notification and NotificationType are gone with the fixtures: the shape is
// NotificationRow now, and the types are the ones the API actually sends.
export type { NotificationRow, Severity } from '@/components/notification-inbox';

import { createSelector, createSlice, nanoid, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from '../store';

export type NotificationType = 'info' | 'error' | 'success' | 'task' ;

export type NotificationButton = {
  id: string,
  label: string,
  url?: string,
  dismiss?: boolean
};

export type NotificationStatus = 'dismissed' | 'active';

export type NotificationState = {
  id: string,
  title: string,
  body: string,
  type: NotificationType,
  progress?: number,
  progressMax?: number,
  buttons: NotificationButton[],
  status: NotificationStatus
};

export type NotificationsState = {
  notifications: NotificationState[],
};

const initialState: NotificationsState = {
  notifications: [],
};

export type DismissNotificationPayload = {
  id: string,
};

export type UpdateNotificationProgressPayload = {
  id: string,
  progress: number,
  progressMax?: number,
};

const notificationsSlice = createSlice({
  name: 'notificationsSlice',
  initialState,
  reducers: {
    createNotification: (state, action: PayloadAction<Omit<NotificationState, 'status' | 'id'> & { id?: string }>) => {
      const id = action.payload.id ?? nanoid();

      state.notifications.push({
        ...action.payload,
        id,
        status: 'active',
      });
    },

    dismissNotification: (state, action: PayloadAction<DismissNotificationPayload>) => {
      const notification = state.notifications.find((e) => e.id === action.payload.id);

      if (notification) {
        notification.status = 'dismissed';
      }
    },

    updateNotificationProgress: (state, action: PayloadAction<UpdateNotificationProgressPayload>) => {
      const notification = state.notifications.find((e) => e.id === action.payload.id);

      if (notification) {
        notification.progress = action.payload.progress;

        if (action.payload.progressMax) {
          notification.progressMax = action.payload.progressMax;
        }
      }
    },
  },
});

export const selectNotification = createSelector(
  (state: RootState) => state.notifications.notifications,
  (_state: RootState, id: string) => id,
  (notifications, id) => notifications.find((n) => n.id === id),
);

export const selectActiveNotifications = createSelector(
  (state: RootState) => state.notifications.notifications,
  (notifications) => notifications.filter((n) => n.status === 'active'),
);

export default notificationsSlice;

export interface SlackNotification {
  title: string;
  options?: Record<string, any>;
}

export interface SlackTitleChange {
  title: string;
}

export type SlackEvent =
  | { type: "notification"; data: SlackNotification }
  | { type: "title"; data: SlackTitleChange };

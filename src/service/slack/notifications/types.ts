export interface SlackNotification {
  title: string;
  options?: Record<string, any>;
}

export type SlackEvent = { type: "notification"; data: SlackNotification };

export interface SlackWebSocketMessage {
  type?: string;
  subtype?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  hidden?: boolean;
  ids?: string[];
  [key: string]: any;
}

export interface SlackNotification {
  title: string;
  options?: Record<string, any>;
}

export type SlackEvent = { type: "notification"; data: SlackNotification };

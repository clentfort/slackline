import type { SlackConversation } from "../conversation/conversation-manager.js";
import type { SlackMessage } from "./message-manager.js";
import { withSlackClient } from "../with-slack-client.js";

type PostMessageOptions = {
  target: string;
  message: string;
};

export type SlackPostMessageResult = {
  target: string;
  conversation: SlackConversation;
  posted: SlackMessage;
};

export async function postMessage(options: PostMessageOptions): Promise<SlackPostMessageResult> {
  return withSlackClient({}, async (client) => {
    const conversation = await client.conversations.open({ target: options.target });

    const posted = await client.messages.post(options.message);

    return {
      target: options.target,
      conversation,
      posted,
    };
  });
}

/**
 * This script is injected into the Slack web client to intercept WebSocket messages
 * and forward them to a webhook URL.
 */
export const notificationInjectionScript = (webhookUrl: string) => {
  if ((window as any)._slackline_hooked) return;
  (window as any)._slackline_hooked = true;

  console.log('[slackline] Injecting notification listener...');

  const originalAddEventListener = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function (type: string, listener: any, options: any) {
    if (type === 'message') {
      const originalListener = listener;
      const wrappedListener = async (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'message' && !payload.hidden && (payload.subtype === 'thread_broadcast' || !payload.subtype)) {
             // Forward to webhook
             // We don't have all the filtering logic here, but we can do a simple check
             const isDm = payload.channel && (payload.channel.startsWith('D') || payload.channel.startsWith('G'));
             // We could also check for mentions if we had the user ID

             if (isDm || (payload.text && (payload.text.includes('<!channel>') || payload.text.includes('<!here>') || payload.text.includes('<!everyone>')))) {
                fetch(webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'notification',
                    data: {
                      title: isDm ? 'New DM' : 'Slack Mention',
                      options: {
                        body: payload.text,
                        channel: payload.channel,
                        user: payload.user,
                        ts: payload.ts,
                        source: 'browser-injected'
                      }
                    }
                  })
                }).catch(() => {});
             }
          }
        } catch (e) {
          // Ignore
        }
        return originalListener.apply(this, [event]);
      };
      return originalAddEventListener.call(this, type, wrappedListener, options);
    }
    return originalAddEventListener.apply(this, [type, listener, options]);
  };
};

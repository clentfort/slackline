import { SlackComponent } from '../slack-component.js'
import { notificationInjectionScript } from './browser-scripts.js'
import type { SlackEvent } from './types.js'

export interface ForwarderOptions {
  onEvent?: (event: SlackEvent) => void
  onError?: (error: Error) => void
  verbose?: boolean
}

export class NotificationManager extends SlackComponent {
  private isListening = false

  /**
   * Starts listening for browser notifications and title changes.
   * @param onEvent Callback function called whenever a notification or title change is detected.
   */
  async listen(onEvent: (event: SlackEvent) => void): Promise<void> {
    if (this.isListening) {
      throw new Error('Already listening for notifications.')
    }
    this.isListening = true

    // 1. Listen for Notifications via CDP (Chromium only)
    try {
      const session = await this.page.context().newCDPSession(this.page)
      await session.send('Notification.enable')
      session.on('Notification.notificationDisplayed', (params: any) => {
        onEvent({
          type: 'notification',
          data: {
            title: params.title,
            options: {
              body: params.body,
              dir: params.dir,
              lang: params.lang,
              tag: params.tag,
              icon: params.icon,
              badge: params.badge,
              image: params.image,
              vibrate: params.vibrate,
              timestamp: params.timestamp,
              renotify: params.renotify,
              silent: params.silent,
              requireInteraction: params.requireInteraction,
              data: params.data,
              actions: params.actions,
            },
          },
        })
      })
    } catch (err) {
      // Fallback or ignore if CDP is not available (e.g. non-Chromium)
      if (this.config.browser.browser === 'chrome') {
        console.warn('Failed to enable CDP Notification domain:', err)
      }
    }

    // 2. Listen for Title changes via MutationObserver
    const titleCallbackName = 'slacklineTitleCallback'
    await this.page.exposeFunction(titleCallbackName, (title: string) => {
      onEvent({ type: 'title', data: { title } })
    })

    // 3. Fallback/Support for Service Worker notifications via monkey-patch
    // (CDP on Page session doesn't always catch SW notifications)
    const notificationCallbackName = 'slacklineNotificationCallback'
    await this.page.exposeFunction(notificationCallbackName, (data: any) => {
      onEvent({ type: 'notification', data })
    })

    const script = `(titleCallback, notificationCallback) => {
      // Title Observer
      let lastTitle = document.title;
      const observer = new MutationObserver(() => {
        if (document.title !== lastTitle) {
          lastTitle = document.title;
          window[titleCallback](lastTitle);
        }
      });
      observer.observe(document, { subtree: true, childList: true, characterData: true });

      // Service Worker Notification Patch (fallback)
      if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype.showNotification) {
        const original = ServiceWorkerRegistration.prototype.showNotification;
        ServiceWorkerRegistration.prototype.showNotification = function(title, options) {
          window[notificationCallback]({ title, options });
          return original.apply(this, [title, options]);
        };
      }
    }`

    await this.page.addInitScript(script, titleCallbackName, notificationCallbackName)
    await this.page.evaluate(script, titleCallbackName, notificationCallbackName).catch(() => {})
  }

  /**
   * Starts a webhook forwarder that listens for events and POSTs them to a URL.
   */
  async startWebhookForwarder(webhookUrl: string, options: ForwarderOptions = {}): Promise<void> {
    await this.listen(async (event) => {
      if (options.onEvent) {
        options.onEvent(event)
      }

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        })
        if (!response.ok && options.verbose) {
          console.error(`Webhook returned error: ${response.status} ${response.statusText}`)
        }
      } catch (err) {
        if (options.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)))
        } else if (options.verbose) {
          console.error(`Failed to send webhook: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    })
  }
}

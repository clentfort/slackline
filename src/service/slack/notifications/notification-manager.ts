import { SlackComponent } from '../slack-component.js'
import { notificationInjectionScript } from './browser-scripts.js'
import type { SlackEvent } from './types.js'

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

    const callbackName = 'slacklineNotificationCallback'

    // Expose the callback function to the browser context.
    // This allows the browser script to call back into the Node.js process.
    await this.page.exposeFunction(callbackName, (event: SlackEvent) => {
      onEvent(event)
    })

    // Register the injection script to run on every new document load.
    await this.page.addInitScript(notificationInjectionScript, callbackName)

    // Also execute it immediately on the current page to catch events without a reload.
    await this.page.evaluate(notificationInjectionScript, callbackName).catch(() => {
      // If the page is currently navigating or not ready, this might fail.
      // The addInitScript call above ensures it will be injected on the next load.
    })
  }
}

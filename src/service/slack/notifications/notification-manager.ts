import type { Worker } from "playwright";

import { SlackComponent } from "../slack-component.js";
import type { SlackEvent } from "./types.js";

export interface ForwarderOptions {
  onEvent?: (event: SlackEvent) => void;
  onError?: (error: Error) => void;
  verbose?: boolean;
}

type PageHookArgs = {
  titleCallback: string;
  notificationCallback: string;
  installedFlag: string;
  swMessageKey: string;
};

type ServiceWorkerHookArgs = {
  installedFlag: string;
  messageKey: string;
};

const pageHooksInstalledFlag = "__slacklineNotificationHooksInstalled";
const serviceWorkerHooksInstalledFlag = "__slacklineServiceWorkerNotificationHooksInstalled";
const serviceWorkerMessageKey = "__slacklineNotification";

function encodeScriptArg(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildPageHookScript(args: PageHookArgs): string {
  return `(function(args) {
    var win = window;
    if (win[args.installedFlag]) {
      return;
    }
    win[args.installedFlag] = true;

    var markWrapped = function(fn) {
      if (typeof fn !== 'function') {
        return;
      }
      try {
        Object.defineProperty(fn, '__slacklineWrapped', {
          configurable: true,
          value: true,
        });
      } catch {
        // ignore if marker cannot be set
      }
    };

    var isWrapped = function(fn) {
      if (typeof fn !== 'function') {
        return false;
      }
      try {
        return Boolean(fn.__slacklineWrapped);
      } catch {
        return false;
      }
    };

    var emitTitle = function(title) {
      try {
        var callback = win[args.titleCallback];
        if (typeof callback === 'function') {
          callback(title);
        }
      } catch {
        // ignore bridge errors
      }
    };

    var emitNotification = function(payload) {
      try {
        var callback = win[args.notificationCallback];
        if (typeof callback === 'function') {
          callback(payload);
        }
      } catch {
        // ignore bridge errors
      }
    };

    var lastTitle = document.title;
    var observer = new MutationObserver(function() {
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        emitTitle(lastTitle);
      }
    });
    observer.observe(document, { subtree: true, childList: true, characterData: true });

    if (typeof win.Notification === 'function' && !isWrapped(win.Notification)) {
      var originalNotification = win.Notification;
      var proxiedNotification = new Proxy(originalNotification, {
        construct: function(target, argsList, newTarget) {
          var title = argsList[0];
          var options = argsList[1];
          emitNotification({ title: title, options: options });
          return Reflect.construct(target, argsList, newTarget);
        },
      });

      markWrapped(proxiedNotification);

      try {
        Object.defineProperty(win, 'Notification', {
          configurable: true,
          writable: true,
          value: proxiedNotification,
        });
      } catch {
        // ignore if browser disallows overriding
      }
    }

    var patchShowNotification = function(target) {
      var candidate = target;
      if (!candidate || typeof candidate.showNotification !== 'function') {
        return;
      }

      var original = candidate.showNotification;
      if (isWrapped(original)) {
        return;
      }

      var wrapped = function(title, options) {
        emitNotification({ title: title, options: options });
        return original.apply(this, [title, options]);
      };

      markWrapped(wrapped);

      try {
        candidate.showNotification = wrapped;
      } catch {
        // ignore if browser disallows overriding
      }
    };

    if (win.ServiceWorkerRegistration && win.ServiceWorkerRegistration.prototype) {
      patchShowNotification(win.ServiceWorkerRegistration.prototype);
    }

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', function(event) {
        var data = event.data;
        if (!data || typeof data !== 'object') {
          return;
        }

        var payload = data[args.swMessageKey];
        if (typeof payload !== 'undefined') {
          emitNotification(payload);
        }
      });
    }
  })(${encodeScriptArg(args)});`;
}

function buildServiceWorkerHookScript(args: ServiceWorkerHookArgs): string {
  return `(function(args) {
    var scope = self;
    if (scope[args.installedFlag]) {
      return;
    }
    scope[args.installedFlag] = true;

    var markWrapped = function(fn) {
      if (typeof fn !== 'function') {
        return;
      }
      try {
        Object.defineProperty(fn, '__slacklineWrapped', {
          configurable: true,
          value: true,
        });
      } catch {
        // ignore if marker cannot be set
      }
    };

    var isWrapped = function(fn) {
      if (typeof fn !== 'function') {
        return false;
      }
      try {
        return Boolean(fn.__slacklineWrapped);
      } catch {
        return false;
      }
    };

    var emitNotification = function(payload) {
      try {
        if (!scope.clients || typeof scope.clients.matchAll !== 'function') {
          return;
        }

        scope.clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(function(clients) {
            for (var i = 0; i < clients.length; i += 1) {
              var client = clients[i];
              try {
                client.postMessage({ [args.messageKey]: payload });
              } catch {
                // ignore per-client postMessage errors
              }
            }
          })
          .catch(function() {});
      } catch {
        // ignore bridge errors
      }
    };

    var patchShowNotification = function(target) {
      var candidate = target;
      if (!candidate || typeof candidate.showNotification !== 'function') {
        return;
      }

      var original = candidate.showNotification;
      if (isWrapped(original)) {
        return;
      }

      var wrapped = function(title, options) {
        emitNotification({ title: title, options: options });
        return original.apply(this, [title, options]);
      };

      markWrapped(wrapped);

      try {
        candidate.showNotification = wrapped;
      } catch {
        // ignore if browser disallows overriding
      }
    };

    if (scope.registration) {
      patchShowNotification(scope.registration);
    }

    if (scope.ServiceWorkerRegistration && scope.ServiceWorkerRegistration.prototype) {
      patchShowNotification(scope.ServiceWorkerRegistration.prototype);
    }
  })(${encodeScriptArg(args)});`;
}

export class NotificationManager extends SlackComponent {
  private isListening = false;

  /**
   * Starts listening for browser notifications and title changes.
   * @param onEvent Callback function called whenever a notification or title change is detected.
   */
  async listen(onEvent: (event: SlackEvent) => void): Promise<void> {
    if (this.isListening) {
      throw new Error("Already listening for notifications.");
    }
    this.isListening = true;

    await this.ensureNotificationPermission();

    const titleCallbackName = "slacklineTitleCallback";
    await this.page.exposeFunction(titleCallbackName, (title: string) => {
      onEvent({ type: "title", data: { title } });
    });

    const notificationCallbackName = "slacklineNotificationCallback";
    await this.page.exposeFunction(notificationCallbackName, (data: any) => {
      onEvent({ type: "notification", data });
    });

    const pageHookArgs: PageHookArgs = {
      titleCallback: titleCallbackName,
      notificationCallback: notificationCallbackName,
      installedFlag: pageHooksInstalledFlag,
      swMessageKey: serviceWorkerMessageKey,
    };

    const pageHookScript = buildPageHookScript(pageHookArgs);
    await this.page.addInitScript(pageHookScript);
    await this.page.evaluate(pageHookScript).catch(() => {});

    await this.installServiceWorkerHooks();
  }

  private async ensureNotificationPermission(): Promise<void> {
    const pageUrl = this.page.url();
    if (!pageUrl) {
      return;
    }

    let origin: string;
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return;
    }

    await this.page
      .context()
      .grantPermissions(["notifications"], { origin })
      .catch(() => {});

    const permission = await this.page
      .evaluate(() => {
        if (typeof Notification !== "function") {
          return "unsupported";
        }
        return Notification.permission;
      })
      .catch(() => "unknown");

    if (permission !== "granted") {
      console.warn(
        `Notification permission is '${permission}' for ${origin}. Browser notifications may not fire.`,
      );
    }
  }

  private async installServiceWorkerHooks(): Promise<void> {
    const context = this.page.context();

    const patchWorker = async (worker: Worker): Promise<void> => {
      const args: ServiceWorkerHookArgs = {
        installedFlag: serviceWorkerHooksInstalledFlag,
        messageKey: serviceWorkerMessageKey,
      };
      const script = buildServiceWorkerHookScript(args);

      await worker.evaluate(script).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.warn(`Failed to patch service worker notification hooks: ${errorMessage}`);
      });
    };

    await Promise.all(context.serviceWorkers().map((worker) => patchWorker(worker)));
    context.on("serviceworker", (worker) => {
      void patchWorker(worker);
    });
  }

  /**
   * Starts a webhook forwarder that listens for events and POSTs them to a URL.
   */
  async startWebhookForwarder(webhookUrl: string, options: ForwarderOptions = {}): Promise<void> {
    await this.listen(async (event) => {
      if (options.onEvent) {
        options.onEvent(event);
      }

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });
        if (!response.ok && options.verbose) {
          console.error(`Webhook returned error: ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        if (options.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)));
        } else if (options.verbose) {
          console.error(
            `Failed to send webhook: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    });
  }
}

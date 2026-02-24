/**
 * This function is injected into the Slack page to intercept notifications and title changes.
 * It uses a callback function exposed by Playwright.
 *
 * NOTE: This function must be self-contained as it is serialized and executed in the browser context.
 */
export function notificationInjectionScript(callbackName: string) {
  const onEvent = (event: any) => {
    const callback = (window as any)[callbackName]
    if (typeof callback === 'function') {
      callback(event)
    }
  }

  // 1. Hook window.Notification
  const OriginalNotification = window.Notification
  if (OriginalNotification && !(OriginalNotification as any).__slackline_hooked) {
    function HookedNotification(this: any, title: string, options?: any) {
      onEvent({ type: 'notification', data: { title, options } })
      return new (OriginalNotification as any)(title, options)
    }
    ;(HookedNotification as any).__slackline_hooked = true

    // Copy static properties like 'permission'
    Object.defineProperty(HookedNotification, 'permission', {
      get: () => OriginalNotification.permission,
      configurable: true,
    })
    HookedNotification.requestPermission = OriginalNotification.requestPermission.bind(OriginalNotification)
    HookedNotification.prototype = OriginalNotification.prototype
    window.Notification = HookedNotification as any
  }

  // 2. Hook ServiceWorkerRegistration.showNotification
  if (
    window.ServiceWorkerRegistration &&
    ServiceWorkerRegistration.prototype.showNotification &&
    !(ServiceWorkerRegistration.prototype.showNotification as any).__slackline_hooked
  ) {
    const originalShowNotification = ServiceWorkerRegistration.prototype.showNotification
    ServiceWorkerRegistration.prototype.showNotification = function (this: any, title: string, options?: any) {
      onEvent({ type: 'notification', data: { title, options } })
      return originalShowNotification.apply(this, [title, options])
    }
    ;(ServiceWorkerRegistration.prototype.showNotification as any).__slackline_hooked = true
  }

  // 3. Hook Title changes
  let lastTitle = document.title
  const observer = new MutationObserver(() => {
    if (document.title !== lastTitle) {
      lastTitle = document.title
      onEvent({ type: 'title', data: { title: lastTitle } })
    }
  })

  // Observe the document for any changes that might affect the title.
  // This is safer than looking for the <title> element which might not be ready.
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
  })
}

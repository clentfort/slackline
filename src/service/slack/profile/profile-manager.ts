import { SlackComponent } from "../slack-component.js";
import { extractNameFromUserLabel, extractWorkspaceName } from "../session/session-state.js";
import { BROWSER_HELPERS } from "../utils/browser-helpers.js";

export type SlackProfile = {
  loggedIn: boolean;
  name?: string;
  workspace?: string;
  url: string;
};

export class ProfileManager extends SlackComponent {
  async get(): Promise<SlackProfile> {
    const url = this.page.url();
    const loggedIn = await this.client.isLoggedIn();
    if (!loggedIn) {
      return { loggedIn: false, url };
    }

    await this.page
      .waitForFunction(
        () => document.title.trim().length > 0 && document.title.trim().toLowerCase() !== "slack",
        {
          timeout: 5000,
        },
      )
      .catch(() => {});

    const details = await this.page.evaluate((helpers) => {
      const normalize = new Function(`return ${helpers.normalize}`)();

      const userButton = document.querySelector('button[data-qa="user-button"]');
      const searchButton = document.querySelector('button[data-qa="top_nav_search"]');

      return {
        userLabel: normalize(userButton?.getAttribute("aria-label")),
        searchButtonText: normalize(searchButton?.textContent),
        searchButtonAria: normalize(searchButton?.getAttribute("aria-label")),
        title: normalize(document.title),
      };
    }, BROWSER_HELPERS);

    const name = extractNameFromUserLabel(details.userLabel);
    const workspace = extractWorkspaceName({
      title: details.title,
      searchButtonText: details.searchButtonText,
      searchButtonAria: details.searchButtonAria,
    });

    return {
      loggedIn: true,
      name,
      workspace,
      url,
    };
  }
}

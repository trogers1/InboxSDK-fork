/* @flow */

import _ from 'lodash';
import {defn} from 'ud';
import Kefir from 'kefir';
import kefirStopper from 'kefir-stopper';
import fakeWindowResize from '../../../lib/fake-window-resize';
import findParent from '../../../lib/dom/find-parent';
import getChatSidebarClassname from '../getChatSidebarClassname';
import waitForAnimationClickBlockerGone from '../waitForAnimationClickBlockerGone';
import makeMutationObserverChunkedStream from '../../../lib/dom/make-mutation-observer-chunked-stream';
import fromEventTargetCapture from '../../../lib/from-event-target-capture';
import appSidebarIcon from '../../../lib/appSidebarIcon';

import type InboxDriver from '../inbox-driver';
import InboxSidebarContentPanelView from './inbox-sidebar-content-panel-view';

class InboxAppSidebarView {
  _stopper = kefirStopper();
  _driver: InboxDriver;
  _el: HTMLElement;
  _buttonContainer: HTMLElement;
  _contentArea: HTMLElement;
  _mainParent: HTMLElement;

  constructor(driver: InboxDriver) {
    this._driver = driver;
    this._el = document.querySelector('.inboxsdk__app_sidebar') || this._createElement();
    this._buttonContainer = this._el.querySelector('.inboxsdk__sidebar_panel_buttons');
    this._contentArea = this._el.querySelector('.inboxsdk__sidebar_panel_content_area');

    const mainParent = findParent(document.querySelector('[role=application]'), el => el.parentElement === document.body);
    if (!mainParent) {
      const err = new Error('Failed to find main parent');
      this._driver.getLogger().errorSite(err);
      throw err;
    }
    this._mainParent = mainParent;
  }

  destroy() {
    this._stopper.destroy();
    this._el.remove();
  }

  _hasAppToolbarButton(): boolean {
    return this._el.getAttribute('data-sdk-has-app-toolbar-button') === 'true';
  }

  _setHasAppToolbarButton(x: boolean) {
    this._el.setAttribute('data-sdk-has-app-toolbar-button', String(x));
  }

  _createElement() {
    const el = document.createElement('div');
    el.style.display = 'none';
    el.className = 'inboxsdk__app_sidebar';
    el.innerHTML = `
      <div class="inboxsdk__sidebar_panel_buttons"></div>
      <div class="inboxsdk__sidebar_panel_content_area"></div>
    `;
    el.setAttribute('data-open', 'false');
    document.body.appendChild(el);

    const contentArea = el.querySelector('.inboxsdk__sidebar_panel_content_area');

    const positionSidebarAfterAnimation = () => {
      waitForAnimationClickBlockerGone()
        .takeUntilBy(this._stopper)
        .onValue(positionSidebarNow);
    };

    const positionSidebarNow = () => {
      if (el.getAttribute('data-open') !== 'true') {
        this._el.style.display = 'none';

        if (this._driver.getCurrentChatSidebarView().getMode() !== 'SIDEBAR') {
          this._mainParent.classList.remove(getChatSidebarClassname());
          this._driver.getPageCommunicator().fakeWindowResize();
        }
      } else {
        this._el.style.display = '';

        if (this._driver.getCurrentChatSidebarView().getMode() !== 'SIDEBAR') {
          this._mainParent.classList.add(getChatSidebarClassname());
          this._driver.getPageCommunicator().fakeWindowResize();
        }
      }
    };

    makeMutationObserverChunkedStream(el, {attributes: true, attributeFilter: ['data-open']})
      .map(() => el.getAttribute('data-open'))
      .skipDuplicates()
      .onValue(positionSidebarNow);

    {
      let appToolbarButtonPromise = null;
      makeMutationObserverChunkedStream(contentArea, {childList: true})
        .map(() => contentArea.childElementCount > 0)
        .skipDuplicates()
        .onValue(hasChildren => {
          if (hasChildren) {
            if (!appToolbarButtonPromise) {
              appToolbarButtonPromise = this._driver.addToolbarButtonForApp(Kefir.constant({
                title: 'Extension Sidebar',
                iconUrl: appSidebarIcon,
                hasDropdown: false,
                onClick: () => {
                  el.setAttribute('data-open', String(el.getAttribute('data-open') !== 'true'));
                }
              }));
            }
          } else {
            el.setAttribute('data-open', 'false');
            if (appToolbarButtonPromise) {
              appToolbarButtonPromise.then(x => { x.destroy(); });
              appToolbarButtonPromise = null;
            }
          }
        });
    }

    fromEventTargetCapture(this._driver.getChatSidebarButton(), 'click')
      .filter(() =>
        el.getAttribute('data-open') === 'true' &&
        this._driver.getCurrentChatSidebarView().getMode() === 'SIDEBAR'
      )
      .takeUntilBy(this._stopper)
      .onValue(event => {
        event.stopImmediatePropagation();
        el.setAttribute('data-open', 'false');
      });
    Kefir.fromEvents(this._driver.getChatSidebarButton(), 'click')
      .delay(0)
      .filter(() =>
        el.getAttribute('data-open') === 'true' &&
        this._driver.getCurrentChatSidebarView().getMode() === 'SIDEBAR'
      )
      .takeUntilBy(this._stopper)
      .onValue(() => {
        el.setAttribute('data-open', 'false');
      });

    positionSidebarAfterAnimation();

    return el;
  }

  _hideAllPanels() {
    _.forEach(this._contentArea.children, el => {
      el.style.display = 'none';
    });
  }

  addSidebarContentPanel(descriptor: Kefir.Observable<Object>) {
    const view = new InboxSidebarContentPanelView(descriptor);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(this._buttonContainer.childElementCount);
    this._buttonContainer.appendChild(button);

    button.addEventListener('click', () => {
      this._hideAllPanels();
      view.getElement().style.display = '';
    });

    this._hideAllPanels();
    this._contentArea.appendChild(view.getElement());
    if (this._driver.getCurrentChatSidebarView().getMode() === 'SIDEBAR') {
      this._el.setAttribute('data-open', 'true');
    }

    this._stopper
      .takeUntilBy(view.getStopper())
      .onValue(() => {
        view.remove();
      });

    view.getStopper()
      .onValue(() => {
        button.remove();
      });
    return view;
  }
}

export default defn(module, InboxAppSidebarView);

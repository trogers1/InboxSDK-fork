/* @flow */

import signIn from './lib/signIn';
import delay from 'pdelay';
import waitFor from '../../src/platform-implementation-js/lib/wait-for';

const testEmail = 'inboxsdktest@gmail.com';

// https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md

beforeAll(async () => {
  await page.setViewport({ width: 1024, height: 768 });
  await signIn();
});

beforeEach(async () => {
  // reset all counters
  await page.$eval('head', head => {
    head
      .getAttributeNames()
      .filter(name => name.startsWith('data-test-'))
      .forEach(name => {
        head.removeAttribute(name);
      });
  });
});

function waitForCounter(attribute: string, goal: number): Promise<number> {
  return page.waitForFunction(
    (attribute, goal) => {
      const value = Number((document.head: any).getAttribute(attribute));
      if (value >= goal) {
        return value;
      }
      return null;
    },
    { polling: 100 },
    attribute,
    goal
  );
}

function getCounter(attribute: string): Promise<number> {
  return page.$eval(
    'head',
    (head, attribute) => Number(head.getAttribute(attribute)),
    attribute
  );
}

async function openCompose() {
  await page.click('[gh=cm]');
  await page.waitForSelector('.inboxsdk__compose');
}

test('compose button, discard', async () => {
  await openCompose();

  await page.waitForSelector('.test__tooltipButton');
  expect(await page.$eval('.test__tooltipButton', el => el.textContent)).toBe(
    'Counter: 0'
  );
  await page.click('.test__tooltipButton');
  expect(await page.$eval('.test__tooltipButton', el => el.textContent)).toBe(
    'Counter: 1'
  );

  await page.click('.inboxsdk__composeButton[aria-label="Monkeys!"]');
  expect(await page.$('.test__tooltipButton')).toBe(null);
  expect(await page.$('div.test__dropdownContent')).not.toBe(null);

  await page.click('.inboxsdk__compose [role=button][aria-label^="Discard"]');

  expect(await getCounter('data-test-composeDiscardEmitted')).toBe(1);
  expect(await getCounter('data-test-composeDestroyEmitted')).toBe(1);
});

test('compose presending, sending, sent', async () => {
  await openCompose();
  await page.type('.inboxsdk__compose textarea[aria-label="To"]', testEmail);
  await page.type(
    '.inboxsdk__compose input[aria-label="Subject"]',
    'cancel send'
  );
  await page.type(
    '.inboxsdk__compose div[contenteditable=true][aria-label="Message Body"]',
    'Test message!'
  );
  await page.click('.inboxsdk__compose div[role=button][aria-label^="Send"]');

  expect(await getCounter('data-test-composePresendingEmitted')).toBe(1);
  expect(await getCounter('data-test-composeSendCanceledEmitted')).toBe(1);
  expect(await getCounter('data-test-composeSendingEmitted')).toBe(0);
  expect(await getCounter('data-test-composeSentEmitted')).toBe(0);
  expect(await getCounter('data-test-composeDiscardEmitted')).toBe(0);
  expect(await getCounter('data-test-composeDestroyEmitted')).toBe(0);

  await page.$eval('.inboxsdk__compose input[aria-label="Subject"]', input => {
    input.value = '';
  });
  await page.type(
    '.inboxsdk__compose input[aria-label="Subject"]',
    `InboxSDK Inbox ComposeView events test @ ${Date.now()}`
  );

  await page.click('.inboxsdk__compose div[role=button][aria-label^="Send"]');

  await waitForCounter('data-test-composeSentEmitted', 1);

  expect(await getCounter('data-test-composePresendingEmitted')).toBe(2);
  expect(await getCounter('data-test-composeSendCanceledEmitted')).toBe(1);
  expect(await getCounter('data-test-composeSendingEmitted')).toBe(1);
  expect(await getCounter('data-test-composeSentEmitted')).toBe(1);
  expect(await getCounter('data-test-composeDiscardEmitted')).toBe(0);
  expect(await getCounter('data-test-composeDestroyEmitted')).toBe(1);
});

/* @flow */

import ErrorCollector from '../../../../lib/ErrorCollector';
import querySelectorOne from '../../../../lib/dom/querySelectorOne';
import BigNumber from 'bignumber.js';

export default function parser(el: HTMLElement) {
  const ec = new ErrorCollector('compose');

  const inBundle = !el.hasAttribute('aria-multiselectable');

  ec.run('tabindex', () => {
    if (!el.hasAttribute('tabindex')) throw new Error('expected tabindex');
  });

  const threadId: ?string = ec.run(
    'thread id',
    () => new BigNumber(/#gmail:thread-f:(\d+)/.exec(el.getAttribute('data-item-id'))[1]).toString(16)
  );

  const heading = ec.run(
    'heading',
    () => el.querySelector('div[role=heading]')
  );
  const list = ec.run(
    'list',
    () => el.querySelector('div[role=list]')
  );

  const elements = {
    heading,
    list
  };
  const score = 1 - (ec.errorCount() / ec.runCount());
  return {
    elements,
    attributes: {
      inBundle,
      threadId
    },
    score,
    errors: ec.getErrorLogs()
  };
}

/*:: const x = parser(({}:any)); */
export type Parsed = typeof x;
/* @flow */
//jshint ignore:start

import _ from 'lodash';
import {defn} from 'ud';
import ajax from '../../../../common/ajax';
import {readDraftId} from '../gmail-response-processor';
import type GmailDriver from '../gmail-driver';
import isStreakAppId from '../../../lib/is-streak-app-id';
import rateLimitQueuer from '../../../../common/rate-limit-queuer';

const getDraftIDForMessageID: (driver: GmailDriver, messageID: string) => Promise<?string> =
  _.memoize(rateLimitQueuer(async function(driver: GmailDriver, messageID: string): Promise<?string> {
    const response = await ajax({
      method: 'GET',
      url: (document.location:any).origin+document.location.pathname,
      data: {
        ui: '2',
        ik: driver.getPageCommunicator().getIkValue(),
        view: 'cv',
        th: messageID,
        prf: '1',
        nsc: '1',
        mb: '0',
        rt: 'j',
        search: 'drafts'
      }
    });
    try {
      return readDraftId(response.text, messageID);
    } catch (err) {
      if (isStreakAppId(driver.getAppId())) {
        driver.getLogger().error(err, {
          message: 'failed to read draft ID',
          messageID,
          text: response.text
        });
      }
      throw err;
    }
  }, 1000, 5), (driver, messageID) => messageID);

export default defn(module, getDraftIDForMessageID);

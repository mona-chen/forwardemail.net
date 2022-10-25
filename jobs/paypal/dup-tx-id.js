const process = require('process');
const { parentPort } = require('worker_threads');
const os = require('os');

const Graceful = require('@ladjs/graceful');
const Mongoose = require('@ladjs/mongoose');
const sharedConfig = require('@ladjs/shared-config');
const parseErr = require('parse-err');
const pMap = require('p-map');

const config = require('#config');
const emailHelper = require('#helpers/email');
const Payments = require('#models/payment');
const logger = require('#helpers/logger');

const concurrency = os.cpus().length;
const breeSharedConfig = sharedConfig('BREE');
const mongoose = new Mongoose({ ...breeSharedConfig.mongoose, logger });
const graceful = new Graceful({
  mongooses: [mongoose],
  logger
});

graceful.listen();

const dupIds = [];

async function mapper(id) {
  const count = await Payments.countDocuments({ paypal_transaction_id: id });
  if (count > 1) dupIds.push(id);
}

(async () => {
  await mongoose.connect();

  //
  // count the number of duplicate paypal tx ids
  // and if any then email them to an admin
  //
  try {
    // TODO: rewrite this with aggregate + group
    const ids = await Payments.distinct('paypal_transaction_id', {
      paypal_transaction_id: { $exists: true }
    });
    logger.info(`found ${ids.length} unique paypal transaction ids`);
    await pMap(ids, mapper, { concurrency });
    logger.info('dupIds', { dupIds });
    if (dupIds.length > 0)
      throw new Error(
        `<p>The following duplicate PayPal transaction IDs were found:</p><ul><li>${dupIds.join(
          '</li><li>'
        )}</li></ul>`
      );
  } catch (err) {
    logger.error(err);
    // TODO: Once the culprit is determined, set "unique" to true in the Mongoose model for this property.</p>';
    err.message +=
      '<hr /><p>Once the culprit is determined, set "unique" to true in the Mongoose model for this property.</p>';
    await emailHelper({
      template: 'alert',
      message: {
        to: config.email.message.from,
        subject: 'Duplicate PayPal Transactions Detected'
      },
      locals: {
        message: `<pre><code>${JSON.stringify(
          parseErr(err),
          null,
          2
        )}</code></pre>`
      }
    });
  }

  if (parentPort) parentPort.postMessage('done');
  else process.exit(0);
})();

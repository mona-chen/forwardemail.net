/*
 * Copyright (c) Forward Email LLC
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This file incorporates work covered by the following copyright and
 * permission notice:
 *
 *   WildDuck Mail Agent is licensed under the European Union Public License 1.2 or later.
 *   https://github.com/nodemailer/wildduck
 */

const Aliases = require('#models/aliases');
const IMAPError = require('#helpers/imap-error');
const Mailboxes = require('#models/mailboxes');
const config = require('#config');
const i18n = require('#helpers/i18n');
const refineAndLogError = require('#helpers/refine-and-log-error');
const updateStorageUsed = require('#helpers/update-storage-used');

async function onCreate(path, session, fn) {
  this.logger.debug('CREATE', { path, session });

  if (this.wsp) {
    try {
      const data = await this.wsp.request({
        action: 'create',
        session: {
          id: session.id,
          user: session.user,
          remoteAddress: session.remoteAddress
        },
        path
      });
      fn(null, ...data);
      this.server.notifier.fire(session.user.alias_id);
    } catch (err) {
      fn(err);
    }

    return;
  }

  try {
    await this.refreshSession(session, 'CREATE');

    // check if over quota
    const { isOverQuota } = await Aliases.isOverQuota(
      {
        id: session.user.alias_id,
        domain: session.user.domain_id,
        locale: session.user.locale
      },
      0,
      this.client
    );
    if (isOverQuota)
      throw new IMAPError(
        i18n.translate('IMAP_MAILBOX_OVER_QUOTA', session.user.locale),
        {
          imapResponse: 'OVERQUOTA'
        }
      );

    //
    // limit the number of mailboxes a user can create
    // (Gmail defaults to 10,000 labels)
    // <https://github.com/nodemailer/wildduck/issues/512>
    //
    const count = await Mailboxes.countDocuments(this, session, {});

    if (count > config.maxMailboxes)
      throw new IMAPError(
        i18n.translate('IMAP_MAILBOX_MAX_EXCEEDED', session.user.locale),
        {
          imapResponse: 'OVERQUOTA'
        }
      );

    let mailbox = await Mailboxes.findOne(this, session, {
      path
    });

    if (mailbox)
      throw new IMAPError(
        i18n.translate('IMAP_MAILBOX_ALREADY_EXISTS', session.user.locale),
        {
          imapResponse: 'ALREADYEXISTS'
        }
      );

    mailbox = await Mailboxes.create({
      instance: this,
      session,
      path,
      // NOTE: this is the same uncommented code as `helpers/refresh-session`
      // TODO: support custom alias retention (would get stored on session)
      // TODO: if user updates retetion then we'd need to update in-memory IMAP connections
      // retention: typeof alias.retention === 'number' ? alias.retention : 0
      retention: 0
    });

    await this.server.notifier.addEntries(this, session, mailbox, {
      command: 'CREATE',
      mailbox: mailbox._id,
      path
    });

    // update storage
    try {
      session.db.pragma('wal_checkpoint(PASSIVE)');
      await updateStorageUsed(session.user.alias_id, this.client);
    } catch (err) {
      this.logger.fatal(err, { path, session });
    }

    fn(null, true, mailbox._id);
  } catch (err) {
    if (err.code === 11000) err.imapResponse = 'ALREADYEXISTS';
    // NOTE: wildduck uses `imapResponse` so we are keeping it consistent
    if (err.imapResponse) {
      this.logger.error(err, { path, session });
      return fn(null, err.imapResponse);
    }

    fn(refineAndLogError(err, session, true, this));
  }
}

module.exports = onCreate;

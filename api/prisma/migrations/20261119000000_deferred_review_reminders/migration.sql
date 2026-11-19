ALTER TABLE `ContractReview`
  ADD COLUMN `deferredReminderSentAt` DATETIME(3) NULL,
  ADD INDEX `ContractReview_deferred_reminder_idx` (`reviewedAt`, `deferredReminderSentAt`, `deferredUntil`);

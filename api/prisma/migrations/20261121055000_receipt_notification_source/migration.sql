ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_receiptEventId_fkey`;

ALTER TABLE `Notification`
  DROP CHECK `Notification_one_event_source_check`,
  ADD CONSTRAINT `Notification_one_event_source_check`
    CHECK (((`eventId` IS NOT NULL) + (`reviewEventId` IS NOT NULL) + (`receiptEventId` IS NOT NULL)) = 1),
  ADD CONSTRAINT `Notification_receiptEventId_fkey` FOREIGN KEY (`receiptEventId`)
    REFERENCES `PaymentReceiptEvent` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `PaymentReceipt` ADD COLUMN `payerName` VARCHAR(150) NULL, ADD COLUMN `notes` TEXT NULL;

CREATE TABLE `PaymentReceiptEvent` (
  `id` VARCHAR(191) NOT NULL,
  `receiptId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `reason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PaymentReceiptEvent_receiptId_kind_key` (`receiptId`, `kind`),
  UNIQUE INDEX `PaymentReceiptEvent_actorUserId_clientId_key` (`actorUserId`, `clientId`),
  INDEX `PaymentReceiptEvent_kind_createdAt_idx` (`kind`, `createdAt`),
  CONSTRAINT `PaymentReceiptEvent_receiptId_fkey` FOREIGN KEY (`receiptId`) REFERENCES `PaymentReceipt` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `PaymentReceiptEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Notification`
  ADD COLUMN `receiptEventId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Notification_recipientUserId_receiptEventId_key` (`recipientUserId`, `receiptEventId`),
  ADD CONSTRAINT `Notification_receiptEventId_fkey` FOREIGN KEY (`receiptEventId`) REFERENCES `PaymentReceiptEvent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

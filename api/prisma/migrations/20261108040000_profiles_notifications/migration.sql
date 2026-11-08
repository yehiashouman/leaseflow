ALTER TABLE `User`
  ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'Asia/Dubai',
  ADD COLUMN `profileVersion` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `TenantProfile` ADD COLUMN `pendingPhone` VARCHAR(40) NULL;
CREATE TABLE `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `recipientUserId` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(191) NOT NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Notification_recipientUserId_eventId_key` (`recipientUserId`, `eventId`),
  INDEX `Notification_recipientUserId_readAt_createdAt_idx` (`recipientUserId`, `readAt`, `createdAt`),
  CONSTRAINT `Notification_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `RequestEvent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

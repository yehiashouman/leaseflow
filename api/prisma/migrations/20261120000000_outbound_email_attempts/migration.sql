CREATE TABLE `OutboundEmailAttempt` (
  `leaseToken` VARCHAR(36) NOT NULL,
  `emailId` VARCHAR(191) NOT NULL,
  `number` INTEGER NOT NULL,
  `status` ENUM('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED') NOT NULL DEFAULT 'RUNNING',
  `failureCode` VARCHAR(80) NULL,
  `providerId` VARCHAR(191) NULL,
  `startedAt` DATETIME(3) NOT NULL,
  `finishedAt` DATETIME(3) NULL,
  INDEX `OutboundEmailAttempt_emailId_startedAt_idx` (`emailId`, `startedAt`),
  PRIMARY KEY (`leaseToken`),
  CONSTRAINT `OutboundEmailAttempt_emailId_fkey` FOREIGN KEY (`emailId`)
    REFERENCES `OutboundEmail` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Contract` ADD COLUMN `timezone` VARCHAR(80) NOT NULL DEFAULT 'Asia/Dubai';
ALTER TABLE `ContractReview`
  ADD COLUMN `spaceNameSnapshot` VARCHAR(150) NULL,
  ADD COLUMN `unitNameSnapshot` VARCHAR(150) NULL,
  ADD COLUMN `rentalSpaceId` VARCHAR(191) NULL,
  ADD COLUMN `sameSpaceSince` DATETIME(3) NULL,
  ADD COLUMN `milestoneMonths` INTEGER NULL,
  ADD COLUMN `deferredUntil` DATETIME(3) NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0,
  ADD UNIQUE INDEX `ContractReview_contractId_dueAt_key` (`contractId`, `dueAt`),
  ADD CONSTRAINT `ContractReview_rentalSpaceId_fkey` FOREIGN KEY (`rentalSpaceId`) REFERENCES `RentalSpace` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `ContractReviewEvent` (
  `id` VARCHAR(191) NOT NULL,
  `reviewId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NULL,
  `actorName` VARCHAR(150) NULL,
  `clientId` VARCHAR(36) NULL,
  `payloadHash` CHAR(64) NULL,
  `kind` VARCHAR(40) NOT NULL,
  `note` TEXT NULL,
  `proposedRent` DECIMAL(12,2) NULL,
  `currency` VARCHAR(3) NULL,
  `effectiveMonth` DATETIME(3) NULL,
  `deferredUntil` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ContractReviewEvent_reviewId_clientId_key` (`reviewId`, `clientId`),
  INDEX `ContractReviewEvent_reviewId_createdAt_id_idx` (`reviewId`, `createdAt`, `id`),
  CONSTRAINT `ContractReviewEvent_reviewId_fkey` FOREIGN KEY (`reviewId`) REFERENCES `ContractReview` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ContractReviewEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ContractAmendment`
  ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN `sourceReviewEventId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `ContractAmendment_sourceReviewEventId_key` (`sourceReviewEventId`),
  ADD CONSTRAINT `ContractAmendment_sourceReviewEventId_fkey` FOREIGN KEY (`sourceReviewEventId`) REFERENCES `ContractReviewEvent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_eventId_fkey`;
ALTER TABLE `Notification`
  MODIFY `eventId` VARCHAR(191) NULL,
  ADD COLUMN `reviewEventId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Notification_recipientUserId_reviewEventId_key` (`recipientUserId`, `reviewEventId`),
  ADD CONSTRAINT `Notification_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `RequestEvent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Notification_reviewEventId_fkey` FOREIGN KEY (`reviewEventId`) REFERENCES `ContractReviewEvent` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `Notification_one_event_source_check` CHECK ((`eventId` IS NOT NULL AND `reviewEventId` IS NULL) OR (`eventId` IS NULL AND `reviewEventId` IS NOT NULL));

CREATE TABLE `BusinessJob` (
  `id` VARCHAR(191) NOT NULL,
  `contractId` VARCHAR(191) NOT NULL,
  `kind` ENUM('MONTHLY_OBLIGATIONS','OBLIGATION_STATUS','ANNUAL_REVIEW','ROOM_CHANGE_EXPIRY') NOT NULL,
  `jobKey` VARCHAR(191) NOT NULL,
  `sourceRequestId` VARCHAR(191) NULL,
  `state` ENUM('QUEUED','RUNNING','PAUSED','FAILED','STOPPED') NOT NULL DEFAULT 'QUEUED',
  `cursor` DATETIME(3) NOT NULL,
  `sourceSpaceId` VARCHAR(191) NOT NULL,
  `sourceStartDate` DATETIME(3) NOT NULL,
  `nextRunAt` DATETIME(3) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `retryCount` INTEGER NOT NULL DEFAULT 0,
  `leaseToken` VARCHAR(36) NULL,
  `leaseExpiresAt` DATETIME(3) NULL,
  `failureCode` VARCHAR(80) NULL,
  `lastRunAt` DATETIME(3) NULL,
  `lastSuccessAt` DATETIME(3) NULL,
  `processed` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BusinessJob_jobKey_key` (`jobKey`),
  INDEX `BusinessJob_state_nextRunAt_createdAt_idx` (`state`,`nextRunAt`,`createdAt`),
  INDEX `BusinessJob_state_leaseExpiresAt_idx` (`state`,`leaseExpiresAt`),
  CONSTRAINT `BusinessJob_contractId_fkey` FOREIGN KEY (`contractId`) REFERENCES `Contract` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BusinessJob_sourceRequestId_fkey` FOREIGN KEY (`sourceRequestId`) REFERENCES `Request` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BusinessJob_sourceSpaceId_fkey` FOREIGN KEY (`sourceSpaceId`) REFERENCES `RentalSpace` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessJobRetry` (
  `id` VARCHAR(191) NOT NULL,
  `jobId` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(36) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `BusinessJobRetry_jobId_clientId_key` (`jobId`,`clientId`),
  CONSTRAINT `BusinessJobRetry_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `BusinessJob` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `BusinessJobRetry_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `BusinessWorkerHeartbeat` (
  `id` VARCHAR(191) NOT NULL,
  `state` VARCHAR(30) NOT NULL,
  `redisConnected` BOOLEAN NOT NULL DEFAULT false,
  `lastSeenAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `BusinessWorkerHeartbeat_lastSeenAt_idx` (`lastSeenAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

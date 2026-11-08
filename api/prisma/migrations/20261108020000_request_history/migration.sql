ALTER TABLE `Request`
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `clientId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `Request_contractId_clientId_key` (`contractId`, `clientId`);

ALTER TABLE `RequestEvent`
  ADD COLUMN `actorName` VARCHAR(150) NULL,
  ADD COLUMN `actorRole` ENUM('ADMIN', 'LEASING_MANAGER', 'TENANT') NULL,
  ADD COLUMN `clientId` VARCHAR(191) NULL,
  ADD COLUMN `sequence` INTEGER NULL,
  ADD COLUMN `fromStatus` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `RequestEvent_requestId_clientId_key` (`requestId`, `clientId`),
  ADD UNIQUE INDEX `RequestEvent_requestId_sequence_key` (`requestId`, `sequence`);

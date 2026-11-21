ALTER TABLE `DepositEntry`
    ADD COLUMN `recordedAt` DATETIME(3) NULL,
    ADD COLUMN `method` VARCHAR(60) NULL,
    ADD COLUMN `reference` VARCHAR(150) NULL,
    ADD COLUMN `category` VARCHAR(40) NULL,
    ADD COLUMN `sourceProposalId` VARCHAR(191) NULL,
    ADD UNIQUE INDEX `DepositEntry_sourceProposalId_key` (`sourceProposalId`),
    ADD INDEX `DepositEntry_contractId_type_idx` (`contractId`, `type`),
    ADD CONSTRAINT `DepositEntry_sourceProposalId_fkey` FOREIGN KEY (`sourceProposalId`) REFERENCES `DepositEntry` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `DepositEvent` (
    `id` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NOT NULL,
    `actorRole` VARCHAR(30) NOT NULL,
    `clientId` VARCHAR(36) NOT NULL,
    `payloadHash` CHAR(64) NOT NULL,
    `sequence` INT NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `amount` DECIMAL(12, 2) NULL,
    `category` VARCHAR(40) NULL,
    `message` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `DepositEvent_actorUserId_clientId_key` (`actorUserId`, `clientId`),
    UNIQUE INDEX `DepositEvent_entryId_sequence_key` (`entryId`, `sequence`),
    PRIMARY KEY (`id`),
    CONSTRAINT `DepositEvent_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `DepositEntry` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `DepositEvent_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DocumentSeries`
    MODIFY COLUMN `purpose` ENUM('IDENTITY','LICENSE','LANDLORD_DOCUMENT','PROPERTY_DOCUMENT','CONSENT','UNIT_PHOTO','COMMON_PHOTO','SPACE_PHOTO','CASE_EVIDENCE','PAYMENT_EVIDENCE','EXPENSE_EVIDENCE','OCCUPANT_IDENTITY','DEPOSIT_EVIDENCE') NOT NULL,
    ADD COLUMN `depositEntryId` VARCHAR(191) NULL,
    ADD INDEX `DocumentSeries_depositEntryId_idx` (`depositEntryId`),
    ADD CONSTRAINT `DocumentSeries_depositEntryId_fkey` FOREIGN KEY (`depositEntryId`) REFERENCES `DepositEntry` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

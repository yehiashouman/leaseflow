-- CreateTable
CREATE TABLE `DocumentSeries` (
    `id` VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `purpose` ENUM('IDENTITY', 'LICENSE', 'LANDLORD_DOCUMENT', 'PROPERTY_DOCUMENT', 'CONSENT', 'UNIT_PHOTO', 'COMMON_PHOTO', 'SPACE_PHOTO', 'CASE_EVIDENCE', 'PAYMENT_EVIDENCE') NOT NULL,
    `landlordId` VARCHAR(191) NULL,
    `unitId` VARCHAR(191) NULL,
    `rentalSpaceId` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `paymentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DocumentSeries_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    INDEX `DocumentSeries_landlordId_idx`(`landlordId`),
    INDEX `DocumentSeries_unitId_idx`(`unitId`),
    INDEX `DocumentSeries_rentalSpaceId_idx`(`rentalSpaceId`),
    INDEX `DocumentSeries_requestId_idx`(`requestId`),
    INDEX `DocumentSeries_paymentId_idx`(`paymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Document` (
    `id` VARCHAR(191) NOT NULL,
    `seriesId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `uploaderUserId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `payloadHash` VARCHAR(64) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `originalName` VARCHAR(150) NOT NULL,
    `mimeType` VARCHAR(80) NOT NULL,
    `originalSize` INTEGER NOT NULL,
    `fileSize` INTEGER NULL,
    `sourceHash` VARCHAR(64) NOT NULL,
    `fileHash` VARCHAR(64) NULL,
    `quarantineKey` VARCHAR(191) NOT NULL,
    `cleanKey` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NULL,
    `status` ENUM('QUARANTINED', 'SCANNING', 'CLEAN', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'QUARANTINED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseToken` VARCHAR(191) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `failureCode` VARCHAR(80) NULL,
    `scannedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Document_quarantineKey_key`(`quarantineKey`),
    UNIQUE INDEX `Document_cleanKey_key`(`cleanKey`),
    INDEX `Document_status_nextAttemptAt_createdAt_idx`(`status`, `nextAttemptAt`, `createdAt`),
    UNIQUE INDEX `Document_seriesId_version_key`(`seriesId`, `version`),
    UNIQUE INDEX `Document_uploaderUserId_clientId_key`(`uploaderUserId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DocumentSeries` ADD CONSTRAINT `DocumentSeries_ownerUserId_fkey` FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentSeries` ADD CONSTRAINT `DocumentSeries_landlordId_fkey` FOREIGN KEY (`landlordId`) REFERENCES `Landlord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentSeries` ADD CONSTRAINT `DocumentSeries_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentSeries` ADD CONSTRAINT `DocumentSeries_rentalSpaceId_fkey` FOREIGN KEY (`rentalSpaceId`) REFERENCES `RentalSpace`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentSeries` ADD CONSTRAINT `DocumentSeries_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `Request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DocumentSeries` ADD CONSTRAINT `DocumentSeries_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Document` ADD CONSTRAINT `Document_seriesId_fkey` FOREIGN KEY (`seriesId`) REFERENCES `DocumentSeries`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


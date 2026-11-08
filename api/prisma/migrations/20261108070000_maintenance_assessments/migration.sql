CREATE TABLE `MaintenanceAssessment` (
  `id` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(191) NOT NULL,
  `caseVersion` INTEGER NOT NULL,
  `classification` ENUM('MANAGER_COST', 'TENANT_COST', 'UNDER_REVIEW', 'NO_COST') NOT NULL,
  `proposedAmount` DECIMAL(12,2) NULL,
  `currency` VARCHAR(191) NULL,
  `explanation` TEXT NOT NULL,
  `evidenceNotes` TEXT NULL,
  `decision` ENUM('ACCEPTED', 'DISPUTED') NULL,
  `responseExplanation` TEXT NULL,
  `respondedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `MaintenanceAssessment_requestId_caseVersion_key` (`requestId`, `caseVersion`),
  CONSTRAINT `MaintenanceAssessment_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `Request` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

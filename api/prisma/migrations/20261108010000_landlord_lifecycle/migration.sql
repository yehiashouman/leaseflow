ALTER TABLE `Landlord`
  MODIFY COLUMN `companyName` VARCHAR(200) NULL,
  MODIFY COLUMN `address` VARCHAR(500) NULL,
  ADD COLUMN `preferredContactMethod` VARCHAR(191) NULL,
  ADD COLUMN `archivedAt` DATETIME(3) NULL,
  ADD INDEX `Landlord_managerId_archivedAt_idx` (`managerId`, `archivedAt`);

ALTER TABLE `Unit` MODIFY COLUMN `street` VARCHAR(200) NULL, ADD COLUMN `addressNotes` TEXT NULL;

ALTER TABLE `AuditEvent` MODIFY COLUMN `userAgent` TEXT NULL;

ALTER TABLE `Unit`
  ADD COLUMN `archivedAt` DATETIME(3) NULL,
  ADD COLUMN `ownerPaymentSchedule` TEXT NULL,
  ADD INDEX `Unit_managerId_archivedAt_idx` (`managerId`, `archivedAt`);

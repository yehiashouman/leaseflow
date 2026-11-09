ALTER TABLE ExpenseRecovery
 ADD COLUMN payerTenantId VARCHAR(191) NULL,
 ADD COLUMN payerName VARCHAR(191) NULL,
 ADD INDEX ExpenseRecovery_payerTenantId_idx (payerTenantId),
 ADD CONSTRAINT ExpenseRecovery_payerTenantId_fkey FOREIGN KEY (payerTenantId) REFERENCES TenantProfile(id) ON DELETE RESTRICT ON UPDATE CASCADE;

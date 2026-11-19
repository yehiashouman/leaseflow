ALTER TABLE `TenantInvitation`
  ADD INDEX `TenantInvitation_reminder_due_idx` (`acceptedAt`, `revokedAt`, `expiresAt`);

ALTER TABLE `OutboundEmail`
  ADD COLUMN `invitationReminderId` VARCHAR(191) NULL,
  ADD UNIQUE INDEX `OutboundEmail_invitation_reminder_key` (`invitationReminderId`),
  ADD CONSTRAINT `OutboundEmail_invitation_reminder_fk`
    FOREIGN KEY (`invitationReminderId`) REFERENCES `TenantInvitation` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

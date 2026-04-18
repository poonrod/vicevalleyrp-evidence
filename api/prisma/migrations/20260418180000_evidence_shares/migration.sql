CREATE TABLE `evidence_shares` (
    `id` VARCHAR(191) NOT NULL,
    `evidenceId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `createdByUserId` VARCHAR(191) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `evidence_shares_token_key`(`token`),
    INDEX `evidence_shares_evidenceId_idx`(`evidenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `evidence_shares` ADD CONSTRAINT `evidence_shares_evidenceId_fkey` FOREIGN KEY (`evidenceId`) REFERENCES `EvidenceItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `evidence_shares` ADD CONSTRAINT `evidence_shares_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

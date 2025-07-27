// config/backupConfig.js
const DATE_STR = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
const FILE_NAME = `backups/database-backup-${DATE_STR}.xlsx`;

module.exports = {
  DATE_STR,
  FILE_NAME
};